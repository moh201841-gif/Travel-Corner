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

const hasDatabase = Boolean(process.env.DATABASE_URL);

/**
 * Degraded-mode contract only.
 *
 * These previously asserted lifecycle correctness with `.every()` over collections that were always
 * empty, so they passed whether or not the lifecycle rules worked. They now assert a concrete value
 * and make no lifecycle claim; lifecycle behaviour is covered deterministically in
 * server/lifecycle.test.ts, and its database-dependent half is declared in
 * server/lifecycle.integration.test.ts.
 */
describe.skipIf(hasDatabase)("Travel Corner public procedures without a configured database", () => {
  it("returns an empty offer list instead of throwing", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.offers()).resolves.toEqual([]);
  });

  it("returns an empty Umrah list instead of throwing", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.umrahPrograms()).resolves.toEqual([]);
  });
});

describe("Travel Corner enquiry validation", () => {
  it("rejects an enquiry with no usable contact method before attempting persistence", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.createEnquiry({
      kind: "custom_trip",
      name: "Travel Corner guest",
      preferredContact: "whatsapp",
    })).rejects.toThrow();
  });
});
