/**
 * Travel Corner Umrah occupancy pricing helpers.
 *
 * Two defects are addressed here:
 *
 * D3 — the Umrah card previously rendered `rates[0]` (the cheapest row overall) under a hardcoded
 *      "quad room" label. Because rows are ordered by price ascending, an infant fare could be
 *      advertised as a quad room price. The headline now selects the cheapest *adult* occupancy and
 *      the caller renders the price and the room type from the same record, so the label and the
 *      figure cannot disagree.
 *
 * D4 — room-type labels are entered as free text by staff ("Quad", "quad", " QUAD "). Lookup is
 *      normalized so Arabic labels resolve regardless of casing or surrounding whitespace.
 */
import type { Language } from "@/data/travelData";

export type OccupancyRate = {
  roomType: string;
  price: string | number;
};

/** Tokens that identify a non-adult occupancy, in both languages staff may enter. */
const CHILD_TOKENS = ["child", "children", "kid", "طفل", "أطفال", "اطفال"];
const INFANT_TOKENS = ["infant", "baby", "رضيع", "رضع"];

/** Trim and lower-case a staff-entered room type so lookups and comparisons are stable. */
export function normalizeRoomType(roomType: string | null | undefined): string {
  return (roomType ?? "").trim().toLowerCase();
}

export function isChildOccupancy(roomType: string | null | undefined): boolean {
  const normalized = normalizeRoomType(roomType);
  return CHILD_TOKENS.some((token) => normalized.includes(token));
}

export function isInfantOccupancy(roomType: string | null | undefined): boolean {
  const normalized = normalizeRoomType(roomType);
  return INFANT_TOKENS.some((token) => normalized.includes(token));
}

/** An adult occupancy is any room type that is not a child or infant fare. */
export function isAdultOccupancy(roomType: string | null | undefined): boolean {
  return !isChildOccupancy(roomType) && !isInfantOccupancy(roomType);
}

function numericPrice(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/**
 * Select the public "from" rate: the cheapest adult occupancy.
 *
 * Child and infant fares can never become the headline, even when they are the cheapest rows in the
 * program. If a program carries no adult occupancy at all, this returns null and the caller shows no
 * price rather than falling back to a child or infant fare.
 */
export function selectHeadlineUmrahRate<T extends OccupancyRate>(rates: readonly T[] | null | undefined): T | null {
  if (!rates || rates.length === 0) return null;

  let selected: T | null = null;
  let selectedPrice = Number.POSITIVE_INFINITY;

  for (const rate of rates) {
    if (!isAdultOccupancy(rate.roomType)) continue;
    const price = numericPrice(rate.price);
    if (Number.isNaN(price)) continue;
    if (price < selectedPrice) {
      selected = rate;
      selectedPrice = price;
    }
  }

  return selected;
}

const ARABIC_ROOM_TYPES: Record<string, string> = {
  quad: "رباعي",
  triple: "ثلاثي",
  double: "ثنائي",
  single: "فردي",
  child: "طفل",
  infant: "رضيع",
};

/**
 * Label a room type for display.
 * English shows exactly what staff entered. Arabic resolves a known occupancy to its Arabic term and
 * otherwise falls through to the entered value unchanged, so an Arabic-entered room type is never
 * mangled.
 */
export function roomTypeLabel(roomType: string, lang: Language): string {
  if (lang !== "ar") return roomType;
  return ARABIC_ROOM_TYPES[normalizeRoomType(roomType)] ?? roomType;
}
