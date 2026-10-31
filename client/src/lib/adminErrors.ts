/**
 * Operator-facing error messages for the Travel Corner control room.
 *
 * Two kinds of failure reach a toast here, and both used to collapse into the same sentence:
 *
 *   1. Input validation. The server rejects the input before any database work, and the tRPC error
 *      formatter attaches the field paths and zod's messages (see server/_core/trpc.ts). Those are
 *      derived from the schema, so naming them tells the operator which field to fix and discloses
 *      nothing. A price typed as "6,500" now says so instead of "the package could not be saved".
 *   2. A thrown server error. tRPC forwards `Error.message` verbatim, so echoing it would show raw
 *      database text — a duplicate-key failure would print the table and index names. Only messages
 *      the application itself defines are shown; everything else falls back to a generic sentence.
 *      server/dbErrors.ts is what turns the common driver failures into those defined messages.
 */
import { OPERATOR_SAFE_ERR_MSGS } from "@shared/const";

/** Business refusals and translated database failures that are safe to show exactly as phrased. */
const KNOWN_OPERATOR_MESSAGES: ReadonlySet<string> = new Set(OPERATOR_SAFE_ERR_MSGS);

/**
 * Field names as the forms label them, so a validation message names what the operator sees rather
 * than the wire format. A field missing from here falls back to its own key, which is still more
 * useful than no field at all.
 */
const FIELD_LABELS: Record<string, string> = {
  slug: "Slug",
  destinationEn: "Destination (English)",
  destinationAr: "Destination (Arabic)",
  hotelNameEn: "Hotel (English)",
  hotelNameAr: "Hotel (Arabic)",
  areaEn: "Area (English)",
  areaAr: "Area (Arabic)",
  days: "Days",
  nights: "Nights",
  mealPlanEn: "Board (English)",
  mealPlanAr: "Board (Arabic)",
  price: "Price (EGP)",
  priceLabelEn: "Price label (English)",
  priceLabelAr: "Price label (Arabic)",
  validUntil: "Offer expires on",
  availability: "Availability",
  titleEn: "Program (English)",
  titleAr: "Program (Arabic)",
  departureAt: "Departure",
  returnAt: "Return",
  durationDays: "Duration (days)",
  airline: "Airline",
  makkahHotelEn: "Makkah hotel (English)",
  makkahHotelAr: "Makkah hotel (Arabic)",
  madinahHotelEn: "Madinah hotel (English)",
  madinahHotelAr: "Madinah hotel (Arabic)",
  roomType: "Room type",
  occupancy: "Occupancy",
  rates: "Price periods",
  imageGallery: "Hotel gallery",
  primaryImageUrl: "Cover image",
  imageAltEn: "English alt text",
  imageAltAr: "Arabic alt text",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

type ZodErrorShape = {
  formErrors?: unknown;
  fieldErrors?: unknown;
};

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** The `zodError` the server's error formatter attaches to a BAD_REQUEST, when there is one. */
function zodErrorOf(error: unknown): ZodErrorShape | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null;
  const data = (error as { data: unknown }).data;
  if (typeof data !== "object" || data === null || !("zodError" in data)) return null;
  const zodError = (data as { zodError: unknown }).zodError;
  if (typeof zodError !== "object" || zodError === null) return null;
  return zodError as ZodErrorShape;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/**
 * One sentence naming the fields the server rejected, or null when this was not a validation
 * failure. At most three fields are named so a toast stays readable; the count tells the operator
 * there are more.
 */
export function validationMessage(error: unknown): string | null {
  const zodError = zodErrorOf(error);
  if (!zodError) return null;

  const problems: string[] = [];
  const fieldErrors = zodError.fieldErrors;
  if (typeof fieldErrors === "object" && fieldErrors !== null) {
    for (const [field, messages] of Object.entries(fieldErrors as Record<string, unknown>)) {
      const first = stringList(messages)[0];
      if (first) problems.push(`${fieldLabel(field)}: ${first}`);
    }
  }
  // A whole-object refusal (zod's `.refine`) carries no field, so it is reported on its own.
  problems.push(...stringList(zodError.formErrors));

  if (problems.length === 0) return null;

  const shown = problems.slice(0, 3).join("; ");
  const hidden = problems.length - Math.min(problems.length, 3);
  return hidden > 0
    ? `Check these fields — ${shown}; and ${hidden} more`
    : `Check these fields — ${shown}`;
}

/**
 * The message to show for a failed admin action.
 *
 * Validation detail first (it names the field to fix), then a known server refusal verbatim, then
 * the caller's generic fallback. Unknown server text is never shown.
 */
export function operatorErrorMessage(error: unknown, fallback: string): string {
  const validation = validationMessage(error);
  if (validation) return validation;

  const message = messageOf(error);
  return KNOWN_OPERATOR_MESSAGES.has(message) ? message : fallback;
}
