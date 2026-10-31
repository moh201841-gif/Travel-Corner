/**
 * Headline-price editability in the Travel Corner offer editor.
 *
 * The server refuses a headline price when a package carries several price periods (D9), because
 * choosing one to overwrite would be a guess. The offer editor previously pre-filled the price from
 * `rates[0]` regardless, so it always sent a price and every save on a multi-rate package was
 * refused — blocking ordinary content edits such as renaming a hotel or changing availability.
 *
 * These rules mirror the server guard on the client so the editor never sends a price it knows will
 * be refused. The server guard remains the authority and is not weakened.
 */

export type HeadlineRate = {
  price: string | number;
  labelEn?: string | null;
  labelAr?: string | null;
};

/** The single headline price field is only meaningful for a package with zero or one price period. */
export function isHeadlinePriceEditable(rateCount: number): boolean {
  return rateCount <= 1;
}

/**
 * The rate a headline price edit would act on.
 * Returns null for a multi-rate package so the editor pre-fills nothing, and for a package with no
 * rates at all, where there is nothing to pre-fill.
 */
export function initialHeadlineRate<T extends HeadlineRate>(rates: readonly T[] | null | undefined): T | null {
  if (!rates || rates.length !== 1) return null;
  return rates[0];
}

/**
 * The price value to submit with an offer save.
 * A multi-rate package always submits nothing, so normal content editing stays possible and the
 * server guard is never triggered by the editor itself.
 */
export function headlinePriceToSubmit(rateCount: number, rawPrice: string): string | undefined {
  if (!isHeadlinePriceEditable(rateCount)) return undefined;
  const trimmed = rawPrice.trim();
  return trimmed === "" ? undefined : trimmed;
}
