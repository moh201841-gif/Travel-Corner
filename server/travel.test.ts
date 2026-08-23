/** Travel Corner public API contract checks for safe content delivery and basic sales-lead validation. */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Travel Corner public travel procedures", () => {
  it("returns a safe array shape when browsing hotel offers", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const offers = await caller.travel.offers();

    expect(Array.isArray(offers)).toBe(true);
    expect(offers.every((offer) => !offer.validUntil || new Date(offer.validUntil).getTime() >= Date.now())).toBe(true);
  });

  it("does not return Umrah programs whose departure has passed", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const programs = await caller.travel.umrahPrograms();

    expect(programs.every((program) => !program.departureAt || new Date(program.departureAt).getTime() >= Date.now())).toBe(true);
  });

  it("rejects an enquiry with no usable contact method before attempting persistence", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.createEnquiry({
      kind: "custom_trip",
      name: "Travel Corner guest",
      preferredContact: "whatsapp",
    })).rejects.toThrow();
  });
});
