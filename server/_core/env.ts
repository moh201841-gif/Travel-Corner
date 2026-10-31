/** Session cookie SameSite policy. Narrow type so an unexpected value cannot reach Express. */
export type SessionSameSite = "lax" | "strict" | "none";

function readSameSite(): SessionSameSite {
  const raw = (process.env.SESSION_COOKIE_SAMESITE ?? "").trim().toLowerCase();
  if (raw === "none" || raw === "strict" || raw === "lax") return raw;
  // Default to "lax" for independent hosting: it still allows top-level navigation
  // logins while refusing cross-site POSTs, which is the CSRF protection the admin
  // mutations rely on. Manus previews embedded the app cross-site and needed "none";
  // that remains available by setting SESSION_COOKIE_SAMESITE explicitly.
  return "lax";
}

/**
 * Cloudflare R2 speaks the S3 API, so the endpoint is either given directly or derived from the
 * account id as https://<account-id>.r2.cloudflarestorage.com.
 */
function readR2Endpoint(): string {
  const explicit = (process.env.R2_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const account = (process.env.R2_ACCOUNT_ID ?? "").trim();
  return account ? `https://${account}.r2.cloudflarestorage.com` : "";
}

/**
 * Read a configuration value that is a single structured token — an identifier or a digest, never
 * free text — with surrounding whitespace and one matching pair of quotes removed.
 *
 * This is not cosmetic. ADMIN_PASSWORD_HASH is parsed by splitting on "$" and comparing the first
 * field to "scrypt", so a value pasted into a hosting dashboard with a leading space or newline, or
 * copied from a .env line complete with its quotes, makes *every* password fail verification. The
 * login then answers "Incorrect password." — by design indistinguishable from a wrong password —
 * and nothing in the logs says the stored digest was unreadable. The same applies to OWNER_OPEN_ID
 * and VITE_APP_ID: whitespace there produces a session cookie that fails its own verification.
 *
 * Deliberately not applied to JWT_SECRET or R2_SECRET_ACCESS_KEY: those are opaque secrets whose
 * bytes are whatever the operator chose, so trimming them could change a working value.
 */
function readToken(name: string): string {
  const raw = (process.env[name] ?? "").trim();
  const unquoted = raw.match(/^(["'])(.*)\1$/);
  return unquoted ? unquoted[2]!.trim() : raw;
}

/**
 * How many reverse proxies sit between a client and this process.
 *
 * X-Forwarded-For is appended to by each proxy, so only the right-hand entries were written by
 * infrastructure we control; everything to the left of them is supplied by the caller. Reading the
 * wrong end lets an attacker rotate a spoofed value and escape per-client rate limiting, so the
 * default is 0: trust no forwarding header and identify clients by their socket address instead.
 * Set it to 1 behind a single proxy such as Railway's edge.
 */
function readTrustedProxyHops(): number {
  const raw = (process.env.TRUSTED_PROXY_HOPS ?? "").trim();
  if (!/^\d+$/.test(raw)) return 0;
  const hops = Number(raw);
  return Number.isSafeInteger(hops) && hops >= 0 ? hops : 0;
}

export const ENV = {
  appId: readToken("VITE_APP_ID"),
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: readToken("OWNER_OPEN_ID"),
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** scrypt hash of the single administrator password. Never the password itself. */
  adminPasswordHash: readToken("ADMIN_PASSWORD_HASH"),
  sessionCookieSameSite: readSameSite(),
  /**
   * Cloudflare R2 media storage. When these are set, media is served from R2 and nothing on the
   * media path talks to Manus Forge any more. The secret is read here and never logged.
   */
  r2Endpoint: readR2Endpoint(),
  r2Bucket: (process.env.R2_BUCKET ?? "").trim(),
  r2AccessKeyId: (process.env.R2_ACCESS_KEY_ID ?? "").trim(),
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  /**
   * Optional public base URL (an r2.dev subdomain or a custom domain). When set, media URLs point
   * straight at it and no request is signed. When unset the bucket is treated as private and the
   * media route redirects to a short-lived signed URL instead.
   */
  r2PublicBaseUrl: (process.env.R2_PUBLIC_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  /** Trusted reverse-proxy hop count used to identify clients for rate limiting. 0 = trust none. */
  trustedProxyHops: readTrustedProxyHops(),
};
