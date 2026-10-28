/** Travel Corner enquiry procedure checks with an isolated persistence boundary; no customer data is written during tests. */
import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const createEnquiryMock = vi.hoisted(() => vi.fn());
const getPublicSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  createEnquiry: createEnquiryMock,
  getPublicCampaigns: vi.fn(),
  getPublicOfferBySlug: vi.fn(),
  getPublicSettings: getPublicSettingsMock,
  getPublicUmrahProgramBySlug: vi.fn(),
  listAdminOffers: vi.fn(),
  listPublicOffers: vi.fn(),
  listPublicUmrahPrograms: vi.fn(),
  updateOfferStatus: vi.fn(),
}));

const { appRouter } = await import("./routers");

function createPublicContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("Travel Corner enquiry contract", () => {
  it("returns a defined null settings value when no site settings record exists", async () => {
    getPublicSettingsMock.mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.settings()).resolves.toBeNull();
  });

  it("records a valid custom-trip enquiry through the persistence boundary", async () => {
    createEnquiryMock.mockResolvedValueOnce({ id: 42 });
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.createEnquiry({
      kind: "custom_trip",
      sourcePath: "/en/plan-your-trip",
      preferredContact: "whatsapp",
      name: "Test traveller",
      phone: "01000000000",
      travellerNotes: "Sharm El Sheikh · Family time",
    })).resolves.toEqual({ id: 42 });

    expect(createEnquiryMock).toHaveBeenCalledWith(expect.objectContaining({ kind: "custom_trip", phone: "01000000000" }));
  });

  it("rejects an enquiry that lacks a usable contact method and never reaches persistence", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const callsBefore = createEnquiryMock.mock.calls.length;

    await expect(caller.travel.createEnquiry({ kind: "callback", name: "Missing contact" })).rejects.toThrow();

    expect(createEnquiryMock).toHaveBeenCalledTimes(callsBefore);
  });

  it("accepts a contact enquiry whose optional fields arrive blank, and stores them as absent", async () => {
    // The exact shape the contact form produced before D1: untouched inputs submitted as "".
    createEnquiryMock.mockResolvedValueOnce({ id: 101 });
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.createEnquiry({
      kind: "callback",
      sourcePath: "/en/contact",
      preferredContact: "phone",
      name: "",
      phone: "01000000000",
      whatsapp: "",
      email: "",
      travellerNotes: "Please call me about Sharm El Sheikh.",
    })).resolves.toEqual({ id: 101 });

    const stored = createEnquiryMock.mock.calls.at(-1)?.[0];
    expect(stored.phone).toBe("01000000000");
    expect(stored.name).toBeUndefined();
    expect(stored.email).toBeUndefined();
    expect(stored.whatsapp).toBeUndefined();
  });

  it("accepts a WhatsApp-only enquiry from an offer page", async () => {
    createEnquiryMock.mockResolvedValueOnce({ id: 102 });
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.createEnquiry({
      kind: "hotel_offer",
      offerId: 4,
      preferredContact: "whatsapp",
      phone: "",
      whatsapp: "01036666387",
      travellerNotes: "Interest: Sharks Bay Oasis",
    })).resolves.toEqual({ id: 102 });

    const stored = createEnquiryMock.mock.calls.at(-1)?.[0];
    expect(stored.whatsapp).toBe("01036666387");
    expect(stored.phone).toBeUndefined();
  });

  it("still rejects a genuinely malformed email rather than silently dropping it", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const callsBefore = createEnquiryMock.mock.calls.length;

    await expect(caller.travel.createEnquiry({
      kind: "callback",
      email: "not-an-email",
      phone: "01000000000",
    })).rejects.toThrow();

    expect(createEnquiryMock).toHaveBeenCalledTimes(callsBefore);
  });

  it("rejects a submission where every contact channel is present but blank", async () => {
    // Reachable now that the contact form no longer marks name and email as browser-required.
    const caller = appRouter.createCaller(createPublicContext());
    const callsBefore = createEnquiryMock.mock.calls.length;

    await expect(caller.travel.createEnquiry({
      kind: "callback",
      sourcePath: "/en/contact",
      name: "",
      phone: "",
      whatsapp: "",
      email: "",
      travellerNotes: "Please get in touch.",
    })).rejects.toThrow();

    expect(createEnquiryMock).toHaveBeenCalledTimes(callsBefore);
  });
});
