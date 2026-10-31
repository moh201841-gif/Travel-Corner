/**
 * TLS configuration for the MySQL connection, shared by the server and by drizzle-kit.
 *
 * A managed MySQL such as Aiven presents a certificate signed by its own project CA, so the client
 * has to be given that CA to verify against. Three facts make this impossible to express in
 * DATABASE_URL alone, and all three fail quietly, which is why this module exists:
 *
 *   1. Node's TLS `ca` option takes certificate *content*, never a path. mysql2 passes `ssl.ca`
 *      straight to tls.createSecureContext, and that call accepts a path string without complaint
 *      while loading no certificate at all — and because `ca` replaces the default root store, the
 *      handshake then fails with an opaque verification error.
 *   2. mysql2's only built-in SSL profile is "Amazon RDS". `?ssl=true` and `?ssl=REQUIRED` throw.
 *   3. Aiven's own connection URI carries `?ssl-mode=REQUIRED`, which mysql2 does not recognise. It
 *      logs "Ignoring invalid configuration option" and leaves ssl disabled, so the connection goes
 *      out in plaintext with nothing but a warning on stderr.
 *
 * So the CA is read from disk here (Render mounts Secret Files at /etc/secrets/<name>) and passed as
 * PEM content beside the URI. Everything fails closed: if DATABASE_CA_PATH is set, a certificate
 * that is missing, unreadable, empty or unparseable throws rather than connecting unverified, and an
 * unsupported SSL query parameter in the URL throws rather than silently downgrading to plaintext.
 *
 * Reading process.env at call time rather than from the ENV snapshot is deliberate: it matches the
 * adjacent getDb(), which reads process.env.DATABASE_URL directly, and it keeps this module usable
 * from drizzle.config.ts without pulling in the server's environment module.
 */
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { X509Certificate } from "node:crypto";
import type { SslOptions } from "mysql2";

/** Environment variable holding the path to the CA certificate, in PEM form. */
export const CA_PATH_ENV = "DATABASE_CA_PATH";

/** Minimum TLS version accepted once a CA is configured. */
export const MIN_TLS_VERSION = "TLSv1.2" as const;

/**
 * Query parameters that look like they ask for TLS but which mysql2 does not understand. Each one
 * would be ignored with a warning and leave the connection unencrypted, so they are refused.
 * The keys are compared case-insensitively.
 */
export const UNSUPPORTED_SSL_PARAMS = [
  "ssl-mode",
  "sslmode",
  "ssl_mode",
  "ssl-ca",
  "sslca",
  "ssl_ca",
  "ssl-cert",
  "sslcert",
  "ssl-key",
  "sslkey",
  "sslaccept",
  "usessl",
  "requiressl",
  "verifyca",
  "verify-ca",
  "verifyservercertificate",
] as const;

export class DatabaseSslError extends Error {}

/**
 * Validate PEM text and return it unchanged.
 * X509Certificate is a real parser: it rejects empty input, text without PEM markers, a bare file
 * path and corrupt base64 — all the ways a misconfiguration would otherwise reach the TLS layer and
 * be accepted silently.
 */
export function assertCertificatePem(pem: string, source: string): string {
  if (pem.trim() === "") {
    throw new DatabaseSslError(`The CA certificate at ${source} is empty.`);
  }
  if (!/-----BEGIN CERTIFICATE-----/.test(pem) || !/-----END CERTIFICATE-----/.test(pem)) {
    throw new DatabaseSslError(
      `The file at ${source} does not look like a PEM certificate (no BEGIN/END CERTIFICATE markers).`
    );
  }
  try {
    new X509Certificate(pem);
  } catch (error) {
    throw new DatabaseSslError(
      `The CA certificate at ${source} could not be parsed: ${(error as Error).message}`
    );
  }
  return pem;
}

/** Read and validate the CA certificate. Throws on anything unusable — never returns a fallback. */
export function readCaCertificate(caPath: string, readFile = readFileSync): string {
  let contents: string;
  try {
    contents = readFile(caPath, "utf8") as string;
  } catch (error) {
    throw new DatabaseSslError(
      `${CA_PATH_ENV} is set to ${caPath}, but the certificate could not be read: ${(error as Error).message}`
    );
  }
  return assertCertificatePem(contents, caPath);
}

/**
 * Refuse a URL whose query asks for TLS in a spelling mysql2 ignores.
 * Without this, pasting Aiven's service URI unchanged yields an unencrypted connection.
 */
export function assertNoUnsupportedSslParams(databaseUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    // Not this module's job to validate the URL; mysql2 will report it.
    return;
  }

  const offending: string[] = [];
  parsed.searchParams.forEach((_value, key) => {
    if ((UNSUPPORTED_SSL_PARAMS as readonly string[]).includes(key.toLowerCase())) {
      offending.push(key);
    }
  });
  if (offending.length === 0) return;

  throw new DatabaseSslError(
    `DATABASE_URL contains ${offending.join(", ")}, which mysql2 ignores — the connection would ` +
      `fall back to plaintext. Remove it from the URL and set ${CA_PATH_ENV} to a CA certificate ` +
      `file instead (see docs/deployment-render-aiven.md).`
  );
}

/**
 * True when a hostname can carry an identity check.
 *
 * mysql2 computes the name to verify as `Net.isIP(config.host) ? undefined : config.host`, and then
 * only runs the check when that name is a string. So against an IP literal, verifyIdentity is
 * silently inert: the chain is still verified, but nothing ties the certificate to the host dialled.
 */
export function isVerifiableHostname(host: string): boolean {
  return host !== "" && isIP(host) === 0;
}

/**
 * Refuse the combination of a configured CA and an IP-literal host, because identity verification
 * cannot be enforced there. Failing closed keeps the guarantee honest rather than quietly weaker
 * than the rest of this module promises. A managed MySQL is always reached by hostname.
 */
export function assertVerifiableHost(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  if ((env[CA_PATH_ENV] ?? "").trim() === "") return;

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    return;
  }
  // A URL wraps an IPv6 literal in brackets; isIP wants it bare.
  const bare = host.replace(/^\[(.+)\]$/, "$1");
  if (isVerifiableHostname(bare)) return;

  throw new DatabaseSslError(
    `${CA_PATH_ENV} is set, but DATABASE_URL addresses the server by IP address (${bare}). TLS ` +
      `hostname verification cannot be enforced against an IP, so the certificate could not be tied ` +
      `to this server. Use the hostname from the database provider instead.`
  );
}

/**
 * TLS options for mysql2, or {} when no CA is configured.
 * rejectUnauthorized is set explicitly rather than relying on mysql2's default, so the intent is
 * visible at the call site and cannot be weakened by a query parameter.
 */
export function databaseSslOptions(
  env: NodeJS.ProcessEnv = process.env,
  readFile = readFileSync
): { ssl?: SslOptions } {
  const caPath = (env[CA_PATH_ENV] ?? "").trim();
  if (caPath === "") return {};

  return {
    ssl: {
      ca: readCaCertificate(caPath, readFile),
      minVersion: MIN_TLS_VERSION,
      rejectUnauthorized: true,
      // Without this mysql2 replaces checkServerIdentity with a stub that returns undefined, so the
      // certificate chain is verified but the hostname on it is never checked — any host holding a
      // certificate signed by the same CA would be accepted. mysql2's own typings say of this
      // option: "You should enable this but it is disabled by default right now for backwards
      // compatibility." The name checked is config.host, which mysql2 derives from the URI.
      verifyIdentity: true,
    } as SslOptions,
  };
}

/**
 * The connection object for drizzle/mysql2.
 *
 * mysql2 merges options derived from `uri` with its siblings and lets the explicit siblings win
 * (ConnectionConfig: `if (options[key]) continue`), so the CA here overrides any `ssl` in the URL.
 * With no CA configured this is `{ uri }`, which is exactly what drizzle(string) builds — so local
 * development and the loopback integration harness are unaffected.
 */
export function databaseConnectionOptions(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  readFile = readFileSync
): { uri: string; ssl?: SslOptions } {
  assertNoUnsupportedSslParams(databaseUrl);
  assertVerifiableHost(databaseUrl, env);
  return { uri: databaseUrl, ...databaseSslOptions(env, readFile) };
}

/**
 * Validate the database TLS configuration at startup.
 *
 * getDb() builds its pool lazily, so without this a bad CA or an ignored SSL parameter would only
 * surface on the first query — and because the health check path `/` is served from static files and
 * touches no database, the host would mark a broken deployment live. Calling this before the server
 * listens turns a misconfiguration into a failed deploy instead.
 *
 * A no-op when DATABASE_URL is unset, which is how local tooling and the test suite run.
 */
export function assertDatabaseTlsConfiguration(
  env: NodeJS.ProcessEnv = process.env,
  readFile = readFileSync
): void {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) return;
  databaseConnectionOptions(databaseUrl, env, readFile);
}

/**
 * Credentials for drizzle-kit, which needs the fields spelled out: its mysql `dbCredentials` is a
 * union, and the `{ url }` branch has no `ssl` option at all, so a URL alone cannot carry a CA.
 */
export function drizzleKitCredentials(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  readFile = readFileSync
): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: SslOptions;
} {
  assertNoUnsupportedSslParams(databaseUrl);
  assertVerifiableHost(databaseUrl, env);
  const parsed = new URL(databaseUrl);

  return {
    host: decodeURIComponent(parsed.hostname),
    port: Number(parsed.port || "3306"),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    ...databaseSslOptions(env, readFile),
  };
}
