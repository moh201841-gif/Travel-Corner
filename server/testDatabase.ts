/**
 * Travel Corner — disposable integration-test database harness (Tier 1, MySQL 8).
 *
 * Real integration tests need the production code path (server/db.ts) to talk to a real server.
 * getDb() reads only DATABASE_URL and caches its pool on first call, so the only way to redirect it
 * is to assign DATABASE_URL before server/db.ts is first imported in that worker. That assignment is
 * the entire blast radius of this harness, so every safety check below runs *before* it, and the
 * harness fails closed on each one.
 *
 * SAFETY MODEL
 *   1. The connection comes from TEST_DATABASE_URL only. There is no fallback to DATABASE_URL.
 *   2. A missing or unparseable TEST_DATABASE_URL is a hard error, never a skip.
 *   3. A TEST_DATABASE_URL whose server matches DATABASE_URL's server is refused.
 *   4. Tier 1 is loopback-only: a non-loopback host is refused. This is the primary isolation
 *      control, and it is a property of the address rather than a name convention, so it cannot be
 *      defeated by naming a remote database "test".
 *   5. The harness never writes to the database named in the URL. It creates its own uniquely named
 *      database per run and uses only that.
 *   6. DROP targets exactly the database this run created, compared by name, or it does not run.
 *   7. Nothing logs a password or a full connection string; only "host:port" is ever surfaced.
 *
 * Deliberately NOT a safety control: the database name. A hardcoded name would be a convention a
 * caller could satisfy against a shared server. Ownership here is established by creation.
 *
 * This file is imported only by integration tests. Unit tests never load it, so `pnpm test` opens no
 * connection and needs no database.
 */
import { createConnection, type Connection } from "mysql2/promise";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * A rate price that the disposable schema is configured to reject, so the *second* write of
 * saveAdminOffer fails inside the real transaction. Failure injection is a CHECK constraint on the
 * disposable database — real server-side SQL, not a mocked transaction — applied only after the
 * committed migrations, and only to the database this run owns.
 */
export const SENTINEL_REJECTED_PRICE = "6666.00";

const SENTINEL_CONSTRAINT = "travelcorner_test_rate_write_sentinel";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const MIGRATIONS = ["0000_giant_betty_ross.sql", "0001_thankful_sentinels.sql"];

/** The exact shape uniqueDatabaseName() produces; teardown drops nothing that fails this. */
const OWNED_NAME_PATTERN = /^travelcorner_it_[0-9]{14}_[a-z0-9]{1,10}$/;

export type IntegrationDatabase = {
  /** Redacted descriptor safe to log: host and port only, never user or password. */
  readonly target: string;
  /** The database this run created and therefore owns. */
  readonly databaseName: string;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Empty every business table this harness seeds, so each test starts from a known state. */
  reset(): Promise<void>;
  teardown(): Promise<void>;
};

function fail(message: string): never {
  throw new Error(`[integration-db] ${message}`);
}

/** host:port only. Never includes user, password, or database. */
function describeServer(url: URL): string {
  return `${url.hostname}:${url.port || "3306"}`;
}

function parseOrFail(raw: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail(`${label} is not a valid URL. Refusing to run.`);
  }
  if (url.protocol !== "mysql:") fail(`${label} must use the mysql: protocol. Refusing to run.`);
  if (!url.hostname) fail(`${label} has no host. Refusing to run.`);
  return url;
}

/**
 * Validate TEST_DATABASE_URL and return it. Fails closed on every check.
 * Runs before any connection is opened and before DATABASE_URL is touched.
 */
export function resolveTestServerUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw || raw.trim() === "") {
    fail(
      "TEST_DATABASE_URL is not set. Integration tests require a disposable MySQL 8 server and will " +
        "not fall back to DATABASE_URL. Set TEST_DATABASE_URL to a loopback server, or run `pnpm test` " +
        "for the database-free suite.",
    );
  }

  const testUrl = parseOrFail(raw, "TEST_DATABASE_URL");

  if (!LOOPBACK_HOSTS.has(testUrl.hostname)) {
    fail(
      `TEST_DATABASE_URL points at a non-loopback host (${describeServer(testUrl)}). Tier 1 integration ` +
        "testing runs only against a disposable server on localhost. Refusing to run.",
    );
  }

  const productionRaw = process.env.DATABASE_URL;
  if (productionRaw && productionRaw.trim() !== "") {
    const productionUrl = parseOrFail(productionRaw, "DATABASE_URL");
    const sameServer =
      productionUrl.hostname === testUrl.hostname && (productionUrl.port || "3306") === (testUrl.port || "3306");
    if (sameServer) {
      fail(
        "TEST_DATABASE_URL and DATABASE_URL address the same server. The integration harness will not " +
          "create or drop databases on a server that is also configured as production. Refusing to run.",
      );
    }
  }

  return testUrl;
}

function uniqueDatabaseName(): string {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
  const salt = Math.random().toString(36).slice(2, 10);
  // Only [a-z0-9_] by construction, so it is safe to interpolate into a backtick-quoted identifier.
  return `travelcorner_it_${stamp}_${salt}`;
}

function statementsOf(migration: string): string[] {
  const file = path.join(process.cwd(), "drizzle", migration);
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

/**
 * Confirm the server resolves timestamps at UTC. Every TIMESTAMP column in this schema is converted
 * using the session time zone, so a non-UTC server would shift the validity-window boundaries that
 * these tests assert on. Fail closed rather than produce a result that depends on the host clock.
 */
async function assertUtcSession(connection: Connection): Promise<void> {
  const [rows] = await connection.query("SELECT TIMEDIFF(NOW(), UTC_TIMESTAMP()) AS offset");
  const offset = String((rows as Array<{ offset: unknown }>)[0]?.offset ?? "");
  if (!/^(00:00:00(\.0+)?|-?00:00:00)$/.test(offset)) {
    fail(
      `the test server is not running at UTC (NOW() - UTC_TIMESTAMP() = ${offset}). TIMESTAMP columns ` +
        "would shift and boundary assertions would be unreliable. Refusing to run.",
    );
  }
}

/** Tables this harness seeds and clears. Ordered so child rows go before their parents. */
const SEEDED_TABLES = ["offerRatePeriods", "travelOffers"] as const;

/**
 * Create a uniquely named disposable database, apply the committed migrations to it, install the
 * failure-injection constraint, and point DATABASE_URL at it.
 *
 * Call this before importing server/db.ts (see importApplicationDb). Setup is ordered so a partial
 * failure cannot leave DATABASE_URL pointing somewhere unintended: the assignment happens last, and
 * anything that throws earlier tears down what it had already created.
 */
export async function setupIntegrationDatabase(): Promise<IntegrationDatabase> {
  // Make Node's own Date handling deterministic before any connection exists.
  process.env.TZ = "UTC";

  const serverUrl = resolveTestServerUrl();
  const target = describeServer(serverUrl);
  const databaseName = uniqueDatabaseName();
  const ownedDatabaseName = databaseName;
  const previousDatabaseUrl = process.env.DATABASE_URL;

  // Admin connection to the server itself, with no database selected: nothing existing is touched.
  const admin = await createConnection({
    host: serverUrl.hostname,
    port: Number(serverUrl.port || "3306"),
    user: decodeURIComponent(serverUrl.username || "root"),
    password: decodeURIComponent(serverUrl.password || ""),
    multipleStatements: false,
    timezone: "Z",
  });

  let created = false;
  try {
    await assertUtcSession(admin);
    await admin.query("SET SESSION time_zone = '+00:00'");

    await admin.query(`CREATE DATABASE \`${databaseName}\``);
    created = true;
    await admin.changeUser({ database: databaseName });
    await admin.query("SET SESSION time_zone = '+00:00'");

    for (const migration of MIGRATIONS) {
      for (const statement of statementsOf(migration)) {
        await admin.query(statement);
      }
    }

    // Database-level failure injection, scoped to this disposable database only. MySQL 8.0.16+
    // enforces CHECK constraints, so a rate write carrying the sentinel price fails server-side
    // while the offer write that precedes it does not — which is exactly what makes a
    // non-atomic implementation observable.
    await admin.query(
      `ALTER TABLE \`offerRatePeriods\` ADD CONSTRAINT \`${SENTINEL_CONSTRAINT}\` CHECK (\`price\` <> ${SENTINEL_REJECTED_PRICE})`,
    );
  } catch (error) {
    if (created) {
      try {
        await admin.query(`DROP DATABASE \`${databaseName}\``);
      } catch {
        /* teardown of a failed setup must not mask the original error */
      }
    }
    await admin.end().catch(() => undefined);
    throw error;
  }

  // Last step, once the disposable database is fully provisioned.
  const applicationUrl = new URL(serverUrl.toString());
  applicationUrl.pathname = `/${databaseName}`;
  applicationUrl.searchParams.set("timezone", "Z");
  process.env.DATABASE_URL = applicationUrl.toString();

  return {
    target,
    databaseName,
    async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
      const [rows] = await admin.query(sql, params);
      return rows as T[];
    },
    async reset(): Promise<void> {
      for (const table of SEEDED_TABLES) {
        await admin.query(`DELETE FROM \`${table}\``);
      }
    },
    async teardown(): Promise<void> {
      try {
        // Ownership check: drop only a database this run demonstrably created, whose name still
        // matches the generated form. A pre-existing or externally named database never qualifies.
        if (!created) fail("this run created no database; refusing to drop anything.");
        if (databaseName !== ownedDatabaseName || !OWNED_NAME_PATTERN.test(ownedDatabaseName)) {
          fail("refusing to drop a database this run does not own.");
        }
        await admin.query(`DROP DATABASE \`${ownedDatabaseName}\``);
      } finally {
        await admin.end().catch(() => undefined);
        if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = previousDatabaseUrl;
      }
    },
  };
}

/**
 * Import server/db.ts only once DATABASE_URL provably points at the disposable database.
 * getDb() caches its pool on first use, so this must be the first import of that module in the
 * worker — hence the dynamic import rather than a top-level one.
 */
export async function importApplicationDb(database: IntegrationDatabase) {
  const configured = process.env.DATABASE_URL;
  if (!configured) fail("DATABASE_URL is unset after setup; refusing to import application code.");
  const configuredUrl = parseOrFail(configured, "DATABASE_URL (harness-assigned)");
  if (configuredUrl.pathname !== `/${database.databaseName}`) {
    fail("DATABASE_URL does not point at the disposable database; refusing to import application code.");
  }
  if (!LOOPBACK_HOSTS.has(configuredUrl.hostname)) {
    fail("DATABASE_URL is not loopback after setup; refusing to import application code.");
  }
  return import("./db");
}

/** Close the pool server/db.ts opened, so the Vitest worker does not hang on an open handle. */
export async function closeApplicationPool(module: { getDb: () => Promise<unknown> }): Promise<void> {
  const db = (await module.getDb()) as { $client?: { end?: () => Promise<void> } } | null;
  await db?.$client?.end?.().catch(() => undefined);
}
