/**
 * Travel Corner — CA-verified TLS for the MySQL connection (Aiven on Render).
 *
 * Nothing here connects anywhere: the certificate is a throwaway self-signed one generated for this
 * file, the filesystem is injected, and the one check against mysql2 builds a ConnectionConfig
 * without opening a socket. No real CA path is read and no secret is touched.
 *
 * The properties under test are the ones whose absence fails silently in production:
 *   - a CA path is never passed through as if it were certificate content;
 *   - a missing, unreadable, empty or corrupt CA throws instead of connecting unverified;
 *   - an SSL query parameter mysql2 ignores throws instead of downgrading to plaintext;
 *   - with no CA configured, the connection object is byte-for-byte what drizzle(string) built.
 */
import { checkServerIdentity } from "node:tls";
import { describe, expect, it } from "vitest";
import {
  CA_PATH_ENV,
  DatabaseSslError,
  MIN_TLS_VERSION,
  assertCertificatePem,
  assertDatabaseTlsConfiguration,
  assertNoUnsupportedSslParams,
  assertVerifiableHost,
  isVerifiableHostname,
  databaseConnectionOptions,
  databaseSslOptions,
  drizzleKitCredentials,
  readCaCertificate,
} from "./databaseSsl";

/**
 * A self-signed P-256 certificate generated solely for this test (CN=Travel Corner Test CA).
 * It is not a real certificate authority, carries no private key, and grants nothing.
 */
const TEST_CA_PEM = `-----BEGIN CERTIFICATE-----
MIIBlDCCATugAwIBAgIUIxpThecBsec2faZlz9jPHGPDuVkwCgYIKoZIzj0EAwIw
IDEeMBwGA1UEAwwVVHJhdmVsIENvcm5lciBUZXN0IENBMB4XDTI2MTAzMTE3MjAz
NFoXDTQ2MTAyNjE3MjAzNFowIDEeMBwGA1UEAwwVVHJhdmVsIENvcm5lciBUZXN0
IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEI+hpVmGDomIkz31aH2oALGio
PpLWhfv9alTehuE/j2NKnfbDyuPzDGWIXAAeMEsqkcfaSfzcYMy8EgQKL0wJAaNT
MFEwHQYDVR0OBBYEFKkebt8mVcLDl/lGHOv28/7bJT/RMB8GA1UdIwQYMBaAFKke
bt8mVcLDl/lGHOv28/7bJT/RMA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwID
RwAwRAIgDkGbHDryF1O4nImAsjY1Axi6NyK2fxRKR7wLr8Kf2sUCIA76yfABhGPy
tC4iJsdZAMUFuqJy2pK+1/qFycNsWW6W
-----END CERTIFICATE-----
`;

const CA_PATH = "/etc/secrets/aiven-ca.pem";
const AIVEN_URL = "mysql://avnadmin:pw@mysql-travel.aivencloud.com:12345/defaultdb";
const LOCAL_URL = "mysql://root:root@127.0.0.1:3306/travelcorner";

/** A fake readFileSync: serves the files it is given and throws ENOENT for anything else. */
function fakeFs(files: Record<string, string>) {
  return ((path: string) => {
    if (path in files) return files[path]!;
    const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
    (error as NodeJS.ErrnoException).code = "ENOENT";
    throw error;
  }) as unknown as typeof import("node:fs").readFileSync;
}

const withCa = fakeFs({ [CA_PATH]: TEST_CA_PEM });
const caEnv = { [CA_PATH_ENV]: CA_PATH } as NodeJS.ProcessEnv;

describe("certificate validation", () => {
  it("accepts a real PEM certificate", () => {
    expect(assertCertificatePem(TEST_CA_PEM, CA_PATH)).toBe(TEST_CA_PEM);
    expect(readCaCertificate(CA_PATH, withCa)).toBe(TEST_CA_PEM);
  });

  it("rejects a path given where certificate content belongs", () => {
    // The defect this whole module exists to prevent: tls.createSecureContext accepts a path string
    // without complaint and loads no certificate, so the failure would surface as an opaque
    // handshake error much later.
    expect(() => assertCertificatePem(CA_PATH, "DATABASE_URL ?ssl={\"ca\":…}")).toThrow(DatabaseSslError);
    expect(() => assertCertificatePem(CA_PATH, "x")).toThrow(/BEGIN\/END CERTIFICATE markers/);
  });

  it("rejects empty, whitespace-only and marker-less content", () => {
    expect(() => assertCertificatePem("", CA_PATH)).toThrow(/empty/i);
    expect(() => assertCertificatePem("   \n\t ", CA_PATH)).toThrow(/empty/i);
    expect(() => assertCertificatePem("not a certificate", CA_PATH)).toThrow(/markers/);
  });

  it("rejects a certificate whose body is corrupt", () => {
    const corrupt = "-----BEGIN CERTIFICATE-----\nnot-valid-base64!!!\n-----END CERTIFICATE-----\n";

    // Markers alone are not enough; the bytes have to parse.
    expect(() => assertCertificatePem(corrupt, CA_PATH)).toThrow(/could not be parsed/);
  });

  it("rejects a truncated certificate", () => {
    const truncated = `${TEST_CA_PEM.split("\n").slice(0, 4).join("\n")}\n-----END CERTIFICATE-----\n`;

    expect(() => assertCertificatePem(truncated, CA_PATH)).toThrow(DatabaseSslError);
  });
});

describe("fail-closed behaviour", () => {
  it("throws, naming the path, when the certificate is missing", () => {
    const empty = fakeFs({});

    expect(() => databaseSslOptions(caEnv, empty)).toThrow(DatabaseSslError);
    expect(() => databaseSslOptions(caEnv, empty)).toThrow(new RegExp(CA_PATH_ENV));
    expect(() => databaseSslOptions(caEnv, empty)).toThrow(/ENOENT/);
  });

  it("throws when the file exists but cannot be read", () => {
    const denied = (() => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    }) as unknown as typeof import("node:fs").readFileSync;

    expect(() => databaseSslOptions(caEnv, denied)).toThrow(/EACCES/);
  });

  it("throws rather than connecting unverified when the certificate is empty", () => {
    expect(() => databaseConnectionOptions(AIVEN_URL, caEnv, fakeFs({ [CA_PATH]: "" }))).toThrow(/empty/i);
  });

  it("propagates out of the connection builder, so no pool is created", () => {
    // databaseConnectionOptions is called before drizzle() in getDb, so a bad CA never reaches mysql2.
    expect(() => databaseConnectionOptions(AIVEN_URL, caEnv, fakeFs({}))).toThrow(DatabaseSslError);
    expect(() => drizzleKitCredentials(AIVEN_URL, caEnv, fakeFs({}))).toThrow(DatabaseSslError);
  });
});

describe("TLS options when a CA is configured", () => {
  it("requires verification and TLS 1.2 or better, and passes PEM content not a path", () => {
    const { ssl } = databaseSslOptions(caEnv, withCa);

    expect(ssl).toBeDefined();
    expect(ssl!.rejectUnauthorized).toBe(true);
    expect(ssl!.minVersion).toBe(MIN_TLS_VERSION);
    expect(ssl!.ca).toBe(TEST_CA_PEM);
    expect(ssl!.ca).not.toBe(CA_PATH);
    expect(String(ssl!.ca)).toContain("BEGIN CERTIFICATE");
  });

  it("is absent when no CA is configured, and when the variable is blank", () => {
    expect(databaseSslOptions({}, withCa)).toEqual({});
    expect(databaseSslOptions({ [CA_PATH_ENV]: "" }, withCa)).toEqual({});
    expect(databaseSslOptions({ [CA_PATH_ENV]: "   " }, withCa)).toEqual({});
  });
});

describe("unsupported SSL query parameters", () => {
  it("refuses the ssl-mode that Aiven's own connection URI carries", () => {
    // mysql2 logs "Ignoring invalid configuration option: ssl-mode" and leaves ssl disabled, so
    // pasting Aiven's URI unchanged would send credentials in plaintext.
    expect(() => assertNoUnsupportedSslParams(`${AIVEN_URL}?ssl-mode=REQUIRED`)).toThrow(/ssl-mode/);
    expect(() => assertNoUnsupportedSslParams(`${AIVEN_URL}?ssl-mode=REQUIRED`)).toThrow(/plaintext/);
  });

  it("refuses the other spellings that look like TLS but are ignored", () => {
    for (const param of ["sslmode=require", "ssl_mode=REQUIRED", "ssl-ca=/etc/secrets/aiven-ca.pem", "sslaccept=strict", "useSSL=true", "requireSSL=true", "verify-ca=1"]) {
      expect(() => assertNoUnsupportedSslParams(`${AIVEN_URL}?${param}`), param).toThrow(DatabaseSslError);
    }
  });

  it("matches the parameter name whatever its case", () => {
    expect(() => assertNoUnsupportedSslParams(`${AIVEN_URL}?SSL-Mode=REQUIRED`)).toThrow(DatabaseSslError);
  });

  it("allows a URL with no SSL parameters, and the mysql2-native ssl option", () => {
    expect(() => assertNoUnsupportedSslParams(AIVEN_URL)).not.toThrow();
    expect(() => assertNoUnsupportedSslParams(LOCAL_URL)).not.toThrow();
    // ?ssl={...} is mysql2's own supported form, so it is left alone.
    expect(() =>
      assertNoUnsupportedSslParams(`${AIVEN_URL}?ssl=${encodeURIComponent('{"rejectUnauthorized":true}')}`)
    ).not.toThrow();
  });

  it("leaves an unparseable URL to mysql2 to report", () => {
    expect(() => assertNoUnsupportedSslParams("not-a-url")).not.toThrow();
  });
});

describe("connection object for drizzle", () => {
  it("is exactly { uri } when no CA is configured, preserving local and loopback behaviour", () => {
    // drizzle(string) builds createPool({ uri }); this must stay equivalent so that development and
    // the loopback integration harness are untouched.
    expect(databaseConnectionOptions(LOCAL_URL, {}, withCa)).toEqual({ uri: LOCAL_URL });
  });

  it("carries the URI and the CA together when one is configured", () => {
    const connection = databaseConnectionOptions(AIVEN_URL, caEnv, withCa);

    expect(connection.uri).toBe(AIVEN_URL);
    expect(connection.ssl?.ca).toBe(TEST_CA_PEM);
    expect(connection.ssl?.rejectUnauthorized).toBe(true);
  });

  it("is accepted by mysql2, which honours both the URI and the CA", async () => {
    // createPool is lazy — it resolves the configuration without opening a socket — so this checks
    // the real code path drizzle takes, against a host that is never contacted.
    const { createPool } = await import("mysql2");
    const connection = databaseConnectionOptions(AIVEN_URL, caEnv, withCa);
    const pool = createPool(connection);

    try {
      const config = pool.config.connectionConfig as unknown as {
        host: string;
        port: number;
        database: string;
        ssl: { ca?: string; minVersion?: string; rejectUnauthorized?: boolean } | false;
      };

      expect(config.host).toBe("mysql-travel.aivencloud.com");
      expect(config.port).toBe(12345);
      expect(config.database).toBe("defaultdb");
      // ssl === false is the silent-plaintext failure this guards against.
      expect(config.ssl).not.toBe(false);
      expect((config.ssl as { ca?: string }).ca).toBe(TEST_CA_PEM);
      expect((config.ssl as { rejectUnauthorized?: boolean }).rejectUnauthorized).toBe(true);
      expect((config.ssl as { minVersion?: string }).minVersion).toBe(MIN_TLS_VERSION);
    } finally {
      await new Promise<void>((resolve) => pool.end(() => resolve()));
    }
  });

  it("leaves mysql2 with ssl disabled only when no CA is configured", async () => {
    const { createPool } = await import("mysql2");
    const pool = createPool(databaseConnectionOptions(LOCAL_URL, {}, withCa));

    try {
      // Local development is plaintext by design, and that stays true.
      expect((pool.config.connectionConfig as unknown as { ssl: unknown }).ssl).toBe(false);
    } finally {
      await new Promise<void>((resolve) => pool.end(() => resolve()));
    }
  });
});

describe("TLS hostname identity verification", () => {
  /**
   * mysql2 runs exactly `Tls.checkServerIdentity(servername, peerCertificate)` when
   * ssl.verifyIdentity is set, and replaces it with a stub returning undefined when it is not. These
   * feed Node's real function the peer-certificate shape it consumes, so the semantics the flag
   * switches on are tested rather than assumed. No socket is opened and no key is needed.
   */
  const certFor = (names: string[]) => ({
    subject: { CN: names[0]! },
    subjectaltname: names.map((name) => `DNS:${name}`).join(", "),
  });

  const AIVEN_HOST = "mysql-travel.aivencloud.com";

  it("accepts the certificate when the hostname matches", () => {
    expect(checkServerIdentity(AIVEN_HOST, certFor([AIVEN_HOST]) as never)).toBeUndefined();
  });

  it("rejects a certificate issued for a different host", () => {
    // The attack verifyIdentity closes: a certificate signed by the same CA but for another host.
    const error = checkServerIdentity(AIVEN_HOST, certFor(["other-service.aivencloud.com"]) as never);

    expect(error).toBeInstanceOf(Error);
    expect(error!.message).toMatch(/altnames|Host:/i);
  });

  it("rejects a near-miss hostname", () => {
    for (const presented of [
      "mysql-travel.aivencloud.com.evil.example",
      "mysql-travel.aivencloud.co",
      "aivencloud.com",
    ]) {
      expect(checkServerIdentity(AIVEN_HOST, certFor([presented]) as never), presented).toBeInstanceOf(Error);
    }
  });

  it("honours a wildcard certificate only one label deep", () => {
    expect(checkServerIdentity("a.aivencloud.com", certFor(["*.aivencloud.com"]) as never)).toBeUndefined();
    // A wildcard must not span a dot.
    expect(checkServerIdentity("a.b.aivencloud.com", certFor(["*.aivencloud.com"]) as never)).toBeInstanceOf(Error);
  });

  it("asks mysql2 to run that check, on both the runtime and the migration path", () => {
    const connection = databaseConnectionOptions(AIVEN_URL, caEnv, withCa);
    const credentials = drizzleKitCredentials(AIVEN_URL, caEnv, withCa);

    // Without verifyIdentity, mysql2 substitutes a checkServerIdentity that returns undefined.
    expect(connection.ssl?.verifyIdentity).toBe(true);
    expect(credentials.ssl?.verifyIdentity).toBe(true);
    // The name verified is config.host, which mysql2 derives from the URI.
    expect(credentials.host).toBe(AIVEN_HOST);
  });

  it("reaches mysql2's live configuration intact", async () => {
    const { createPool } = await import("mysql2");
    const pool = createPool(databaseConnectionOptions(AIVEN_URL, caEnv, withCa));

    try {
      const config = pool.config.connectionConfig as unknown as {
        host: string;
        ssl: { verifyIdentity?: boolean; rejectUnauthorized?: boolean };
      };

      expect(config.ssl.verifyIdentity).toBe(true);
      expect(config.ssl.rejectUnauthorized).toBe(true);
      expect(config.host).toBe(AIVEN_HOST);
    } finally {
      await new Promise<void>((resolve) => pool.end(() => resolve()));
    }
  });
});

describe("hosts whose identity cannot be verified", () => {
  it("classifies hostnames and IP literals", () => {
    expect(isVerifiableHostname("mysql-travel.aivencloud.com")).toBe(true);
    expect(isVerifiableHostname("localhost")).toBe(true);
    expect(isVerifiableHostname("127.0.0.1")).toBe(false);
    expect(isVerifiableHostname("203.0.113.7")).toBe(false);
    expect(isVerifiableHostname("::1")).toBe(false);
    expect(isVerifiableHostname("")).toBe(false);
  });

  it("refuses a CA together with an IPv4 or IPv6 literal host", () => {
    // mysql2 skips the identity check for an IP host, so verifyIdentity would be silently inert.
    expect(() => assertVerifiableHost("mysql://u:pw@203.0.113.7:3306/db", caEnv)).toThrow(/IP address/);
    expect(() => assertVerifiableHost("mysql://u:pw@[2001:db8::1]:3306/db", caEnv)).toThrow(/2001:db8::1/);
    expect(() => assertVerifiableHost("mysql://u:pw@127.0.0.1:3306/db", caEnv)).toThrow(DatabaseSslError);
  });

  it("allows an IP host when no CA is configured, so local development is unaffected", () => {
    expect(() => assertVerifiableHost(LOCAL_URL, {})).not.toThrow();
    expect(databaseConnectionOptions(LOCAL_URL, {}, withCa)).toEqual({ uri: LOCAL_URL });
  });

  it("allows a hostname with a CA", () => {
    expect(() => assertVerifiableHost(AIVEN_URL, caEnv)).not.toThrow();
  });

  it("stops the server from starting on an IP host with a CA configured", () => {
    expect(() =>
      assertDatabaseTlsConfiguration(
        { DATABASE_URL: "mysql://u:pw@203.0.113.7:3306/db", [CA_PATH_ENV]: CA_PATH },
        withCa
      )
    ).toThrow(/IP address/);
  });
});

describe("startup validation", () => {
  it("passes with no DATABASE_URL, so local tooling and tests are unaffected", () => {
    expect(() => assertDatabaseTlsConfiguration({}, withCa)).not.toThrow();
    expect(() => assertDatabaseTlsConfiguration({ [CA_PATH_ENV]: CA_PATH }, withCa)).not.toThrow();
  });

  it("passes for a plain local URL with no CA configured", () => {
    expect(() => assertDatabaseTlsConfiguration({ DATABASE_URL: LOCAL_URL }, withCa)).not.toThrow();
  });

  it("passes when the CA is present and valid", () => {
    expect(() =>
      assertDatabaseTlsConfiguration({ DATABASE_URL: AIVEN_URL, [CA_PATH_ENV]: CA_PATH }, withCa)
    ).not.toThrow();
  });

  it("refuses to start when the CA is configured but unusable", () => {
    expect(() =>
      assertDatabaseTlsConfiguration({ DATABASE_URL: AIVEN_URL, [CA_PATH_ENV]: CA_PATH }, fakeFs({}))
    ).toThrow(DatabaseSslError);
  });

  it("refuses to start when the URL carries an SSL parameter the driver ignores", () => {
    // Without this the deploy would go live: `/` is static, so the health check passes while every
    // database-backed request fails.
    expect(() =>
      assertDatabaseTlsConfiguration({ DATABASE_URL: `${AIVEN_URL}?ssl-mode=REQUIRED` }, withCa)
    ).toThrow(/ssl-mode/);
  });
});

describe("credentials for drizzle-kit migrations", () => {
  it("spells out the fields, because the url branch has no ssl option", () => {
    const credentials = drizzleKitCredentials(AIVEN_URL, caEnv, withCa);

    expect(credentials).toMatchObject({
      host: "mysql-travel.aivencloud.com",
      port: 12345,
      user: "avnadmin",
      password: "pw",
      database: "defaultdb",
    });
    expect(credentials.ssl?.ca).toBe(TEST_CA_PEM);
    expect(credentials.ssl?.rejectUnauthorized).toBe(true);
    expect(credentials.ssl?.minVersion).toBe(MIN_TLS_VERSION);
  });

  it("defaults the port and omits ssl when no CA is configured", () => {
    const credentials = drizzleKitCredentials("mysql://root:root@localhost/travelcorner", {}, withCa);

    expect(credentials.port).toBe(3306);
    expect(credentials.ssl).toBeUndefined();
  });

  it("decodes percent-escaped credentials", () => {
    const credentials = drizzleKitCredentials(
      "mysql://av%40admin:p%40ss%3Aword@host:3306/my%2Ddb",
      {},
      withCa
    );

    expect(credentials.user).toBe("av@admin");
    expect(credentials.password).toBe("p@ss:word");
    expect(credentials.database).toBe("my-db");
  });
});
