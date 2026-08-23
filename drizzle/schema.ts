import { boolean, decimal, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** CMS-managed seasonal or product campaign. Dates and visibility allow staff to expire offers without code changes. */
export const campaigns = mysqlTable("campaigns", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  nameEn: varchar("nameEn", { length: 180 }).notNull(),
  nameAr: varchar("nameAr", { length: 180 }).notNull(),
  heroImageUrl: text("heroImageUrl"),
  promoArtworkUrl: text("promoArtworkUrl"),
  summaryEn: text("summaryEn"),
  summaryAr: text("summaryAr"),
  startsAt: timestamp("startsAt"),
  endsAt: timestamp("endsAt"),
  isActive: boolean("isActive").default(false).notNull(),
  seoTitleEn: varchar("seoTitleEn", { length: 180 }),
  seoTitleAr: varchar("seoTitleAr", { length: 180 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** A hotel offer is intentionally distinct from Umrah because it uses hotel, stay, meal-plan, transport, and date-based rates. */
export const travelOffers = mysqlTable("travelOffers", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").references(() => campaigns.id),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  destinationEn: varchar("destinationEn", { length: 120 }).notNull(),
  destinationAr: varchar("destinationAr", { length: 120 }).notNull(),
  hotelNameEn: varchar("hotelNameEn", { length: 180 }).notNull(),
  hotelNameAr: varchar("hotelNameAr", { length: 180 }).notNull(),
  areaEn: varchar("areaEn", { length: 180 }),
  areaAr: varchar("areaAr", { length: 180 }),
  hotelCategory: varchar("hotelCategory", { length: 60 }),
  days: int("days").notNull(),
  nights: int("nights").notNull(),
  mealPlanEn: varchar("mealPlanEn", { length: 120 }).notNull(),
  mealPlanAr: varchar("mealPlanAr", { length: 120 }).notNull(),
  transportationIncluded: boolean("transportationIncluded").default(false).notNull(),
  transportDetailsEn: text("transportDetailsEn"),
  transportDetailsAr: text("transportDetailsAr"),
  hotelTags: json("hotelTags"),
  adultsOnly: boolean("adultsOnly").default(false).notNull(),
  familyFriendly: boolean("familyFriendly").default(false).notNull(),
  availability: mysqlEnum("availability", ["available", "limited", "on_request", "sold_out", "expired", "hidden"]).default("on_request").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  validFrom: timestamp("validFrom"),
  validUntil: timestamp("validUntil"),
  lastPriceUpdatedAt: timestamp("lastPriceUpdatedAt"),
  imageUrl: text("imageUrl"),
  primaryImageUrl: text("primaryImageUrl"),
  imageGallery: json("imageGallery"),
  imageAltEn: varchar("imageAltEn", { length: 240 }),
  imageAltAr: varchar("imageAltAr", { length: 240 }),
  posterArtworkUrl: text("posterArtworkUrl"),
  summaryEn: text("summaryEn"),
  summaryAr: text("summaryAr"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Multiple validity windows and occupancy-specific rates belong to a single hotel offer. */
export const offerRatePeriods = mysqlTable("offerRatePeriods", {
  id: int("id").autoincrement().primaryKey(),
  offerId: int("offerId").notNull().references(() => travelOffers.id),
  labelEn: varchar("labelEn", { length: 140 }),
  labelAr: varchar("labelAr", { length: 140 }),
  occupancy: varchar("occupancy", { length: 80 }).default("per_person").notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
  childPrice: decimal("childPrice", { precision: 12, scale: 2 }),
  infantPrice: decimal("infantPrice", { precision: 12, scale: 2 }),
  singleSupplement: decimal("singleSupplement", { precision: 12, scale: 2 }),
  extraNightPrice: decimal("extraNightPrice", { precision: 12, scale: 2 }),
  validFrom: timestamp("validFrom"),
  validUntil: timestamp("validUntil"),
  notesEn: text("notesEn"),
  notesAr: text("notesAr"),
  lastUpdatedAt: timestamp("lastUpdatedAt").defaultNow().notNull(),
});

/** Umrah program information is stored separately so pricing, stays, and important verified information remain respectful and precise. */
export const umrahPrograms = mysqlTable("umrahPrograms", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").references(() => campaigns.id),
  slug: varchar("slug", { length: 160 }).notNull().unique(),
  programCode: varchar("programCode", { length: 80 }),
  titleEn: varchar("titleEn", { length: 180 }).notNull(),
  titleAr: varchar("titleAr", { length: 180 }).notNull(),
  departureAt: timestamp("departureAt"),
  returnAt: timestamp("returnAt"),
  durationDays: int("durationDays"),
  airline: varchar("airline", { length: 160 }),
  departureAirport: varchar("departureAirport", { length: 160 }),
  arrivalAirport: varchar("arrivalAirport", { length: 160 }),
  flightNotesEn: text("flightNotesEn"),
  flightNotesAr: text("flightNotesAr"),
  makkahHotelEn: varchar("makkahHotelEn", { length: 180 }),
  makkahHotelAr: varchar("makkahHotelAr", { length: 180 }),
  makkahNights: int("makkahNights"),
  makkahNotesEn: text("makkahNotesEn"),
  makkahNotesAr: text("makkahNotesAr"),
  madinahHotelEn: varchar("madinahHotelEn", { length: 180 }),
  madinahHotelAr: varchar("madinahHotelAr", { length: 180 }),
  madinahNights: int("madinahNights"),
  madinahNotesEn: text("madinahNotesEn"),
  madinahNotesAr: text("madinahNotesAr"),
  includedItems: json("includedItems"),
  transportationEn: text("transportationEn"),
  transportationAr: text("transportationAr"),
  ziyaratEn: text("ziyaratEn"),
  ziyaratAr: text("ziyaratAr"),
  importantNotesEn: text("importantNotesEn"),
  importantNotesAr: text("importantNotesAr"),
  verifiedInformationEn: text("verifiedInformationEn"),
  verifiedInformationAr: text("verifiedInformationAr"),
  availability: mysqlEnum("availability", ["available", "limited", "on_request", "sold_out", "expired", "hidden"]).default("on_request").notNull(),
  isActive: boolean("isActive").default(false).notNull(),
  imageUrl: text("imageUrl"),
  posterArtworkUrl: text("posterArtworkUrl"),
  lastUpdatedAt: timestamp("lastUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Room-type pricing is flexible by program rather than forcing a hotel-offer rate structure. */
export const umrahRateRows = mysqlTable("umrahRateRows", {
  id: int("id").autoincrement().primaryKey(),
  programId: int("programId").notNull().references(() => umrahPrograms.id),
  roomType: varchar("roomType", { length: 60 }).notNull(),
  price: decimal("price", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("EGP").notNull(),
  notesEn: text("notesEn"),
  notesAr: text("notesAr"),
});

/** A singleton editable source for conversion channels and operational contact details. */
export const siteSettings = mysqlTable("siteSettings", {
  id: int("id").autoincrement().primaryKey(),
  primaryPhone: varchar("primaryPhone", { length: 40 }),
  secondaryPhone: varchar("secondaryPhone", { length: 40 }),
  whatsappNumber: varchar("whatsappNumber", { length: 40 }),
  email: varchar("email", { length: 320 }),
  officeAddressEn: text("officeAddressEn"),
  officeAddressAr: text("officeAddressAr"),
  googleMapsUrl: text("googleMapsUrl"),
  facebookUrl: text("facebookUrl"),
  instagramUrl: text("instagramUrl"),
  tiktokUrl: text("tiktokUrl"),
  businessHoursEn: text("businessHoursEn"),
  businessHoursAr: text("businessHoursAr"),
  supportPhone: varchar("supportPhone", { length: 40 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** A qualified lead represents a sales request; this is not a checkout or booking record. */
export const enquiries = mysqlTable("enquiries", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["hotel_offer", "umrah", "custom_trip", "callback"]).notNull(),
  offerId: int("offerId").references(() => travelOffers.id),
  umrahProgramId: int("umrahProgramId").references(() => umrahPrograms.id),
  sourcePath: varchar("sourcePath", { length: 255 }),
  preferredContact: mysqlEnum("preferredContact", ["whatsapp", "phone", "email"]).default("whatsapp").notNull(),
  name: varchar("name", { length: 160 }),
  phone: varchar("phone", { length: 40 }),
  whatsapp: varchar("whatsapp", { length: 40 }),
  email: varchar("email", { length: 320 }),
  travelDate: timestamp("travelDate"),
  destination: varchar("destination", { length: 180 }),
  travellers: varchar("travellers", { length: 120 }),
  preferences: text("preferences"),
  budget: varchar("budget", { length: 120 }),
  language: mysqlEnum("language", ["ar", "en"]),
  travellerNotes: text("travellerNotes"),
  status: mysqlEnum("status", ["new", "contacted", "qualified", "closed"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Campaign = typeof campaigns.$inferSelect;
export type TravelOffer = typeof travelOffers.$inferSelect;
export type OfferRatePeriod = typeof offerRatePeriods.$inferSelect;
export type UmrahProgram = typeof umrahPrograms.$inferSelect;
export type UmrahRateRow = typeof umrahRateRows.$inferSelect;
export type SiteSettings = typeof siteSettings.$inferSelect;
export type Enquiry = typeof enquiries.$inferSelect;
