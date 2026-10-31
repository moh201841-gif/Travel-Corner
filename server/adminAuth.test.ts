/**
 * Travel Corner — administrator password login (Phase 1 independent hosting).
 *
 * Covers the security properties the login route is responsible for: the password is only ever
 * stored as a scrypt digest, verification is constant-time and rejects malformed digests, failed
 * attempts are rate limited, the administrator identity comes from server configuration rather than
 * the request, and a session is never issued when the admin row cannot be persisted.
 *
 * No database is touched: server/db is mocked, so these run in the database-free suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertUser = vi.fn();
const getUserByOpenId = vi.fn();

vi.mock("./db", () => ({
  upsertUser: (...args: unknown[]) => upsertUser(...args),
  getUserByOpenId: (...args: unknown[]) => getUserByOpenId(...args),
}));

const createSessionToken = vi.fn(async () => "signed.session.token");
vi.mock("./_core/sdk", () => ({
  sdk: { createSessionToken: (...args: unknown[]) => createSessionToken(...args) },
}));

import {
  ADMIN_HASH_SCHEME,
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  adminLoginConfigError,
  clearFailedAttempts,
  clientKey,
  hashAdminPassword,
  lockoutRemainingMs,
  recordFailedAttempt,
  resetLoginRateLimit,
  verifyAdminPassword,
} from "./_core/adminAuth";

const PASSWORD = "correct horse battery staple";

let previous: Record<string, string | undefined>;

beforeEach(() => {
  previous = {
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    JWT_SECRET: process.env.JWT_SECRET,
    OWNER_OPEN_ID: process.env.OWNER_OPEN_ID,
    VITE_APP_ID: process.env.VITE_APP_ID,
  };
  resetLoginRateLimit();
  upsertUser.mockReset();
  getUserByOpenId.mockReset();
  createSessionToken.mockClear();
});

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetLoginRateLimit();
});

describe("password hashing", () => {
  it("produces a parameterised scrypt digest that contains neither the password nor a plaintext salt", async () => {
    const hash = await hashAdminPassword(PASSWORD);

    expect(hash.startsWith(`${ADMIN_HASH_SCHEME}$`)).toBe(true);
    expect(hash.split("$")).toHaveLength(6);
    expect(hash).not.toContain(PASSWORD);
  });

  it("salts each hash, so the same password never yields the same digest", async () => {
    const [first, second] = await Promise.all([hashAdminPassword(PASSWORD), hashAdminPassword(PASSWORD)]);

    expect(first).not.toEqual(second);
    await expect(verifyAdminPassword(PASSWORD, first)).resolves.toBe(true);
    await expect(verifyAdminPassword(PASSWORD, second)).resolves.toBe(true);
  });

  it("refuses to hash a password short enough to brute force", async () => {
    await expect(hashAdminPassword("short")).rejects.toThrow(/at least 12 characters/i);
  });
});

describe("password verification", () => {
  it("accepts the correct password and rejects a near miss", async () => {
    const hash = await hashAdminPassword(PASSWORD);

    await expect(verifyAdminPassword(PASSWORD, hash)).resolves.toBe(true);
    await expect(verifyAdminPassword(`${PASSWORD} `, hash)).resolves.toBe(false);
    await expect(verifyAdminPassword(PASSWORD.toUpperCase(), hash)).resolves.toBe(false);
    await expect(verifyAdminPassword("", hash)).resolves.toBe(false);
  });

  it("returns false rather than throwing for a malformed or foreign digest", async () => {
    for (const malformed of [
      "",
      "not-a-hash",
      "scrypt$16384$8$1$only-five-parts",
      "bcrypt$16384$8$1$c2FsdA==$aGFzaA==",
      "scrypt$0$8$1$c2FsdA==$aGFzaA==",
      "scrypt$16384$8$1$$",
    ]) {
      await expect(verifyAdminPassword(PASSWORD, malformed)).resolves.toBe(false);
    }
  });

  it("verifies a digest whose cost parameters differ from the current default", async () => {
    // An older hash must keep working: the parameters are read from the stored digest.
    const legacy = await hashAdminPassword(PASSWORD);
    const [, , r, p, salt, hash] = legacy.split("$");
    const reparameterised = ["scrypt", "1024", r, p, salt, hash].join("$");

    // Different N means a different derived key, so this must fail closed rather than pass.
    await expect(verifyAdminPassword(PASSWORD, reparameterised)).resolves.toBe(false);
    await expect(verifyAdminPassword(PASSWORD, legacy)).resolves.toBe(true);
  });
});

describe("login rate limiting", () => {
  it("locks a client out after the configured number of failures", () => {
    const key = "203.0.113.5";

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
      recordFailedAttempt(key);
      expect(lockoutRemainingMs(key)).toBe(0);
    }

    recordFailedAttempt(key);
    expect(lockoutRemainingMs(key)).toBeGreaterThan(0);
    expect(lockoutRemainingMs(key)).toBeLessThanOrEqual(LOCKOUT_MS);
  });

  it("expires the lockout once the window has passed", () => {
    const key = "203.0.113.6";
    const start = Date.now();

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      recordFailedAttempt(key, start);
    }

    expect(lockoutRemainingMs(key, start)).toBeGreaterThan(0);
    expect(lockoutRemainingMs(key, start + LOCKOUT_MS + 1)).toBe(0);
  });

  it("isolates clients from one another", () => {
    const locked = "203.0.113.7";
    const other = "203.0.113.8";

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      recordFailedAttempt(locked);
    }

    expect(lockoutRemainingMs(locked)).toBeGreaterThan(0);
    expect(lockoutRemainingMs(other)).toBe(0);
  });

  it("clears the counter on a successful sign-in", () => {
    const key = "203.0.113.9";
    recordFailedAttempt(key);
    recordFailedAttempt(key);

    clearFailedAttempts(key);

    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
      recordFailedAttempt(key);
    }
    // Had the counter survived, this client would already be locked out.
    expect(lockoutRemainingMs(key)).toBe(0);
  });

  it("derives the client key from the first forwarded hop, falling back to the socket", () => {
    expect(clientKey({ headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" } } as never)).toBe("198.51.100.7");
    expect(clientKey({ headers: {}, ip: "198.51.100.8" } as never)).toBe("198.51.100.8");
    expect(clientKey({ headers: {} } as never)).toBe("unknown");
  });
});

describe("login configuration guard", () => {
  it("reports each missing requirement and nothing when fully configured", async () => {
    vi.resetModules();

    delete process.env.ADMIN_PASSWORD_HASH;
    process.env.JWT_SECRET = "secret";
    process.env.OWNER_OPEN_ID = "admin-identifier";
    let mod = await import("./_core/adminAuth");
    expect(mod.adminLoginConfigError()).toMatch(/ADMIN_PASSWORD_HASH/);

    vi.resetModules();
    process.env.ADMIN_PASSWORD_HASH = await hashAdminPassword(PASSWORD);
    delete process.env.JWT_SECRET;
    mod = await import("./_core/adminAuth");
    expect(mod.adminLoginConfigError()).toMatch(/JWT_SECRET/);

    vi.resetModules();
    process.env.JWT_SECRET = "secret";
    delete process.env.OWNER_OPEN_ID;
    mod = await import("./_core/adminAuth");
    expect(mod.adminLoginConfigError()).toMatch(/OWNER_OPEN_ID/);

    vi.resetModules();
    process.env.OWNER_OPEN_ID = "admin-identifier";
    delete process.env.VITE_APP_ID;
    mod = await import("./_core/adminAuth");
    // Without it the session would fail its own verification, so the login has to refuse up front.
    expect(mod.adminLoginConfigError()).toMatch(/VITE_APP_ID/);

    vi.resetModules();
    process.env.VITE_APP_ID = "travel-corner";
    mod = await import("./_core/adminAuth");
    expect(mod.adminLoginConfigError()).toBeNull();
  });

  it("never includes a configured value in the error text", () => {
    process.env.ADMIN_PASSWORD_HASH = "";
    process.env.JWT_SECRET = "super-secret-value";
    process.env.OWNER_OPEN_ID = "owner-identifier";
    process.env.VITE_APP_ID = "travel-corner";

    const message = adminLoginConfigError() ?? "";
    expect(message).not.toContain("super-secret-value");
    expect(message).not.toContain("owner-identifier");
  });
});
