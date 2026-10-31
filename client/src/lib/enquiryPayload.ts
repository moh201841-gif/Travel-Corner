/**
 * Travel Corner enquiry payload construction.
 *
 * Both public enquiry forms previously passed raw React state straight into the mutation. React
 * initialises text inputs to "", and an empty string is not an absent value: `z.string().email()`
 * and `z.string().min(…)` both reject it. The result was that a visitor who supplied a phone number
 * and a message — the expected path — had their enquiry rejected and silently lost.
 *
 * These builders are the single place where a blank field becomes an omitted field.
 */

export type EnquiryKind = "hotel_offer" | "umrah" | "custom_trip" | "callback";
export type PreferredContact = "whatsapp" | "phone" | "email";

export type EnquiryPayload = {
  kind: EnquiryKind;
  preferredContact: PreferredContact;
  offerId?: number;
  umrahProgramId?: number;
  sourcePath?: string;
  name?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  travelDate?: Date;
  destination?: string;
  language?: "ar" | "en";
  travellerNotes?: string;
};

/** Trim a user-entered value and treat a blank result as "not provided". */
export function optionalText(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Whether the enquiry carries at least one channel the team can actually reply on.
 * Mirrors the server-side rule (phone OR email OR WhatsApp) so the form can fail fast with a useful
 * message instead of surfacing a generic server rejection.
 */
export function hasUsableContact(payload: Pick<EnquiryPayload, "phone" | "email" | "whatsapp">): boolean {
  return Boolean(payload.phone || payload.email || payload.whatsapp);
}

function preferredContactFrom(
  whatsapp: string | undefined,
  phone: string | undefined,
  email: string | undefined,
): PreferredContact {
  if (whatsapp) return "whatsapp";
  if (phone) return "phone";
  if (email) return "email";
  return "whatsapp";
}

/** Payload for the general contact / callback form. */
export function buildContactEnquiryPayload(input: {
  lang: "ar" | "en";
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  message: string;
}): EnquiryPayload {
  const phone = optionalText(input.phone);
  const whatsapp = optionalText(input.whatsapp);
  const email = optionalText(input.email);

  return {
    kind: "callback",
    sourcePath: `/${input.lang}/contact`,
    preferredContact: preferredContactFrom(whatsapp, phone, email),
    name: optionalText(input.name),
    phone,
    whatsapp,
    email,
    language: input.lang,
    travellerNotes: optionalText(input.message),
  };
}

/** Payload for the offer-detail and Umrah-detail enquiry panels. */
export function buildOfferEnquiryPayload(input: {
  kind: Extract<EnquiryKind, "hotel_offer" | "umrah">;
  lang: "ar" | "en";
  name: string;
  phone: string;
  whatsapp: string;
  offerId?: number;
  umrahProgramId?: number;
  sourcePath?: string;
  destination?: string;
  travelDate?: Date | string | null;
  label: string;
}): EnquiryPayload {
  const phone = optionalText(input.phone);
  const whatsapp = optionalText(input.whatsapp);
  const travelDate = input.travelDate ? new Date(input.travelDate) : undefined;

  return {
    kind: input.kind,
    offerId: input.offerId,
    umrahProgramId: input.umrahProgramId,
    sourcePath: optionalText(input.sourcePath),
    preferredContact: preferredContactFrom(whatsapp, phone, undefined),
    name: optionalText(input.name),
    phone,
    whatsapp,
    destination: optionalText(input.destination),
    travelDate: travelDate && !Number.isNaN(travelDate.getTime()) ? travelDate : undefined,
    language: input.lang,
    travellerNotes: optionalText(`Interest: ${input.label}`),
  };
}
