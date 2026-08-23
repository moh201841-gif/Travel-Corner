# Travel Corner CMS Operator Guide

## Accessing the control room

Open the published website at **`/admin`** and sign in with the Travel Corner owner / administrator account. The page is the **Travel Corner Control Room**. Only accounts with the `admin` role can view or change hotel packages, hotel rates, media, or Umrah programs. A regular signed-in user sees a clear **Administrator access is required** state and the server rejects every administration procedure.

> Do not share the owner login. If another staff member needs CMS access, the account must be explicitly granted the administrator role before it can make content changes.

## Hotel packages

### Add a hotel package

1. Open **Hotel packages** and choose **Add hotel package**.
2. Enter a unique `slug`, the English and Arabic destination and hotel names, the area, days, nights, and board basis.
3. Enter the starting EGP price and bilingual rate labels. Add an **Offer expires on** date when the offer has a definite final date.
4. Choose availability and tick **Publish on the public site** only when the hotel name, rate, dates, and inclusions have been checked.
5. Select **Create package**. A published package can appear publicly only while it still has a valid active price period.

### Edit package details

1. On the relevant hotel row, choose **Edit**.
2. Update the public information. Use both language fields whenever a bilingual label is changed.
3. Select **Save package**. This changes the record but does not force a package live unless its publish state is enabled.

### Manage price periods and occupancy

1. Expand **Price periods & occupancy** under a hotel.
2. For every rate row, set **occupancy**, **EGP price**, English and Arabic labels, and its **Valid from** / **Valid until** dates.
3. Use **Add rate** for another occupancy or travel window; use **Remove** to remove an incorrect row before saving.
4. Select **Save rate periods**. Keep at least one valid current rate on a published hotel. A hotel whose rate windows have all passed is automatically removed from public browsing, while remaining available inside the control room.

### Publish, unpublish, and expire

| Action | What to do | Public effect |
| --- | --- | --- |
| Publish | Select **Publish** on the hotel row. | Makes the hotel eligible for public display if it also has a current valid rate. |
| Unpublish | Select **Published** again to toggle it off. | Removes the hotel from public browsing but preserves it in the CMS. |
| Change availability | Use the status selector: Available, Limited, On request, Sold out, Expired, or Hidden. | Updates the customer-facing status when the package is published and current. |
| Expire / archive | Choose **Expire / archive**. | Marks the package expired and unpublishes it. It is retained for staff reference; it is not deleted. |

### Hotel images and gallery

1. Expand **Hotel images & alt text**.
2. Upload a cover image and provide English and Arabic alt text. Add gallery images as needed.
3. Until a hotel cover is set, the public card uses a destination image fallback. This avoids an empty or broken visual card.

Use only approved, rights-cleared hotel photography. Do not upload poster artwork as a hotel cover, and do not remove an existing approved image until its replacement has been uploaded and saved.

## Umrah programs

### Add or edit a program

1. In **Programs & departures**, choose **Add Umrah program**, or select **Edit** on an existing program.
2. Enter the unique slug, English and Arabic titles, departure and return dates, duration, airline, Makkah accommodation, and Madinah accommodation.
3. Enter an initial starting price and room type, choose availability, and tick **Publish on the public site** only after the departure, hotels, rates, and included services have been checked.
4. Select **Create program** or **Save program**.

### Manage occupancy pricing

1. Expand **Occupancy price rows** below an Umrah program.
2. Enter a room / occupancy label such as Quad, Triple, Double, Child, or Infant, then add the EGP price and optional bilingual notes.
3. Use **Add occupancy** for additional room types and **Remove** for a row that should no longer be offered.
4. Select **Save Umrah rates**.

### Publish, unpublish, and expire

| Action | What to do | Public effect |
| --- | --- | --- |
| Publish | Select **Publish**. | The program becomes eligible for public display if its departure has not passed. |
| Unpublish | Select **Published** again to switch it off. | Hides the program without deleting the record. |
| Set availability | Use the program status selector. | Communicates current sales state when the program is public. |
| Expire / archive | Choose **Expire / archive**. | Unpublishes the program and marks it expired. A passed departure is also automatically hidden from public routes. |

## Safe operating practice

1. **Never publish based on an old poster alone.** Confirm rate, validity window, hotel, board basis, transport, and availability first.
2. **Use unpublish before making uncertain edits.** Update and review the record, then publish it again when confirmed.
3. **Use Expire / archive rather than deleting historical offers.** It protects customers from stale offers while preserving staff reference data.
4. **Review both language fields.** English and Arabic content are independent; a changed offer can otherwise be inconsistent between routes.
5. **Check the public listing after a major change.** A published package needs a current valid rate; a published Umrah program needs a future departure.
6. **Treat the CMS as a content and lead-management tool, not a payment or booking engine.** Staff must still confirm live availability and final prices before creating a booking.

## Current scope and safe workarounds

The control room currently supports no-code creation, editing, publication, unpublication, expiration / archive, availability, hotel price rows, Umrah occupancy price rows, and hotel media. It intentionally **does not permanently delete** packages or Umrah programs, which prevents accidental loss of historical offer data.

Campaign-level management, central contact-setting edits, lead-status triage, bulk imports, and automated staff notifications are not yet separate dashboard modules. Until those modules are added, update individual offer/program records in the control room and use the existing qualified-enquiry records for follow-up. Do not use the database console or source-code edits for routine publishing operations.
