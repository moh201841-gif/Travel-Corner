import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { MULTI_RATE_HEADLINE_PRICE_ERR_MSG, MULTI_RATE_UMRAH_PRICE_ERR_MSG } from "@shared/const";
import { hasCurrentRatePeriod, isOfferPubliclyVisible, isRatePeriodCurrent, isUmrahProgramPubliclyVisible, shouldAutoExpireOffer, shouldAutoExpireUmrahProgram } from "@shared/lifecycle";
import { campaigns, enquiries, InsertUser, offerRatePeriods, siteSettings, travelOffers, umrahPrograms, umrahRateRows, users } from "../drizzle/schema";
import { databaseConnectionOptions } from "./databaseSsl";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Lazily create the drizzle instance so local tooling can run without a DB.
 *
 * The connection goes in as an object rather than a bare URL string: drizzle(string) builds its pool
 * as createPool({ uri }) with no way to supply TLS options, and a managed MySQL such as Aiven needs
 * its CA certificate passed as PEM content. databaseConnectionOptions returns exactly { uri } when
 * no CA is configured, so local development and the loopback integration harness are unchanged.
 *
 * A configuration fault — an unreadable or invalid CA, or an SSL query parameter mysql2 would ignore
 * — throws out of here rather than being swallowed, because the alternative is an unverified or
 * plaintext connection. The catch below stays for genuine pool-construction failures only.
 */
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    const connection = databaseConnectionOptions(process.env.DATABASE_URL);
    try {
      _db = drizzle({ connection });
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

  // The SQL below narrows the candidate set; the shared predicate makes the final call, so the
  // archive rule cannot drift from the visibility rule. Narrowing is safe in both directions:
  // public reads independently apply isOfferPubliclyVisible / isUmrahProgramPubliclyVisible, so a
  // record this rule declines to archive is still never shown to a customer.
  const umrahCandidates = await db.select({ id: umrahPrograms.id, isActive: umrahPrograms.isActive, availability: umrahPrograms.availability, departureAt: umrahPrograms.departureAt }).from(umrahPrograms).where(and(
    lt(umrahPrograms.departureAt, now),
    ne(umrahPrograms.availability, "expired"),
    ne(umrahPrograms.availability, "hidden"),
  ));
  const umrahToArchive = umrahCandidates.filter((program) => shouldAutoExpireUmrahProgram(program, now)).map((program) => program.id);
  if (umrahToArchive.length) await db.update(umrahPrograms).set({ availability: "expired", isActive: false }).where(inArray(umrahPrograms.id, umrahToArchive));

  const offerCandidates = await db.select({ id: travelOffers.id, isActive: travelOffers.isActive, availability: travelOffers.availability, validUntil: travelOffers.validUntil }).from(travelOffers).where(and(
    lt(travelOffers.validUntil, now),
    ne(travelOffers.availability, "expired"),
    ne(travelOffers.availability, "hidden"),
    ne(travelOffers.availability, "sold_out"),
  ));
  const offersToArchive = offerCandidates.filter((offer) => shouldAutoExpireOffer(offer, now)).map((offer) => offer.id);
  if (offersToArchive.length) await db.update(travelOffers).set({ availability: "expired", isActive: false }).where(inArray(travelOffers.id, offersToArchive));
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
    // Defence in depth: the SQL WHERE above is a pre-filter, the shared predicate is authoritative.
    if (!isOfferPubliclyVisible(offer, now)) return false;
    const tags = Array.isArray(offer.hotelTags) ? offer.hotelTags.map(String) : [];
    if (filters.destination && offer.destinationEn.toLowerCase() !== filters.destination.toLowerCase() && offer.destinationAr !== filters.destination) return false;
    if (filters.tag && !tags.includes(filters.tag)) return false;
    if (filters.adultsOnly && !offer.adultsOnly) return false;
    if (filters.mealPlan && offer.mealPlanEn.toLowerCase() !== filters.mealPlan.toLowerCase() && offer.mealPlanAr !== filters.mealPlan) return false;
    return true;
  });
  if (selected.length === 0) return [];
  const rates = await db.select().from(offerRatePeriods).where(and(inArray(offerRatePeriods.offerId, selected.map((item) => item.id)), currentRateVisibility(now))).orderBy(asc(offerRatePeriods.price));
  const currentRates = rates.filter((rate) => isRatePeriodCurrent(rate, now));
  return selected.map((offer) => ({ ...offer, rates: currentRates.filter((rate) => rate.offerId === offer.id) })).filter((offer) => hasCurrentRatePeriod(offer.rates, now));
}

/**
 * Retrieve a detailed hotel offer and its currently valid price rows by its stable public slug.
 *
 * An offer carrying no current rate period is not bookable, so it is withheld here exactly as
 * listPublicOffers withholds it from the listing. Both paths therefore answer the same question with
 * the same rule. Without this, an offer whose rate windows had all closed stayed reachable by direct
 * link with an empty rates array: a priced product presented with no price, still accepting
 * enquiries.
 */
export async function getPublicOfferBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const rows = await db.select().from(travelOffers).where(and(eq(travelOffers.slug, slug), currentOfferVisibility(now))).limit(1);
  const offer = rows[0];
  if (!offer || !isOfferPubliclyVisible(offer, now)) return undefined;
  const rates = await db.select().from(offerRatePeriods).where(and(eq(offerRatePeriods.offerId, offer.id), currentRateVisibility(now))).orderBy(asc(offerRatePeriods.validFrom), asc(offerRatePeriods.price));
  const currentRates = rates.filter((rate) => isRatePeriodCurrent(rate, now));
  if (!hasCurrentRatePeriod(currentRates, now)) return undefined;
  return { ...offer, rates: currentRates };
}

/** The public Umrah listing is separate from leisure travel to retain its distinct product structure. */
export async function listPublicUmrahPrograms() {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  await applyPublicLifecycleRules(now);
  const rows = await db.select().from(umrahPrograms).where(and(eq(umrahPrograms.isActive, true), ne(umrahPrograms.availability, "hidden"), ne(umrahPrograms.availability, "expired"), or(isNull(umrahPrograms.departureAt), gte(umrahPrograms.departureAt, now)))).orderBy(asc(umrahPrograms.departureAt));
  const programs = rows.filter((program) => isUmrahProgramPubliclyVisible(program, now));
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
  if (!program || !isUmrahProgramPubliclyVisible(program, now)) return undefined;
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
  if (!db) return null;
  const rows = await db.select().from(siteSettings).limit(1);
  return rows[0] ?? null;
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

/**
 * Create or update a hotel package and maintain a single headline rate for no-code staff operations.
 *
 * Headline-price rules (D9):
 *   0 rate rows → create exactly one
 *   1 rate row  → update that row
 *   2+ rate rows → refuse, because any choice would be a guess
 *
 * The previous implementation selected a row with an unordered `LIMIT 1`, which MySQL does not
 * guarantee to be stable, so editing an offer could silently rewrite an arbitrary seasonal rate.
 *
 * Offer validity and rate validity are separate concepts: this function never writes
 * validFrom/validUntil on a rate row. Rate windows are owned exclusively by the rate editor.
 *
 * The offer write and the headline-rate write are one transaction, so a failure part-way through can
 * no longer leave the offer updated while its price is not — a state that also stamped
 * lastPriceUpdatedAt as though the price had been written, and so concealed itself. The D9 read sits
 * inside the transaction so the rows it counts are the rows the write acts on.
 *
 * Scope limit, deliberately stated: the transaction makes this operation all-or-nothing. It does NOT
 * prevent a concurrent replaceOfferRates from inserting rate rows between the D9 read and the rate
 * write, so the D9 refusal remains bypassable under concurrent admin edits. Closing that race needs
 * a locking or isolation strategy whose behaviour on TiDB is unverified; it is registered as deferred
 * coverage in server/lifecycle.integration.test.ts rather than guessed at here.
 */
export async function saveAdminOffer(input: AdminOfferInput) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");

  return db.transaction(async (tx) => {
    // Counted inside the transaction so a refusal reflects the rows this write would act on, and so
    // a refusal rolls back rather than relying on being reached before the first write.
    let existingRateIds: number[] = [];
    if (input.id && input.price) {
      const existingRates = await tx.select({ id: offerRatePeriods.id }).from(offerRatePeriods).where(eq(offerRatePeriods.offerId, input.id));
      if (existingRates.length > 1) throw new Error(MULTI_RATE_HEADLINE_PRICE_ERR_MSG);
      existingRateIds = existingRates.map((rate) => rate.id);
    }

    const patch = { slug: input.slug, destinationEn: input.destinationEn, destinationAr: input.destinationAr, hotelNameEn: input.hotelNameEn, hotelNameAr: input.hotelNameAr, areaEn: input.areaEn || null, areaAr: input.areaAr || null, days: input.days, nights: input.nights, mealPlanEn: input.mealPlanEn, mealPlanAr: input.mealPlanAr, transportationIncluded: input.transportationIncluded, availability: input.availability, isActive: input.isActive, validUntil: input.validUntil ?? null, lastPriceUpdatedAt: new Date() };
    const insertedOffer = input.id ? null : await tx.insert(travelOffers).values(patch);
    const id = input.id ?? Number((insertedOffer as unknown as Array<{ insertId: number }>)[0]?.insertId);
    if (input.id) await tx.update(travelOffers).set(patch).where(eq(travelOffers.id, input.id));

    if (input.price) {
      const ratePatch = { price: input.price, labelEn: input.priceLabelEn || null, labelAr: input.priceLabelAr || null, lastUpdatedAt: new Date() };
      const targetRateId = existingRateIds[0];
      if (targetRateId !== undefined) await tx.update(offerRatePeriods).set(ratePatch).where(eq(offerRatePeriods.id, targetRateId));
      else await tx.insert(offerRatePeriods).values({ offerId: id, occupancy: "per_person", currency: "EGP", ...ratePatch });
    }

    return { id };
  });
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

/**
 * Replace staff-entered hotel rate periods atomically so an offer never exposes a partially edited
 * public price table.
 *
 * The DELETE, the INSERT and the headline-timestamp UPDATE are one transaction (D6). Before that
 * they were three separate auto-committed statements, and the DELETE removed every rate row before
 * the INSERT was attempted: a failure in between destroyed the offer's entire price table. Because a
 * published offer carrying no current rate is withheld from both public read paths, the offer then
 * vanished from the site rather than showing a stale price, so a transient failure during an
 * ordinary price edit silently removed a product from the catalogue.
 *
 * Scope limit, as with saveAdminOffer: this makes the operation all-or-nothing. It does not
 * serialise this function against a concurrent saveAdminOffer, whose headline-price rules read the
 * same rows; closing that race needs locking semantics that are unverified on TiDB and is tracked as
 * deferred coverage in server/lifecycle.integration.test.ts.
 */
export async function replaceOfferRates(offerId: number, rates: AdminRateInput[]) {
  const db = await getDb();
  if (!db) throw new Error("The offer service is unavailable.");

  return db.transaction(async (tx) => {
    await tx.delete(offerRatePeriods).where(eq(offerRatePeriods.offerId, offerId));
    if (rates.length) await tx.insert(offerRatePeriods).values(rates.map((rate) => ({ offerId, labelEn: rate.labelEn || null, labelAr: rate.labelAr || null, occupancy: rate.occupancy, price: rate.price, currency: "EGP", childPrice: rate.childPrice || null, infantPrice: rate.infantPrice || null, validFrom: rate.validFrom ?? null, validUntil: rate.validUntil ?? null, notesEn: rate.notesEn || null, notesAr: rate.notesAr || null, lastUpdatedAt: new Date() })));
    await tx.update(travelOffers).set({ lastPriceUpdatedAt: new Date() }).where(eq(travelOffers.id, offerId));
    return { success: true };
  });
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

/**
 * Create or update a structured Umrah program plus its headline occupancy rate.
 *
 * Headline-price rules (D9-U), mirroring the offer editor:
 *   0 rate rows → create exactly one
 *   1 rate row  → update that row
 *   2+ rate rows → refuse, because any choice would be a guess
 *
 * The previous implementation selected a row with an unordered `LIMIT 1` and then overwrote both its
 * price and its roomType. A program carrying Quad/Triple/Double fares therefore had an arbitrary
 * occupancy silently rewritten: the Double row could come back as a second "Quad" at the starting
 * price, and the Double fare was gone. No failure was required — editing the title or the airline was
 * enough, because the editor submitted its prefilled price on every save.
 *
 * The program write and the rate write are one transaction, and the rate count is read inside it, so
 * a refusal rolls back rather than relying on being reached before the first write.
 *
 * Scope limit, as elsewhere: this does not serialise against a concurrent replaceUmrahRates.
 */
export async function saveAdminUmrahProgram(input: AdminUmrahInput) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");

  return db.transaction(async (tx) => {
    // Counted inside the transaction so a refusal reflects the rows this write would act on, and
    // targeted by explicit id afterwards rather than by an unordered LIMIT 1.
    let existingRateIds: number[] = [];
    if (input.id && input.price) {
      const existingRates = await tx.select({ id: umrahRateRows.id }).from(umrahRateRows).where(eq(umrahRateRows.programId, input.id));
      if (existingRates.length > 1) throw new Error(MULTI_RATE_UMRAH_PRICE_ERR_MSG);
      existingRateIds = existingRates.map((rate) => rate.id);
    }

    const patch = { slug: input.slug, titleEn: input.titleEn, titleAr: input.titleAr, departureAt: input.departureAt ?? null, returnAt: input.returnAt ?? null, durationDays: input.durationDays ?? null, airline: input.airline || null, makkahHotelEn: input.makkahHotelEn || null, makkahHotelAr: input.makkahHotelAr || null, madinahHotelEn: input.madinahHotelEn || null, madinahHotelAr: input.madinahHotelAr || null, availability: input.availability, isActive: input.isActive, lastUpdatedAt: new Date() };
    const insertedProgram = input.id ? null : await tx.insert(umrahPrograms).values(patch);
    const id = input.id ?? Number((insertedProgram as unknown as Array<{ insertId: number }>)[0]?.insertId);
    if (input.id) await tx.update(umrahPrograms).set(patch).where(eq(umrahPrograms.id, input.id));

    if (input.price) {
      const ratePatch = { roomType: input.roomType || "Quad", price: input.price, currency: "EGP" };
      const targetRateId = existingRateIds[0];
      if (targetRateId !== undefined) await tx.update(umrahRateRows).set(ratePatch).where(eq(umrahRateRows.id, targetRateId));
      else await tx.insert(umrahRateRows).values({ programId: id, ...ratePatch });
    }

    return { id };
  });
}

export async function updateUmrahStatus(id: number, patch: Pick<typeof umrahPrograms.$inferInsert, "isActive" | "availability">) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");
  await db.update(umrahPrograms).set(patch).where(eq(umrahPrograms.id, id));
  return { success: true };
}

export type AdminUmrahRateInput = { roomType: string; price: string; notesEn?: string; notesAr?: string };

/**
 * Replace staff-managed Umrah occupancy rates atomically so every program keeps a complete, ordered
 * price list.
 *
 * The DELETE, the INSERT and the program timestamp UPDATE are one transaction (D7). Before that they
 * were three separate auto-committed statements, and the DELETE removed every occupancy row before
 * the INSERT was attempted: a failure in between destroyed the program's whole room-type price list.
 * The public Umrah listing does not withhold a program that has no rates, so the program stayed
 * visible to customers showing no prices at all.
 *
 * Same scope limit as replaceOfferRates: this makes the operation all-or-nothing, and does not
 * serialise it against a concurrent saveAdminUmrahProgram.
 */
export async function replaceUmrahRates(programId: number, rates: AdminUmrahRateInput[]) {
  const db = await getDb();
  if (!db) throw new Error("The Umrah service is unavailable.");

  return db.transaction(async (tx) => {
    await tx.delete(umrahRateRows).where(eq(umrahRateRows.programId, programId));
    if (rates.length) await tx.insert(umrahRateRows).values(rates.map((rate) => ({ programId, roomType: rate.roomType, price: rate.price, currency: "EGP", notesEn: rate.notesEn || null, notesAr: rate.notesAr || null })));
    await tx.update(umrahPrograms).set({ lastUpdatedAt: new Date() }).where(eq(umrahPrograms.id, programId));
    return { success: true };
  });
}
