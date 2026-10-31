/** Operator-facing error mapping — known business refusals pass through, raw server text does not. */
import { describe, expect, it } from "vitest";
import {
  DATABASE_UNREACHABLE_ERR_MSG,
  DUPLICATE_SLUG_ERR_MSG,
  MEDIA_STORAGE_UNCONFIGURED_ERR_MSG,
  MULTI_RATE_HEADLINE_PRICE_ERR_MSG,
  SCHEMA_OUT_OF_DATE_ERR_MSG,
} from "@shared/const";
import { operatorErrorMessage, validationMessage } from "./adminErrors";

const FALLBACK = "The hotel package could not be saved.";

describe("operatorErrorMessage", () => {
  it("shows the multi-rate headline-price refusal exactly as the server phrased it", () => {
    expect(operatorErrorMessage({ message: MULTI_RATE_HEADLINE_PRICE_ERR_MSG }, FALLBACK))
      .toBe(MULTI_RATE_HEADLINE_PRICE_ERR_MSG);
  });

  it("never shows raw database error text to the operator", () => {
    const mysqlError = { message: "Duplicate entry 'sharks-bay-oasis' for key 'travelOffers.travelOffers_slug_unique'" };

    const shown = operatorErrorMessage(mysqlError, FALLBACK);

    expect(shown).toBe(FALLBACK);
    expect(shown).not.toContain("travelOffers");
    expect(shown).not.toContain("Duplicate entry");
  });

  it("falls back for any other unrecognised server message", () => {
    expect(operatorErrorMessage({ message: "ECONNREFUSED 10.0.0.4:4000" }, FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage({ message: "The offer service is unavailable." }, FALLBACK)).toBe(FALLBACK);
  });

  /**
   * The messages server/dbErrors.ts produces. They are the whole point of that translation: the
   * operator reads "choose a different slug" instead of the same sentence they get for every other
   * failure, and the driver's own text still never reaches the browser.
   */
  it.each([
    ["a duplicate slug", DUPLICATE_SLUG_ERR_MSG],
    ["an out-of-date schema", SCHEMA_OUT_OF_DATE_ERR_MSG],
    ["an unreachable database", DATABASE_UNREACHABLE_ERR_MSG],
    ["unconfigured image storage", MEDIA_STORAGE_UNCONFIGURED_ERR_MSG],
  ])("shows the translated message for %s", (_label, message) => {
    expect(operatorErrorMessage({ message }, FALLBACK)).toBe(message);
  });

  it("falls back for malformed or absent errors", () => {
    expect(operatorErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage("a bare string", FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK);
  });
});

/**
 * Input validation. The server's error formatter attaches the rejected field paths and zod's own
 * messages to a BAD_REQUEST; before that the operator was told the package "could not be saved"
 * with no indication of which field was at fault — a price typed as "6,500" being the likely cause
 * of the reported save failure, and indistinguishable from a database problem.
 */
describe("validationMessage", () => {
  const priceRejection = {
    message: "Input validation failed",
    data: {
      code: "BAD_REQUEST",
      zodError: { formErrors: [], fieldErrors: { price: ["Invalid string: must match pattern /^\\d+(\\.\\d{1,2})?$/"] } },
    },
  };

  it("names the field using the form's own label", () => {
    const shown = operatorErrorMessage(priceRejection, FALLBACK);

    expect(shown).toContain("Price (EGP)");
    expect(shown).not.toBe(FALLBACK);
  });

  it("prefers validation detail over the generic fallback", () => {
    expect(validationMessage(priceRejection)).not.toBeNull();
  });

  it("lists several fields and caps how many it names", () => {
    const shown = operatorErrorMessage(
      {
        message: "Input validation failed",
        data: {
          code: "BAD_REQUEST",
          zodError: {
            formErrors: [],
            fieldErrors: {
              slug: ["Too small: expected string to have >=3 characters"],
              hotelNameEn: ["Too small"],
              mealPlanAr: ["Too small"],
              days: ["Too big"],
            },
          },
        },
      },
      FALLBACK
    );

    expect(shown).toContain("Slug");
    expect(shown).toContain("and 1 more");
  });

  it("reports a whole-object refusal that belongs to no field", () => {
    const shown = operatorErrorMessage(
      {
        message: "Input validation failed",
        data: {
          code: "BAD_REQUEST",
          zodError: { formErrors: ["Choose at least one field to update."], fieldErrors: {} },
        },
      },
      FALLBACK
    );

    expect(shown).toContain("Choose at least one field to update.");
  });

  it("is null for an error carrying no validation detail", () => {
    expect(validationMessage({ message: "something else" })).toBeNull();
    expect(validationMessage({ message: "x", data: { code: "INTERNAL_SERVER_ERROR" } })).toBeNull();
    expect(validationMessage(undefined)).toBeNull();
    expect(validationMessage({ message: "x", data: { zodError: { fieldErrors: {}, formErrors: [] } } })).toBeNull();
  });

  it("ignores non-string entries rather than printing them", () => {
    const shown = operatorErrorMessage(
      {
        message: "Input validation failed",
        data: { code: "BAD_REQUEST", zodError: { formErrors: [{ nested: true }], fieldErrors: { price: [7] } } },
      },
      FALLBACK
    );

    expect(shown).toBe(FALLBACK);
  });
});
