/**
 * Travel Corner — the hotel package form carries image management.
 *
 * The reported symptom was "the hotel package form has no visible image upload field", and it was
 * accurate: OfferMediaControls was rendered only inside the package table row, collapsed, beside
 * the rate editor. Nothing in "Add hotel package" or "Edit package" referred to images at all, so
 * the only route to an upload was to save the package, find its row and expand a details element.
 *
 * These cases render the form itself, which the page-level render test cannot reach — a static
 * render leaves the offers query loading, so the table and its editor never mount. Only the form's
 * own markup is asserted, so the test says what the operator can see rather than how it is built.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { trpc } from "@/lib/trpc";
import { OfferEditor } from "./TravelAdmin";

type AdminOfferProp = Parameters<typeof OfferEditor>[0]["initial"];

const SAVED_OFFER = {
  id: 42,
  slug: "sharm-royal-4n",
  hotelNameEn: "Royal Sharm Resort",
  hotelNameAr: "منتجع شرم الملكي",
  destinationEn: "Sharm El Sheikh",
  destinationAr: "شرم الشيخ",
  areaEn: "Nabq Bay",
  areaAr: "خليج نبق",
  days: 4,
  nights: 3,
  mealPlanEn: "All inclusive",
  mealPlanAr: "إقامة كاملة",
  transportationIncluded: true,
  availability: "available",
  isActive: true,
  validUntil: null,
  primaryImageUrl: "/media/travel-corner/offers/42/1700000000000.jpg",
  imageGallery: [{ url: "/media/travel-corner/offers/42/1700000000001.jpg", altEn: "Pool at dusk" }],
  imageAltEn: "Royal Sharm Resort pool",
  imageAltAr: "مسبح منتجع شرم الملكي",
  rates: [],
} as unknown as NonNullable<AdminOfferProp>;

function stubBrowserGlobals() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

function render(props: {
  initial?: NonNullable<AdminOfferProp>;
  uploadsEnabled?: boolean;
}): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const trpcClient = trpc.createClient({
    links: [httpBatchLink({ url: "http://localhost/api/trpc", transformer: superjson })],
  });

  return renderToStaticMarkup(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <OfferEditor
          initial={props.initial}
          onClose={() => {}}
          onSaved={async () => {}}
          onCreated={() => {}}
          uploadsEnabled={props.uploadsEnabled ?? true}
        />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

beforeAll(stubBrowserGlobals);
afterAll(() => vi.unstubAllGlobals());

describe("the hotel package form for a saved package", () => {
  it("shows the image section inside the form", () => {
    const html = render({ initial: SAVED_OFFER });

    expect(html).toContain("Hotel images &amp; alt text");
    expect(html).toContain("Upload cover");
    expect(html).toContain("Add image");
    expect(html).toContain("Hotel gallery");
  });

  it("offers a file input that accepts the supported image types", () => {
    const html = render({ initial: SAVED_OFFER });

    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it("opens the image section rather than leaving it collapsed", () => {
    // A collapsed <details> is what made the control invisible in the table; inside the form it is
    // open, so "no visible image upload field" cannot recur by default.
    const html = render({ initial: SAVED_OFFER });

    expect(html).toMatch(/<details[^>]*class="admin-media-control"[^>]*\sopen\b/);
  });

  it("shows the current cover, its alt text and the existing gallery", () => {
    const html = render({ initial: SAVED_OFFER });

    expect(html).toContain("/media/travel-corner/offers/42/1700000000000.jpg");
    expect(html).toContain("/media/travel-corner/offers/42/1700000000001.jpg");
    expect(html).toContain("Royal Sharm Resort pool");
    expect(html).toContain("Use as cover");
    expect(html).toContain("Remove");
  });

  it("keeps both languages for alt text", () => {
    const html = render({ initial: SAVED_OFFER });

    expect(html).toContain("English alt text");
    expect(html).toContain("Arabic alt text");
    // The Arabic field keeps its right-to-left direction, as every other Arabic input does.
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("مسبح منتجع شرم الملكي");
  });

  it("still carries every package field it carried before", () => {
    const html = render({ initial: SAVED_OFFER });

    for (const label of [
      "Slug",
      "Destination (English)",
      "Destination (Arabic)",
      "Hotel (English)",
      "Hotel (Arabic)",
      "Area (English)",
      "Days",
      "Nights",
      "Board (English)",
      "Price (EGP)",
      "Offer expires on",
      "Availability",
      "Transfers included",
      "Publish on the public site",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Save package");
  });
});

describe("the hotel package form with no media storage configured", () => {
  it("states the reason instead of offering an upload that will fail", () => {
    const html = render({ initial: SAVED_OFFER, uploadsEnabled: false });

    expect(html).toContain("Image storage is not configured");
    expect(html).toContain("admin-upload is-disabled");
    expect(html).toContain('type="file" accept="image/jpeg,image/png,image/webp" disabled=""');
  });

  it("still allows alt text and gallery order to be edited", () => {
    const html = render({ initial: SAVED_OFFER, uploadsEnabled: false });

    expect(html).toContain("English alt text");
    expect(html).toContain("Use as cover");
    expect(html).toContain("Remove");
  });

  it("leaves the upload enabled when storage is configured", () => {
    const html = render({ initial: SAVED_OFFER, uploadsEnabled: true });

    expect(html).not.toContain("admin-upload is-disabled");
    expect(html).not.toContain("Image storage is not configured");
  });
});

describe("the hotel package form for a new package", () => {
  it("explains when images can be added, since an upload needs the package id", () => {
    const html = render({ initial: undefined });

    expect(html).toContain("Hotel images can be added as soon as the package is created");
    expect(html).toContain("Create package");
  });

  it("offers no file input before the package exists", () => {
    // offerImageKey builds travel-corner/offers/<id>/… server-side, so there is nothing to upload
    // against until the row is written.
    const html = render({ initial: undefined });

    expect(html).not.toContain('type="file"');
  });
});
