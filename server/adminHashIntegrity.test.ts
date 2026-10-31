/**
 * Regression cover for the reported production symptom "admin login returns Incorrect password
 * after updating ADMIN_PASSWORD_HASH".
 *
 * Two defects produced it, and both are invisible from the outside: the login route answers 401
 * "Incorrect password." for a wrong password *and* for a digest it cannot parse, by design, so a
 * value damaged between the generator and the hosting dashboard looks exactly like a typing
 * mistake. These cases pin the three parts of the fix:
 *
 *   1. ENV reads the digest as a token — surrounding whitespace and one pair of quotes removed —
 *      because those are the two ways a paste into a dashboard field actually fails.
 *   2. A digest that is still unparseable is reported as a configuration fault (503 with a log line
 *      naming the shape problem), not as a wrong password.
 *   3. A truncated digest is rejected rather than verified at reduced strength.
 *
 * No password or digest from any deployment appears here: every value is generated in the test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminHashFormatError, hashAdminPassword, verifyAdminPassword } from "./_core/passwordHash";

const PASSWORD = "regression-test-password";

describe("admin password digest integrity", () => {
  it("verifies a digest exactly as generated", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    expect(adminHashFormatError(stored)).toBeNull();
    await expect(verifyAdminPassword(PASSWORD, stored)).resolves.toBe(true);
  });

  it("still rejects the wrong password for a well-formed digest", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    await expect(verifyAdminPassword(`${PASSWORD}x`, stored)).resolves.toBe(false);
    // A wrong password is not a configuration fault, so nothing about the digest is reported.
    expect(adminHashFormatError(stored)).toBeNull();
  });

  /**
   * The failure mode that matches the production report. Before the fix these all returned false
   * with no diagnostic, so the operator was told the password was wrong.
   */
  it.each([
    ["a leading space", (hash: string) => ` ${hash}`],
    ["a leading newline", (hash: string) => `\n${hash}`],
    ["double quotes", (hash: string) => `"${hash}"`],
    ["single quotes", (hash: string) => `'${hash}'`],
    ["a trailing newline", (hash: string) => `${hash}\n`],
    ["trailing CRLF", (hash: string) => `${hash}\r\n`],
    ["surrounding whitespace and quotes", (hash: string) => `  "${hash}"  `],
  ])("reports %s in the configured value as a configuration fault", async (_label, mangle) => {
    const stored = await hashAdminPassword(PASSWORD);
    const mangled = mangle(stored);

    // Whatever the mangling, the raw value either fails to verify or is reported as malformed —
    // never silently accepted as a different digest.
    const verifiedRaw = await verifyAdminPassword(PASSWORD, mangled);
    const reported = adminHashFormatError(mangled);
    expect(verifiedRaw && reported === null ? "silently accepted" : "flagged").toBe("flagged");
  });

  it("rejects a digest truncated in transit instead of verifying a prefix of it", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    // Dropping four base64 characters removes one byte-triple from the digest. scrypt ends in a
    // PBKDF2-style expansion, so a shorter derivation is a prefix of the full one: before the fix
    // this verified successfully against the correct password at reduced strength.
    const truncated = stored.slice(0, -4);
    expect(truncated).not.toBe(stored);
    await expect(verifyAdminPassword(PASSWORD, truncated)).resolves.toBe(false);
    expect(adminHashFormatError(truncated)).toMatch(/decodes to \d+ bytes, expected 64/);
  });

  it("names the shape problem without quoting the value", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    const reasons = [
      adminHashFormatError(""),
      adminHashFormatError("scrypt$16384$8"),
      adminHashFormatError(stored.replace(/^scrypt/, "bcrypt")),
      adminHashFormatError(stored.replace("$16384$", "$0$")),
    ];
    expect(reasons.every((reason) => typeof reason === "string" && reason.length > 0)).toBe(true);
    for (const reason of reasons) {
      // The salt and digest fields are the long base64 segments; neither may appear in a log line.
      const [, , , , salt, digest] = stored.split("$");
      expect(reason).not.toContain(salt!);
      expect(reason).not.toContain(digest!);
    }
  });
});

describe("ADMIN_PASSWORD_HASH is read as a token", () => {
  const ORIGINAL = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.resetModules();
  });

  /** Load ENV and the login-configuration guard against the environment set up by the caller. */
  async function loadWith(hash: string) {
    process.env.ADMIN_PASSWORD_HASH = hash;
    process.env.JWT_SECRET = "test-secret";
    process.env.OWNER_OPEN_ID = "owner";
    process.env.VITE_APP_ID = "app";
    const { ENV } = await import("./_core/env");
    const { adminLoginConfigError } = await import("./_core/adminAuth");
    return { ENV, adminLoginConfigError };
  }

  it.each([
    ["a leading space", (hash: string) => ` ${hash}`],
    ["a trailing newline", (hash: string) => `${hash}\n`],
    ["double quotes", (hash: string) => `"${hash}"`],
    ["single quotes", (hash: string) => `'${hash}'`],
    ["quotes inside whitespace", (hash: string) => `  "${hash}"\n`],
  ])("recovers a digest pasted with %s, so the right password still signs in", async (_label, mangle) => {
    const stored = await hashAdminPassword(PASSWORD);
    const { ENV, adminLoginConfigError } = await loadWith(mangle(stored));

    expect(ENV.adminPasswordHash).toBe(stored);
    expect(adminLoginConfigError()).toBeNull();
    await expect(verifyAdminPassword(PASSWORD, ENV.adminPasswordHash)).resolves.toBe(true);
  });

  it("refuses the login as misconfigured when the digest cannot be recovered", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    // A quote on one side only is not a quoting pattern, so there is nothing to strip.
    const { adminLoginConfigError } = await loadWith(`"${stored}`);

    const configError = adminLoginConfigError();
    expect(configError).toMatch(/^ADMIN_PASSWORD_HASH is malformed: /);
    // Which matters because the route turns a configuration error into a 503 that says the login is
    // not configured, instead of a 401 that says the password is wrong.
  });

  it("reads OWNER_OPEN_ID and VITE_APP_ID the same way", async () => {
    const stored = await hashAdminPassword(PASSWORD);
    process.env.ADMIN_PASSWORD_HASH = stored;
    process.env.JWT_SECRET = "test-secret";
    process.env.OWNER_OPEN_ID = ' "travel-corner-owner" ';
    process.env.VITE_APP_ID = "travel-corner\n";
    const { ENV } = await import("./_core/env");

    // Whitespace here produced a session cookie that failed its own verification, because the
    // openId written to the database and the one signed into the JWT would differ by a newline.
    expect(ENV.ownerOpenId).toBe("travel-corner-owner");
    expect(ENV.appId).toBe("travel-corner");
  });

  it("leaves JWT_SECRET exactly as configured", async () => {
    process.env.JWT_SECRET = "  secret with spaces  ";
    const { ENV } = await import("./_core/env");
    // An opaque secret's bytes are whatever the operator chose; trimming could break a working one.
    expect(ENV.cookieSecret).toBe("  secret with spaces  ");
  });
});
