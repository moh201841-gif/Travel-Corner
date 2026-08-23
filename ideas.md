# Travel Corner — Brand and Experience Direction

## Three possible visual approaches

| Theme Name | Very Brief Intro | Probability |
| --- | --- | ---: |
| The Atlas Journal | A sun-worn editorial travel journal that pairs composed photography with rigorous, almost architectural information design. It feels considered, worldly, and calm. | 0.07 |
| Coastal Atelier | A warm, tactile hospitality identity that uses sand, coral, and deep ocean hues to make trip planning feel personal rather than transactional. | 0.04 |
| Meridian Gallery | A gallery-like luxury travel environment with typographic restraint and wide cinematic images treated as exhibition pieces. | 0.09 |

## Chosen approach — The Atlas Journal

### Design Movement

Contemporary **editorial travel publishing** combined with the clarity of airport wayfinding and the quiet material sensibility of Mediterranean architecture. The visual language will feel like a considered travel journal rather than a booking-template interface.

### Core Principles

1. **Photographs lead; interface supports.** Imagery gets real scale and breathing room, while utility information is sharply organized beside it.
2. **Every conversion has context.** Calls to action appear next to specific trip questions rather than being scattered as generic booking buttons.
3. **Warm precision over decoration.** A controlled typographic hierarchy, hairline rules, and careful proportions establish trust without corporate heaviness.
4. **Bilingual parity by design.** English and Arabic are separate, polished content systems with correct reading direction, labels, spacing, and natural editorial rhythm.

### Color Philosophy

The site is grounded in **Atlas Navy** (`#102C36`) to convey reliability and composure. A warm **Limestone** background (`#F5F0E7`) prevents a generic white travel-site feel and recalls sunlit regional stonework. **Coral Signal** (`#E56F55`) is reserved for decisive interactions and status, making user action legible rather than loud. Deep Ink (`#142128`) and muted sea-glass (`#6A8484`) carry long-form information without visual fatigue.

### Layout Paradigm

Pages follow a **journey spread** model, alternating full-bleed visual chapters, editorial columns, and narrow vertical information rails. Content should feel discovered in stages, avoiding a repetitive stack of centered containers. Desktop areas use asymmetrical image-to-copy ratios; mobile collapses into a confident reading flow with large touch targets and a persistent inquiry action when appropriate.

### Signature Elements

* A **journey marker**: a coral, offset dot-and-rule motif that signals the current point in a travel story, search step, or itinerary.
* **Caption bars**: compact, bordered image captions styled like a travel journal’s field notes.
* **Open-corner frames**: partial line frames around select cards and CTAs that echo the brand’s “corner” concept without relying on a cliché travel icon.

### Interaction Philosophy

Interactions should encourage calm exploration. Cards lift only slightly while photography breathes forward; form controls feel tangible with precise focus states; conversion buttons use direct, human language. Functional demo flows should reveal the next relevant area, never pretend to submit unavailable production data.

### Animation

Use short, understated transitions only: 160ms press feedback, 220ms image-scale and card-elevation on hover, and 300ms opacity/translate reveals for major content. Journey markers can sweep across a short rule on active selection. Motion must respect `prefers-reduced-motion`; no looping decorative animations or distracting parallax.

### Typography System

**Manrope** provides a polished, highly legible English UI and body text system. **Noto Kufi Arabic** delivers crisp, contemporary Arabic reading at UI and editorial sizes. English display headings use a tightly tracked, high-weight Manrope; Arabic display headings use Noto Kufi Arabic with open leading. Interface labels are uppercase only in English; Arabic labels retain natural sentence case. The hierarchy uses generous scale contrast rather than many font styles.

### Brand Essence

**Travel Corner is the composed travel partner for Egyptians who want an international trip experience tailored with human care.**

Personality: **composed, warm, curious**.

### Brand Voice

Headlines should be observant and specific; calls to action should sound confident, concise, and helpful. Avoid empty superlatives, urgency theatre, and vague promises.

> “Some journeys start with a place. The best ones start with a feeling.”

> “Tell us what you have in mind. We’ll shape the route around it.”

### Wordmark & Logo

The temporary mark is an interlocking **corner-and-horizon symbol**: two offset architectural curves create a protected corner opening onto a distant line. It is paired with a custom-styled Travel Corner wordmark in the implementation, so the symbol can remain when a future bespoke logo replaces the temporary treatment.

### Signature Brand Color

**Atlas Navy — `#102C36`**.

## Recommended Taglines

| Tagline | Intended role |
| --- | --- |
| Your Corner of the World | Primary positioning line and recommended choice. |
| Travel Well, From Here | A succinct campaign line focused on confidence. |
| Made for the Way You Travel | A custom-trip and flexibility message. |
| The World, Considered Personally | A premium, human-planning expression. |
| Places Worth Planning For | An editorial destination-led option. |
| Go Further, Feel at Home | A warm reassurance-led alternative. |

## Confirmed public experience scope

The first delivery will provide an interactive bilingual storefront rather than an unconfigured live booking engine. It will include a high-fidelity homepage, destination discovery, reusable package and package-detail states, a multi-step custom-trip inquiry experience, services, contact, FAQ, travel inspiration, mobile navigation, and a clear configurable-data posture. All package imagery and content will be visibly marked as **sample content**, with no fabricated prices, reviews, contact details, licenses, or guarantees.

## Sitemap and URLs

| Route | Purpose |
| --- | --- |
| `/` | Bilingual homepage with search, destinations, sample packages, trust approach, inspiration, FAQ, newsletter, and final trip-planning CTA. |
| `/en/destinations` and `/ar/destinations` | Destination discovery with region filters. |
| `/en/packages` and `/ar/packages` | Browseable sample package collection with client-side filters. |
| `/en/packages/:slug` and `/ar/packages/:slug` | Detailed sample package with itinerary, inclusions, gallery, FAQs, and inquiry actions. |
| `/en/plan-your-trip` and `/ar/plan-your-trip` | Multi-step, client-side custom-trip inquiry flow and success state. |
| `/en/services` and `/ar/services` | Configurable service presentation; unavailable services are treated as future capabilities. |
| `/en/about` and `/ar/about` | Brand approach and values without invented company facts. |
| `/en/inspiration` and `/ar/inspiration` | Travel guide and inspirational editorial-card shell. |
| `/en/contact` and `/ar/contact` | Configurable contact-information layout and inquiry form shell. |

## Homepage conversion structure

The homepage moves from emotional discovery to practical confidence. A cinematic hero introduces the idea of a trip that is personally considered. An immediately usable discovery bar routes visitors toward sample package browsing or the custom-trip flow. Destination-led exploration follows, then sample packages with transparent demo labels. The remaining chapters build credibility through the travel-planning approach, surface key trip types, offer a low-friction custom-trip invitation, provide editorial inspiration and FAQ clarity, and close with a direct planning prompt. WhatsApp and contact mechanisms are represented as clearly configured placeholders until business details are supplied.

## Technical architecture

This first delivery uses the available **React 19 + TypeScript + Vite + Tailwind 4** static frontend scaffold, with Wouter for client-side routing and reusable local TypeScript data models. This is intentional: the user has not provided a real inventory, contact endpoint, WhatsApp number, authentication requirement, or CMS credentials, so a production database/admin system cannot be truthfully configured yet. The implementation will isolate all sample data and settings from view components so a future full-stack upgrade can add Supabase/PostgreSQL, admin authentication, lead storage, and a CMS without rewriting the public experience.

## Future full-stack handoff

When business content and access requirements are ready, the recommended next step is a full-stack upgrade with authenticated role-based admin areas, relational entities for packages, destinations, media, leads, and settings; protected lead APIs; spam protection and server-side validation; configurable WhatsApp/contact settings; metadata fields per content type; and a real email/analytics integration. This future work is deliberately out of the static first delivery rather than being simulated with fake persistence.

## Style Decisions

* Build with full-width photographic chapters, editorial columns, and precise information rails rather than centered card grids.
* Make Atlas Navy, Limestone, and Coral Signal the immutable visual anchors.
* Keep interactive motion composed, compact, and optional for reduced-motion users.
* Treat all business-specific facts as configurable; display sample travel data only with explicit labels.
* Carry the coral journey marker, caption-bar logic, and open-corner frames into every primary page and repeated content surface.
* Use a custom Travel Corner wordmark lockup, with the horizon-corner emblem and coral signature rule, consistently in the header and footer.
* Present package and enquiry content as editorial field notes with metadata rails and hairline detail rather than default booking cards.
