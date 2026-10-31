/**
 * Travel Corner — R2 media storage (Phase 2 independent media storage).
 *
 * The AWS SDK is mocked, so nothing here reaches Cloudflare or any network: the tests assert what
 * the module *would* send. What matters is the validation that happens before anything is sent —
 * key allowlisting, the size ceiling, and checking the declared content type against the file's
 * real magic bytes — plus the URL the caller is told to record.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(async () => ({}));
const s3Configs: Record<string, unknown>[] = [];
const putInputs: Record<string, unknown>[] = [];
const getInputs: Record<string, unknown>[] = [];

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: Record<string, unknown>) {
      s3Configs.push(config);
    }
    send(command: unknown) {
      return sendMock(command as never);
    }
  },
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {
      putInputs.push(input);
    }
  },
  GetObjectCommand: class {
    constructor(public input: Record<string, unknown>) {
      getInputs.push(input);
    }
  },
}));

const getSignedUrlMock = vi.fn(async () => "https://account.r2.cloudflarestorage.com/signed?sig=x");
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...(args as [])),
}));

const R2_ENV = {
  R2_ACCOUNT_ID: "account-under-test",
  R2_BUCKET: "travel-corner-media",
  R2_ACCESS_KEY_ID: "access-key-under-test",
  R2_SECRET_ACCESS_KEY: "secret-key-under-test",
  R2_ENDPOINT: undefined,
  R2_PUBLIC_BASE_URL: undefined,
} as const;

type R2Var = keyof typeof R2_ENV;

/** Load the module in a fresh generation so its ENV snapshot reflects this case's environment. */
async function loadMediaStorage(overrides: Partial<Record<R2Var, string | undefined>> = {}) {
  const env = { ...R2_ENV, ...overrides };
  for (const key of Object.keys(env) as R2Var[]) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import("./_core/mediaStorage");
}

function imageBytes(kind: "jpeg" | "png" | "webp", size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  if (kind === "jpeg") {
    bytes.set([0xff, 0xd8, 0xff], 0);
  } else if (kind === "png") {
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  } else {
    bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  }
  return bytes;
}

beforeEach(() => {
  sendMock.mockClear();
  getSignedUrlMock.mockClear();
  s3Configs.length = 0;
  putInputs.length = 0;
  getInputs.length = 0;
});

describe("configuration", () => {
  it("is configured once endpoint, bucket and credentials are present", async () => {
    const media = await loadMediaStorage();
    expect(media.isR2Configured()).toBe(true);
    expect(media.r2ConfigError()).toBeNull();
  });

  it("derives the S3 endpoint from the account id and accepts an explicit override", async () => {
    let media = await loadMediaStorage();
    media.r2Client();
    expect(s3Configs[0]?.endpoint).toBe("https://account-under-test.r2.cloudflarestorage.com");
    expect(s3Configs[0]?.region).toBe("auto");

    s3Configs.length = 0;
    media = await loadMediaStorage({ R2_ENDPOINT: "https://custom.example.com/" });
    media.r2Client();
    // The trailing slash is trimmed so keys do not end up double-slashed.
    expect(s3Configs[0]?.endpoint).toBe("https://custom.example.com");
  });

  it("reports each missing setting by name and never includes a credential value", async () => {
    for (const missing of ["R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"] as R2Var[]) {
      const media = await loadMediaStorage({ [missing]: undefined });
      const error = media.r2ConfigError() ?? "";

      expect(media.isR2Configured()).toBe(false);
      expect(error).toContain(missing);
      expect(error).not.toContain("secret-key-under-test");
      expect(error).not.toContain("access-key-under-test");
    }

    const noEndpoint = await loadMediaStorage({ R2_ACCOUNT_ID: undefined, R2_ENDPOINT: undefined });
    expect(noEndpoint.isR2Configured()).toBe(false);
    expect(noEndpoint.r2ConfigError()).toMatch(/R2_ENDPOINT|R2_ACCOUNT_ID/);
  });

  it("refuses to build a client, rather than sending anywhere, when unconfigured", async () => {
    const media = await loadMediaStorage({ R2_BUCKET: undefined });

    expect(() => media.r2Client()).toThrow(/not configured/i);
    expect(s3Configs).toEqual([]);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("storage key validation", () => {
  it("accepts the keys the application actually produces", async () => {
    const media = await loadMediaStorage();

    for (const key of [
      "travel-corner/offers/12/1730000000000.jpg",
      "travel-corner-hero_7b834ed9.jpg",
      "a",
      "nested/deep/path/file.webp",
    ]) {
      expect(media.isValidStorageKey(key), `${key} should be accepted`).toBe(true);
    }
  });

  it("refuses a key that could escape its prefix or address something else", async () => {
    const media = await loadMediaStorage();

    const rejected = [
      "",
      "   ",
      "/leading-slash.jpg",
      "../secrets.jpg",
      "travel-corner/../../etc/passwd",
      "travel-corner/./file.jpg",
      "travel-corner//file.jpg",
      "travel-corner\\windows.jpg",
      "https://evil.example.com/file.jpg",
      "file name with spaces.jpg",
      "file\u0000.jpg",
      "file\n.jpg",
      "trailing/",
      ".hidden",
      "a".repeat(301),
    ];

    for (const key of rejected) {
      expect(media.isValidStorageKey(key), `${JSON.stringify(key)} should be rejected`).toBe(false);
      expect(() => media.assertValidStorageKey(key)).toThrow();
    }
  });

  it("builds an offer key under a server-fixed prefix and rejects a bad offer id", async () => {
    const media = await loadMediaStorage();

    const key = media.offerImageKey(12, "image/webp", 1730000000000);
    expect(key).toBe("travel-corner/offers/12/1730000000000.webp");
    expect(media.offerImageKey(3, "image/jpeg", 1)).toBe("travel-corner/offers/3/1.jpg");
    expect(media.offerImageKey(3, "image/png", 1)).toBe("travel-corner/offers/3/1.png");

    for (const badId of [0, -1, 1.5, Number.NaN]) {
      expect(() => media.offerImageKey(badId, "image/jpeg")).toThrow(/offer id/i);
    }
  });
});

describe("image sniffing", () => {
  it("identifies each accepted format from its magic bytes", async () => {
    const media = await loadMediaStorage();

    expect(media.sniffImageType(imageBytes("jpeg"))).toBe("image/jpeg");
    expect(media.sniffImageType(imageBytes("png"))).toBe("image/png");
    expect(media.sniffImageType(imageBytes("webp"))).toBe("image/webp");
  });

  it("returns null for anything that is not one of them", async () => {
    const media = await loadMediaStorage();

    expect(media.sniffImageType(new Uint8Array(0))).toBeNull();
    expect(media.sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull(); // truncated JPEG
    // A RIFF container that is not WebP (e.g. a WAV) must not pass as an image.
    const riffOnly = new Uint8Array(16);
    riffOnly.set([0x52, 0x49, 0x46, 0x46], 0);
    riffOnly.set([0x57, 0x41, 0x56, 0x45], 8);
    expect(media.sniffImageType(riffOnly)).toBeNull();
    // A script that merely claims to be an image.
    expect(media.sniffImageType(new TextEncoder().encode("<?php echo 1; ?>"))).toBeNull();
  });
});

describe("putMedia", () => {
  it("stores the object once, with the bucket, key and content type it was given", async () => {
    const media = await loadMediaStorage();
    const bytes = imageBytes("jpeg");

    const stored = await media.putMedia({
      key: "travel-corner/offers/7/1730000000000.jpg",
      bytes,
      contentType: "image/jpeg",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(putInputs).toHaveLength(1);
    expect(putInputs[0]).toMatchObject({
      Bucket: "travel-corner-media",
      Key: "travel-corner/offers/7/1730000000000.jpg",
      ContentType: "image/jpeg",
    });
    expect(putInputs[0]!.Body).toBe(bytes);
    expect(stored.key).toBe("travel-corner/offers/7/1730000000000.jpg");
  });

  it("returns the proxied media route when the bucket has no public base URL", async () => {
    const media = await loadMediaStorage();

    const stored = await media.putMedia({
      key: "travel-corner/offers/7/a.png",
      bytes: imageBytes("png"),
      contentType: "image/png",
    });

    expect(stored.url).toBe("/media/travel-corner/offers/7/a.png");
  });

  it("returns the public bucket URL when one is configured", async () => {
    const media = await loadMediaStorage({ R2_PUBLIC_BASE_URL: "https://media.travelcorner.example/" });

    const stored = await media.putMedia({
      key: "travel-corner/offers/7/a.png",
      bytes: imageBytes("png"),
      contentType: "image/png",
    });

    expect(stored.url).toBe("https://media.travelcorner.example/travel-corner/offers/7/a.png");
  });

  it("refuses an upload whose bytes do not match the declared content type", async () => {
    const media = await loadMediaStorage();

    // A PNG announced as a JPEG: the bytes decide, and nothing is sent.
    await expect(
      media.putMedia({ key: "travel-corner/offers/7/a.jpg", bytes: imageBytes("png"), contentType: "image/jpeg" })
    ).rejects.toThrow(/image\/png image, not image\/jpeg/);

    await expect(
      media.putMedia({
        key: "travel-corner/offers/7/a.jpg",
        bytes: new TextEncoder().encode("#!/bin/sh\nrm -rf /\n"),
        contentType: "image/jpeg",
      })
    ).rejects.toThrow(/not a JPEG, PNG or WebP/i);

    expect(sendMock).not.toHaveBeenCalled();
    expect(putInputs).toEqual([]);
  });

  it("refuses an empty file, an oversized file, a bad key and an unsupported type without sending", async () => {
    const media = await loadMediaStorage();
    const key = "travel-corner/offers/7/a.jpg";

    await expect(media.putMedia({ key, bytes: new Uint8Array(0), contentType: "image/jpeg" })).rejects.toThrow(/empty/i);

    const oversized = imageBytes("jpeg", media.MAX_MEDIA_BYTES + 1);
    await expect(media.putMedia({ key, bytes: oversized, contentType: "image/jpeg" })).rejects.toThrow(/5 MB or smaller/);

    await expect(
      media.putMedia({ key: "../escape.jpg", bytes: imageBytes("jpeg"), contentType: "image/jpeg" })
    ).rejects.toThrow();

    await expect(
      media.putMedia({ key, bytes: imageBytes("jpeg"), contentType: "image/gif" as never })
    ).rejects.toThrow(/unsupported media type/i);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it("accepts a file exactly on the size limit", async () => {
    const media = await loadMediaStorage();

    await expect(
      media.putMedia({
        key: "travel-corner/offers/7/a.jpg",
        bytes: imageBytes("jpeg", media.MAX_MEDIA_BYTES),
        contentType: "image/jpeg",
      })
    ).resolves.toMatchObject({ key: "travel-corner/offers/7/a.jpg" });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe("mediaObjectUrl", () => {
  it("signs a short-lived GET when the bucket is private", async () => {
    const media = await loadMediaStorage();

    const url = await media.mediaObjectUrl("travel-corner/offers/7/a.jpg");

    expect(url).toBe("https://account.r2.cloudflarestorage.com/signed?sig=x");
    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
    expect(getInputs[0]).toMatchObject({ Bucket: "travel-corner-media", Key: "travel-corner/offers/7/a.jpg" });
    const options = getSignedUrlMock.mock.calls[0]![2] as { expiresIn: number };
    expect(options.expiresIn).toBe(media.SIGNED_URL_TTL_SECONDS);
    expect(options.expiresIn).toBeLessThanOrEqual(3600);
  });

  it("uses the public base URL without signing when one is configured", async () => {
    const media = await loadMediaStorage({ R2_PUBLIC_BASE_URL: "https://media.travelcorner.example" });

    const url = await media.mediaObjectUrl("travel-corner/offers/7/a.jpg");

    expect(url).toBe("https://media.travelcorner.example/travel-corner/offers/7/a.jpg");
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("refuses to resolve an invalid key", async () => {
    const media = await loadMediaStorage();

    await expect(media.mediaObjectUrl("../../secrets")).rejects.toThrow();
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });
});
