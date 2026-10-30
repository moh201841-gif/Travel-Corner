/**
 * Travel Corner — public offer visibility parity between the listing and the detail path.
 *
 * Regression cover for the confirmed defect in which `listPublicOffers` excluded an offer carrying
 * no current rate period while `getPublicOfferBySlug` still returned that same offer with an empty
 * `rates` array, leaving a priced product reachable by direct link with no price and a working
 * enquiry form.
 *
 * These tests drive the real `server/db.ts` functions. Only the drizzle client is replaced, by a
 * fake query builder that answers `select()` from in-memory fixtures, so the code under test is the
 * production code path: the SQL pre-filter is bypassed, and the in-memory lifecycle predicates that
 * own the final decision are exercised exactly as they run in production.
 *
 * The fake deliberately does not interpret `WHERE` clauses. Each fixture therefore models the row
 * set a query would already have returned: a detail-path fixture holds the single offer under test
 * and only its own rate rows. Slug and offerId scoping are SQL concerns, not predicate concerns, and
 * are listed as blocked integration coverage rather than faked here.
 *
 * The clock is pinned with fake timers so boundary cases assert exact-millisecond behaviour rather
 * than relying on wall-clock slack.
 *
 * NOT VERIFIED HERE (requires TEST_DATABASE_URL; see server/lifecycle.integration.test.ts):
 * conformance between the SQL `WHERE` clauses and these predicates over real rows, and the
 * behaviour of MySQL/TiDB DATETIME and timezone handling at a window boundary.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Schema = typeof import("../drizzle/schema");

type Row = Record<string, unknown>;

/** The fake client the mocked drizzle factory hands to server/db.ts for the current test. */
let currentDb: unknown = null;

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => currentDb,
}));

const NOW = new Date("2026-06-15T12:00:00.000Z");
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

const DAY = 24 * 60 * 60 * 1000;

function tableKey(schema: Schema, table: unknown): "offers" | "rates" | "umrah" {
  if (table === schema.travelOffers) return "offers";
  if (table === schema.offerRatePeriods) return "rates";
  if (table === schema.umrahPrograms) return "umrah";
  // Loud by design: a table this fake does not model would otherwise resolve to [] and let an
  // assertion of "withheld" pass without exercising anything.
  throw new Error("publicOfferVisibility fake: unmodelled table in query");
}

/**
 * A minimal stand-in for the drizzle query builder: every terminal in the chains used by
 * server/db.ts (`where`, `limit`, `orderBy`) resolves to the fixture rows for the selected table.
 * Writes are recorded rather than applied, so a read-path test can never mutate its own fixture.
 */
function makeFakeDb(schema: Schema, fixture: { offers?: Row[]; rates?: Row[]; umrah?: Row[] }) {
  const data = {
    offers: fixture.offers ?? [],
    rates: fixture.rates ?? [],
    umrah: fixture.umrah ?? [],
  };
  const updates: Array<{ table: string; values: Row }> = [];

  const makeBuilder = (resolveRows: () => Row[]) => {
    const builder: Record<string, unknown> = {
      from: (table: unknown) => makeBuilder(() => data[tableKey(schema, table)]),
      where: () => builder,
      limit: () => builder,
      orderBy: () => builder,
      then: (onFulfilled?: (value: Row[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolveRows()).then(onFulfilled, onRejected),
    };
    return builder;
  };

  return {
    db: {
      select: () => makeBuilder(() => []),
      update: (table: unknown) => ({
        set: (values: Row) => ({
          where: () => {
            updates.push({ table: tableKey(schema, table), values });
            return Promise.resolve([]);
          },
        }),
      }),
    },
    updates,
  };
}

/** A published offer that is itself visible: active, plainly available, no expiry of its own. */
const visibleOffer = (overrides: Row = {}): Row => ({
  id: 1,
  slug: "sharm-reef-oasis",
  destinationEn: "Sharm El Sheikh",
  destinationAr: "شرم الشيخ",
  hotelNameEn: "Reef Oasis",
  hotelNameAr: "ريف أوَيسيس",
  isActive: true,
  availability: "available",
  validUntil: null,
  hotelTags: [],
  adultsOnly: false,
  mealPlanEn: "All inclusive",
  mealPlanAr: "إقامة كاملة",
  ...overrides,
});

const rate = (overrides: Row = {}): Row => ({
  id: 10,
  offerId: 1,
  price: "6500.00",
  validFrom: null,
  validUntil: null,
  ...overrides,
});

/** Re-import server/db.ts against a freshly built fake client, resetting its cached connection. */
async function loadDbWith(fixture: { offers?: Row[]; rates?: Row[]; umrah?: Row[] }) {
  // Reset first, then resolve both modules in the new generation so the table objects this fake
  // compares against are the very ones server/db.ts holds. Importing the schema beforehand would
  // compare across generations, every match would fail, and every query would answer [].
  vi.resetModules();
  const schema = (await import("../drizzle/schema")) as Schema;
  const fake = makeFakeDb(schema, fixture);
  currentDb = fake.db;
  const mod = await import("./db");
  return { ...mod, updates: fake.updates };
}

let previousDatabaseUrl: string | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  previousDatabaseUrl = process.env.DATABASE_URL;
  // getDb() only builds a client when this is set; the value is never dialled, the factory is mocked.
  process.env.DATABASE_URL = "mysql://fake-not-dialled/travelcorner";
});

afterEach(() => {
  vi.useRealTimers();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  currentDb = null;
});

describe("getPublicOfferBySlug — an offer is withheld unless it carries a current rate", () => {
  it("returns undefined for an offer with no rate periods at all", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({ offers: [visibleOffer()], rates: [] });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("returns undefined when every rate period has expired", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [
        rate({ id: 10, validFrom: at(-30 * DAY), validUntil: at(-10 * DAY) }),
        rate({ id: 11, validFrom: at(-60 * DAY), validUntil: at(-31 * DAY) }),
      ],
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("returns undefined when every rate period is still future-dated", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [
        rate({ id: 10, validFrom: at(10 * DAY), validUntil: at(40 * DAY) }),
        rate({ id: 11, validFrom: at(50 * DAY), validUntil: at(80 * DAY) }),
      ],
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("returns undefined when a rate period carries an unparseable boundary", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: "not-a-date", validUntil: null })],
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("returns the offer with its current rate when one is open-ended", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10 })],
    });

    const offer = await getPublicOfferBySlug("sharm-reef-oasis");

    expect(offer).toBeDefined();
    expect(offer?.slug).toBe("sharm-reef-oasis");
    expect(offer?.rates.map((item) => item.id)).toEqual([10]);
  });

  it("returns only the current rate periods and drops the closed ones", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [
        rate({ id: 10, validFrom: at(-30 * DAY), validUntil: at(-1 * DAY) }),
        rate({ id: 11, validFrom: at(-5 * DAY), validUntil: at(5 * DAY) }),
        rate({ id: 12, validFrom: at(20 * DAY), validUntil: at(40 * DAY) }),
      ],
    });

    const offer = await getPublicOfferBySlug("sharm-reef-oasis");

    expect(offer?.rates.map((item) => item.id)).toEqual([11]);
  });
});

describe("getPublicOfferBySlug — exact rate validity boundaries", () => {
  it("includes a rate whose validUntil is exactly now", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: at(-DAY), validUntil: NOW })],
    });

    const offer = await getPublicOfferBySlug("sharm-reef-oasis");

    expect(offer?.rates.map((item) => item.id)).toEqual([10]);
  });

  it("withholds the offer when validUntil is one millisecond before now", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: at(-DAY), validUntil: at(-1) })],
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("includes a rate whose validFrom is exactly now", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: NOW, validUntil: at(DAY) })],
    });

    const offer = await getPublicOfferBySlug("sharm-reef-oasis");

    expect(offer?.rates.map((item) => item.id)).toEqual([10]);
  });

  it("withholds the offer when validFrom is one millisecond after now", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: at(1), validUntil: at(DAY) })],
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });
});

describe("getPublicOfferBySlug — existing offer-level restrictions still apply", () => {
  const currentRate = [rate({ id: 10 })];

  it("withholds a hidden offer even though a current rate exists", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer({ availability: "hidden" })],
      rates: currentRate,
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("withholds an expired offer even though a current rate exists", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer({ availability: "expired" })],
      rates: currentRate,
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("withholds an inactive offer even though a current rate exists", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer({ isActive: false })],
      rates: currentRate,
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("withholds an offer whose own validUntil has passed", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer({ validUntil: at(-DAY) })],
      rates: currentRate,
    });

    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("returns undefined when the slug matches no offer", async () => {
    const { getPublicOfferBySlug } = await loadDbWith({ offers: [], rates: [] });

    await expect(getPublicOfferBySlug("no-such-slug")).resolves.toBeUndefined();
  });
});

describe("listPublicOffers and getPublicOfferBySlug agree", () => {
  it("withholds from both paths an offer whose rate windows have all closed", async () => {
    const { listPublicOffers, getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: at(-30 * DAY), validUntil: at(-DAY) })],
    });

    await expect(listPublicOffers()).resolves.toEqual([]);
    await expect(getPublicOfferBySlug("sharm-reef-oasis")).resolves.toBeUndefined();
  });

  it("serves from both paths an offer that still carries a current rate", async () => {
    const { listPublicOffers, getPublicOfferBySlug } = await loadDbWith({
      offers: [visibleOffer()],
      rates: [rate({ id: 10, validFrom: at(-DAY), validUntil: at(DAY) })],
    });

    const listed = await listPublicOffers();
    const detail = await getPublicOfferBySlug("sharm-reef-oasis");

    expect(listed.map((item) => item.slug)).toEqual(["sharm-reef-oasis"]);
    expect(detail?.slug).toBe("sharm-reef-oasis");
  });

  it("lists only the offer that still carries a current rate", async () => {
    const { listPublicOffers } = await loadDbWith({
      offers: [
        visibleOffer({ id: 1, slug: "has-current-rate" }),
        visibleOffer({ id: 2, slug: "all-rates-closed" }),
        visibleOffer({ id: 3, slug: "no-rates-at-all" }),
      ],
      rates: [
        rate({ id: 10, offerId: 1, validFrom: at(-DAY), validUntil: at(DAY) }),
        rate({ id: 11, offerId: 2, validFrom: at(-30 * DAY), validUntil: at(-DAY) }),
      ],
    });

    expect((await listPublicOffers()).map((item) => item.slug)).toEqual(["has-current-rate"]);
  });

  it("resolves by slug exactly the offers the listing would include", async () => {
    const cases = [
      {
        slug: "has-current-rate",
        rates: [rate({ id: 10, offerId: 1, validFrom: at(-DAY), validUntil: at(DAY) })],
        expectServed: true,
      },
      {
        slug: "all-rates-closed",
        rates: [rate({ id: 11, offerId: 1, validFrom: at(-30 * DAY), validUntil: at(-DAY) })],
        expectServed: false,
      },
      { slug: "no-rates-at-all", rates: [], expectServed: false },
    ];

    for (const scenario of cases) {
      const { listPublicOffers, getPublicOfferBySlug } = await loadDbWith({
        offers: [visibleOffer({ id: 1, slug: scenario.slug })],
        rates: scenario.rates,
      });

      const listed = (await listPublicOffers()).map((item) => item.slug);
      const detail = await getPublicOfferBySlug(scenario.slug);

      // The assertion that matters is agreement between the two paths, in both directions.
      expect(listed.includes(scenario.slug)).toBe(scenario.expectServed);
      expect(detail !== undefined).toBe(scenario.expectServed);
      expect(detail !== undefined).toBe(listed.includes(scenario.slug));
    }
  });
});
