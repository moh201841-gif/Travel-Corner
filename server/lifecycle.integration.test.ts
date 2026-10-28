/**
 * Travel Corner lifecycle — database-dependent coverage. CURRENTLY BLOCKED.
 *
 * This file deliberately contains no working integration tests. During Phase 0.5 no database was
 * reachable (no DATABASE_URL, no TEST_DATABASE_URL, MySQL port unreachable), so the behaviours below
 * could not be written against a real server or executed even once.
 *
 * The file exists so the gap is visible in the test report rather than invisible. It is arranged so
 * that it can never produce a false green:
 *
 *   - Without TEST_DATABASE_URL the suite is skipped and a banner names exactly what is unverified.
 *   - With TEST_DATABASE_URL the suite runs and FAILS, because the bodies are not implemented.
 *     A red suite is the correct signal: supplying a database does not retroactively create
 *     coverage that was never written.
 *
 * Do not "fix" these by deleting them or by asserting something trivial. Implement them against a
 * disposable schema once database access is available.
 */
import { describe, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const BLOCKED_COVERAGE = [
  "SQL visibility clauses in db.ts conform to the shared lifecycle predicates over seeded fixtures",
  "applyPublicLifecycleRules archives exactly the passed rows and leaves hidden/sold_out untouched",
  "listPublicOffers omits an offer whose rate windows have all closed",
  "saveAdminOffer headline-price rules: 0 rows creates, 1 row updates, 2+ rows is refused (D9)",
  "saveAdminOffer never writes validFrom/validUntil on a rate row (K-2 separation)",
  "replaceOfferRates rolls back completely on a mid-operation failure (D6 — blocked)",
  "replaceUmrahRates rolls back completely on a mid-operation failure (D7 — blocked)",
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
