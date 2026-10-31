/**
 * Travel Corner lifecycle — database-dependent coverage.
 *
 * This file holds two distinct groups.
 *
 * EXECUTABLE (3 tests, "Finding 2 atomicity [executable]")
 *   Real integration tests that run saveAdminOffer against a disposable MySQL 8 database and assert
 *   that a failing headline-rate write leaves no partial offer state behind. Nothing is mocked: the
 *   transaction, the SQL and the failure are all server-side. They run when TEST_DATABASE_URL is set
 *   (or when TRAVEL_CORNER_REQUIRE_DB=1 forces a hard failure instead of a skip) and are selected on
 *   their own by `pnpm test:integration`.
 *
 * BLOCKED (13 entries)
 *   Behaviours that still have no implementation. During Phase 0.5 no database was reachable, so they
 *   could not be written or executed even once. They remain arranged so they can never produce a
 *   false green:
 *     - Without TEST_DATABASE_URL the suite is skipped and a banner names exactly what is unverified.
 *     - With TEST_DATABASE_URL the suite runs and FAILS, because the bodies are not implemented.
 *       A red suite is the correct signal: supplying a database does not retroactively create
 *       coverage that was never written. `pnpm test:integration` therefore does not select them.
 *
 * Do not "fix" the blocked entries by deleting them or by asserting something trivial. Implement them
 * against a disposable schema, one at a time, the way the three executable tests below were.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MULTI_RATE_UMRAH_PRICE_ERR_MSG } from "@shared/const";
import {
  closeApplicationPool,
  importApplicationDb,
  rootCauseMessage,
  setupIntegrationDatabase,
  SENTINEL_CONSTRAINT_NAME,
  SENTINEL_REJECTED_PRICE,
  SENTINEL_UMRAH_CONSTRAINT_NAME,
  type IntegrationDatabase,
} from "./testDatabase";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/** Set by `pnpm test:integration` so a missing database is a failure, never a silent skip. */
const REQUIRE_DATABASE = process.env.TRAVEL_CORNER_REQUIRE_DB === "1";

const RUN_EXECUTABLE = Boolean(TEST_DATABASE_URL) || REQUIRE_DATABASE;

const BLOCKED_COVERAGE = [
  "SQL visibility clauses in db.ts conform to the shared lifecycle predicates over seeded fixtures",
  "applyPublicLifecycleRules archives exactly the passed rows and leaves hidden/sold_out untouched",
  "listPublicOffers omits an offer whose rate windows have all closed",
  "getPublicOfferBySlug withholds an offer whose rate windows have all closed (Finding 1)",
  "saveAdminOffer headline-price rules: 0 rows creates, 1 row updates, 2+ rows is refused (D9)",
  "saveAdminOffer never writes validFrom/validUntil on a rate row (K-2 separation)",
  "saveAdminOffer D9 refusal on a multi-rate offer leaves every offer and rate row unchanged (Finding 2)",
  "saveAdminOffer success commits the offer and its headline rate together, and the returned id resolves (Finding 2)",
  "saveAdminOffer leaves validFrom/validUntil on the touched rate row untouched on both the success and the rollback path (Finding 2)",
  "saveAdminOffer versus a concurrent replaceOfferRates: the D9 refusal is not bypassed and no rate row is overwritten arbitrarily (Finding 2 — concurrency; a transaction alone does not close this race, and the required locking semantics are unverified on TiDB)",
  "rate reconciliation preserves childPrice, infantPrice and bilingual notes (D8 — blocked)",
];

if (!TEST_DATABASE_URL) {
  console.warn(
    [
      "",
      "================================================================",
      " TRAVEL CORNER — DATABASE-DEPENDENT LIFECYCLE COVERAGE IS SKIPPED",
      " TEST_DATABASE_URL is not set. The following are NOT verified:",
      ...BLOCKED_COVERAGE.map((item) => `   - ${item}`),
      "",
      " The three saveAdminOffer rollback tests in this file are also skipped,",
      " and they are the only database-dependent coverage that exists.",
      "",
      " A passing suite does NOT mean these behaviours are correct.",
      "================================================================",
      "",
    ].join("\n"),
  );
}

describe.skipIf(!TEST_DATABASE_URL)("Lifecycle integration [requires TEST_DATABASE_URL]", () => {
  for (const behaviour of BLOCKED_COVERAGE) {
    it(`BLOCKED — not implemented: ${behaviour}`, () => {
      throw new Error(
        "Database-dependent coverage was never written: no database was reachable during Phase 0.5. " +
          "Implement this test against a disposable schema before relying on it.",
      );
    });
  }
});

/**
 * Real rollback coverage for Finding 2.
 *
 * saveAdminOffer writes the offer and its headline rate. Before the transaction boundary those were
 * separate auto-committed statements, so a failing rate write left the offer updated with its price
 * unchanged — and `lastPriceUpdatedAt` already stamped, which concealed it.
 *
 * Each test forces the SECOND write to fail using a CHECK constraint the harness installs on the
 * disposable database, then asserts that the FIRST write did not survive. If saveAdminOffer ever
 * regresses to separate statements, the offer row persists or changes and every assertion below
 * fails. Fixtures are written and read with the harness's own admin connection, independently of the
 * code under test.
 */
describe.runIf(RUN_EXECUTABLE)("Finding 2 atomicity and D6 rate replacement [executable]", () => {
  let database: IntegrationDatabase;
  let saveAdminOffer: typeof import("./db")["saveAdminOffer"];
  let replaceOfferRates: typeof import("./db")["replaceOfferRates"];
  let replaceUmrahRates: typeof import("./db")["replaceUmrahRates"];
  let saveAdminUmrahProgram: typeof import("./db")["saveAdminUmrahProgram"];
  let applicationDb: typeof import("./db");

  const baseInput = {
    slug: "integration-sharm-reef",
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

  const FIXTURE_PRICE_UPDATED_AT = "2026-03-01 10:00:00";
  const FIXTURE_RATE_UPDATED_AT = "2026-03-01 10:00:00";

  /** Date values come back as Date objects; normalise so a deep comparison is meaningful. */
  const snapshot = (row: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
    );

  const offerRows = () =>
    database.query<Record<string, unknown>>("SELECT * FROM `travelOffers` WHERE `slug` = ?", [baseInput.slug]);
  const rateRows = (offerId?: number) =>
    offerId === undefined
      ? database.query<Record<string, unknown>>("SELECT * FROM `offerRatePeriods`")
      : database.query<Record<string, unknown>>("SELECT * FROM `offerRatePeriods` WHERE `offerId` = ?", [offerId]);

  /** Seed an offer directly, so the fixture does not depend on the function under test. */
  async function seedOffer(): Promise<number> {
    await database.query(
      "INSERT INTO `travelOffers` (`slug`, `destinationEn`, `destinationAr`, `hotelNameEn`, `hotelNameAr`, `days`, `nights`, `mealPlanEn`, `mealPlanAr`, `transportationIncluded`, `availability`, `isActive`, `lastPriceUpdatedAt`) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        baseInput.slug,
        "Hurghada",
        "الغردقة",
        "Seeded Hotel",
        "فندق مزروع",
        6,
        5,
        "Half board",
        "نصف إقامة",
        0,
        "limited",
        1,
        FIXTURE_PRICE_UPDATED_AT,
      ],
    );
    const rows = await offerRows();
    return Number(rows[0].id);
  }

  async function seedRate(offerId: number): Promise<void> {
    await database.query(
      "INSERT INTO `offerRatePeriods` (`offerId`, `occupancy`, `price`, `currency`, `labelEn`, `labelAr`, `validFrom`, `validUntil`, `lastUpdatedAt`) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [offerId, "per_person", "5500.00", "EGP", "Seeded label", "تسمية مزروعة", "2026-01-01 00:00:00", "2026-12-31 00:00:00", FIXTURE_RATE_UPDATED_AT],
    );
  }

  /**
   * Assert the call rejected *because the sentinel CHECK constraint fired*, not for any other reason.
   *
   * Drizzle's thrown error only says "Failed query: <sql>", keeping the driver error on `.cause`, so
   * matching the top-level message would pass for any failed write — including a schema mistake that
   * never exercised rollback at all. Matching the root cause, and the constraint by name, makes the
   * injected failure the only thing these tests can be satisfied by.
   */
  async function expectSentinelRejection(
    call: Promise<unknown>,
    constraintName: string = SENTINEL_CONSTRAINT_NAME,
  ): Promise<void> {
    const error = await call.then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error, "the call resolved: the sentinel rate write did not fail").not.toBeNull();
    const cause = rootCauseMessage(error);
    expect(cause).toMatch(/check constraint/i);
    expect(cause).toContain(constraintName);
  }

  async function seedSecondRate(offerId: number): Promise<void> {
    await database.query(
      "INSERT INTO `offerRatePeriods` (`offerId`, `occupancy`, `price`, `currency`, `labelEn`, `labelAr`, `childPrice`, `infantPrice`, `validFrom`, `validUntil`, `notesEn`, `notesAr`, `lastUpdatedAt`) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [offerId, "per_person", "7100.00", "EGP", "Second seeded window", "النافذة الثانية", "3400.00", "600.00", "2026-02-01 00:00:00", "2026-11-30 00:00:00", "Seeded notes EN", "ملاحظات مزروعة", FIXTURE_RATE_UPDATED_AT],
    );
  }

  /** Rows ordered by id, so a deep comparison across a rollback is stable. */
  async function orderedRates(offerId: number) {
    const rows = await rateRows(offerId);
    return rows.sort((left, right) => Number(left.id) - Number(right.id)).map(snapshot);
  }

  const FIXTURE_PROGRAM_UPDATED_AT = "2026-04-01 09:00:00";

  const umrahSlug = "integration-umrah-ramadan";

  const programRows = () =>
    database.query<Record<string, unknown>>("SELECT * FROM `umrahPrograms` WHERE `slug` = ?", [umrahSlug]);

  const umrahRateRowsFor = (programId: number) =>
    database.query<Record<string, unknown>>("SELECT * FROM `umrahRateRows` WHERE `programId` = ?", [programId]);

  /** Rows ordered by id, so a deep comparison across a rollback is stable. */
  async function orderedUmrahRates(programId: number) {
    const rows = await umrahRateRowsFor(programId);
    return rows.sort((left, right) => Number(left.id) - Number(right.id)).map(snapshot);
  }

  /** Seed a program directly, so the fixture does not depend on the function under test. */
  async function seedUmrahProgram(): Promise<number> {
    await database.query(
      "INSERT INTO `umrahPrograms` (`slug`, `titleEn`, `titleAr`, `availability`, `isActive`, `airline`, `departureAt`, `lastUpdatedAt`) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [umrahSlug, "Ramadan Umrah", "عمرة رمضان", "limited", 1, "EgyptAir", "2027-02-20 00:00:00", FIXTURE_PROGRAM_UPDATED_AT],
    );
    const rows = await programRows();
    return Number(rows[0].id);
  }

  /** Three occupancies, so losing a whole room-type price list is observable. */
  async function seedUmrahRates(programId: number): Promise<void> {
    for (const [roomType, price, notesEn, notesAr] of [
      ["Quad", "37500.00", "Four per room", "أربعة في الغرفة"],
      ["Triple", "42000.00", "Three per room", "ثلاثة في الغرفة"],
      ["Double", "48000.00", null, null],
    ] as Array<[string, string, string | null, string | null]>) {
      await database.query(
        "INSERT INTO `umrahRateRows` (`programId`, `roomType`, `price`, `currency`, `notesEn`, `notesAr`) VALUES (?, ?, ?, ?, ?, ?)",
        [programId, roomType, price, "EGP", notesEn, notesAr],
      );
    }
  }

  async function seedSingleUmrahRate(programId: number): Promise<number> {
    await database.query(
      "INSERT INTO `umrahRateRows` (`programId`, `roomType`, `price`, `currency`, `notesEn`) VALUES (?, ?, ?, ?, ?)",
      [programId, "Triple", "42000.00", "EGP", "Only occupancy"],
    );
    const rows = await umrahRateRowsFor(programId);
    return Number(rows[0].id);
  }

  beforeAll(async () => {
    database = await setupIntegrationDatabase();
    applicationDb = await importApplicationDb(database);
    saveAdminOffer = applicationDb.saveAdminOffer;
    replaceOfferRates = applicationDb.replaceOfferRates;
    replaceUmrahRates = applicationDb.replaceUmrahRates;
    saveAdminUmrahProgram = applicationDb.saveAdminUmrahProgram;
  }, 60_000);

  afterAll(async () => {
    if (applicationDb) await closeApplicationPool(applicationDb);
    if (database) await database.teardown();
  }, 60_000);

  beforeEach(async () => {
    await database.reset();
  });

  it("Test A — create path: a failing rate INSERT leaves no offer behind", async () => {
    expect(await offerRows()).toHaveLength(0);

    await expectSentinelRejection(saveAdminOffer({ ...baseInput, price: SENTINEL_REJECTED_PRICE }));

    // Without the transaction the offer INSERT would have committed before the rate INSERT failed.
    expect(await offerRows()).toHaveLength(0);
    expect(await rateRows()).toHaveLength(0);
  });

  it("Test B — edit path: a failing rate UPDATE leaves offer and rate byte-identical", async () => {
    const offerId = await seedOffer();
    await seedRate(offerId);

    const offerBefore = snapshot((await offerRows())[0]);
    const rateBefore = snapshot((await rateRows(offerId))[0]);
    expect(offerBefore.lastPriceUpdatedAt).toBeTruthy();

    await expectSentinelRejection(
      saveAdminOffer({ ...baseInput, id: offerId, price: SENTINEL_REJECTED_PRICE, priceLabelEn: "Rolled back" }),
    );

    const offerAfter = snapshot((await offerRows())[0]);
    const ratesAfter = await rateRows(offerId);

    // A committed offer UPDATE would have changed hotelNameEn, availability, lastPriceUpdatedAt and
    // updatedAt (ON UPDATE CURRENT_TIMESTAMP), so this equality is what detects a regression.
    expect(offerAfter).toEqual(offerBefore);
    expect(ratesAfter).toHaveLength(1);
    expect(snapshot(ratesAfter[0])).toEqual(rateBefore);
  });

  it("Test C — edit path with zero rates: a failing rate INSERT leaves the offer unchanged", async () => {
    const offerId = await seedOffer();
    expect(await rateRows(offerId)).toHaveLength(0);

    const offerBefore = snapshot((await offerRows())[0]);

    await expectSentinelRejection(saveAdminOffer({ ...baseInput, id: offerId, price: SENTINEL_REJECTED_PRICE }));

    expect(snapshot((await offerRows())[0])).toEqual(offerBefore);
    expect(await rateRows(offerId)).toHaveLength(0);
  });
  it("Test D6 — replaceOfferRates: a failing rate INSERT leaves the whole price table intact", async () => {
    const offerId = await seedOffer();
    await seedRate(offerId);
    await seedSecondRate(offerId);

    const ratesBefore = await orderedRates(offerId);
    const offerBefore = snapshot((await offerRows())[0]);
    expect(ratesBefore).toHaveLength(2);

    // replaceOfferRates DELETEs every row before inserting the submitted set, so without the
    // transaction this call would leave the offer with no rate periods at all — and a published
    // offer carrying no current rate is withheld from both public read paths, which would remove
    // the product from the catalogue entirely.
    await expectSentinelRejection(
      replaceOfferRates(offerId, [
        { occupancy: "per_person", price: SENTINEL_REJECTED_PRICE, labelEn: "Should not persist" },
      ]),
    );

    expect(await orderedRates(offerId)).toEqual(ratesBefore);
    // lastPriceUpdatedAt must not advance either: the timestamp update is in the same transaction.
    expect(snapshot((await offerRows())[0])).toEqual(offerBefore);
  });
  it("Test D7 — replaceUmrahRates: a failing occupancy INSERT leaves the whole room-type list intact", async () => {
    const programId = await seedUmrahProgram();
    await seedUmrahRates(programId);

    const ratesBefore = await orderedUmrahRates(programId);
    const programBefore = snapshot((await programRows())[0]);
    expect(ratesBefore).toHaveLength(3);
    expect(ratesBefore.map((rate) => rate.roomType)).toEqual(["Quad", "Triple", "Double"]);

    // replaceUmrahRates DELETEs every occupancy row before inserting the submitted set. Without the
    // transaction this call would leave the program with no rates at all — and the public Umrah
    // listing does not withhold a rate-less program, so it would stay visible showing no prices.
    await expectSentinelRejection(
      replaceUmrahRates(programId, [{ roomType: "Quad", price: SENTINEL_REJECTED_PRICE }]),
      SENTINEL_UMRAH_CONSTRAINT_NAME,
    );

    expect(await orderedUmrahRates(programId)).toEqual(ratesBefore);
    // lastUpdatedAt must not advance either: the program timestamp update is in the same transaction.
    expect(snapshot((await programRows())[0])).toEqual(programBefore);
  });
  it("Test D9-U — a multi-occupancy program refuses a starting price and changes nothing", async () => {
    const programId = await seedUmrahProgram();
    await seedUmrahRates(programId);

    const ratesBefore = await orderedUmrahRates(programId);
    const programBefore = snapshot((await programRows())[0]);
    expect(ratesBefore).toHaveLength(3);

    // Before D9-U this call picked a row with an unordered LIMIT 1 and overwrote its price AND its
    // roomType, so a Double fare could come back as a second "Quad" at the starting price.
    await expect(
      saveAdminUmrahProgram({
        slug: umrahSlug,
        titleEn: "Ramadan Umrah",
        titleAr: "عمرة رمضان",
        availability: "limited",
        isActive: true,
        id: programId,
        price: "39000",
        roomType: "Quad",
      }),
    ).rejects.toThrow(MULTI_RATE_UMRAH_PRICE_ERR_MSG);

    expect(await orderedUmrahRates(programId)).toEqual(ratesBefore);
    expect(snapshot((await programRows())[0])).toEqual(programBefore);
  });

  it("Test D9-U — a content-only edit of a multi-occupancy program succeeds and touches no fare", async () => {
    const programId = await seedUmrahProgram();
    await seedUmrahRates(programId);
    const ratesBefore = await orderedUmrahRates(programId);

    await expect(
      saveAdminUmrahProgram({
        slug: umrahSlug,
        titleEn: "Ramadan Umrah (revised)",
        titleAr: "عمرة رمضان",
        availability: "available",
        isActive: true,
        id: programId,
        airline: "Saudia",
      }),
    ).resolves.toEqual({ id: programId });

    // The ordinary edit that used to corrupt a fare now goes through untouched.
    const program = (await programRows())[0];
    expect(program.titleEn).toBe("Ramadan Umrah (revised)");
    expect(program.airline).toBe("Saudia");
    expect(await orderedUmrahRates(programId)).toEqual(ratesBefore);
  });

  it("Test D9-U — a single-occupancy program updates exactly that row, by id", async () => {
    const programId = await seedUmrahProgram();
    const rateId = await seedSingleUmrahRate(programId);

    await expect(
      saveAdminUmrahProgram({
        slug: umrahSlug,
        titleEn: "Ramadan Umrah",
        titleAr: "عمرة رمضان",
        availability: "limited",
        isActive: true,
        id: programId,
        price: "44500",
        roomType: "Triple",
      }),
    ).resolves.toEqual({ id: programId });

    const rates = await umrahRateRowsFor(programId);
    expect(rates).toHaveLength(1);
    expect(Number(rates[0].id)).toBe(rateId);
    expect(String(rates[0].price)).toBe("44500.00");
    expect(rates[0].roomType).toBe("Triple");
  });
});
