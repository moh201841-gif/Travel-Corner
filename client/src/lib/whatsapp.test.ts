/** WhatsApp deep-link contract checks for centralized Travel Corner contact settings. */
import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "./whatsapp";

describe("buildWhatsAppUrl", () => {
  it("normalizes an Egyptian local mobile number and encodes the contextual message", () => {
    expect(buildWhatsAppUrl("01036666387", "Hello Travel Corner, I need availability."))
      .toBe("https://wa.me/201036666387?text=Hello%20Travel%20Corner%2C%20I%20need%20availability.");
  });

  it("returns no action when the centralized number is absent", () => {
    expect(buildWhatsAppUrl(null, "Hello")).toBeNull();
  });
});
