/**
 * Umrah occupancy pricing helpers.
 *
 * The infant-cheapest case below is the exact defect found in the Phase 0 audit: with the supplied
 * poster data (infant 17,500 < child 28,500 < quad 37,500) the card advertised EGP 17,500 as a quad
 * room price.
 */
import { describe, expect, it } from "vitest";
import { isAdultOccupancy, normalizeRoomType, roomTypeLabel, selectHeadlineUmrahRate } from "./umrahRate";

/** Mirrors the supplied Travel Corner Umrah programme, ordered as the server returns it (price ascending). */
const POSTER_RATES = [
  { roomType: "Infant", price: "17500" },
  { roomType: "Child", price: "28500" },
  { roomType: "Quad", price: "37500" },
  { roomType: "Triple", price: "39000" },
  { roomType: "Double", price: "41000" },
];

describe("normalizeRoomType", () => {
  it("trims and lower-cases staff-entered values", () => {
    expect(normalizeRoomType("  QUAD ")).toBe("quad");
    expect(normalizeRoomType("Quad")).toBe("quad");
    expect(normalizeRoomType(null)).toBe("");
  });
});

describe("isAdultOccupancy", () => {
  it("classifies standard room types as adult occupancy", () => {
    for (const roomType of ["Quad", "quad", "Triple", "Double", "Single", "رباعي"]) {
      expect(isAdultOccupancy(roomType)).toBe(true);
    }
  });

  it("classifies child and infant fares as non-adult, in either language", () => {
    for (const roomType of ["Child", "child", "Children", "طفل", "Infant", "infant", "رضيع"]) {
      expect(isAdultOccupancy(roomType)).toBe(false);
    }
  });
});

describe("selectHeadlineUmrahRate", () => {
  it("never selects an infant fare, even when it is the cheapest row overall", () => {
    const selected = selectHeadlineUmrahRate(POSTER_RATES);
    expect(selected).not.toBeNull();
    expect(selected?.roomType).toBe("Quad");
    expect(selected?.price).toBe("37500");
  });

  it("never selects a child fare", () => {
    const selected = selectHeadlineUmrahRate([
      { roomType: "Child", price: "28500" },
      { roomType: "Triple", price: "39000" },
    ]);
    expect(selected?.roomType).toBe("Triple");
  });

  it("selects the cheapest adult occupancy rather than the first listed", () => {
    const selected = selectHeadlineUmrahRate([
      { roomType: "Double", price: "41000" },
      { roomType: "Quad", price: "37500" },
      { roomType: "Triple", price: "39000" },
    ]);
    expect(selected?.roomType).toBe("Quad");
  });

  it("returns the record itself, so the displayed price and room type cannot disagree", () => {
    const selected = selectHeadlineUmrahRate(POSTER_RATES);
    const source = POSTER_RATES.find((rate) => rate.roomType === selected?.roomType);
    expect(selected).toBe(source);
  });

  it("returns null rather than falling back to a child or infant fare", () => {
    expect(selectHeadlineUmrahRate([{ roomType: "Infant", price: "17500" }])).toBeNull();
    expect(selectHeadlineUmrahRate([{ roomType: "Child", price: "28500" }])).toBeNull();
  });

  it("returns null for an empty or absent rate list", () => {
    expect(selectHeadlineUmrahRate([])).toBeNull();
    expect(selectHeadlineUmrahRate(null)).toBeNull();
  });

  it("ignores rows whose price is not a usable number", () => {
    const selected = selectHeadlineUmrahRate([
      { roomType: "Quad", price: "to be confirmed" },
      { roomType: "Triple", price: "39000" },
    ]);
    expect(selected?.roomType).toBe("Triple");
  });

  it("accepts numeric prices as well as decimal strings", () => {
    const selected = selectHeadlineUmrahRate([
      { roomType: "Double", price: 41000 },
      { roomType: "Quad", price: "37500.00" },
    ]);
    expect(selected?.roomType).toBe("Quad");
  });
});

describe("roomTypeLabel", () => {
  it("resolves Arabic labels regardless of casing or whitespace", () => {
    expect(roomTypeLabel("Quad", "ar")).toBe("رباعي");
    expect(roomTypeLabel("quad", "ar")).toBe("رباعي");
    expect(roomTypeLabel("  QUAD  ", "ar")).toBe("رباعي");
    expect(roomTypeLabel("Triple", "ar")).toBe("ثلاثي");
    expect(roomTypeLabel("Double", "ar")).toBe("ثنائي");
  });

  it("shows the value exactly as entered in English", () => {
    expect(roomTypeLabel("Quad", "en")).toBe("Quad");
    expect(roomTypeLabel("Family suite", "en")).toBe("Family suite");
  });

  it("falls through to the entered value for unknown or Arabic-entered types", () => {
    expect(roomTypeLabel("Family suite", "ar")).toBe("Family suite");
    expect(roomTypeLabel("رباعي", "ar")).toBe("رباعي");
  });
});
