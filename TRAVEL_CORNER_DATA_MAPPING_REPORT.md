# Travel Corner DATA MAPPING REPORT

## Scope and source assessment

The supplied file was analyzed as the only source provided for this import review. It contains a **production-readiness and migration instruction set**, not the underlying hotel, Umrah, contact, media, pricing, or enquiry records. It names the categories of data that should be compared or migrated, but it does not provide any business values to import.

No database records were changed. No UI, CMS feature, SEO, or deployment change was made.

The copied database was queried read-only. Current counts are:

| Copied CMS area | Current rows |
|---|---:|
| Hotel packages (`travelOffers`) | 0 |
| Hotel price periods (`offerRatePeriods`) | 0 |
| Hotel media records | 0 dedicated rows; media fields exist on `travelOffers` |
| Umrah programs (`umrahPrograms`) | 0 |
| Umrah occupancy prices (`umrahRateRows`) | 0 |
| Site settings (`siteSettings`) | 0 |
| Enquiries/leads (`enquiries`) | 0 |
| Users (`users`) | 1 system/owner user record; not business content |

The original approved project's live database was not provided as an accessible data source in the attachment. Therefore, original record counts and row-level comparisons cannot be established from the supplied content alone.

## Source-to-CMS mapping

| Source content | CMS field/table | Example value | Action |
|---|---|---|---|
| Egypt hotel packages | `travelOffers` | No actual package value supplied | **Do not import.** Await the approved source records. |
| Hotel names | `travelOffers.hotelNameEn`, `hotelNameAr` | No hotel name supplied | **Missing.** Manual/source export required. |
| Destinations | `travelOffers.destinationEn`, `destinationAr` | No destination value supplied | **Missing.** Manual/source export required. |
| Areas/locations | `travelOffers.areaEn`, `areaAr` | No area value supplied | **Missing.** Manual/source export required. |
| Duration | `travelOffers.days`, `nights` | No duration supplied | **Missing.** Manual/source export required. |
| Meal plans | `travelOffers.mealPlanEn`, `mealPlanAr` | No meal plan supplied | **Missing.** Manual/source export required. |
| Transportation | `travelOffers.transportationIncluded`, `transportDetailsEn`, `transportDetailsAr` | No transportation information supplied | **Missing.** Manual/source export required. |
| Hotel availability | `travelOffers.availability`, `isActive` | No availability value supplied | **Missing.** Do not default to an invented status. |
| Hotel validity dates | `travelOffers.validFrom`, `validUntil` | No dates supplied | **Missing.** Required for lifecycle verification. |
| Hotel prices | `offerRatePeriods.price`, `currency` | No price supplied | **Missing.** Do not create replacement/demo prices. |
| Occupancy types | `offerRatePeriods.occupancy` | No occupancy type supplied | **Missing.** Manual/source export required. |
| Child/infant/supplement prices | `offerRatePeriods.childPrice`, `infantPrice`, `singleSupplement`, `extraNightPrice` | No values supplied | **Missing.** Import only when explicitly present in the approved source. |
| Hotel price periods | `offerRatePeriods.labelEn`, `labelAr`, `validFrom`, `validUntil` | No period label or dates supplied | **Missing.** Manual/source export required. |
| Hotel notes | `offerRatePeriods.notesEn`, `notesAr`, or offer summaries | No notes supplied | **Missing.** Preserve only supplied wording. |
| Hotel images/media | `travelOffers.primaryImageUrl`, `imageGallery`, `imageAltEn`, `imageAltAr`, `imageUrl` | No media URL or file supplied | **Missing.** Do not generate or substitute imagery. |
| Umrah programs | `umrahPrograms` | No program record supplied | **Do not import.** Await approved program data. |
| Umrah departure/return dates | `umrahPrograms.departureAt`, `returnAt` | No dates supplied | **Missing.** Required for expiry verification. |
| Umrah duration | `umrahPrograms.durationDays` | No duration supplied | **Missing.** Manual/source export required. |
| Umrah hotels | `makkahHotelEn`, `makkahHotelAr`, `madinahHotelEn`, `madinahHotelAr`, night and notes fields | No hotel information supplied | **Missing.** Manual/source export required. |
| Umrah flights/airports | `airline`, `departureAirport`, `arrivalAirport`, flight notes | No flight information supplied | **Missing.** Manual/source export required. |
| Umrah transportation/ziyarat | `transportationEn`, `transportationAr`, `ziyaratEn`, `ziyaratAr` | No programme details supplied | **Missing.** Manual/source export required. |
| Umrah occupancy prices | `umrahRateRows.roomType`, `price`, `currency`, notes | No room type or price supplied | **Missing.** Do not create sample rates. |
| Umrah availability | `umrahPrograms.availability`, `isActive` | No availability value supplied | **Missing.** Do not infer availability. |
| Important notes | `umrahPrograms.importantNotesEn`, `importantNotesAr`, `verifiedInformationEn`, `verifiedInformationAr` | No notes supplied | **Missing.** Preserve exact approved wording when provided. |
| Custom Trip configuration | No dedicated configuration table is present; enquiry capture uses `enquiries` fields | No configuration values supplied | **Not importable automatically.** Requires clarification of the intended source and existing approved representation. No new CMS feature will be added. |
| Contact information | `siteSettings.primaryPhone`, `secondaryPhone`, `whatsappNumber`, `email`, address, maps, social URLs, hours | No contact values supplied | **Missing.** Manual/source export required. |
| Existing enquiries/leads | `enquiries` | No enquiry records supplied | **Not importable from this file.** Requires an approved export and privacy/retention decision. |
| Campaign/site settings | `campaigns`, `siteSettings` | No values supplied | **Missing.** Import only from an approved source export. |

## Decision categories

### A. Data that can be imported automatically

**None from the supplied file.** The file contains field names and migration instructions, but no record-level values, dates, prices, names, URLs, media, or bilingual text. Once an approved structured export from the original project is supplied and its version is confirmed, deterministic mapping into the existing tables can be prepared without inventing data.

### B. Data that requires manual entry or an approved source export

All business content requires source data: hotel packages, destinations, hotels, areas, dates, durations, meal plans, transportation, prices, occupancy rates, availability, images/media, Umrah programmes and dates, Umrah hotels, Umrah rates, important notes, contact details, site settings, and any enquiries/leads. Custom Trip configuration also requires clarification because the current schema has no separate configuration table.

### C. Data that is missing

The supplied content is missing every actual business value needed to populate the CMS. It also does not include original database counts, a database export, a source-project connection, media files, or a reliable record identifier/version for conflict detection.

### D. Data that conflicts with existing records

No record-level conflicts can be assessed because the copied business-content tables are empty and the supplied file contains no records. The one copied `users` row is authentication data and is not comparable to travel content. Conflict checking must wait for an approved original-project export or another authoritative source.

### E. Data that should NOT be imported

Do not import the instruction text itself as hotel, Umrah, campaign, settings, or enquiry content. Do not import invented/demo records, guessed prices, guessed dates, inferred availability, substitute images, unverified contact details, or placeholder bilingual translations. Do not import enquiries/leads without an approved data export and retention/ privacy authorization.

## Required approval/input before population

To proceed safely, provide or authorize an approved, record-level export from the original Travel Corner project containing the business data and media references, or confirm that the pasted file was intended only as a migration brief. The export should preserve stable identifiers where available, English and Arabic fields, timestamps/validity windows, rate rows, media URLs, and the source version/date. After receiving that source, I can produce a conflict report and a second mapping confirmation before any database write.

## Current recommendation

**Do not populate the CMS yet.** The copied project is structurally ready for data migration, but it is not production-data ready because its content tables are empty and the supplied file does not contain the records needed to fill them. No migration method can safely be executed from this attachment alone.
