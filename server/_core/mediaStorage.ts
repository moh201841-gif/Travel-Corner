/**
 * Media storage on Cloudflare R2 (Phase 2 of the Manus migration).
 *
 * R2 speaks the S3 API, so this uses the AWS SDK that is already a dependency — no new package.
 * Manus Forge is replaced only on the media path: when R2 is configured, nothing here or in the
 * media route talks to Forge. `server/storage.ts` is left in place for the unrelated Forge features
 * (AI image generation), which are not part of this phase.
 *
 * What this module is responsible for:
 *
 *   - Validating storage keys. A key reaches the bucket, so a key that escapes its prefix would let
 *     an upload overwrite, or a fetch read, an unrelated object. Keys are checked against an
 *     allowlist rather than a denylist, which rules out traversal, absolute paths, backslashes,
 *     control characters and anything URL-shaped in one test.
 *   - Validating the bytes. A caller can claim any content type, so the declared type is checked
 *     against the file's actual magic bytes and the size ceiling is enforced here, at the storage
 *     boundary, not only in the router.
 *   - Deciding the public URL. With R2_PUBLIC_BASE_URL set, URLs point straight at that bucket
 *     domain. Without it the bucket is treated as private and the media route signs a short-lived
 *     GET instead, so a private bucket works with no further configuration.
 *
 * Credentials are read from ENV and never logged; the configuration error names the missing
 * variable only.
 */
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./env";

/** Route that serves media uploaded to R2. */
export const MEDIA_ROUTE_PREFIX = "/media/";

/**
 * Route that served Manus Forge storage. Existing database rows and the static site assets hold
 * URLs under it, so it stays mounted as a compatibility route and now resolves from R2 as well.
 */
export const LEGACY_MEDIA_ROUTE_PREFIX = "/manus-storage/";

/** Upload ceiling. Matches the limit the admin dashboard enforces before it sends anything. */
export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

/** Content types an administrator may upload, mapped to the extension used in the stored key. */
export const ALLOWED_MEDIA_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type MediaContentType = keyof typeof ALLOWED_MEDIA_TYPES;

/** How long a signed GET stays valid when the bucket is private. */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

const MAX_KEY_LENGTH = 300;

/**
 * Allowlist for storage keys: slash-separated segments of letters, digits, dot, dash and
 * underscore, starting with a letter or digit. A key that does not match is rejected, so `..`,
 * a leading `/`, a backslash, a control character, a space and `https://…` are all refused without
 * needing a rule each.
 */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export class MediaStorageError extends Error {}

let _client: S3Client | null = null;

/** True when every R2 setting needed to read and write objects is present. */
export function isR2Configured(): boolean {
  return r2ConfigError() === null;
}

/** The first missing R2 setting, named but never valued, or null when the configuration is complete. */
export function r2ConfigError(): string | null {
  if (!ENV.r2Endpoint) return "R2_ENDPOINT or R2_ACCOUNT_ID is not configured";
  if (!ENV.r2Bucket) return "R2_BUCKET is not configured";
  if (!ENV.r2AccessKeyId) return "R2_ACCESS_KEY_ID is not configured";
  if (!ENV.r2SecretAccessKey) return "R2_SECRET_ACCESS_KEY is not configured";
  return null;
}

/**
 * The shared S3 client, created on first use so the server starts without R2 configured.
 * `region: "auto"` is what R2 expects; the SDK requires the field to be set to something.
 */
export function r2Client(): S3Client {
  const configError = r2ConfigError();
  if (configError) throw new MediaStorageError(`Media storage is not configured: ${configError}`);

  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: ENV.r2Endpoint,
      credentials: {
        accessKeyId: ENV.r2AccessKeyId,
        secretAccessKey: ENV.r2SecretAccessKey,
      },
    });
  }
  return _client;
}

/** Test-only: drop the cached client so a case can change the environment and rebuild it. */
export function resetR2Client(): void {
  _client = null;
}

/**
 * Validate a storage key and return it unchanged.
 * Throws rather than sanitising: silently rewriting a key would store an object somewhere the
 * caller did not ask for, and the caller then records a URL that does not resolve.
 */
export function assertValidStorageKey(key: unknown): string {
  if (typeof key !== "string" || key.trim() === "") {
    throw new MediaStorageError("Storage key must be a non-empty string.");
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new MediaStorageError(`Storage key must be at most ${MAX_KEY_LENGTH} characters.`);
  }
  if (!KEY_PATTERN.test(key)) {
    throw new MediaStorageError("Storage key contains characters that are not allowed.");
  }
  if (key.includes("//")) {
    throw new MediaStorageError("Storage key must not contain an empty path segment.");
  }
  if (key.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new MediaStorageError("Storage key must not contain a relative path segment.");
  }
  if (key.endsWith("/")) {
    throw new MediaStorageError("Storage key must not end with a slash.");
  }
  return key;
}

/** True when the key is valid, for callers that need a boolean rather than an exception. */
export function isValidStorageKey(key: unknown): boolean {
  try {
    assertValidStorageKey(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Identify an image from its leading bytes, so a declared content type can be checked against what
 * was actually uploaded. Returns null for anything that is not one of the accepted formats.
 */
export function sniffImageType(bytes: Uint8Array): MediaContentType | null {
  const matchesAt = (signature: readonly number[], offset: number) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);

  const JPEG = [0xff, 0xd8, 0xff] as const;
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
  const RIFF = [0x52, 0x49, 0x46, 0x46] as const; // "RIFF"
  const WEBP = [0x57, 0x45, 0x42, 0x50] as const; // "WEBP"

  if (matchesAt(JPEG, 0)) return "image/jpeg";
  if (matchesAt(PNG, 0)) return "image/png";
  // WebP is a RIFF container whose form type sits at offset 8.
  if (matchesAt(RIFF, 0) && matchesAt(WEBP, 8)) return "image/webp";
  return null;
}

/** The URL to record for a stored object: the public bucket domain, or the proxied media route. */
export function mediaUrlForKey(key: string): string {
  assertValidStorageKey(key);
  if (ENV.r2PublicBaseUrl) return `${ENV.r2PublicBaseUrl}/${key}`;
  return `${MEDIA_ROUTE_PREFIX}${key}`;
}

/**
 * Build the key for an administrator upload. The prefix is fixed here rather than taken from the
 * request, and the only caller-influenced part is the offer id and the extension, so an upload
 * cannot be steered outside `travel-corner/offers/`.
 */
export function offerImageKey(offerId: number, contentType: MediaContentType, now = Date.now()): string {
  if (!Number.isInteger(offerId) || offerId <= 0) {
    throw new MediaStorageError("An offer id is required to store an image.");
  }
  const extension = ALLOWED_MEDIA_TYPES[contentType];
  if (!extension) throw new MediaStorageError(`Unsupported media type: ${contentType}`);
  return assertValidStorageKey(`travel-corner/offers/${offerId}/${now}.${extension}`);
}

export type PutMediaInput = {
  key: string;
  bytes: Uint8Array;
  contentType: MediaContentType;
};

/**
 * Store an object in R2 and return the key with the URL to record against it.
 * Validation happens before the client is touched, so a rejected upload never reaches the network.
 */
export async function putMedia({ key, bytes, contentType }: PutMediaInput): Promise<{ key: string; url: string }> {
  assertValidStorageKey(key);

  if (!(contentType in ALLOWED_MEDIA_TYPES)) {
    throw new MediaStorageError(`Unsupported media type: ${contentType}`);
  }
  if (!bytes || bytes.length === 0) {
    throw new MediaStorageError("The uploaded file is empty.");
  }
  if (bytes.length > MAX_MEDIA_BYTES) {
    throw new MediaStorageError(`Images must be ${Math.floor(MAX_MEDIA_BYTES / (1024 * 1024))} MB or smaller.`);
  }

  const sniffed = sniffImageType(bytes);
  if (sniffed === null) {
    throw new MediaStorageError("The uploaded file is not a JPEG, PNG or WebP image.");
  }
  if (sniffed !== contentType) {
    // A caller can claim any type; the bytes decide.
    throw new MediaStorageError(`The uploaded file is a ${sniffed} image, not ${contentType}.`);
  }

  await r2Client().send(
    new PutObjectCommand({
      Bucket: ENV.r2Bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    })
  );

  return { key, url: mediaUrlForKey(key) };
}

/**
 * Where a client should be sent to fetch an object: the public URL when the bucket has a public
 * base, otherwise a short-lived signed GET so a private bucket needs no extra configuration.
 */
export async function mediaObjectUrl(key: string): Promise<string> {
  assertValidStorageKey(key);
  if (ENV.r2PublicBaseUrl) return `${ENV.r2PublicBaseUrl}/${key}`;

  return getSignedUrl(
    r2Client(),
    new GetObjectCommand({ Bucket: ENV.r2Bucket, Key: key }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}
