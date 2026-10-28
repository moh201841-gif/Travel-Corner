/**
 * Headline-price editability.
 *
 * Guards the regression found in adversarial review: the offer editor pre-filled the price from
 * rates[0], so on a package with several price periods it always sent a price, the server D9 guard
 * always refused, and no content edit on that package could be saved at all.
 */
import { describe, expect, it } from "vitest";
import { headlinePriceToSubmit, initialHeadlineRate, isHeadlinePriceEditable } from "./offerHeadlinePrice";

const ONE_RATE = [{ price: "6650", labelEn: "1 Jul – 30 Sep", labelAr: "١ يوليو – ٣٠ سبتمبر" }];
const THREE_RATES = [
  { price: "6650", labelEn: "July", labelAr: "يوليو" },
  { price: "7400", labelEn: "August", labelAr: "أغسطس" },
  { price: "6950", labelEn: "September", labelAr: "سبتمبر" },
];

describe("isHeadlinePriceEditable", () => {
  it("allows the headline price for a package with no rate rows yet", () => {
    expect(isHeadlinePriceEditable(0)).toBe(true);
  });

  it("allows the headline price for a package with exactly one rate row", () => {
    expect(isHeadlinePriceEditable(1)).toBe(true);
  });

  it("disallows it once several price periods exist", () => {
    expect(isHeadlinePriceEditable(2)).toBe(false);
    expect(isHeadlinePriceEditable(12)).toBe(false);
  });
});

describe("initialHeadlineRate", () => {
  it("pre-fills from the sole rate row", () => {
    expect(initialHeadlineRate(ONE_RATE)).toBe(ONE_RATE[0]);
  });

  it("pre-fills nothing for a multi-rate package, so no price is carried into the form", () => {
    expect(initialHeadlineRate(THREE_RATES)).toBeNull();
  });

  it("pre-fills nothing when the package has no rates or none were loaded", () => {
    expect(initialHeadlineRate([])).toBeNull();
    expect(initialHeadlineRate(undefined)).toBeNull();
    expect(initialHeadlineRate(null)).toBeNull();
  });
});

describe("headlinePriceToSubmit", () => {
  it("submits nothing for a multi-rate package even if the form somehow holds a value", () => {
    // This is the regression guard: a multi-rate save must stay possible, so no price is sent and
    // the server's D9 refusal is never triggered by ordinary content editing.
    expect(headlinePriceToSubmit(3, "6650")).toBeUndefined();
    expect(headlinePriceToSubmit(2, "9999")).toBeUndefined();
  });

  it("submits the entered price for a single-rate package", () => {
    expect(headlinePriceToSubmit(1, "6650")).toBe("6650");
  });

  it("submits the entered price for a package that has no rates yet", () => {
    expect(headlinePriceToSubmit(0, "6650")).toBe("6650");
  });

  it("treats a blank or whitespace-only price as no price", () => {
    expect(headlinePriceToSubmit(1, "")).toBeUndefined();
    expect(headlinePriceToSubmit(0, "   ")).toBeUndefined();
  });

  it("trims a padded value", () => {
    expect(headlinePriceToSubmit(1, "  6650 ")).toBe("6650");
  });
});
