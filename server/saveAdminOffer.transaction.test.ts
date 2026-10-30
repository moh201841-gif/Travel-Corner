/**
 * Travel Corner — saveAdminOffer transaction boundary (Finding 2).
 *
 * saveAdminOffer previously issued its offer write and its headline-rate write as separate
 * auto-committed statements. A failure between them left the offer updated with its price unchanged,
 * while `lastPriceUpdatedAt` had already been stamped as though the price had been written — so the
 * inconsistency concealed itself. These tests drive the real `saveAdminOffer` against a controlled
 * fake client and assert that every database operation is issued on the transaction handle.
 *
 * WHAT THESE TESTS PROVE
 *   - saveAdminOffer delegates to `db.transaction` exactly once.
 *   - Every read and write goes through `tx`; nothing reaches the pooled handle.
 *   - A failing rate write propagates out of saveAdminOffer, so the driver's rollback path is the
 *     one that runs, and no error is swallowed.
 *   - The D9 refusal happens before any write is issued.
 *   - The headline-price editor never writes validFrom/validUntil.
 *
 * WHAT THESE TESTS DO NOT PROVE
 *   They do NOT prove database rollback. The fake records calls; it implements no MVCC, no undo log
 *   and no durability. Whether MySQL/TiDB actually discards the offer write when the rate write
 *   fails is verifiable only against a real server, and is registered as deferred coverage in
 *   server/lifecycle.integration.test.ts. A green run here is not evidence of rollback.
 *
 * The fake throws on any operation the production path should not perform — an operation on the
 * pooled handle, an unmodelled table, or an unexpected builder method — so a mis-wired test fails
 * loudly instead of passing vacuously.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Schema = typeof import("../drizzle/schema");
type Row = Record<string, unknown>;

type TableName = "offers" | "rates";

type RecordedOp = {
  via: "tx" | "pool";
  kind: "select" | "insert" | "update";
  table: TableName;
  values?: Row;
};

/** Where in the sequence a write should fail, mirroring an infrastructure or constraint error. */
type FailPoint = { kind: "insert" | "update"; table: TableName } | null;

let currentDb: unknown = null;

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => currentDb,
}));

const INSERTED_OFFER_ID = 4242;

function tableName(schema: Schema, table: unknown): TableName {
  if (table === schema.travelOffers) return "offers";
  if (table === schema.offerRatePeriods) return "rates";
  throw new Error("saveAdminOffer fake: operation on an unmodelled table");
}

/**
 * A fake drizzle client whose only real behaviours are: hand out a transaction handle, record the
 * operations issued on it, and fail at a configured point. Operations issued on the pooled handle
 * throw, which is what makes the "uses tx, not db" assertions meaningful.
 */
function makeFakeDb(
  schema: Schema,
  options: { existingRateIds?: number[]; failAt?: FailPoint } = {},
) {
  const existingRateIds = options.existingRateIds ?? [];
  const failAt = options.failAt ?? null;

  const ops: RecordedOp[] = [];
  const outcomes: Array<"commit" | "rollback"> = [];
  let transactionCalls = 0;

  const shouldFail = (kind: "insert" | "update", table: TableName) =>
    failAt !== null && failAt.kind === kind && failAt.table === table;

  const failure = (kind: string, table: TableName) =>
    new Error(`fake database failure: ${kind} on ${table}`);

  const handle = (via: "tx" | "pool") => {
    const guard = () => {
      if (via === "pool") {
        throw new Error(
          "saveAdminOffer fake: database operation issued on the pooled handle instead of the transaction",
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
              then: (onFulfilled?: (value: Row[]) => unknown, onRejected?: (reason: unknown) => unknown) => {
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
            then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
              ops.push({ via, kind: "insert", table: name, values });
              if (shouldFail("insert", name)) return Promise.reject(failure("insert", name)).then(onFulfilled, onRejected);
              // mysql2 shape the production code reads: result[0].insertId
              return Promise.resolve([{ insertId: INSERTED_OFFER_ID }]).then(onFulfilled, onRejected);
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
              then: (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
                ops.push({ via, kind: "update", table: name, values });
                if (shouldFail("update", name)) return Promise.reject(failure("update", name)).then(onFulfilled, onRejected);
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
        // Mirrors the driver: the error leaves the transaction after the rollback path is taken.
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
  };
}

async function loadWith(options: { existingRateIds?: number[]; failAt?: FailPoint } = {}) {
  // Reset first, then resolve both modules in the same registry generation, so the table objects the
  // fake compares against are the ones server/db.ts holds. Importing the schema earlier would
  // compare across generations and every match would silently fail.
  vi.resetModules();
  const schema = (await import("../drizzle/schema")) as Schema;
  const fake = makeFakeDb(schema, options);
  currentDb = fake.db;
  const mod = await import("./db");
  return { saveAdminOffer: mod.saveAdminOffer, fake };
}

const baseInput = {
  slug: "sharm-reef-oasis",
  destinationEn: "Sharm El Sheikh",
  destinationAr: "شرم الشيخ",
  hotelNameEn: "Reef Oasis",
  hotelNameAr: "ريف أوَيسيس",
  days: 5,
  nights: 4,
  mealPlanEn: "All inclusive",
  mealPlanAr: "إقامة كاملة",
  transportationIncluded: true,
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

describe("saveAdminOffer — transaction boundary", () => {
  it("opens exactly one transaction", async () => {
    const { saveAdminOffer, fake } = await loadWith();

    await saveAdminOffer({ ...baseInput, price: "6500" });

    expect(fake.transactionCalls).toBe(1);
  });

  it("issues every database operation on the transaction handle, never the pooled one", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10] });

    await saveAdminOffer({ ...baseInput, id: 1, price: "6500" });

    expect(fake.ops.length).toBeGreaterThan(0);
    expect(fake.ops.every((op) => op.via === "tx")).toBe(true);
    expect(fake.ops.some((op) => op.via === "pool")).toBe(false);
  });

  it("would fail loudly if an operation reached the pooled handle", async () => {
    // Guards the assertion above: the fake's pooled handle really does throw, so "every op is tx"
    // cannot pass merely because the guard is inert.
    const { fake } = await loadWith();
    const pooled = fake.db as unknown as { insert: (table: unknown) => unknown };

    expect(() => pooled.insert({})).toThrow(/pooled handle/);
  });
});

describe("saveAdminOffer — create path", () => {
  it("writes the offer and its headline rate, and returns the new id", async () => {
    const { saveAdminOffer, fake } = await loadWith();

    const result = await saveAdminOffer({ ...baseInput, price: "6500", priceLabelEn: "Jul", priceLabelAr: "يوليو" });

    expect(result).toEqual({ id: INSERTED_OFFER_ID });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["insert:offers", "insert:rates"]);

    const rateWrite = fake.writes()[1];
    expect(rateWrite.values).toMatchObject({
      offerId: INSERTED_OFFER_ID,
      occupancy: "per_person",
      currency: "EGP",
      price: "6500",
      labelEn: "Jul",
      labelAr: "يوليو",
    });
    expect(fake.outcomes).toEqual(["commit"]);
  });

  it("writes only the offer when no price is supplied", async () => {
    const { saveAdminOffer, fake } = await loadWith();

    await saveAdminOffer({ ...baseInput });

    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["insert:offers"]);
  });
});

describe("saveAdminOffer — edit path", () => {
  it("updates the offer and the single existing headline rate", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10] });

    const result = await saveAdminOffer({ ...baseInput, id: 7, price: "7000" });

    expect(result).toEqual({ id: 7 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:offers", "update:rates"]);
    expect(fake.writes()[1].values).toMatchObject({ price: "7000" });
    expect(fake.outcomes).toEqual(["commit"]);
  });

  it("inserts a headline rate when the offer has none", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [] });

    const result = await saveAdminOffer({ ...baseInput, id: 7, price: "7000" });

    expect(result).toEqual({ id: 7 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:offers", "insert:rates"]);
    expect(fake.writes()[1].values).toMatchObject({ offerId: 7, price: "7000" });
  });

  it("reads the existing rate rows before writing anything", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10] });

    await saveAdminOffer({ ...baseInput, id: 7, price: "7000" });

    expect(fake.ops[0]).toMatchObject({ via: "tx", kind: "select", table: "rates" });
  });
});

describe("saveAdminOffer — failure propagation", () => {
  it("propagates a failing headline-rate update to the caller", async () => {
    const { saveAdminOffer, fake } = await loadWith({
      existingRateIds: [10],
      failAt: { kind: "update", table: "rates" },
    });

    await expect(saveAdminOffer({ ...baseInput, id: 7, price: "7000" })).rejects.toThrow(/fake database failure: update on rates/);

    // The offer write was issued, so only the transaction can undo it: the error must not be absorbed.
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:offers", "update:rates"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("propagates a failing headline-rate insert on the create path", async () => {
    const { saveAdminOffer, fake } = await loadWith({ failAt: { kind: "insert", table: "rates" } });

    await expect(saveAdminOffer({ ...baseInput, price: "6500" })).rejects.toThrow(/fake database failure: insert on rates/);

    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("propagates a failing headline-rate insert when the offer had no rates", async () => {
    const { saveAdminOffer, fake } = await loadWith({
      existingRateIds: [],
      failAt: { kind: "insert", table: "rates" },
    });

    await expect(saveAdminOffer({ ...baseInput, id: 7, price: "7000" })).rejects.toThrow(/fake database failure: insert on rates/);

    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:offers", "insert:rates"]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });
});

describe("saveAdminOffer — D9 multi-rate refusal", () => {
  it("refuses before issuing any write, and the error reaches the caller unchanged", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10, 11] });

    await expect(saveAdminOffer({ ...baseInput, id: 7, price: "7000" })).rejects.toThrow(
      /more than one price period/,
    );

    expect(fake.writes()).toEqual([]);
    expect(fake.outcomes).toEqual(["rollback"]);
  });

  it("allows a content-only edit on a multi-rate offer, because no price is submitted", async () => {
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10, 11] });

    const result = await saveAdminOffer({ ...baseInput, id: 7 });

    expect(result).toEqual({ id: 7 });
    expect(fake.writes().map((op) => `${op.kind}:${op.table}`)).toEqual(["update:offers"]);
  });
});

describe("saveAdminOffer — rate validity windows are not the headline editor's to write", () => {
  it("omits validFrom and validUntil from every rate write", async () => {
    for (const options of [{ existingRateIds: [] }, { existingRateIds: [10] }]) {
      const { saveAdminOffer, fake } = await loadWith(options);

      await saveAdminOffer({ ...baseInput, id: 7, price: "7000", validUntil: new Date("2027-01-01T00:00:00.000Z") });

      const rateWrites = fake.writes().filter((op) => op.table === "rates");
      expect(rateWrites.length).toBe(1);
      for (const write of rateWrites) {
        expect(write.values).not.toHaveProperty("validFrom");
        expect(write.values).not.toHaveProperty("validUntil");
      }
    }
  });

  it("still applies the offer's own validUntil to the offer row", async () => {
    const validUntil = new Date("2027-01-01T00:00:00.000Z");
    const { saveAdminOffer, fake } = await loadWith({ existingRateIds: [10] });

    await saveAdminOffer({ ...baseInput, id: 7, price: "7000", validUntil });

    const offerWrite = fake.writes().find((op) => op.table === "offers");
    expect(offerWrite?.values).toMatchObject({ validUntil });
  });
});
