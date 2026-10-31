/**
 * Enquiry payload construction.
 *
 * Guards the exact defect found in the Phase 0 audit: the forms passed raw React state, so an
 * untouched input arrived as "" and was rejected by the server as an invalid value rather than
 * treated as an absent optional field. Visitors who supplied only a phone number were silently lost.
 */
import { describe, expect, it } from "vitest";
import { buildContactEnquiryPayload, buildOfferEnquiryPayload, hasUsableContact, optionalText } from "./enquiryPayload";

describe("optionalText", () => {
  it("treats blank and whitespace-only values as absent", () => {
    expect(optionalText("")).toBeUndefined();
    expect(optionalText("   ")).toBeUndefined();
    expect(optionalText(null)).toBeUndefined();
    expect(optionalText(undefined)).toBeUndefined();
  });

  it("trims and keeps real values", () => {
    expect(optionalText("  Mohamed  ")).toBe("Mohamed");
  });
});

describe("hasUsableContact", () => {
  it("accepts any single channel the team can reply on", () => {
    expect(hasUsableContact({ phone: "01000000000" })).toBe(true);
    expect(hasUsableContact({ email: "guest@example.com" })).toBe(true);
    expect(hasUsableContact({ whatsapp: "01036666387" })).toBe(true);
  });

  it("rejects an enquiry with no channel at all", () => {
    expect(hasUsableContact({})).toBe(false);
    expect(hasUsableContact({ phone: undefined, email: undefined, whatsapp: undefined })).toBe(false);
  });
});

describe("buildContactEnquiryPayload", () => {
  const base = { lang: "en" as const, name: "", phone: "", whatsapp: "", email: "", message: "Hello" };

  it("omits blank name and email when only a phone number is supplied", () => {
    const payload = buildContactEnquiryPayload({ ...base, phone: "01000000000" });

    expect(payload.name).toBeUndefined();
    expect(payload.email).toBeUndefined();
    expect(payload.phone).toBe("01000000000");
    expect("email" in payload && payload.email === "").toBe(false);
    expect(hasUsableContact(payload)).toBe(true);
  });

  it("keeps every value the visitor actually entered", () => {
    const payload = buildContactEnquiryPayload({
      lang: "ar",
      name: "محمد",
      phone: "01145555785",
      whatsapp: "01036666387",
      email: "guest@example.com",
      message: "استفسار",
    });

    expect(payload).toMatchObject({
      kind: "callback",
      sourcePath: "/ar/contact",
      language: "ar",
      name: "محمد",
      phone: "01145555785",
      whatsapp: "01036666387",
      email: "guest@example.com",
      travellerNotes: "استفسار",
    });
  });

  it("prefers WhatsApp, then phone, then email as the contact channel", () => {
    expect(buildContactEnquiryPayload({ ...base, whatsapp: "01036666387", phone: "01000000000" }).preferredContact).toBe("whatsapp");
    expect(buildContactEnquiryPayload({ ...base, phone: "01000000000" }).preferredContact).toBe("phone");
    expect(buildContactEnquiryPayload({ ...base, email: "guest@example.com" }).preferredContact).toBe("email");
  });

  it("reports no usable contact when the visitor left every channel blank", () => {
    expect(hasUsableContact(buildContactEnquiryPayload(base))).toBe(false);
  });
});

describe("buildOfferEnquiryPayload", () => {
  const base = {
    kind: "hotel_offer" as const,
    lang: "en" as const,
    name: "",
    phone: "",
    whatsapp: "",
    label: "Sharks Bay Oasis",
  };

  it("omits a blank phone number so a WhatsApp-only enquiry is valid", () => {
    const payload = buildOfferEnquiryPayload({ ...base, whatsapp: "01036666387", offerId: 7 });

    expect(payload.phone).toBeUndefined();
    expect(payload.whatsapp).toBe("01036666387");
    expect(payload.preferredContact).toBe("whatsapp");
    expect(payload.offerId).toBe(7);
    expect(hasUsableContact(payload)).toBe(true);
  });

  it("carries the offer context into the enquiry notes", () => {
    const payload = buildOfferEnquiryPayload({ ...base, phone: "01000000000", destination: "Sharm El Sheikh" });

    expect(payload.travellerNotes).toBe("Interest: Sharks Bay Oasis");
    expect(payload.destination).toBe("Sharm El Sheikh");
  });

  it("omits a blank destination rather than sending an empty string", () => {
    const payload = buildOfferEnquiryPayload({ ...base, phone: "01000000000", destination: "   " });
    expect(payload.destination).toBeUndefined();
  });

  it("converts a supplied travel date and drops an unusable one", () => {
    const withDate = buildOfferEnquiryPayload({ ...base, kind: "umrah", phone: "01000000000", umrahProgramId: 3, travelDate: "2026-08-05T00:00:00.000Z" });
    expect(withDate.travelDate).toBeInstanceOf(Date);
    expect(withDate.umrahProgramId).toBe(3);

    const withoutDate = buildOfferEnquiryPayload({ ...base, phone: "01000000000", travelDate: null });
    expect(withoutDate.travelDate).toBeUndefined();

    const withBadDate = buildOfferEnquiryPayload({ ...base, phone: "01000000000", travelDate: "not-a-date" });
    expect(withBadDate.travelDate).toBeUndefined();
  });

  it("reports no usable contact when both channels are blank", () => {
    expect(hasUsableContact(buildOfferEnquiryPayload(base))).toBe(false);
  });
});
