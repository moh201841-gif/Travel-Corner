/**
 * Travel Corner — replaceUmrahRates transaction boundary (D7).
 *
 * replaceUmrahRates deletes every occupancy row for a program, re-inserts the submitted set, then
 * stamps the program's lastUpdatedAt. Before the transaction boundary those were three separate
 * auto-committed statements, so a failure after the DELETE destroyed the program's whole room-type
 * price list. Unlike offers, the public Umrah listing does not withhold a program that has no rates,
 * so the program stayed visible to customers showing no prices at all.
 *
 * WHAT THESE TESTS PROVE
 *   - replaceUmrahRates delegates to db.transaction exactly once.
 *   - The DELETE, the INSERT and the timestamp UPDATE all run on `tx`, in that order, and nothing
 *     reaches the pooled handle.
 *   - A failure at any of the three steps propagates, so the driver's rollback path runs and no
 *     error is swallowed.
 *   - Every occupancy row the admin submitted is carried through unchanged.
 *
 * WHAT THESE TESTS DO NOT PROVE
 *   They do NOT prove database rollback. The fake records calls; it implements no MVCC and no undo
 *   log. Whether MySQL/TiDB actually restores the deleted occupancy rows is proven only by the real
 *   integration test in server/lifecycle.integration.test.ts.
 *
 * The fake throws on any operation the production path should not perform — an operation on the
 * pooled handle or on an unmodelled table — so a mis-wired test fails loudly instead of vacuously.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Schema = typeof import("../drizzle/schema");
type Row = Record<string, unknown>;
type TableName = "programs" | "rates";

type RecordedOp = {
  via: "tx" | "pool";
  kind: "delete" | "insert" | "update";
  table: TableName;
  values?: Row | Row[];
};

type FailPoint = { kind: "delete" | "insert" | "update"; table: TableName } | null;

let currentDb: unknown = null;

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => currentDb,
}));

function tableName(schema: Schema, table: unknown): TableName {
  if (table === schema.umrahPrograms) return "programs";
  if (table === schema.umrahRateRows) return "rates";
  throw new Error("replaceUmrahRates fake: operation on an unmodelled table");
}

function makeFakeDb(schema: Schema, options: { failAt?: FailPoint } = {}) {
  const failAt = options.failAt ?? null;
  const ops: RecordedOp[] = [];
  const outcomes: Array<"commit" | "rollback"> = [];
  let transactionCalls = 0;

  const shouldFail = (kind: "delete" | "insert" | "update", table: TableName) =>
    failAt !== null && failAt.kind === kind && failAt.table === table;

  const settle = (
    kind: "delete" | "insert" | "update",
    table: TableName,
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    shouldFail(kind, table)
      ? Promise.reject(new Error(`fake database failure: ${kind} on ${table}`)).then(onFulfilled, onRejected)
      : Promise.resolve([]).then(onFulfilled, onRejected);

  const handle = (via: "tx" | "pool") => {
    const guard = () => {
      if (via === "pool") {
        throw new Error(
          "replaceUmrahRates fake: database operation issued on the pooled handle instead of the transaction",
        );
      }
    };

    return {
      delete: (table: unknown) => {
        guard();
        const name = tableName(schema, table);
        return {
          where: () => ({
            then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) => {
              ops.push({ via, kind: "delete", table: name });
              return settle("delete", name, onFulfilled, onRejected);
            },
          }),
        };
      },
      insert: (table: unknown) => {
        guard();
        const name = tableName(schema, table);
        return {
          values: (values: Row | Row[]) => ({
            then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) => {
              ops.push({ via, kind: "insert", table: name, values });
              return settle("insert", name, onFulfilled, onRejected);
            },
          }),
        };
      },
      update: (table: unknown) => {
        guard();
        const name = tableName(schema, table);
        return {
          set: (values: Row) => ({
            where: () => ({
              then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) => {
                ops.push({ via, kind: "update", table: name, values });
                return settle("update", name, onFulfilled, onRejected);
              },
            }),
          }),
        };
      },
    };
  };

  const pooled = handle("pool") as Record<string, unknown>;

  const db = {
    ...pooled,
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      transactionCalls += 1;
      try {
        const result = await callback(handle("tx"));
        outcomes.push("commit");
        return result;
      } catch (error) {
        outcomes.push("rollback");
        throw error;
      }
    },
  };

  return {
    db,
    ops,
    outcomes,
    get transactionCalls() {
      return transactionCalls;
    },
    sequence: () => ops.map((op) => `${op.kind}:${op.table}`),
  };
}

async function loadWith(options: { failAt?: FailPoint } = {}) {
  // Reset first, then resolve both modules in the same registry generation so the table objects the
  // fake compares against are the ones server/db.ts holds.
  vi.resetModules();
  const schema = (await import("../drizzle/schema")) as Schema;
  const fake = makeFakeDb(schema, options);
  currentDb = fake.db;
  const mod = await import("./db");
  return { replaceUmrahRates: mod.replaceUmrahRates, fake };
}

const quad = { roomType: "Quad", price: "37500.00", notesEn: "Four per room", notesAr: "أربعة في الغرفة" };
const triple = { roomType: "Triple", price: "42000.00", notesEn: "Three per room", notesAr: "ثلاثة في الغرفة" };
const double = { roomType: "Double", price: "48000.00" };

let previousDatabaseUrl: string | undefined;

beforeEach(() => {
  previousDatabaseUrl = process.env.DATABASE_URL;
  // getDb() only builds a client when this is set; it is never dialled, the factory is mocked.
  process.env.DATABASE_URL = "mysql://fake-not-dialled/travelcorner";
});

afterEach(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  currentDb = null;
});

describe("replaceUmrahRates — transaction boundary", () => {
  it("opens exactly one transaction", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, [quad]);

    expect(fake.transactionCalls).toBe(1);
  });

  it("runs the delete, insert and timestamp update on the transaction handle, in order", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, [quad]);

    expect(fake.sequence()).toEqual(["delete:rates", "insert:rates", "update:programs"]);
    expect(fake.ops.every((op) => op.via === "tx")).toBe(true);
    expect(fake.outcomes).toEqual(["commit"]);
  });

  it("would fail loudly if an operation reached the pooled handle", async () => {
    // Guards the assertion above: the pooled handle really does throw, so "every op is tx" cannot
    // pass merely because the guard is inert.
    const { fake } = await loadWith();
    const pooled = fake.db as unknown as { delete: (table: unknown) => unknown };

    expect(() => pooled.delete({})).toThrow(/pooled handle/);
  });

  it("returns the existing success contract", async () => {
    const { replaceUmrahRates } = await loadWith();

    await expect(replaceUmrahRates(3, [quad])).resolves.toEqual({ success: true });
  });
});

describe("replaceUmrahRates — submitted occupancy rows are carried through", () => {
  it("writes every supplied field, with the fixed currency and program id", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, [quad]);

    const rows = fake.ops.find((op) => op.kind === "insert")?.values as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      programId: 3,
      roomType: "Quad",
      price: "37500.00",
      currency: "EGP",
      notesEn: "Four per room",
      notesAr: "أربعة في الغرفة",
    });
  });

  it("writes every occupancy when several room types are submitted, in submitted order", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, [quad, triple, double]);

    const rows = fake.ops.find((op) => op.kind === "insert")?.values as Row[];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.roomType)).toEqual(["Quad", "Triple", "Double"]);
    expect(rows.map((row) => row.price)).toEqual(["37500.00", "42000.00", "48000.00"]);
    expect(rows.every((row) => row.currency === "EGP" && row.programId === 3)).toBe(true);
  });

  it("normalises omitted notes to null rather than dropping them", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, [double]);

    const rows = fake.ops.find((op) => op.kind === "insert")?.values as Row[];
    expect(rows[0]).toMatchObject({ roomType: "Double", notesEn: null, notesAr: null });
  });

  it("skips the insert entirely for an empty rate set, but still clears and stamps", async () => {
    const { replaceUmrahRates, fake } = await loadWith();

    await replaceUmrahRates(3, []);

    expect(fake.sequence()).toEqual(["delete:rates", "update:programs"]);
  });
});

describe("replaceUmrahRates — failure propagation", () => {
  it("propagates a failing occupancy insert, after the delete has already been issued", async () => {
    const { replaceUmrahRates, fake } = await loadWith({ failAt: { kind: "insert", table: "rates" } });

    await expect(replaceUmrahRates(3, [quad, triple])).rejects.toThrow(/fake database failure: insert on rates/);

    // The delete ran first, so only the transaction can restore those rows: the error must not be
    // absorbed, and the timestamp update must never be reached.
    expect(fake.sequence()).toEqual(["delete:rates", "insert:rates"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("propagates a failing delete without attempting the insert", async () => {
    const { replaceUmrahRates, fake } = await loadWith({ failAt: { kind: "delete", table: "rates" } });

    await expect(replaceUmrahRates(3, [quad])).rejects.toThrow(/fake database failure: delete on rates/);

    expect(fake.sequence()).toEqual(["delete:rates"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("propagates a failing program timestamp update after the rates were rewritten", async () => {
    const { replaceUmrahRates, fake } = await loadWith({ failAt: { kind: "update", table: "programs" } });

    await expect(replaceUmrahRates(3, [quad])).rejects.toThrow(/fake database failure: update on programs/);

    expect(fake.sequence()).toEqual(["delete:rates", "insert:rates", "update:programs"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });
});
