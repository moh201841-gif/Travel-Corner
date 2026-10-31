/**
 * Travel Corner — saveAdminUmrahProgram headline-rate rules and transaction boundary (D9-U).
 *
 * This was the worst of the Umrah defects because it corrupted data during *ordinary* use, with no
 * failure involved. The function selected a rate row with an unordered `LIMIT 1` and overwrote both
 * its price and its roomType, while the editor submitted its prefilled price on every save. A program
 * carrying Quad/Triple/Double fares could therefore come back with two "Quad" rows at the starting
 * price and the Double fare gone, just because someone edited the airline.
 *
 * WHAT THESE TESTS PROVE
 *   - saveAdminUmrahProgram delegates to db.transaction exactly once, and every read and write runs
 *     on `tx`.
 *   - The rate count is read before any write, and 2+ rates is refused with the shared message
 *     before a single write is issued.
 *   - A content-only edit of a multi-occupancy program still succeeds, because no price is sent.
 *   - 0 rates creates one row; 1 rate updates it; the create path writes program then rate.
 *   - A failing rate write propagates, so the driver's rollback path runs.
 *
 * WHAT THESE TESTS DO NOT PROVE
 *   They do NOT prove database rollback, and they cannot prove *which* row an UPDATE targeted — the
 *   fake does not interpret WHERE clauses. That the write lands on the one row the count saw, rather
 *   than an arbitrary one, is proven by the real integration test in
 *   server/lifecycle.integration.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MULTI_RATE_UMRAH_PRICE_ERR_MSG } from "@shared/const";

type Schema = typeof import("../drizzle/schema");
type Row = Record<string, unknown>;
type TableName = "programs" | "rates";

type RecordedOp = { via: "tx" | "pool"; kind: "select" | "insert" | "update"; table: TableName; values?: Row };
type FailPoint = { kind: "insert" | "update"; table: TableName } | null;

let currentDb: unknown = null;

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => currentDb,
}));

const INSERTED_PROGRAM_ID = 909;

function tableName(schema: Schema, table: unknown): TableName {
  if (table === schema.umrahPrograms) return "programs";
  if (table === schema.umrahRateRows) return "rates";
  throw new Error("saveAdminUmrahProgram fake: operation on an unmodelled table");
}

function makeFakeDb(schema: Schema, options: { existingRateIds?: number[]; failAt?: FailPoint } = {}) {
  const existingRateIds = options.existingRateIds ?? [];
  const failAt = options.failAt ?? null;
  const ops: RecordedOp[] = [];
  const outcomes: Array<"commit" | "rollback"> = [];
  let transactionCalls = 0;

  const shouldFail = (kind: "insert" | "update", table: TableName) =>
    failAt !== null && failAt.kind === kind && failAt.table === table;

  const handle = (via: "tx" | "pool") => {
    const guard = () => {
      if (via === "pool") {
        throw new Error(
          "saveAdminUmrahProgram fake: database operation issued on the pooled handle instead of the transaction",
        );
      }
    };

    return {
      select: (_fields?: unknown) => {
        guard();
        return {
          from: (table: unknown) => {
            const name = tableName(schema, table);
            const rows = name === "rates" ? existingRateIds.map((id) => ({ id })) : [];
            const builder = {
              where: () => builder,
              limit: () => builder,
              orderBy: () => builder,
              then: (onFulfilled?: (v: Row[]) => unknown, onRejected?: (r: unknown) => unknown) => {
                ops.push({ via, kind: "select", table: name });
                return Promise.resolve(rows as Row[]).then(onFulfilled, onRejected);
              },
            };
            return builder;
          },
        };
      },
      insert: (table: unknown) => {
        guard();
        const name = tableName(schema, table);
        return {
          values: (values: Row) => ({
            then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) => {
              ops.push({ via, kind: "insert", table: name, values });
              if (shouldFail("insert", name)) {
                return Promise.reject(new Error(`fake database failure: insert on ${name}`)).then(onFulfilled, onRejected);
              }
              return Promise.resolve([{ insertId: INSERTED_PROGRAM_ID }]).then(onFulfilled, onRejected);
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
                if (shouldFail("update", name)) {
                  return Promise.reject(new Error(`fake database failure: update on ${name}`)).then(onFulfilled, onRejected);
                }
                return Promise.resolve([]).then(onFulfilled, onRejected);
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
    writes: () => ops.filter((op) => op.kind !== "select"),
    sequence: () => ops.map((op) => `${op.kind}:${op.table}`),
  };
}

async function loadWith(options: { existingRateIds?: number[]; failAt?: FailPoint } = {}) {
  // Reset first, then resolve both modules in the same registry generation so the table objects the
  // fake compares against are the ones server/db.ts holds.
  vi.resetModules();
  const schema = (await import("../drizzle/schema")) as Schema;
  const fake = makeFakeDb(schema, options);
  currentDb = fake.db;
  const mod = await import("./db");
  return { saveAdminUmrahProgram: mod.saveAdminUmrahProgram, fake };
}

const baseInput = {
  slug: "ramadan-umrah",
  titleEn: "Ramadan Umrah",
  titleAr: "عمرة رمضان",
  availability: "available" as const,
  isActive: true,
};

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

describe("saveAdminUmrahProgram — transaction boundary", () => {
  it("opens exactly one transaction", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith();

    await saveAdminUmrahProgram({ ...baseInput, price: "37500" });

    expect(fake.transactionCalls).toBe(1);
  });

  it("issues every database operation on the transaction handle, never the pooled one", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [77] });

    await saveAdminUmrahProgram({ ...baseInput, id: 3, price: "37500" });

    expect(fake.ops.length).toBeGreaterThan(0);
    expect(fake.ops.every((op) => op.via === "tx")).toBe(true);
  });

  it("would fail loudly if an operation reached the pooled handle", async () => {
    const { fake } = await loadWith();
    const pooled = fake.db as unknown as { insert: (table: unknown) => unknown };

    expect(() => pooled.insert({})).toThrow(/pooled handle/);
  });
});

describe("saveAdminUmrahProgram — create path", () => {
  it("writes the program and its headline occupancy, and returns the new id", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith();

    const result = await saveAdminUmrahProgram({ ...baseInput, price: "37500", roomType: "Triple" });

    expect(result).toEqual({ id: INSERTED_PROGRAM_ID });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["insert:programs", "insert:rates"]);
    expect(fake.writes()[1].values).toMatchObject({
      programId: INSERTED_PROGRAM_ID,
      roomType: "Triple",
      price: "37500",
      currency: "EGP",
    });
    expect(fake.outcomes).toEqual(["commit"]);
  });

  it("defaults the room type to Quad when none is supplied", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith();

    await saveAdminUmrahProgram({ ...baseInput, price: "37500" });

    expect(fake.writes()[1].values).toMatchObject({ roomType: "Quad" });
  });

  it("writes only the program when no price is supplied", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith();

    await saveAdminUmrahProgram({ ...baseInput });

    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["insert:programs"]);
  });
});

describe("saveAdminUmrahProgram — edit path", () => {
  it("updates the program and the single existing occupancy rate", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [77] });

    const result = await saveAdminUmrahProgram({ ...baseInput, id: 3, price: "39000" });

    expect(result).toEqual({ id: 3 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:programs", "update:rates"]);
    expect(fake.writes()[1].values).toMatchObject({ price: "39000", currency: "EGP" });
  });

  it("inserts an occupancy rate when the program has none", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [] });

    const result = await saveAdminUmrahProgram({ ...baseInput, id: 3, price: "39000" });

    expect(result).toEqual({ id: 3 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:programs", "insert:rates"]);
    expect(fake.writes()[1].values).toMatchObject({ programId: 3, price: "39000" });
  });

  it("reads the existing occupancy rows before writing anything", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [77] });

    await saveAdminUmrahProgram({ ...baseInput, id: 3, price: "39000" });

    expect(fake.ops[0]).toMatchObject({ via: "tx", kind: "select", table: "rates" });
  });
});

describe("saveAdminUmrahProgram — D9-U multi-occupancy refusal", () => {
  it("refuses before issuing any write, with the shared message", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [77, 78, 79] });

    await expect(saveAdminUmrahProgram({ ...baseInput, id: 3, price: "39000" })).rejects.toThrow(
      MULTI_RATE_UMRAH_PRICE_ERR_MSG,
    );

    // This is the whole point of D9-U: no occupancy row is touched, so no fare is silently rewritten.
    expect(fake.writes()).toEqual([]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("allows a content-only edit of a multi-occupancy program, because no price is submitted", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ existingRateIds: [77, 78, 79] });

    const result = await saveAdminUmrahProgram({ ...baseInput, id: 3, airline: "Saudia" });

    expect(result).toEqual({ id: 3 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:programs"]);
    expect(fake.outcomes).toEqual(["commit"]);
  });
});

describe("saveAdminUmrahProgram — failure propagation", () => {
  it("propagates a failing occupancy update after the program was updated", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({
      existingRateIds: [77],
      failAt: { kind: "update", table: "rates" },
    });

    await expect(saveAdminUmrahProgram({ ...baseInput, id: 3, price: "39000" })).rejects.toThrow(
      /fake database failure: update on rates/,
    );

    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:programs", "update:rates"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("propagates a failing occupancy insert on the create path", async () => {
    const { saveAdminUmrahProgram, fake } = await loadWith({ failAt: { kind: "insert", table: "rates" } });

    await expect(saveAdminUmrahProgram({ ...baseInput, price: "37500" })).rejects.toThrow(
      /fake database failure: insert on rates/,
    );

    expect(fake.outcomes).toEqual(["rollback"]);
  });
});
