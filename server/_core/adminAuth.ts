/**
 * Single-administrator password login (Phase 1 of the Manus migration).
 *
 * This replaces the Manus OAuth identity provider only. Everything downstream is unchanged: the
 * session is still a locally signed JWT (sdk.signSession), still carried in the same HttpOnly
 * cookie, still verified by sdk.authenticateRequest, and the admin gate is still
 * adminProcedure's `ctx.user.role !== "admin"` check.
 *
 * Design notes that matter for security:
 *
 *   - The password is never stored. ADMIN_PASSWORD_HASH holds a scrypt digest produced by
 *     `pnpm admin:hash`; scrypt comes from node:crypto, so this adds no dependency.
 *   - Comparison is constant-time (timingSafeEqual) and the parsed parameters come from the stored
 *     hash, so an older hash with different cost parameters still verifies.
 *   - The administrator identity comes from OWNER_OPEN_ID (server configuration), never from the
 *     request. A caller cannot nominate which account to sign in as.
 *   - The admin row is written to the database *before* the session is issued. This is required:
 *     sdk.authenticateRequest falls back to syncing the user from the OAuth server when the row is
 *     missing, which would fail off-Manus. If the row cannot be persisted we refuse to issue a
 *     session rather than hand out a cookie that cannot authenticate.
 *   - Failed attempts are rate limited per client. The limiter is in-process, so it resets on
 *     restart and is per-instance; that is adequate for a single-admin deployment on one instance
 *     and is documented in .env.example.
 */
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ADMIN_HASH_SCHEME, hashAdminPassword, verifyAdminPassword } from "./passwordHash";
import { ENV } from "./env";
import { sdk } from "./sdk";

/**
 * Re-exported so the login route, the tests and `pnpm admin:hash` all name one hashing
 * implementation. The primitives themselves live in ./passwordHash.
 */
export { ADMIN_HASH_SCHEME, hashAdminPassword, verifyAdminPassword };

/** Failed attempts allowed per client before the login route refuses to check the password. */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a client stays locked out after exhausting its attempts. */
export const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRecord = { failures: number; firstFailureAt: number; lockedUntil: number };

const attempts = new Map<string, AttemptRecord>();

/** Stable per-client key for rate limiting. Trusts the proxy's first forwarded hop when present. */
export function clientKey(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof header === "string" && header.trim() !== "") {
    return header.split(",")[0]!.trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/** Remaining lockout in milliseconds, or 0 when the client may attempt a login. */
export function lockoutRemainingMs(key: string, now = Date.now()): number {
  const record = attempts.get(key);
  if (!record) return 0;
  if (record.lockedUntil > now) return record.lockedUntil - now;
  if (record.lockedUntil !== 0 && record.lockedUntil <= now) {
    attempts.delete(key);
    return 0;
  }
  // Attempts age out once the window has passed without a lockout.
  if (now - record.firstFailureAt > LOCKOUT_MS) {
    attempts.delete(key);
  }
  return 0;
}

export function recordFailedAttempt(key: string, now = Date.now()): void {
  const existing = attempts.get(key);
  if (!existing || now - existing.firstFailureAt > LOCKOUT_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  existing.failures += 1;
  if (existing.failures >= MAX_FAILED_ATTEMPTS) {
    existing.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearFailedAttempts(key: string): void {
  attempts.delete(key);
}

/** Test-only: drop all rate-limit state so cases do not leak into one another. */
export function resetLoginRateLimit(): void {
  attempts.clear();
}

/** Configuration the login route needs before it can authenticate anybody. */
export function adminLoginConfigError(): string | null {
  if (!ENV.adminPasswordHash) return "ADMIN_PASSWORD_HASH is not configured";
  if (!ENV.cookieSecret) return "JWT_SECRET is not configured";
  if (!ENV.ownerOpenId) return "OWNER_OPEN_ID is not configured";
  // sdk.verifySession requires a non-empty appId in the session payload, so an unset VITE_APP_ID
  // would produce a cookie that fails its own verification: the login would appear to succeed and
  // every admin request would then be refused. Fail closed here instead.
  if (!ENV.appId) return "VITE_APP_ID is not configured";
  return null;
}

export function registerAdminAuthRoutes(app: Express) {
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const configError = adminLoginConfigError();
    if (configError) {
      // Logged without values; the response stays generic so configuration is not disclosed.
      console.error(`[AdminAuth] login unavailable: ${configError}`);
      res.status(503).json({ error: "Administrator login is not configured." });
      return;
    }

    const key = clientKey(req);
    const remaining = lockoutRemainingMs(key);
    if (remaining > 0) {
      res.setHeader("Retry-After", String(Math.ceil(remaining / 1000)));
      res.status(429).json({ error: "Too many attempts. Try again later." });
      return;
    }

    const password = (req.body as { password?: unknown } | undefined)?.password;
    if (typeof password !== "string" || password.length === 0) {
      recordFailedAttempt(key);
      res.status(400).json({ error: "A password is required." });
      return;
    }

    const valid = await verifyAdminPassword(password, ENV.adminPasswordHash);
    if (!valid) {
      recordFailedAttempt(key);
      res.status(401).json({ error: "Incorrect password." });
      return;
    }

    // Persist the administrator before issuing a session: authenticateRequest resolves the role
    // from this row, and would otherwise try to sync the user from the OAuth server.
    try {
      await db.upsertUser({
        openId: ENV.ownerOpenId,
        name: "Travel Corner administrator",
        loginMethod: "password",
        lastSignedIn: new Date(),
        role: "admin",
      });
    } catch (error) {
      console.error("[AdminAuth] failed to persist the administrator account:", error);
      res.status(503).json({ error: "Administrator login is temporarily unavailable." });
      return;
    }

    const stored = await db.getUserByOpenId(ENV.ownerOpenId);
    if (!stored || stored.role !== "admin") {
      console.error("[AdminAuth] administrator account missing after upsert; refusing to issue a session");
      res.status(503).json({ error: "Administrator login is temporarily unavailable." });
      return;
    }

    const sessionToken = await sdk.createSessionToken(ENV.ownerOpenId, {
      name: "Travel Corner administrator",
      expiresInMs: ONE_YEAR_MS,
    });

    clearFailedAttempts(key);
    res.cookie(COOKIE_NAME, sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    res.status(200).json({ ok: true });
  });
}
