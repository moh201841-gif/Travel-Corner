/** Operator-facing error mapping — known business refusals pass through, raw server text does not. */
import { describe, expect, it } from "vitest";
import { MULTI_RATE_HEADLINE_PRICE_ERR_MSG } from "@shared/const";
import { operatorErrorMessage } from "./adminErrors";

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

  it("falls back for malformed or absent errors", () => {
    expect(operatorErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage("a bare string", FALLBACK)).toBe(FALLBACK);
    expect(operatorErrorMessage({ message: 42 }, FALLBACK)).toBe(FALLBACK);
  });
});
