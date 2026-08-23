/** Protected Travel Corner administration contract check: public callers must never manage offer inventory. */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function createNonAdminContext(): TrpcContext {
  return {
    user: { id: 2, openId: "regular-travel-user", name: "Regular user", email: "user@example.com", loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Travel Corner administration access", () => {
  it("rejects unauthenticated access to offer management", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.admin.offers()).rejects.toThrow();
  });

  it("rejects unauthenticated package and Umrah save operations", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.travel.admin.saveOffer({
      slug: "security-check-hotel",
      destinationEn: "Sharm El Sheikh",
      destinationAr: "شرم الشيخ",
      hotelNameEn: "Security Check Hotel",
      hotelNameAr: "فندق اختبار الحماية",
      days: 4,
      nights: 3,
      mealPlanEn: "All inclusive",
      mealPlanAr: "إقامة كاملة",
      transportationIncluded: true,
      availability: "on_request",
      isActive: false,
    })).rejects.toThrow();

    await expect(caller.travel.admin.saveUmrahProgram({
      slug: "security-check-umrah",
      titleEn: "Security Check Umrah",
      titleAr: "عمرة اختبار الحماية",
      availability: "on_request",
      isActive: false,
    })).rejects.toThrow();
  });

  it("rejects all management access for an authenticated non-admin user", async () => {
    const caller = appRouter.createCaller(createNonAdminContext());

    await Promise.all([
      expect(caller.travel.admin.offers()).rejects.toThrow(),
      expect(caller.travel.admin.umrahPrograms()).rejects.toThrow(),
      expect(caller.travel.admin.saveOffer({ slug: "non-admin-hotel", destinationEn: "Hurghada", destinationAr: "الغردقة", hotelNameEn: "Non-admin Hotel", hotelNameAr: "فندق غير إداري", days: 4, nights: 3, mealPlanEn: "All inclusive", mealPlanAr: "إقامة كاملة", transportationIncluded: true, availability: "on_request", isActive: false })).rejects.toThrow(),
      expect(caller.travel.admin.updateOfferStatus({ id: 1, availability: "hidden" })).rejects.toThrow(),
      expect(caller.travel.admin.updateOfferMedia({ id: 1, primaryImageUrl: null, imageGallery: [], imageAltEn: null, imageAltAr: null })).rejects.toThrow(),
      expect(caller.travel.admin.uploadOfferImage({ offerId: 1, filename: "blocked.jpg", contentType: "image/jpeg", base64: "a".repeat(32) })).rejects.toThrow(),
      expect(caller.travel.admin.replaceOfferRates({ offerId: 1, rates: [{ occupancy: "per_person", price: "6500" }] })).rejects.toThrow(),
      expect(caller.travel.admin.saveUmrahProgram({ slug: "non-admin-umrah", titleEn: "Non-admin Umrah", titleAr: "عمرة غير إدارية", availability: "on_request", isActive: false })).rejects.toThrow(),
      expect(caller.travel.admin.updateUmrahStatus({ id: 1, availability: "hidden" })).rejects.toThrow(),
      expect(caller.travel.admin.replaceUmrahRates({ programId: 1, rates: [{ roomType: "Quad", price: "37500" }] })).rejects.toThrow(),
    ]);
  });
});
