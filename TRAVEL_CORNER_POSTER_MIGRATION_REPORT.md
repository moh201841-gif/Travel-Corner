# Travel Corner Poster-Based Migration Report

## Executive decision

The supplied posters are valid source material for Travel Corner’s initial business data. However, the hotel tables are Arabic-only, several OCR row boundaries and price/date pairings are ambiguous, and the existing CMS requires both English and Arabic hotel/program names. Under the supplied rules, **no hotel or Umrah record is safe to import automatically yet**. The two contact numbers are legible and can be mapped deterministically, but I have not written them to the database pending approval of this report.

No UI, CMS feature, SEO, or production deployment change was made. The existing approved design remains unchanged.

## Source inventory and duplicate handling

| Source file | Source role | Assessment | Import treatment |
|---|---|---|---|
| `1000345571.jpg` | Travel Corner logo/reference | OCR contains no offer table; image is treated as brand reference | Do not create a travel record. Existing official-logo treatment remains unchanged. |
| `1000345589.jpg` | Umrah programme poster | One programme poster; Arabic programme details and four/five visible price bands | Candidate Umrah programme only; manual verification required before import. |
| `1000345587.jpg` | Sharm El Sheikh 2026 hotel table | Hotel table with multiple date/price rows | Candidate hotel/rate records; manual verification required before import. |
| `1000345590.jpg` | Sharm El Sheikh 2026 hotel table | Byte-identical duplicate of `1000345587.jpg` (same SHA-256) | Consolidate with `1000345587.jpg`; never create duplicate offers or rates. |
| `1000345588.jpg` | Hurghada 2026 hotel table | Hotel table with multiple date/price rows | Candidate hotel/rate records; manual verification required before import. |
| `pasted_content_2.txt` | Migration instructions | Defines extraction, validation, lifecycle, and import rules; contains no additional business records | Do not import as CMS content. |

The supplied English Community image was not used, as explicitly instructed.

## Current copied database status and conflict check

The copied business-content tables were previously checked and contain no records: `travelOffers` 0, `offerRatePeriods` 0, `umrahPrograms` 0, `umrahRateRows` 0, `siteSettings` 0, and `enquiries` 0. The copied `users` table contains one authentication user and is not travel content.

Accordingly, every sufficiently clear source record would classify as **NEW**, not UPDATE or CONFLICT. Because the source row pairings are not sufficiently clear, the current hotel and Umrah candidates classify as **UNCLEAR / MANUAL VERIFICATION REQUIRED**, not importable NEW records. No existing record will be overwritten.

## Record-level extraction summary

The tables below list the source records or record candidates that could be identified without inventing English translations. Where a date, price, or row association is not certain, it is deliberately left as **REQUIRES MANUAL VERIFICATION** rather than normalized by guesswork.

### Umrah programme candidate

| Source image | Destination | Hotel / programme | Date | Price | Occupancy | Meal plan | Transportation | Notes | CMS destination/table | Confidence | Manual verification? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `1000345589.jpg` | Makkah and Madinah | Arabic heading reads as a first Umrah journey/programme; exact English title is not supplied | 5 August is visible; year, return date, and duration are not safely visible | Quad 37,500; Triple 39,000; Double 41,000; Child 28,500; Infant 17,500 are visible | Quad, triple, double, child, infant; child appears “2 to 11 years”; infant appears “under 2 years” | Not stated | Saudi Airlines is visible; airport routing is not safely complete | Makkah hotel text appears to reference Saraya Al Jawhar / Mahbas Al Jinn; Madinah hotel appears Hayat Grand; comfortable transport, religious visits, and accommodation/service claims are visible | `umrahPrograms` + `umrahRateRows` | Medium for the visible price numerals; low-to-medium for row labels, date year, hotel spelling, and programme structure | **YES** |

The Umrah values above are not an import approval. The exact Arabic text, date year, return date, duration, airline routing, hotel names, and notes require a human reading against the original poster before insertion. The schema can preserve Arabic and English fields, but no English title or hotel translation will be invented.

### Sharm El Sheikh candidate hotel records

The Sharm poster is a duplicate pair, so the following are **candidate hotel names detected once** from the two identical source files. The poster supplies Arabic names and rate rows but does not supply approved English names. Several OCR lines combine adjacent date and price cells; therefore, no candidate below is importable without manual verification of the exact name, area, board basis, date window, and price pairing.

| Source image | Destination | Hotel candidate detected | Date / price | Occupancy / meal / transport | CMS destination | Confidence | Manual verification? |
|---|---|---|---|---|---|---|---|
| `1000345587.jpg` + duplicate `1000345590.jpg` | Sharm El Sheikh | Sharks Bay Oasis | Visible price begins at 6,650; exact paired window requires verification | Poster header indicates 4 days / 3 nights, open buffet, and Mercedes transfers; row-level meal details need verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Sharm Inn | Candidate price around 6,150; date and child condition need verification | Header-level transport/meal text only | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Eden Rock | 5,900 and 6,425 appear as separate candidate rates; exact windows need verification | Breakfast + dinner appears; child supplement around 350 per person/night appears but needs confirmation | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Amphoras Aqua Park | Candidate price 9,800; date pairing unclear | Full-board/area wording requires verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Lido | Candidate price 11,600; a second candidate rate around 9,500 is visible | Full board appears; exact date periods unclear | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Dreams Beach | Candidate prices include approximately 14,450 and 12,800; row association unclear | Area/board wording requires verification | `travelOffers` + `offerRatePeriods` | Low | **YES** |
| same duplicate pair | Sharm El Sheikh | Dreams Vacation | Candidate price 9,950; another row is unclear | Full board appears; Aqua Park variant appears separately | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Dreams Vacation Aqua Park | Candidate price is unclear in OCR | Full board appears | `travelOffers` + `offerRatePeriods` | Low | **YES** |
| same duplicate pair | Sharm El Sheikh | Cataract Resort Aqua Park | Candidate price 9,000 | Meal and date pairing require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Cataract Layalina | Candidate prices around 9,800 and 12,050 | Breakfast + dinner appears; exact periods require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Albatros / Albatros Resort candidate | Candidate price around 10,550; exact Arabic hotel name unclear | Full board and aqua-park wording appear | `travelOffers` + `offerRatePeriods` | Low | **YES** |
| same duplicate pair | Sharm El Sheikh | Hilton Shark Bay | Candidate prices around 15,000 and 12,500 | Full board appears; exact date windows require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Savoy / Shalalat candidate | Candidate prices around 13,550 and 12,800 | Area and child supplement wording require verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Continental Plaza | Candidate prices include approximately 12,800, 13,550, and 12,050 | Full board appears; exact windows require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Jaz Fayrouz | Candidate prices include approximately 14,750, 17,450, and 16,100 | Full board appears; child conditions require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Jaz Sharm Dreams | Candidate prices around 12,500, 13,950, and 12,550 | Aqua-park / sandy-beach wording appears; exact periods require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Novotel Palm | Candidate prices around 13,850 and 11,900 | Full board appears; exact periods require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Novotel Beach candidate | Candidate prices around 18,200, 15,950, and 14,150 | Child condition appears but exact wording and rows need verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same duplicate pair | Sharm El Sheikh | Marina Sharm | Candidate row visible near the bottom; exact price/date pairing is not safely recoverable from OCR | Full board/Naama Bay wording appears | `travelOffers` + `offerRatePeriods` | Low | **YES** |

The Sharm table contains additional row-level rate entries attached to some hotels. They must be retained as separate `offerRatePeriods` only after the original poster is manually checked. The duplicate source image does not create a second offer.

### Hurghada candidate hotel records

The Hurghada poster contains two table columns with multiple candidate hotel rows. Arabic names are visible, but exact English names and several cell pairings are not supplied. The following candidates are therefore report-only until manually verified.

| Source image | Destination | Hotel candidate detected | Date / price | Occupancy / meal / transport | CMS destination | Confidence | Manual verification? |
|---|---|---|---|---|---|---|---|
| `1000345588.jpg` | Hurghada | Juliana Beach | Candidate prices around 7,400 and 6,650 | Full board appears; Al Ahyaa area and child-under-12 note require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Sunny / Sun and Sea candidate | Candidate prices around 7,050 and 7,250 | Full board appears; exact Arabic name and date periods require verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same | Hurghada | Roza Boho Aqua Park | Candidate price around 6,800 | Full board appears; exact period requires verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Sunny Days El Palacio | Candidate prices around 8,450 and 8,600 | Full board appears; exact period pairing requires verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | New Eagles Aqua Park | Candidate prices around 8,450 and 9,800 | Full board appears; exact name/date pairing requires verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same | Hurghada | Seagull / Sea View candidate | Candidate prices around 9,750 and 9,850 | Full board appears; exact name and area require verification | `travelOffers` + `offerRatePeriods` | Low | **YES** |
| same | Hurghada | Marina candidate | Candidate prices around 11,150 and 11,600 | Full board appears; exact hotel name/date pairing requires verification | `travelOffers` + `offerRatePeriods` | Low | **YES** |
| same | Hurghada | Faro Azur | Candidate prices around 12,500 and 12,700 | Full board appears; exact date windows require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Mercure | Candidate prices around 13,100 and 13,850 | Full board appears; exact date windows require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Giftun | Candidate prices around 11,600 and 10,850 | Full board appears; exact periods require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Amwaj Beach Sahl Hasheesh | Candidate price around 13,900 | Full board appears; exact period and area spelling require verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | White Valley | Candidate price around 12,900 | Full board appears; exact date period requires verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Palm Beach Families | Candidate price around 14,600 | Full board appears; exact date period requires verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Royal Lagoons | Candidate prices around 12,050, 11,750, 10,550, and 9,050 | Full board appears; multiple periods require manual row pairing | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Hawaii Paradise | Candidate price around 14,000 | Full board appears; exact row pairing requires verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same | Hurghada | Albatros / Albatros Luxury candidate | Candidate prices around 16,100, 15,350, and 14,150 | Full board appears; exact hotel name and periods require verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |
| same | Hurghada | Panorama Bungalows El Gouna | Candidate price around 13,850 | Full board appears; exact period requires verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Gravity Sahl Hasheesh | Candidate prices around 19,850, 20,600, and 18,350 | Full board appears; child-condition note needs verification | `travelOffers` + `offerRatePeriods` | Medium | **YES** |
| same | Hurghada | Zano / Zinado Makadi Bay candidate | Candidate prices around 25,100 and 23,250 | Full board appears; exact Arabic hotel name and periods require verification | `travelOffers` + `offerRatePeriods` | Low-to-medium | **YES** |

These are candidate detections, not approved records. The report intentionally does not convert Arabic hotel names into English, does not infer exact dates from adjacent OCR lines, and does not assign availability.

## Contact data

| Source image | Source value | CMS field | Confidence | Manual verification? |
|---|---|---|---|---|
| `1000345588.jpg`, `1000345589.jpg`, `1000345587.jpg` | `01145555785` labelled for booking/inquiries | `siteSettings.primaryPhone` | High | NO, subject to owner approval of field assignment |
| same source posters | `01036666387` labelled WhatsApp | `siteSettings.whatsappNumber` | High | NO, subject to owner approval of field assignment |

No email, office address, business hours, map URL, social URLs, secondary phone, or support phone is visible in the supplied source material. These fields must remain empty.

## Import totals and disposition

| Metric | Current determination |
|---|---:|
| Source image files reviewed | 5 image files; 4 distinct image contents because the two Sharm files are identical |
| Hotel source posters | 2 distinct posters: Sharm El Sheikh and Hurghada |
| Hotel candidate names detected | At least 19 Sharm candidates and at least 19 Hurghada candidates; exact source-row total is not finalized because several poster rows span multiple rate periods |
| Hotel rate periods extracted with import-safe confidence | 0 |
| Hotel occupancy price rows extracted with import-safe confidence | 0 |
| Umrah programmes extracted with import-safe confidence | 0 |
| Umrah occupancy price rows extracted with import-safe confidence | 0 |
| Contact records clearly detected | 2 phone numbers |
| Duplicate source images | 1 duplicate pair: `1000345587.jpg` = `1000345590.jpg` |
| Records safe to import now | 0 pending approval and manual verification |
| Conflicts with existing copied business records | 0; copied business tables are empty |
| Records requiring manual verification | All hotel and Umrah candidates; contact field assignment requires owner approval |

The candidate counts above are lower-bound detections, not a claim that the poster tables contain only those rows. The full hotel rate-period total should be finalized by manual row-by-row confirmation because OCR did not reliably preserve table grouping.

## Why the hotel and Umrah candidates are blocked

The existing schema requires `hotelNameEn`/`hotelNameAr`, `destinationEn`/`destinationAr`, meal-plan fields, stay duration, lifecycle fields, and rate rows for hotel offers. The posters visibly provide Arabic names and some English brand spellings, but not a complete approved English dataset. The Umrah poster similarly provides Arabic programme and hotel wording, but its date year, return date, duration, and exact hotel spellings are not safely recoverable. Importing those values would violate the instruction not to infer translations or guess unclear data.

The posters also describe package-level inclusions such as buffet meals, Mercedes transfers, and visits. These can map to existing transportation and notes fields only after the exact scope is confirmed. They should not be turned into invented structured fields or hotel descriptions.

## Approval required before import

Please approve one of the following controlled paths:

1. **Manual verification path:** confirm the Arabic row values, exact date windows, exact hotel names, English names/translations, and rate pairings from the original posters; then I will import only confirmed rows.
2. **Owner-approved limited import:** approve importing only the two contact numbers now, while leaving all hotel and Umrah candidates in the manual-verification queue.
3. **Structured source path:** provide an approved spreadsheet/export containing the poster rows in record form; I will reconcile it against the posters and import only matching records.

Until one path is approved, the database remains unchanged and no offers are presented as active. Historical dates will be retained as rate rows only after confirmation; existing lifecycle logic will hide passed hotel rates and Umrah departures from public active listings.
