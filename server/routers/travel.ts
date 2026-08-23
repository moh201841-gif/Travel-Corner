/**
 * Travel Corner tRPC contract — public discovery remains read-only while offer status changes are reserved for signed-in administrators.
 */
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { createEnquiry, getPublicCampaigns, getPublicOfferBySlug, getPublicSettings, getPublicUmrahProgramBySlug, listAdminOffers, listAdminUmrahPrograms, listPublicOffers, listPublicUmrahPrograms, replaceOfferRates, replaceUmrahRates, saveAdminOffer, saveAdminUmrahProgram, updateOfferMedia, updateOfferStatus, updateUmrahStatus } from "../db";
import { storagePut } from "../storage";

const availabilityValues = ["available", "limited", "on_request", "sold_out", "expired", "hidden"] as const;
const imageAssetSchema = z.object({ url: z.string().min(1).max(1000), altEn: z.string().max(240).optional(), altAr: z.string().max(240).optional() });
const adminOfferSchema = z.object({ id: z.number().int().positive().optional(), slug: z.string().trim().min(3).max(160), destinationEn: z.string().trim().min(2).max(120), destinationAr: z.string().trim().min(2).max(120), hotelNameEn: z.string().trim().min(2).max(180), hotelNameAr: z.string().trim().min(2).max(180), areaEn: z.string().trim().max(180).optional(), areaAr: z.string().trim().max(180).optional(), days: z.number().int().min(1).max(30), nights: z.number().int().min(0).max(29), mealPlanEn: z.string().trim().min(2).max(120), mealPlanAr: z.string().trim().min(2).max(120), transportationIncluded: z.boolean(), availability: z.enum(availabilityValues), isActive: z.boolean(), validUntil: z.date().optional(), price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), priceLabelEn: z.string().trim().max(140).optional(), priceLabelAr: z.string().trim().max(140).optional() });
const adminUmrahSchema = z.object({ id: z.number().int().positive().optional(), slug: z.string().trim().min(3).max(160), titleEn: z.string().trim().min(2).max(180), titleAr: z.string().trim().min(2).max(180), departureAt: z.date().optional(), returnAt: z.date().optional(), durationDays: z.number().int().min(1).max(30).optional(), airline: z.string().trim().max(160).optional(), makkahHotelEn: z.string().trim().max(180).optional(), makkahHotelAr: z.string().trim().max(180).optional(), madinahHotelEn: z.string().trim().max(180).optional(), madinahHotelAr: z.string().trim().max(180).optional(), availability: z.enum(availabilityValues), isActive: z.boolean(), price: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), roomType: z.string().trim().max(60).optional() });
const adminRateSchema = z.object({ labelEn: z.string().trim().max(140).optional(), labelAr: z.string().trim().max(140).optional(), occupancy: z.string().trim().min(2).max(80), price: z.string().regex(/^\d+(\.\d{1,2})?$/), childPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), infantPrice: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(), validFrom: z.date().optional(), validUntil: z.date().optional(), notesEn: z.string().trim().max(2000).optional(), notesAr: z.string().trim().max(2000).optional() });
const adminUmrahRateSchema = z.object({ roomType: z.string().trim().min(2).max(60), price: z.string().regex(/^\d+(\.\d{1,2})?$/), notesEn: z.string().trim().max(2000).optional(), notesAr: z.string().trim().max(2000).optional() });

export const travelRouter = router({
  campaigns: publicProcedure.query(() => getPublicCampaigns()),
  settings: publicProcedure.query(() => getPublicSettings()),
  offers: publicProcedure.input(z.object({ destination: z.string().optional(), tag: z.string().optional(), adultsOnly: z.boolean().optional(), mealPlan: z.string().optional() }).optional()).query(({ input }) => listPublicOffers(input)),
  offerBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(160) })).query(({ input }) => getPublicOfferBySlug(input.slug)),
  umrahPrograms: publicProcedure.query(() => listPublicUmrahPrograms()),
  umrahBySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(160) })).query(({ input }) => getPublicUmrahProgramBySlug(input.slug)),
  createEnquiry: publicProcedure.input(z.object({
    kind: z.enum(["hotel_offer", "umrah", "custom_trip", "callback"]),
    offerId: z.number().int().positive().optional(),
    umrahProgramId: z.number().int().positive().optional(),
    sourcePath: z.string().max(255).optional(),
    preferredContact: z.enum(["whatsapp", "phone", "email"]).default("whatsapp"),
    name: z.string().trim().min(2).max(160).optional(),
    phone: z.string().trim().min(6).max(40).optional(),
    whatsapp: z.string().trim().min(6).max(40).optional(),
    email: z.string().email().max(320).optional(),
    travelDate: z.date().optional(),
    destination: z.string().trim().max(180).optional(),
    travellers: z.string().trim().max(120).optional(),
    preferences: z.string().trim().max(2000).optional(),
    budget: z.string().trim().max(120).optional(),
    language: z.enum(["ar", "en"]).optional(),
    travellerNotes: z.string().trim().max(3000).optional(),
  }).refine((data) => Boolean(data.phone || data.email), { message: "Provide a phone number or email address." })).mutation(({ input }) => createEnquiry(input)),
  admin: router({
    offers: adminProcedure.query(() => listAdminOffers()),
    saveOffer: adminProcedure.input(adminOfferSchema).mutation(({ input }) => saveAdminOffer(input)),
    replaceOfferRates: adminProcedure.input(z.object({ offerId: z.number().int().positive(), rates: z.array(adminRateSchema).min(1).max(12) })).mutation(({ input }) => replaceOfferRates(input.offerId, input.rates)),
    replaceUmrahRates: adminProcedure.input(z.object({ programId: z.number().int().positive(), rates: z.array(adminUmrahRateSchema).min(1).max(8) })).mutation(({ input }) => replaceUmrahRates(input.programId, input.rates)),
    updateOfferStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean().optional(), availability: z.enum(availabilityValues).optional() }).refine((data) => data.isActive !== undefined || data.availability !== undefined, { message: "Choose at least one field to update." })).mutation(({ input }) => updateOfferStatus(input.id, { isActive: input.isActive, availability: input.availability })),
    updateOfferMedia: adminProcedure.input(z.object({ id: z.number().int().positive(), primaryImageUrl: z.string().max(1000).nullable().optional(), imageGallery: z.array(imageAssetSchema).max(12).optional(), imageAltEn: z.string().max(240).nullable().optional(), imageAltAr: z.string().max(240).nullable().optional() })).mutation(({ input }) => updateOfferMedia(input.id, { primaryImageUrl: input.primaryImageUrl, imageGallery: input.imageGallery, imageAltEn: input.imageAltEn, imageAltAr: input.imageAltAr })),
    uploadOfferImage: adminProcedure.input(z.object({ offerId: z.number().int().positive(), filename: z.string().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(32).max(7_000_000) })).mutation(async ({ input }) => {
      const rawBase64 = input.base64.replace(/^data:image\/(jpeg|png|webp);base64,/, "");
      const bytes = Buffer.from(rawBase64, "base64");
      if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("Image must be a non-empty file up to 5 MB.");
      const extension = input.contentType === "image/png" ? "png" : input.contentType === "image/webp" ? "webp" : "jpg";
      const stored = await storagePut(`travel-corner/offers/${input.offerId}/${Date.now()}.${extension}`, bytes, input.contentType);
      return { url: stored.url };
    }),
    umrahPrograms: adminProcedure.query(() => listAdminUmrahPrograms()),
    saveUmrahProgram: adminProcedure.input(adminUmrahSchema).mutation(({ input }) => saveAdminUmrahProgram(input)),
    updateUmrahStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean().optional(), availability: z.enum(availabilityValues).optional() }).refine((data) => data.isActive !== undefined || data.availability !== undefined, { message: "Choose at least one field to update." })).mutation(({ input }) => updateUmrahStatus(input.id, { isActive: input.isActive, availability: input.availability })),
  }),
});
