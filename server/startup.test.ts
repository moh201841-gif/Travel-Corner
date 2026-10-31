/**
 * Travel Corner — application startup and administrator login over HTTP (Phase 1 independent hosting).
 *
 * Two things have to hold before the app can run anywhere but Manus:
 *
 *   1. It binds the port the hosting platform assigns. Railway and Render health-check exactly the
 *      port in PORT, so production must bind it or fail loudly rather than scan for a free one.
 *   2. The administrator can sign in with a password and the resulting session passes the same
 *      authorization gate the Manus OAuth session used to pass.
 *
 * The login route is exercised through a real Express app over a loopback socket, so the status
 * codes, the Set-Cookie flags and the rate limiting are the ones a browser would see. Only
 * `server/db` is mocked; the session is signed and verified by the real sdk, which proves the
 * session no longer depends on the Manus OAuth server.
 */
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const upsertUser = vi.fn();
const getUserByOpenId = vi.fn();

vi.mock("./db", () => ({
  upsertUser: (...args: unknown[]) => upsertUser(...args),
  getUserByOpenId: (...args: unknown[]) => getUserByOpenId(...args),
}));

import { DEFAULT_PORT, parsePort, shouldScanForPort } from "./_core/port";
import { hashAdminPassword } from "./_core/adminAuth";

const PASSWORD = "unit test administrator password";
const OWNER_OPEN_ID = "owner-open-id-under-test";
const JWT_SECRET = "jwt-secret-under-test";
const VITE_APP_ID = "travel-corner-under-test";

const ADMIN_ROW = {
  id: 1,
  openId: OWNER_OPEN_ID,
  name: "Travel Corner administrator",
  email: null,
  loginMethod: "password",
  role: "admin" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const TOUCHED_ENV = [
  "ADMIN_PASSWORD_HASH",
  "JWT_SECRET",
  "OWNER_OPEN_ID",
  "SESSION_COOKIE_SAMESITE",
  "VITE_APP_ID",
] as const;

let savedEnv: Record<string, string | undefined>;
let passwordHash: string;

type BootedApp = {
  baseUrl: string;
  close: () => Promise<void>;
  resetLoginRateLimit: () => void;
};

/**
 * Build the same middleware stack `startServer` builds, in a fresh module generation so the
 * module-level ENV snapshot reflects the environment this case cares about.
 */
async function bootApp(env: Partial<Record<(typeof TOUCHED_ENV)[number], string | undefined>>): Promise<BootedApp> {
  for (const key of TOUCHED_ENV) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  vi.resetModules();
  const adminAuth = await import("./_core/adminAuth");

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  adminAuth.registerAdminAuthRoutes(app);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    resetLoginRateLimit: adminAuth.resetLoginRateLimit,
  };
}

/** Everything the login route needs; a case overrides one key to test what happens without it. */
function baseEnv() {
  return {
    ADMIN_PASSWORD_HASH: passwordHash,
    JWT_SECRET,
    OWNER_OPEN_ID,
    VITE_APP_ID,
    SESSION_COOKIE_SAMESITE: undefined,
  };
}

function login(app: BootedApp, body: unknown, headers: Record<string, string> = {}) {
  return fetch(`${app.baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    redirect: "manual",
  });
}

beforeAll(async () => {
  savedEnv = Object.fromEntries(TOUCHED_ENV.map((key) => [key, process.env[key]]));
  passwordHash = await hashAdminPassword(PASSWORD);
}, 30_000);

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterEach(() => {
  upsertUser.mockReset();
  getUserByOpenId.mockReset();
});

describe("listening port", () => {
  it("falls back to the default port when PORT is absent or blank", () => {
    expect(parsePort(undefined)).toBe(DEFAULT_PORT);
    expect(parsePort("")).toBe(DEFAULT_PORT);
    expect(parsePort("   ")).toBe(DEFAULT_PORT);
  });

  it("binds the port the platform assigns", () => {
    expect(parsePort("8080")).toBe(8080);
    expect(parsePort(" 10000 ")).toBe(10000);
    expect(parsePort("65535")).toBe(65535);
  });

  it("refuses a PORT that is not a port, instead of silently binding something else", () => {
    for (const invalid of ["0", "-1", "65536", "99999", "abc", "80 80", "8080abc", "8.5"]) {
      expect(() => parsePort(invalid), `PORT=${invalid} should be rejected`).toThrow(/not a valid port/i);
    }
  });

  it("never scans for a free port in production, so the health check reaches the server", () => {
    expect(shouldScanForPort("production")).toBe(false);
    expect(shouldScanForPort("development")).toBe(true);
    expect(shouldScanForPort("test")).toBe(true);
    expect(shouldScanForPort(undefined)).toBe(true);
  });
});

describe("administrator login route", () => {
  it("refuses to authenticate anybody while ADMIN_PASSWORD_HASH is unset", async () => {
    const app = await bootApp({ ...baseEnv(), ADMIN_PASSWORD_HASH: undefined });
    try {
      const response = await login(app, { password: PASSWORD });

      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(upsertUser).not.toHaveBeenCalled();
      // The response must not disclose which setting is missing.
      expect(JSON.stringify(await response.json())).not.toMatch(/ADMIN_PASSWORD_HASH/);
    } finally {
      await app.close();
    }
  });

  it("refuses to issue a session that could not verify itself when VITE_APP_ID is unset", async () => {
    // sdk.verifySession requires a non-empty appId, so without it the login would return a cookie
    // and every admin request would then be refused. Failing closed here makes that configuration
    // error visible at the login instead.
    const app = await bootApp({ ...baseEnv(), VITE_APP_ID: undefined });
    try {
      const response = await login(app, { password: PASSWORD });

      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(upsertUser).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejects a missing password and a wrong password without issuing a session", async () => {
    const app = await bootApp(baseEnv());
    try {
      const missing = await login(app, {});
      expect(missing.status).toBe(400);
      expect(missing.headers.getSetCookie()).toEqual([]);

      app.resetLoginRateLimit();

      const wrong = await login(app, { password: "not the administrator password" });
      expect(wrong.status).toBe(401);
      expect(wrong.headers.getSetCookie()).toEqual([]);
      expect(upsertUser).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("issues an HttpOnly session cookie for the correct password", async () => {
    getUserByOpenId.mockResolvedValue(ADMIN_ROW);
    const app = await bootApp(baseEnv());
    try {
      const response = await login(app, { password: PASSWORD });

      expect(response.status).toBe(200);
      const [cookie] = response.headers.getSetCookie();
      expect(cookie).toBeDefined();
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\//i);
      // Lax refuses cross-site POSTs, which is what the admin mutations rely on.
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).not.toContain(PASSWORD);
      expect(cookie).not.toContain(passwordHash);
    } finally {
      await app.close();
    }
  });

  it("marks the cookie Secure behind an HTTPS proxy and keeps SameSite=None usable there only", async () => {
    getUserByOpenId.mockResolvedValue(ADMIN_ROW);
    const app = await bootApp({ ...baseEnv(), SESSION_COOKIE_SAMESITE: "none" });
    try {
      const overHttps = await login(app, { password: PASSWORD }, { "x-forwarded-proto": "https" });
      const [secureCookie] = overHttps.headers.getSetCookie();
      expect(secureCookie).toMatch(/SameSite=None/i);
      expect(secureCookie).toMatch(/Secure/i);

      app.resetLoginRateLimit();

      // SameSite=None without Secure is discarded by browsers, so it degrades to Lax on plain HTTP.
      const overHttp = await login(app, { password: PASSWORD });
      const [plainCookie] = overHttp.headers.getSetCookie();
      expect(plainCookie).toMatch(/SameSite=Lax/i);
      expect(plainCookie).not.toMatch(/Secure/i);
    } finally {
      await app.close();
    }
  });

  it("signs in as the configured owner and ignores an identity supplied by the caller", async () => {
    getUserByOpenId.mockResolvedValue(ADMIN_ROW);
    const app = await bootApp(baseEnv());
    try {
      const response = await login(app, {
        password: PASSWORD,
        openId: "attacker-supplied-open-id",
        role: "admin",
        email: "attacker@example.com",
      });

      expect(response.status).toBe(200);
      expect(upsertUser).toHaveBeenCalledTimes(1);
      const persisted = upsertUser.mock.calls[0]![0] as Record<string, unknown>;
      expect(persisted.openId).toBe(OWNER_OPEN_ID);
      expect(persisted.role).toBe("admin");
      expect(JSON.stringify(persisted)).not.toContain("attacker");
      expect(getUserByOpenId).toHaveBeenCalledWith(OWNER_OPEN_ID);
    } finally {
      await app.close();
    }
  });

  it("refuses a session when the administrator row cannot be persisted or is not an admin", async () => {
    const app = await bootApp(baseEnv());
    try {
      upsertUser.mockRejectedValueOnce(new Error("database unreachable"));
      const unwritable = await login(app, { password: PASSWORD });
      expect(unwritable.status).toBe(503);
      expect(unwritable.headers.getSetCookie()).toEqual([]);

      app.resetLoginRateLimit();

      // A row that exists but is not an admin must not be handed an admin session.
      upsertUser.mockResolvedValue(undefined);
      getUserByOpenId.mockResolvedValue({ ...ADMIN_ROW, role: "user" });
      const notAdmin = await login(app, { password: PASSWORD });
      expect(notAdmin.status).toBe(503);
      expect(notAdmin.headers.getSetCookie()).toEqual([]);

      app.resetLoginRateLimit();

      getUserByOpenId.mockResolvedValue(undefined);
      const missingRow = await login(app, { password: PASSWORD });
      expect(missingRow.status).toBe(503);
      expect(missingRow.headers.getSetCookie()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("locks a client out after repeated failures and says when to retry", async () => {
    const app = await bootApp(baseEnv());
    try {
      const { MAX_FAILED_ATTEMPTS } = await import("./_core/adminAuth");
      const client = { "x-forwarded-for": "198.51.100.42" };

      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
        const response = await login(app, { password: "wrong" }, client);
        expect(response.status).toBe(401);
      }

      const locked = await login(app, { password: "wrong" }, client);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);

      // Even the correct password is refused while the lockout holds.
      getUserByOpenId.mockResolvedValue(ADMIN_ROW);
      const correctButLocked = await login(app, { password: PASSWORD }, client);
      expect(correctButLocked.status).toBe(429);
      expect(correctButLocked.headers.getSetCookie()).toEqual([]);

      // A different client is unaffected.
      const otherClient = await login(app, { password: PASSWORD }, { "x-forwarded-for": "198.51.100.43" });
      expect(otherClient.status).toBe(200);
    } finally {
      await app.close();
    }
  }, 30_000);
});

describe("session issued by the password login", () => {
  it("authenticates as the administrator through the same gate the OAuth session used", async () => {
    getUserByOpenId.mockResolvedValue(ADMIN_ROW);
    const app = await bootApp(baseEnv());
    try {
      const response = await login(app, { password: PASSWORD });
      const [setCookie] = response.headers.getSetCookie();
      const cookie = setCookie!.split(";")[0]!;

      // Same module generation as the route, so both read the same JWT_SECRET.
      const { sdk } = await import("./_core/sdk");
      const user = await sdk.authenticateRequest({ headers: { cookie } } as never);

      expect(user.openId).toBe(OWNER_OPEN_ID);
      expect(user.role).toBe("admin");
    } finally {
      await app.close();
    }
  });

  it("rejects a tampered or foreign session token without reaching the OAuth server", async () => {
    getUserByOpenId.mockResolvedValue(ADMIN_ROW);
    const app = await bootApp(baseEnv());
    try {
      const response = await login(app, { password: PASSWORD });
      const [setCookie] = response.headers.getSetCookie();
      const cookie = setCookie!.split(";")[0]!;
      const [name, token] = cookie.split("=");

      const { sdk } = await import("./_core/sdk");
      const tampered = `${name}=${token!.slice(0, -2)}xx`;

      await expect(sdk.authenticateRequest({ headers: { cookie: tampered } } as never)).rejects.toThrow();
      await expect(sdk.authenticateRequest({ headers: {} } as never)).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
});
