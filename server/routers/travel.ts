/**
 * Travel Corner tRPC contract — public discovery remains read-only while offer status changes are reserved for signed-in administrators.
 */
import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { createEnquiry, getPublicCampaigns, getPublicOfferBySlug, getPublicSettings, getPublicUmrahProgramBySlug, listAdminOffers, listAdminUmrahPrograms, listPublicOffers, listPublicUmrahPrograms, replaceOfferRates, replaceUmrahRates, saveAdminOffer, saveAdminUmrahProgram, updateOfferMedia, updateOfferStatus, updateUmrahStatus } from "../db";
import { MAX_MEDIA_BYTES, offerImageKey, putMedia, type MediaContentType } from "../_core/mediaStorage";

const availabilityValues = ["available", "limited", "on_request", "sold_out", "expired", "hidden"] as const;

/**
 * Treat a blank string as an absent value for optional enquiry fields.
 *
 * A browser form submits "" for an untouched input, which is not the same as omitting the key:
 * `z.string().email()` and `z.string().min(…)` both reject "". Without this, a visitor who supplied
 * only a phone number had their enquiry rejected. Genuinely invalid values are still rejected.
 */
const blankAsMissing = <TSchema extends z.ZodType<string, string>>(schema: TSchema) =>
  z.union([z.literal(""), schema]).optional().transform((value) => (value === "" ? undefined : value));
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
    sourcePath: blankAsMissing(z.string().max(255)),
    preferredContact: z.enum(["whatsapp", "phone", "email"]).default("whatsapp"),
    name: blankAsMissing(z.string().trim().min(2).max(160)),
    phone: blankAsMissing(z.string().trim().min(6).max(40)),
    whatsapp: blankAsMissing(z.string().trim().min(6).max(40)),
    email: blankAsMissing(z.string().email().max(320)),
    travelDate: z.date().optional(),
    destination: blankAsMissing(z.string().trim().max(180)),
    travellers: blankAsMissing(z.string().trim().max(120)),
    preferences: blankAsMissing(z.string().trim().max(2000)),
    budget: blankAsMissing(z.string().trim().max(120)),
    language: z.enum(["ar", "en"]).optional(),
    travellerNotes: blankAsMissing(z.string().trim().max(3000)),
  }).refine((data) => Boolean(data.phone || data.email || data.whatsapp), { message: "Provide a phone number, WhatsApp number, or email address." })).mutation(({ input }) => createEnquiry(input)),
  admin: router({
    offers: adminProcedure.query(() => listAdminOffers()),
    saveOffer: adminProcedure.input(adminOfferSchema).mutation(({ input }) => saveAdminOffer(input)),
    replaceOfferRates: adminProcedure.input(z.object({ offerId: z.number().int().positive(), rates: z.array(adminRateSchema).min(1).max(12) })).mutation(({ input }) => replaceOfferRates(input.offerId, input.rates)),
    replaceUmrahRates: adminProcedure.input(z.object({ programId: z.number().int().positive(), rates: z.array(adminUmrahRateSchema).min(1).max(8) })).mutation(({ input }) => replaceUmrahRates(input.programId, input.rates)),
    updateOfferStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean().optional(), availability: z.enum(availabilityValues).optional() }).refine((data) => data.isActive !== undefined || data.availability !== undefined, { message: "Choose at least one field to update." })).mutation(({ input }) => updateOfferStatus(input.id, { isActive: input.isActive, availability: input.availability })),
    updateOfferMedia: adminProcedure.input(z.object({ id: z.number().int().positive(), primaryImageUrl: z.string().max(1000).nullable().optional(), imageGallery: z.array(imageAssetSchema).max(12).optional(), imageAltEn: z.string().max(240).nullable().optional(), imageAltAr: z.string().max(240).nullable().optional() })).mutation(({ input }) => updateOfferMedia(input.id, { primaryImageUrl: input.primaryImageUrl, imageGallery: input.imageGallery, imageAltEn: input.imageAltEn, imageAltAr: input.imageAltAr })),
    /**
     * Administrator image upload. adminProcedure is the authorization gate, so an anonymous or
     * non-admin caller never reaches the storage layer.
     *
     * `filename` stays in the contract because the dashboard sends it, but it is deliberately not
     * used to build the storage key: the key comes from offerImageKey, which fixes the prefix
     * server-side. putMedia then re-checks the size, the type and the bytes themselves.
     */
    uploadOfferImage: adminProcedure.input(z.object({ offerId: z.number().int().positive(), filename: z.string().min(1).max(160), contentType: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().min(32).max(7_000_000) })).mutation(async ({ input }) => {
      const rawBase64 = input.base64.replace(/^data:image\/(jpeg|png|webp);base64,/, "");
      const bytes = Buffer.from(rawBase64, "base64");
      if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error(`Image must be a non-empty file up to ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))} MB.`);
      const contentType = input.contentType as MediaContentType;
      const stored = await putMedia({ key: offerImageKey(input.offerId, contentType), bytes, contentType });
      return { url: stored.url };
    }),
    umrahPrograms: adminProcedure.query(() => listAdminUmrahPrograms()),
    saveUmrahProgram: adminProcedure.input(adminUmrahSchema).mutation(({ input }) => saveAdminUmrahProgram(input)),
    updateUmrahStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), isActive: z.boolean().optional(), availability: z.enum(availabilityValues).optional() }).refine((data) => data.isActive !== undefined || data.availability !== undefined, { message: "Choose at least one field to update." })).mutation(({ input }) => updateUmrahStatus(input.id, { isActive: input.isActive, availability: input.availability })),
  }),
});
