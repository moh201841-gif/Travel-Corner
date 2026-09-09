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
});
