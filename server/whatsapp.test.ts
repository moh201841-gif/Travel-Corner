/** Centralized WhatsApp deep-link contract for the public Travel Corner conversion paths. */
import { describe, expect, it } from "vitest";
import { buildWhatsAppUrl } from "../client/src/lib/whatsapp";

describe("Travel Corner WhatsApp deep link", () => {
  it("normalizes the configured Egyptian number and encodes contextual offer copy", () => {
    expect(buildWhatsAppUrl("01036666387", "Hello Travel Corner, I need availability."))
      .toBe("https://wa.me/201036666387?text=Hello%20Travel%20Corner%2C%20I%20need%20availability.");
  });

  it("does not create a public action when the central number is unavailable", () => {
    expect(buildWhatsAppUrl(undefined, "Hello")).toBeNull();
  });
});
