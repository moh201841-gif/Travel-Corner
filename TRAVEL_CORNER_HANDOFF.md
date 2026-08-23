# Travel Corner — Official Brand & Offer Platform Handoff

## What is included

This delivery is a polished **React + TypeScript + Vite + Tailwind + Express + tRPC + MySQL/Drizzle** Travel Corner storefront. It provides separate English LTR and Arabic RTL routes, the official supplied Travel Corner logo with a responsive header/footer treatment, a premium editorial homepage, structured Sharm El Sheikh and Hurghada hotel offers, a dedicated Umrah program journey, responsive custom-trip and contact enquiries, protected offer-status controls at `/admin`, mobile navigation, basic social metadata, `robots.txt`, and a sitemap shell.

Poster-derived business records are persisted as editable campaigns, hotel offers, rate rows, Umrah programs, program rate rows, central settings, and enquiries. The initial contact settings are sourced from the supplied Travel Corner material: telephone **01145555785** and WhatsApp **01036666387**. Summer 2026 hotel rates and the August Umrah program are displayed as **campaign reference data**; the website explicitly requires the Travel Corner team to confirm availability and final pricing before any booking.

## Local development

Run the following commands from the project root:

```bash
pnpm install
pnpm dev
```

The standard production check is:

```bash
pnpm check && pnpm build
```

## Required business configuration before a public launch

| Area | Required approved information |
| --- | --- |
| Contact | Business telephone, WhatsApp number, email, office address, working hours, and social URLs. |
| Inventory | Accurate package titles, destinations, itineraries, dates, availability, hotel details, inclusions, exclusions, imagery, and only verified prices. |
| Legal | Business-reviewed privacy, terms, booking, cancellation, and cookie policy text. |
| SEO | Production domain, canonical URLs, Google Search Console verification, per-page metadata, and approved structured-data details. |
| Analytics | GA4, GTM, Meta Pixel, and consent configuration only after the relevant account IDs and policy decisions are supplied. |

## Current content and admin foundation

The project now has an authenticated, role-gated administrative route at `/admin`. It provides a focused first control surface for changing an offer’s public visibility and availability state. The owner account is granted administrator access by the existing authentication layer. Public browsing remains read-only, while offer updates require administrator authentication.

The schema supports campaigns, hotel offers, hotel-offer rate rows, Umrah programs, Umrah rate rows, central contact settings, and qualified travel enquiries. This structure allows a future editor to add full create/edit/archive controls without changing the public content routes.

## Current interaction behaviour

Homepage destination search routes directly into the filtered hotel-offer browser. Offer cards show hotel, location, stay, board, transfer information, campaign rate, and campaign date window. Package and Umrah pages produce contextual WhatsApp enquiries through the official managed number. The custom-trip and contact forms validate essential fields and store qualified enquiries through the secured backend; they do not create bookings or collect payments.

> The platform deliberately does **not** accept payment or create automatic bookings. It stores qualified enquiries for staff follow-up and makes no claim of current availability or a final price until a Travel Corner team member confirms both.

## Verification completed

The production build and TypeScript check pass. The test suite includes public content-contract coverage plus isolated enquiry success and validation-error tests that do not insert artificial customer records. Responsive English and Arabic offer, Umrah, contact, and custom-trip screens were reviewed, including direct URL-loaded destination filters.
