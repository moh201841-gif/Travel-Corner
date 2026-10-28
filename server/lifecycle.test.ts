/**
 * Travel Corner lifecycle rules — deterministic coverage.
 *
 * These tests replace two assertions in travel.test.ts that iterated over arrays which were always
 * empty (no DATABASE_URL), and therefore passed whether or not the lifecycle rules worked at all.
 *
 * Every case here injects an explicit `now` and asserts a concrete boolean, so nothing can pass
 * vacuously. The SQL WHERE clauses in server/db.ts express the same rules for performance;
 * conformance between the two requires a live database and is declared blocked in
 * server/lifecycle.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  hasCurrentRatePeriod,
  isOfferPubliclyVisible,
  isRatePeriodCurrent,
  isUmrahProgramPubliclyVisible,
  resolveBoundary,
  shouldAutoExpireOffer,
  shouldAutoExpireUmrahProgram,
  type LifecycleAvailability,
} from "@shared/lifecycle";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const PAST = new Date("2026-07-14T12:00:00.000Z");
const FUTURE = new Date("2026-07-16T12:00:00.000Z");

const publishedOffer = (overrides: Partial<{ isActive: boolean; availability: LifecycleAvailability; validUntil: Date | string | null }> = {}) => ({
  isActive: true,
  availability: "available" as LifecycleAvailability,
  validUntil: null as Date | string | null,
  ...overrides,
});

const publishedProgram = (overrides: Partial<{ isActive: boolean; availability: LifecycleAvailability; departureAt: Date | string | null }> = {}) => ({
  isActive: true,
  availability: "available" as LifecycleAvailability,
  departureAt: null as Date | string | null,
  ...overrides,
});

describe("resolveBoundary", () => {
  it("distinguishes absent, valid, and unparseable timestamps", () => {
    expect(resolveBoundary(null)).toEqual({ kind: "absent" });
    expect(resolveBoundary(undefined)).toEqual({ kind: "absent" });
    expect(resolveBoundary(NOW)).toEqual({ kind: "at", ms: NOW.getTime() });
    expect(resolveBoundary("2026-07-15T12:00:00.000Z")).toEqual({ kind: "at", ms: NOW.getTime() });
    expect(resolveBoundary("not-a-date")).toEqual({ kind: "invalid" });
  });
});

describe("isOfferPubliclyVisible", () => {
  it("shows a published offer with no expiry date", () => {
    expect(isOfferPubliclyVisible(publishedOffer(), NOW)).toBe(true);
  });

  it("hides an unpublished offer even when every date is valid", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ isActive: false }), NOW)).toBe(false);
  });

  it("hides offers in a deliberately non-public availability state", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ availability: "hidden" }), NOW)).toBe(false);
    expect(isOfferPubliclyVisible(publishedOffer({ availability: "expired" }), NOW)).toBe(false);
  });

  it("still shows offers that are merely limited, on request, or sold out", () => {
    for (const availability of ["limited", "on_request", "sold_out"] as LifecycleAvailability[]) {
      expect(isOfferPubliclyVisible(publishedOffer({ availability }), NOW)).toBe(true);
    }
  });

  it("hides an offer whose validity date has passed", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ validUntil: PAST }), NOW)).toBe(false);
  });

  it("shows an offer at the exact expiry boundary, because validUntil is inclusive", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ validUntil: NOW }), NOW)).toBe(true);
  });

  it("shows an offer whose validity date is still ahead", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ validUntil: FUTURE }), NOW)).toBe(true);
  });

  it("hides an offer with a corrupt validity date rather than treating it as never expiring", () => {
    expect(isOfferPubliclyVisible(publishedOffer({ validUntil: "not-a-date" }), NOW)).toBe(false);
  });
});

describe("isRatePeriodCurrent", () => {
  it("treats an unbounded window as current", () => {
    expect(isRatePeriodCurrent({ validFrom: null, validUntil: null }, NOW)).toBe(true);
  });

  it("excludes a window that has not opened yet", () => {
    expect(isRatePeriodCurrent({ validFrom: FUTURE, validUntil: null }, NOW)).toBe(false);
  });

  it("excludes a window that has already closed", () => {
    expect(isRatePeriodCurrent({ validFrom: null, validUntil: PAST }, NOW)).toBe(false);
  });

  it("includes both boundaries, matching the inclusive SQL comparison", () => {
    expect(isRatePeriodCurrent({ validFrom: NOW, validUntil: null }, NOW)).toBe(true);
    expect(isRatePeriodCurrent({ validFrom: null, validUntil: NOW }, NOW)).toBe(true);
    expect(isRatePeriodCurrent({ validFrom: NOW, validUntil: NOW }, NOW)).toBe(true);
  });

  it("includes a window that straddles now", () => {
    expect(isRatePeriodCurrent({ validFrom: PAST, validUntil: FUTURE }, NOW)).toBe(true);
  });

  it("excludes a rate with a corrupt boundary", () => {
    expect(isRatePeriodCurrent({ validFrom: "rubbish", validUntil: null }, NOW)).toBe(false);
    expect(isRatePeriodCurrent({ validFrom: null, validUntil: "rubbish" }, NOW)).toBe(false);
  });
});

describe("hasCurrentRatePeriod", () => {
  it("is false for an offer whose every rate window has closed", () => {
    const rates = [
      { validFrom: null, validUntil: PAST },
      { validFrom: PAST, validUntil: PAST },
    ];
    expect(rates.length).toBeGreaterThan(0);
    expect(hasCurrentRatePeriod(rates, NOW)).toBe(false);
  });

  it("is true when at least one window is still open", () => {
    const rates = [
      { validFrom: null, validUntil: PAST },
      { validFrom: PAST, validUntil: FUTURE },
    ];
    expect(hasCurrentRatePeriod(rates, NOW)).toBe(true);
  });

  it("is false for an offer with no rate rows at all", () => {
    expect(hasCurrentRatePeriod([], NOW)).toBe(false);
  });
});

describe("isUmrahProgramPubliclyVisible", () => {
  it("shows a published program whose departure is ahead", () => {
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ departureAt: FUTURE }), NOW)).toBe(true);
  });

  it("hides a program whose departure has passed", () => {
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ departureAt: PAST }), NOW)).toBe(false);
  });

  it("shows a program departing exactly now, because the comparison is inclusive", () => {
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ departureAt: NOW }), NOW)).toBe(true);
  });

  it("does not date-gate a program with no departure date", () => {
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ departureAt: null }), NOW)).toBe(true);
  });

  it("hides unpublished, hidden, and expired programs", () => {
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ isActive: false, departureAt: FUTURE }), NOW)).toBe(false);
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ availability: "hidden", departureAt: FUTURE }), NOW)).toBe(false);
    expect(isUmrahProgramPubliclyVisible(publishedProgram({ availability: "expired", departureAt: FUTURE }), NOW)).toBe(false);
  });
});

describe("shouldAutoExpireOffer", () => {
  it("archives a published offer whose validity has passed", () => {
    expect(shouldAutoExpireOffer(publishedOffer({ validUntil: PAST }), NOW)).toBe(true);
  });

  it("does not archive at the exact boundary, because auto-expiry is strict", () => {
    expect(shouldAutoExpireOffer(publishedOffer({ validUntil: NOW }), NOW)).toBe(false);
  });

  it("never archives offers staff placed in a deliberate state", () => {
    for (const availability of ["expired", "hidden", "sold_out"] as LifecycleAvailability[]) {
      expect(shouldAutoExpireOffer(publishedOffer({ availability, validUntil: PAST }), NOW)).toBe(false);
    }
  });

  it("does not archive an offer that has no validity date", () => {
    expect(shouldAutoExpireOffer(publishedOffer({ validUntil: null }), NOW)).toBe(false);
  });
});

describe("shouldAutoExpireUmrahProgram", () => {
  it("archives a program whose departure has passed", () => {
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ departureAt: PAST }), NOW)).toBe(true);
  });

  it("does not archive at the exact departure moment", () => {
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ departureAt: NOW }), NOW)).toBe(false);
  });

  it("never archives hidden or already expired programs", () => {
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ availability: "hidden", departureAt: PAST }), NOW)).toBe(false);
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ availability: "expired", departureAt: PAST }), NOW)).toBe(false);
  });

  it("archives a sold-out program, unlike hotel offers", () => {
    // Mirrors the SQL: the Umrah auto-expiry UPDATE exempts only expired and hidden.
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ availability: "sold_out", departureAt: PAST }), NOW)).toBe(true);
  });

  it("does not archive a program with no departure date", () => {
    expect(shouldAutoExpireUmrahProgram(publishedProgram({ departureAt: null }), NOW)).toBe(false);
  });
});
