/**
 * Travel Corner lifecycle rules.
 *
 * These predicates are the authoritative expression of "may this record reach a customer right now".
 * They are pure and take `now` as an argument so every boundary is deterministic and testable
 * without a database, a clock mock, or a live connection.
 *
 * The SQL `WHERE` clauses in server/db.ts express the same rules for performance. They are a
 * pre-filter; these predicates are applied afterwards in memory as defence in depth. If the two ever
 * disagree, the stricter in-memory result wins, so the failure direction is always "hide inventory
 * that might be stale" rather than "show an expired price".
 */

export type LifecycleAvailability =
  | "available"
  | "limited"
  | "on_request"
  | "sold_out"
  | "expired"
  | "hidden";

/** Timestamps arrive as Date from Drizzle, but may be serialized as strings across a transport boundary. */
export type TimestampInput = Date | string | number | null | undefined;

type Boundary =
  | { kind: "absent" }
  | { kind: "at"; ms: number }
  | { kind: "invalid" };

/**
 * Resolve a nullable timestamp into an explicit boundary.
 * An unparseable value is reported as `invalid` rather than silently treated as "no limit",
 * because treating a corrupt date as "never expires" would fail in the unsafe direction.
 */
export function resolveBoundary(value: TimestampInput): Boundary {
  if (value === null || value === undefined) return { kind: "absent" };
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? { kind: "invalid" } : { kind: "at", ms };
}

export type OfferLifecycleFields = {
  isActive: boolean;
  availability: LifecycleAvailability;
  validUntil?: TimestampInput;
};

export type RatePeriodLifecycleFields = {
  validFrom?: TimestampInput;
  validUntil?: TimestampInput;
};

export type UmrahLifecycleFields = {
  isActive: boolean;
  availability: LifecycleAvailability;
  departureAt?: TimestampInput;
};

/** Availability states that are never auto-expired, because staff set them deliberately. */
const AVAILABILITY_EXEMPT_FROM_OFFER_AUTO_EXPIRY: LifecycleAvailability[] = ["expired", "hidden", "sold_out"];
const AVAILABILITY_EXEMPT_FROM_UMRAH_AUTO_EXPIRY: LifecycleAvailability[] = ["expired", "hidden"];

/** Availability states that are never shown publicly, regardless of dates. */
const AVAILABILITY_HIDDEN_FROM_PUBLIC: LifecycleAvailability[] = ["hidden", "expired"];

/**
 * A hotel offer reaches customers only while it is published, not hidden or expired, and not past
 * its own validity date. `validUntil` is inclusive: an offer is still visible at the exact boundary.
 */
export function isOfferPubliclyVisible(offer: OfferLifecycleFields, now: Date): boolean {
  if (offer.isActive !== true) return false;
  if (AVAILABILITY_HIDDEN_FROM_PUBLIC.includes(offer.availability)) return false;

  const validUntil = resolveBoundary(offer.validUntil);
  if (validUntil.kind === "invalid") return false;
  if (validUntil.kind === "at" && validUntil.ms < now.getTime()) return false;

  return true;
}

/**
 * A rate period is current while `now` falls inside its window. Both bounds are inclusive and both
 * are optional; an absent bound means "unbounded in that direction".
 */
export function isRatePeriodCurrent(rate: RatePeriodLifecycleFields, now: Date): boolean {
  const nowMs = now.getTime();

  const validFrom = resolveBoundary(rate.validFrom);
  if (validFrom.kind === "invalid") return false;
  if (validFrom.kind === "at" && validFrom.ms > nowMs) return false;

  const validUntil = resolveBoundary(rate.validUntil);
  if (validUntil.kind === "invalid") return false;
  if (validUntil.kind === "at" && validUntil.ms < nowMs) return false;

  return true;
}

/**
 * An Umrah program reaches customers only while it is published, not hidden or expired, and its
 * departure has not passed. A program with no departure date is not date-gated.
 */
export function isUmrahProgramPubliclyVisible(program: UmrahLifecycleFields, now: Date): boolean {
  if (program.isActive !== true) return false;
  if (AVAILABILITY_HIDDEN_FROM_PUBLIC.includes(program.availability)) return false;

  const departureAt = resolveBoundary(program.departureAt);
  if (departureAt.kind === "invalid") return false;
  if (departureAt.kind === "at" && departureAt.ms < now.getTime()) return false;

  return true;
}

/**
 * Whether a passed hotel offer should be archived on read.
 * Mirrors the auto-expiry UPDATE: strictly past, and not already in a deliberate staff-set state.
 */
export function shouldAutoExpireOffer(offer: OfferLifecycleFields, now: Date): boolean {
  if (AVAILABILITY_EXEMPT_FROM_OFFER_AUTO_EXPIRY.includes(offer.availability)) return false;
  const validUntil = resolveBoundary(offer.validUntil);
  return validUntil.kind === "at" && validUntil.ms < now.getTime();
}

/** Whether a departed Umrah program should be archived on read. */
export function shouldAutoExpireUmrahProgram(program: UmrahLifecycleFields, now: Date): boolean {
  if (AVAILABILITY_EXEMPT_FROM_UMRAH_AUTO_EXPIRY.includes(program.availability)) return false;
  const departureAt = resolveBoundary(program.departureAt);
  return departureAt.kind === "at" && departureAt.ms < now.getTime();
}

/**
 * A published hotel offer is only genuinely bookable if it still carries at least one current rate.
 * Kept here so the listing rule lives beside the lifecycle rules it depends on.
 */
export function hasCurrentRatePeriod(rates: RatePeriodLifecycleFields[], now: Date): boolean {
  return rates.some((rate) => isRatePeriodCurrent(rate, now));
}
