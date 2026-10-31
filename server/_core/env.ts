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

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** scrypt hash of the single administrator password. Never the password itself. */
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? "",
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
};
