/**
 * Regression cover for the reported production symptom "the admin hotel package form answers
 * 'the hotel could not be saved'".
 *
 * The defect was diagnostic, not arithmetic: every write failure reached the operator as the same
 * sentence, because the dashboard refuses to display server text it does not recognise (correctly —
 * raw driver text names tables and indexes) and nothing translated the common failures into
 * something it does recognise. A duplicate slug and an unapplied migration therefore looked
 * identical from the only seat that can act on them.
 *
 * These cases pin the translation and, as importantly, pin what is *not* translated: an unfamiliar
 * failure must pass through unchanged so the dashboard keeps falling back to a generic message
 * rather than printing database internals.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DATABASE_UNREACHABLE_ERR_MSG,
  DUPLICATE_SLUG_ERR_MSG,
  MULTI_RATE_HEADLINE_PRICE_ERR_MSG,
  SCHEMA_OUT_OF_DATE_ERR_MSG,
} from "@shared/const";
import { operatorSafeDbError, withOperatorSafeDbErrors } from "./dbErrors";

/** A mysql2-shaped driver error: the `code` is what the translation keys on. */
function driverError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe("operatorSafeDbError", () => {
  it("reports a duplicate slug as a slug clash", () => {
    const error = driverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'sharm-royal-4n' for key 'travelOffers.travelOffers_slug_unique'"
    );
    expect(messageOf(operatorSafeDbError(error))).toBe(DUPLICATE_SLUG_ERR_MSG);
  });

  it("does not name the offending value, the table or the index", () => {
    const error = driverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'sharm-royal-4n' for key 'travelOffers.travelOffers_slug_unique'"
    );
    const message = messageOf(operatorSafeDbError(error));
    expect(message).not.toContain("sharm-royal-4n");
    expect(message).not.toContain("travelOffers");
    expect(message).not.toContain("Duplicate entry");
  });

  it("passes a duplicate entry on some other unique key through untranslated", () => {
    // Reporting "choose a different slug" for a clash on a different key would send the operator
    // to edit a field that was never the problem.
    const error = driverError("ER_DUP_ENTRY", "Duplicate entry 'owner' for key 'users.users_openId_unique'");
    expect(operatorSafeDbError(error)).toBe(error);
  });

  it.each([
    ["ER_BAD_FIELD_ERROR", "Unknown column 'imageGallery' in 'field list'"],
    ["ER_NO_SUCH_TABLE", "Table 'travelcorner.travelOffers' doesn't exist"],
    ["ER_BAD_DB_ERROR", "Unknown database 'travelcorner'"],
  ])("reports %s as an out-of-date schema", (code, message) => {
    // This is the shape an unapplied migration takes. Migration 0001 adds validUntil,
    // lastPriceUpdatedAt, primaryImageUrl and imageGallery, all of which the offer write touches,
    // so a database carrying only 0000 fails every save with ER_BAD_FIELD_ERROR.
    expect(messageOf(operatorSafeDbError(driverError(code, message)))).toBe(SCHEMA_OUT_OF_DATE_ERR_MSG);
  });

  it.each([
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "PROTOCOL_CONNECTION_LOST",
    "ER_ACCESS_DENIED_ERROR",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERT_HAS_EXPIRED",
  ])("reports %s as an unreachable database", (code) => {
    expect(messageOf(operatorSafeDbError(driverError(code, "connect failed")))).toBe(
      DATABASE_UNREACHABLE_ERR_MSG
    );
  });

  it("leaves an application refusal exactly as thrown", () => {
    // The headline-price guard is already an operator-facing message; re-wrapping it would replace
    // a precise instruction with a generic one.
    const error = new Error(MULTI_RATE_HEADLINE_PRICE_ERR_MSG);
    expect(operatorSafeDbError(error)).toBe(error);
  });

  it("leaves an error with no recognised code alone", () => {
    const unknown = new Error("something nobody anticipated");
    expect(operatorSafeDbError(unknown)).toBe(unknown);
    expect(operatorSafeDbError(driverError("ER_PARSE_ERROR", "You have an error in your SQL syntax"))).toMatchObject({
      code: "ER_PARSE_ERROR",
    });
  });

  it("tolerates a thrown non-error", () => {
    expect(operatorSafeDbError("a string")).toBe("a string");
    expect(operatorSafeDbError(null)).toBe(null);
  });
});

describe("withOperatorSafeDbErrors", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the value when the write succeeds and logs nothing", async () => {
    await expect(withOperatorSafeDbErrors("saveAdminOffer", async () => ({ id: 7 }))).resolves.toEqual({ id: 7 });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("throws the translated error and logs the original in full", async () => {
    const original = driverError("ER_DUP_ENTRY", "Duplicate entry 'x' for key 'travelOffers_slug_unique'");

    await expect(
      withOperatorSafeDbErrors("saveAdminOffer", async () => {
        throw original;
      })
    ).rejects.toThrow(DUPLICATE_SLUG_ERR_MSG);

    // The driver detail is not lost — it goes to the log, which is the only place it belongs.
    expect(console.error).toHaveBeenCalledTimes(1);
    const [line, logged] = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(line).toContain("saveAdminOffer");
    expect(line).toContain("ER_DUP_ENTRY");
    expect(logged).toBe(original);
  });

  it("re-throws an untranslated failure unchanged, still logged", async () => {
    const original = new Error("something nobody anticipated");
    await expect(
      withOperatorSafeDbErrors("replaceOfferRates", async () => {
        throw original;
      })
    ).rejects.toBe(original);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
