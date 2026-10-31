/**
 * Travel Corner — database initialisation (Phase 1 independent hosting).
 *
 * Independent hosting starts from an empty MySQL 8 database, so `pnpm db:migrate` has to be able to
 * build the whole schema from the committed migration files. Under Manus the schema was kept in step
 * with `drizzle-kit push`, which changes a live database without recording a migration; any column
 * added that way exists in production but not in `drizzle/*.sql`, and a fresh database would come up
 * missing it. These tests replay the committed migrations on paper and compare the result with
 * `drizzle/schema.ts`, so that drift fails here instead of at the first admin save.
 *
 * Nothing connects to a database: the migrations are read as text and `getDb()` is exercised with no
 * DATABASE_URL set.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getTableColumns, getTableName, is, Table } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../drizzle/schema";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "..", "drizzle");

type JournalEntry = { idx: number; tag: string };
type Journal = { dialect: string; entries: JournalEntry[] };

function readJournal(): Journal {
  return JSON.parse(readFileSync(path.join(DRIZZLE_DIR, "meta", "_journal.json"), "utf8")) as Journal;
}

function orderedEntries(): JournalEntry[] {
  return [...readJournal().entries].sort((a, b) => a.idx - b.idx);
}

/**
 * Replay the committed migrations and return the columns each table ends up with.
 * Only the statements drizzle-kit emits for MySQL are understood; an unparsed statement shows up as
 * a missing table or column rather than passing silently.
 */
function schemaAfterMigrations(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();

  for (const entry of orderedEntries()) {
    const sql = readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8");

    for (const [, table, body] of sql.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\);/g)) {
      const columns = new Set<string>();
      for (const line of body.split("\n")) {
        const column = line.match(/^\s*`([^`]+)`\s/);
        if (column) columns.add(column[1]!);
      }
      tables.set(table!, columns);
    }

    // `ADD \`name\`` is a column; `ADD CONSTRAINT` is not, and the backtick keeps them apart.
    for (const [, table, column] of sql.matchAll(/ALTER TABLE `([^`]+)` ADD `([^`]+)`/g)) {
      tables.get(table!)?.add(column!);
    }
    for (const [, table, column] of sql.matchAll(/ALTER TABLE `([^`]+)` DROP COLUMN `([^`]+)`/g)) {
      tables.get(table!)?.delete(column!);
    }
    for (const [, from, to] of sql.matchAll(/ALTER TABLE `([^`]+)` RENAME TO `([^`]+)`/g)) {
      const columns = tables.get(from!);
      if (columns) {
        tables.set(to!, columns);
        tables.delete(from!);
      }
    }
  }

  return tables;
}

/** Every table `drizzle/schema.ts` declares, by database name. */
function declaredTables(): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  for (const value of Object.values(schema)) {
    if (!is(value as never, Table)) continue;
    const table = value as unknown as Table;
    declared.set(
      getTableName(table),
      Object.values(getTableColumns(table))
        .map((column) => column.name)
        .sort()
    );
  }
  return declared;
}

/**
 * The tables the application models, listed so that a drizzle introspection change cannot quietly
 * turn the comparisons below into empty loops. Adding a table means adding it here as well.
 */
const EXPECTED_TABLES = [
  "campaigns",
  "enquiries",
  "offerRatePeriods",
  "siteSettings",
  "travelOffers",
  "umrahPrograms",
  "umrahRateRows",
  "users",
] as const;

describe("committed migration set", () => {
  it("reads the modelled schema, so the comparisons below cannot pass on an empty set", () => {
    const declared = declaredTables();

    expect([...declared.keys()].sort()).toEqual([...EXPECTED_TABLES].sort());
    for (const [name, columns] of declared) {
      expect(columns.length, `no columns were read from \`${name}\``).toBeGreaterThan(2);
      expect(columns).toContain("id");
    }
  });

  it("models every table the migrations create, so no table is left unmodelled", () => {
    expect([...schemaAfterMigrations().keys()].sort()).toEqual([...declaredTables().keys()].sort());
  });

  it("declares the MySQL dialect and a gap-free, file-backed journal", () => {
    const journal = readJournal();
    expect(journal.dialect).toBe("mysql");
    expect(journal.entries.length).toBeGreaterThan(0);

    orderedEntries().forEach((entry, index) => {
      expect(entry.idx).toBe(index);
      // Throws if the migration the journal promises is not committed.
      expect(readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8").length).toBeGreaterThan(0);
    });
  });

  it("creates every table the application models", () => {
    const migrated = schemaAfterMigrations();

    for (const name of declaredTables().keys()) {
      expect(
        migrated.has(name),
        `drizzle/schema.ts models \`${name}\`, but no committed migration creates it; a fresh database would not have the table`
      ).toBe(true);
    }
  });

  it("creates every column the application models, with no column left behind", () => {
    const migrated = schemaAfterMigrations();

    for (const [name, columns] of declaredTables()) {
      const present = migrated.get(name) ?? new Set<string>();

      const missing = columns.filter((column) => !present.has(column));
      expect(
        missing,
        `\`${name}\` is missing ${missing.join(", ")} after the committed migrations; run drizzle-kit generate and commit the result`
      ).toEqual([]);

      const orphaned = [...present].filter((column) => !columns.includes(column)).sort();
      expect(
        orphaned,
        `the migrations create ${orphaned.join(", ")} on \`${name}\`, which drizzle/schema.ts no longer models`
      ).toEqual([]);
    }
  });

  it("creates the role column the administrator gate reads, with an admin value", () => {
    // Authorisation is `ctx.user.role === "admin"`, so a fresh database that cannot store that value
    // would accept the password and still refuse every admin mutation.
    const sql = orderedEntries()
      .map((entry) => readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8"))
      .join("\n");

    const usersTable = sql.match(/CREATE TABLE `users` \(([\s\S]*?)\n\);/);
    expect(usersTable).not.toBeNull();
    const roleColumn = usersTable![1]!.split("\n").find((line) => /^\s*`role`\s/.test(line)) ?? "";

    expect(roleColumn).toMatch(/enum\([^)]*'admin'[^)]*\)/);
    expect(roleColumn).toMatch(/NOT NULL/);
    expect(roleColumn).toMatch(/DEFAULT 'user'/);
  });

  it("uses no Manus-specific or platform-managed SQL", () => {
    const sql = orderedEntries()
      .map((entry) => readFileSync(path.join(DRIZZLE_DIR, `${entry.tag}.sql`), "utf8"))
      .join("\n");

    // A fresh database is created by the hosting provider, so the migrations must not assume a
    // database name, a user, or a host of their own.
    expect(sql).not.toMatch(/CREATE DATABASE/i);
    expect(sql).not.toMatch(/CREATE USER|GRANT /i);
    expect(sql).not.toMatch(/manus/i);
  });
});

describe("lazy database handle", () => {
  let previousDatabaseUrl: string | undefined;

  beforeEach(() => {
    previousDatabaseUrl = process.env.DATABASE_URL;
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("returns no handle when DATABASE_URL is unset, so startup does not depend on a database", async () => {
    delete process.env.DATABASE_URL;

    const { getDb } = await import("./db");

    await expect(getDb()).resolves.toBeNull();
  });

  it("serves public reads as empty rather than throwing while the database is unreachable", async () => {
    delete process.env.DATABASE_URL;

    const dbModule = await import("./db");

    // The public site has to render during an outage; the admin dashboard surfaces the failure.
    await expect(dbModule.listPublicOffers()).resolves.toEqual([]);
    await expect(dbModule.getPublicOfferBySlug("any-slug")).resolves.toBeUndefined();
  });
});
