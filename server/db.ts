import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { campaigns, enquiries, InsertUser, offerRatePeriods, siteSettings, travelOffers, umrahPrograms, umrahRateRows, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/** Archive passed public inventory at read time so expired travel never remains customer-visible between admin updates. */
async function applyPublicLifecycleRules(now = new Date()) {
  const db = await getDb();
  if (!db) return;

  await db.update(umrahPrograms).set({ availability: "expired", isActive: false }).where(and(
    lt(umrahPrograms.departureAt, now),
    ne(umrahPrograms.availability, "expired"),
    ne(umrahPrograms.availability, "hidden"),
  ));

  await db.update(travelOffers).set({ availability: "expired", isActive: false }).where(and(
    lt(travelOffers.validUntil, now),
    ne(travelOffers.availability, "expired"),
    ne(travelOffers.availability, "hidden"),
    ne(travelOffers.availability, "sold_out"),
  ));
}

function currentOfferVisibility(now: Date) {
  return and(
    eq(travelOffers.isActive, true),
    ne(travelOffers.availability, "hidden"),
    ne(travelOffers.availability, "expired"),
    or(isNull(travelOffers.validUntil), gte(travelOffers.validUntil, now)),
  );
}

function currentRateVisibility(now: Date) {
  return and(
    or(isNull(offerRatePeriods.validFrom), lte(offerRatePeriods.validFrom, now)),
    or(isNull(offerRatePeriods.validUntil), gte(offerRatePeriods.validUntil, now)),
  );
}

/** Public offer listings always exclude hidden records; a selected destination and simple attributes are applied after safe typed retrieval. */
export async function listPublicOffers(filters: { destination?: string; tag?: string; adultsOnly?: boolean; mealPlan?: string } = {}) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const rows = await db.select().from(travelOffers).where(currentOfferVisibility(now)).orderBy(asc(travelOffers.destinationEn), asc(travelOffers.hotelNameEn));
  const selected = rows.filter((offer) => {
    const tags = Array.isArray(offer.hotelTags) ? offer.hotelTags.map(String) : [];
    if (filters.destination && offer.destinationEn.toLowerCase() !== filters.destination.toLowerCase() && offer.destinationAr !== filters.destination) return false;
    if (filters.tag && !tags.includes(filters.tag)) return false;
    if (filters.adultsOnly && !offer.adultsOnly) return false;
    if (filters.mealPlan && offer.mealPlanEn.toLowerCase() !== filters.mealPlan.toLowerCase() && offer.mealPlanAr !== filters.mealPlan) return false;
    return true;
  });
  if (selected.length === 0) return [];
  const rates = await db.select().from(offerRatePeriods).where(and(inArray(offerRatePeriods.offerId, selected.map((item) => item.id)), currentRateVisibility(now))).orderBy(asc(offerRatePeriods.price));
  return selected.map((offer) => ({ ...offer, rates: rates.filter((rate) => rate.offerId === offer.id) })).filter((offer) => offer.rates.length > 0);
}

/** Retrieve a detailed hotel offer and all time-windowed price rows by its stable public slug. */
export async function getPublicOfferBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const rows = await db.select().from(travelOffers).where(and(eq(travelOffers.slug, slug), currentOfferVisibility(now))).limit(1);
  const offer = rows[0];
  if (!offer) return undefined;
  const rates = await db.select().from(offerRatePeriods).where(and(eq(offerRatePeriods.offerId, offer.id), currentRateVisibility(now))).orderBy(asc(offerRatePeriods.validFrom), asc(offerRatePeriods.price));
  return { ...offer, rates };
}

/** The public Umrah listing is separate from leisure travel to retain its distinct product structure. */
export async function listPublicUmrahPrograms() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const programs = await db.select().from(umrahPrograms).where(and(eq(umrahPrograms.isActive, true), ne(umrahPrograms.availability, "hidden"), ne(umrahPrograms.availability, "expired"), or(isNull(umrahPrograms.departureAt), gte(umrahPrograms.departureAt, now)))).orderBy(asc(umrahPrograms.departureAt));
  if (programs.length === 0) return [];
  const rates = await db.select().from(umrahRateRows).where(inArray(umrahRateRows.programId, programs.map((item) => item.id))).orderBy(asc(umrahRateRows.price));
  return programs.map((program) => ({ ...program, rates: rates.filter((rate) => rate.programId === program.id) }));
}

export async function getPublicUmrahProgramBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const programs = await db.select().from(umrahPrograms).where(and(eq(umrahPrograms.slug, slug), eq(umrahPrograms.isActive, true), ne(umrahPrograms.availability, "hidden"), ne(umrahPrograms.availability, "expired"), or(isNull(umrahPrograms.departureAt), gte(umrahPrograms.departureAt, now)))).limit(1);
  const program = programs[0];
  if (!program) return undefined;
  const rates = await db.select().from(umrahRateRows).where(eq(umrahRateRows.programId, program.id)).orderBy(asc(umrahRateRows.price));
  return { ...program, rates };
}

export async function getPublicCampaigns() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(campaigns).where(eq(campaigns.isActive, true)).orderBy(asc(campaigns.startsAt));
}

export async function getPublicSettings() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(siteSettings).limit(1);
  return rows[0];
}

export type NewEnquiry = typeof enquiries.$inferInsert;

/** Captures a lead for the sales team without creating an unsupported booking or payment commitment. */
export async function createEnquiry(data: NewEnquiry) {
  const db = await getDb();
  if (!db) throw new Error("The enquiry service is unavailable.");
  const result = await db.insert(enquiries).values(data);
  return { id: result[0].insertId };
}

/** Minimal administrator list intended for the first content-management workspace. */
export async function listAdminOffers() {
  const db = await getDb();
  if (!db) return [];
  const offers = await db.select().from(travelOffers).orderBy(asc(travelOffers.destinationEn), asc(travelOffers.hotelNameEn));
  if (!offers.length) return [];
  const rates = await db.select().from(offerRatePeriods).where(inArray(offerRatePeriods.offerId, offers.map((offer) => offer.id))).orderBy(asc(offerRatePeriods.price));
  return offers.map((offer) => ({ ...offer, rates: rates.filter((rate) => rate.offerId === offer.id) }));
}

export type AdminOfferInput = { id?: number; slug: string; destinationEn: string; destinationAr: string; hotelNameEn: string; hotelNameAr: string; areaEn?: string; areaAr?: string; days: number; nights: number; mealPlanEn: string; mealPlanAr: string; transportationIncluded: boolean; availability: "available" | "limited" | "on_request" | "sold_out" | "expired" | "hidden"; isActive: boolean; validUntil?: Date; price?: string; priceLabelEn?: string; priceLabelAr?: string };

/** Create or update a hotel package and retain one editable headline rate for no-code staff operations. */
export async function saveAdminOffer(input: AdminOfferInput) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");
  const patch = { slug: input.slug, destinationEn: input.destinationEn, destinationAr: input.destinationAr, hotelNameEn: input.hotelNameEn, hotelNameAr: input.hotelNameAr, areaEn: input.areaEn || null, areaAr: input.areaAr || null, days: input.days, nights: input.nights, mealPlanEn: input.mealPlanEn, mealPlanAr: input.mealPlanAr, transportationIncluded: input.transportationIncluded, availability: input.availability, isActive: input.isActive, validUntil: input.validUntil ?? null, lastPriceUpdatedAt: new Date() };
  const insertedOffer = input.id ? null : await db.insert(travelOffers).values(patch);
  const id = input.id ?? Number((insertedOffer as unknown as Array<{ insertId: number }>)[0]?.insertId);
  if (input.id) await db.update(travelOffers).set(patch).where(eq(travelOffers.id, input.id));
  if (input.price) {
    const existing = await db.select().from(offerRatePeriods).where(eq(offerRatePeriods.offerId, id)).limit(1);
    const ratePatch = { price: input.price, labelEn: input.priceLabelEn || null, labelAr: input.priceLabelAr || null, validUntil: input.validUntil ?? null, lastUpdatedAt: new Date() };
    if (existing[0]) await db.update(offerRatePeriods).set(ratePatch).where(eq(offerRatePeriods.id, existing[0].id));
    else await db.insert(offerRatePeriods).values({ offerId: id, occupancy: "per_person", currency: "EGP", ...ratePatch });
  }
  return { id };
}

export async function updateOfferStatus(id: number, patch: Pick<typeof travelOffers.$inferInsert, "isActive" | "availability">) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");
  await db.update(travelOffers).set(patch).where(eq(travelOffers.id, id));
  return { success: true };
}

/** Persist a staff-curated hotel cover image, gallery order, and localized accessibility text. */
export async function updateOfferMedia(id: number, patch: Pick<typeof travelOffers.$inferInsert, "primaryImageUrl" | "imageGallery" | "imageAltEn" | "imageAltAr">) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");
  await db.update(travelOffers).set(patch).where(eq(travelOffers.id, id));
  return { success: true };
}

export type AdminRateInput = { labelEn?: string; labelAr?: string; occupancy: string; price: string; childPrice?: string; infantPrice?: string; validFrom?: Date; validUntil?: Date; notesEn?: string; notesAr?: string };

/** Replace staff-entered hotel rate periods atomically so an offer never exposes a partially edited public price table. */
export async function replaceOfferRates(offerId: number, rates: AdminRateInput[]) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");
  await db.delete(offerRatePeriods).where(eq(offerRatePeriods.offerId, offerId));
  if (rates.length) await db.insert(offerRatePeriods).values(rates.map((rate) => ({ offerId, labelEn: rate.labelEn || null, labelAr: rate.labelAr || null, occupancy: rate.occupancy, price: rate.price, currency: "EGP", childPrice: rate.childPrice || null, infantPrice: rate.infantPrice || null, validFrom: rate.validFrom ?? null, validUntil: rate.validUntil ?? null, notesEn: rate.notesEn || null, notesAr: rate.notesAr || null, lastUpdatedAt: new Date() })));
  await db.update(travelOffers).set({ lastPriceUpdatedAt: new Date() }).where(eq(travelOffers.id, offerId));
  return { success: true };
}

export async function listAdminUmrahPrograms() {
  const db = await getDb();
  if (!db) return [];
  const programs = await db.select().from(umrahPrograms).orderBy(asc(umrahPrograms.departureAt));
  if (!programs.length) return [];
  const rates = await db.select().from(umrahRateRows).where(inArray(umrahRateRows.programId, programs.map((program) => program.id))).orderBy(asc(umrahRateRows.price));
  return programs.map((program) => ({ ...program, rates: rates.filter((rate) => rate.programId === program.id) }));
}

export type AdminUmrahInput = { id?: number; slug: string; titleEn: string; titleAr: string; departureAt?: Date; returnAt?: Date; durationDays?: number; airline?: string; makkahHotelEn?: string; makkahHotelAr?: string; madinahHotelEn?: string; madinahHotelAr?: string; availability: "available" | "limited" | "on_request" | "sold_out" | "expired" | "hidden"; isActive: boolean; price?: string; roomType?: string };

/** Create or update a structured Umrah program plus its headline occupancy rate. */
export async function saveAdminUmrahProgram(input: AdminUmrahInput) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");
  const patch = { slug: input.slug, titleEn: input.titleEn, titleAr: input.titleAr, departureAt: input.departureAt ?? null, returnAt: input.returnAt ?? null, durationDays: input.durationDays ?? null, airline: input.airline || null, makkahHotelEn: input.makkahHotelEn || null, makkahHotelAr: input.makkahHotelAr || null, madinahHotelEn: input.madinahHotelEn || null, madinahHotelAr: input.madinahHotelAr || null, availability: input.availability, isActive: input.isActive, lastUpdatedAt: new Date() };
  const insertedProgram = input.id ? null : await db.insert(umrahPrograms).values(patch);
  const id = input.id ?? Number((insertedProgram as unknown as Array<{ insertId: number }>)[0]?.insertId);
  if (input.id) await db.update(umrahPrograms).set(patch).where(eq(umrahPrograms.id, input.id));
  if (input.price) {
    const existing = await db.select().from(umrahRateRows).where(eq(umrahRateRows.programId, id)).limit(1);
    const ratePatch = { roomType: input.roomType || "Quad", price: input.price, currency: "EGP" };
    if (existing[0]) await db.update(umrahRateRows).set(ratePatch).where(eq(umrahRateRows.id, existing[0].id));
    else await db.insert(umrahRateRows).values({ programId: id, ...ratePatch });
  }
  return { id };
}

export async function updateUmrahStatus(id: number, patch: Pick<typeof umrahPrograms.$inferInsert, "isActive" | "availability">) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");
  await db.update(umrahPrograms).set(patch).where(eq(umrahPrograms.id, id));
  return { success: true };
}

export type AdminUmrahRateInput = { roomType: string; price: string; notesEn?: string; notesAr?: string };

/** Replace staff-managed Umrah occupancy rates atomically so every program keeps a complete, ordered price list. */
export async function replaceUmrahRates(programId: number, rates: AdminUmrahRateInput[]) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");
  await db.delete(umrahRateRows).where(eq(umrahRateRows.programId, programId));
  if (rates.length) await db.insert(umrahRateRows).values(rates.map((rate) => ({ programId, roomType: rate.roomType, price: rate.price, currency: "EGP", notesEn: rate.notesEn || null, notesAr: rate.notesAr || null })));
  await db.update(umrahPrograms).set({ lastUpdatedAt: new Date() }).where(eq(umrahPrograms.id, programId));
  return { success: true };
}
