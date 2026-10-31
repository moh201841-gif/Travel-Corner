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
};
