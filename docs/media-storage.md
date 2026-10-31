# Media storage — Cloudflare R2

Travel Corner stores administrator-uploaded images in Cloudflare R2, which speaks the S3 API. The
code is in place and tested; **nothing in this repository creates or contacts a Cloudflare account.**
The steps below are what the owner does once, when they are ready.

## How it works

| Path | Serves |
| --- | --- |
| `/media/*` | Objects uploaded through the admin dashboard. |
| `/manus-storage/*` | Compatibility route. Existing database rows and the static site assets hold URLs under it. |

Both paths are served by one handler in `server/_core/storageProxy.ts`:

- **R2 configured** → the handler resolves from R2 and **never calls Manus Forge.**
- **R2 not configured** → it falls back to Manus Forge, so a deployment still on Manus keeps
  working. Configuring R2 is what removes the Forge dependency.
- **Neither configured** → `503`, naming the missing configuration in the server log only. That
  notice is printed **once per process**, not once per request: the nine static assets below are
  still referenced under `/manus-storage/`, so per-request logging produced several identical lines
  on every page load and buried everything else.

With `R2_PUBLIC_BASE_URL` set, the handler redirects straight to that bucket domain. Without it the
bucket is treated as private and the handler redirects to a signed `GET` valid for 15 minutes, so a
private bucket needs no extra setup.

Uploads are refused before anything reaches the network unless **all** of the following hold:

- the caller is the administrator (`adminProcedure`; the gate is unchanged from Phase 1);
- the declared content type is `image/jpeg`, `image/png` or `image/webp`;
- the file is non-empty and at most 5 MB;
- the file's **magic bytes** match the declared type — a caller cannot upload a script announced as
  a JPEG;
- the storage key matches the allowlist (`server/_core/mediaStorage.ts`), which rules out traversal,
  absolute paths, backslashes, control characters and anything URL-shaped.

The storage key is built server-side by `offerImageKey()` as
`travel-corner/offers/<offerId>/<timestamp>.<ext>`. The `filename` the dashboard sends is **not**
used to build it.

## Managing hotel images

Cover image, gallery and the English/Arabic alt text are edited inside the hotel package form —
**Edit & images** on a package row, or the form that stays open after you create one. A package
carries one cover plus up to twelve gallery images; public cards fall back to the destination image
while no cover is set.

The key contains the package id, so there is nothing to upload against until the package row
exists. Creating a package therefore leaves the form open on the saved package rather than closing
it, and images are added in the same pass.

With no R2 settings configured, the form says so and the upload buttons are disabled; alt text and
the order of images already stored stay editable. An upload attempted anyway is refused by the
router before the bytes are decoded, with a message that names no environment variable.

## One-time setup

1. In the Cloudflare dashboard, create an R2 bucket (for example `travel-corner-media`).
2. Create an R2 **API token** scoped to that bucket with object read and write. Note the Access Key
   ID and Secret Access Key — the secret is shown once.
3. Note the Account ID from the R2 overview page.
4. Decide how objects are read:
   - **Public bucket** (simpler, images are cacheable by the CDN): enable the bucket's public
     `r2.dev` URL or attach a custom domain, then set `R2_PUBLIC_BASE_URL` to it.
   - **Private bucket**: leave `R2_PUBLIC_BASE_URL` unset. The app signs each read.
5. Set the environment variables in the host's dashboard — see `.env.example`:

   ```
   R2_ACCOUNT_ID=…
   R2_BUCKET=travel-corner-media
   R2_ACCESS_KEY_ID=…
   R2_SECRET_ACCESS_KEY=…
   R2_PUBLIC_BASE_URL=…        # only for a public bucket
   ```

   `R2_ENDPOINT` overrides the derived `https://<account-id>.r2.cloudflarestorage.com` if needed.
6. Restart the app and upload one image from the admin dashboard to confirm the round trip.

Nothing else changes: `primaryImageUrl` and `imageGallery` keep the same shape, and URLs already in
the database keep resolving through `/manus-storage/*`.

## Static assets that must still be recovered

These nine files are referenced by URL but **no copy exists in this repository** — `client/public`
holds no images. They live in Manus Forge storage. Off Manus they do not load, and once R2 is
configured the media route answers `404` for them until the files are uploaded.

**Recovering them is a separate task from the R2 implementation.** No replacement assets have been
invented and no reference has been removed.

| Key to upload to R2 | Referenced by | Used for |
| --- | --- | --- |
| `travel-corner-hero_7b834ed9.jpg` | `travelData.ts`, `client/index.html` (`og:image`) | Trust section, gallery filler, social preview |
| `travel-corner-official-logo_25ee64eb.jpg` | `travelData.ts`, `client/index.html` (`apple-touch-icon`) | Header, footer and nav brand mark |
| `travel-corner-mark_68e5868a.png` | `client/index.html` (`icon`) | Browser favicon |
| `travel-corner-sharm-editorial_a1a4794f.jpg` | `travelData.ts` | Home hero, offers hero, default offer card image |
| `travel-corner-hurghada-editorial_79677206.jpg` | `travelData.ts` | Hurghada offer card fallback |
| `travel-corner-umrah-editorial_32b3518d.jpg` | `travelData.ts` | Umrah hero and programme card fallback |
| `travel-corner-paris-alps_6e640794.jpg` | `travelData.ts` | Alps destination card and gallery |
| `travel-corner-maldives_08394876.jpg` | `travelData.ts` | Maldives destination card and gallery |
| `travel-corner-dubai_9f765ca5.jpg` | `travelData.ts` | Dubai destination card and gallery |

To restore one, upload the file to the bucket under **exactly** the key in the first column; the
existing `/manus-storage/<key>` references then resolve with no code change.

`server/legacyMediaAssets.test.ts` pins this list. It fails if a new Manus-hosted reference is added
or an inventoried one disappears, so this table cannot drift from the source.

## Deliberately out of scope here

- Creating Cloudflare resources, or connecting to real R2. The tests mock the AWS SDK.
- Recovering or replacing the nine static assets above.
- `server/storage.ts` and `server/_core/imageGeneration.ts`, which still use Manus Forge for AI
  image generation — an unrelated feature, left untouched.
