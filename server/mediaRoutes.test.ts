/**
 * Travel Corner — media routes (Phase 2 independent media storage).
 *
 * Drives /media/* and the legacy /manus-storage/* through a real Express app on a loopback socket.
 * The AWS SDK is mocked and `fetch` is stubbed, so nothing reaches Cloudflare or Manus Forge; the
 * stubbed fetch is also the assertion that matters most — once R2 is configured, the media path
 * must not call Forge at all.
 */
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn(async () => ({}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(command: unknown) {
      return sendMock(command as never);
    }
  },
  PutObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
  GetObjectCommand: class {
    constructor(public input: Record<string, unknown>) {}
  },
}));

const getSignedUrlMock = vi.fn(async () => "https://account.r2.cloudflarestorage.com/obj?sig=x");
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...(args as [])),
}));

const MEDIA_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
] as const;

type MediaVar = (typeof MEDIA_ENV)[number];

const R2_CONFIGURED: Partial<Record<MediaVar, string>> = {
  R2_ACCOUNT_ID: "account-under-test",
  R2_BUCKET: "travel-corner-media",
  R2_ACCESS_KEY_ID: "access-key-under-test",
  R2_SECRET_ACCESS_KEY: "secret-key-under-test",
};

const FORGE_CONFIGURED: Partial<Record<MediaVar, string>> = {
  BUILT_IN_FORGE_API_URL: "https://forge.example.com",
  BUILT_IN_FORGE_API_KEY: "forge-key-under-test",
};

const savedEnv: Record<string, string | undefined> = Object.fromEntries(
  MEDIA_ENV.map((key) => [key, process.env[key]])
);

const fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ url: "https://forge.example.com/signed?sig=forge" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
);

type BootedApp = { baseUrl: string; close: () => Promise<void> };

async function bootApp(env: Partial<Record<MediaVar, string>>): Promise<BootedApp> {
  for (const key of MEDIA_ENV) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  vi.resetModules();
  const { registerStorageProxy } = await import("./_core/storageProxy");

  const app = express();
  registerStorageProxy(app);

  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Request the route without following the redirect, using the real fetch rather than the stub. */
function requestMedia(app: BootedApp, path: string) {
  return realFetch(`${app.baseUrl}${path}`, { redirect: "manual" });
}

const realFetch = globalThis.fetch;

beforeEach(() => {
  sendMock.mockClear();
  getSignedUrlMock.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("with R2 configured", () => {
  it("redirects /media/* to a signed URL and never calls Manus Forge", async () => {
    // Forge is configured too, so this proves precedence rather than absence.
    const app = await bootApp({ ...R2_CONFIGURED, ...FORGE_CONFIGURED });
    try {
      const response = await requestMedia(app, "/media/travel-corner/offers/7/a.jpg");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://account.r2.cloudflarestorage.com/obj?sig=x");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("serves the legacy /manus-storage/* route from R2 as well", async () => {
    const app = await bootApp({ ...R2_CONFIGURED, ...FORGE_CONFIGURED });
    try {
      const response = await requestMedia(app, "/manus-storage/travel-corner-hero_7b834ed9.jpg");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://account.r2.cloudflarestorage.com/obj?sig=x");
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("redirects straight to the public bucket URL when one is configured", async () => {
    const app = await bootApp({
      ...R2_CONFIGURED,
      R2_PUBLIC_BASE_URL: "https://media.travelcorner.example",
    });
    try {
      const response = await requestMedia(app, "/media/travel-corner/offers/7/a.jpg");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://media.travelcorner.example/travel-corner/offers/7/a.jpg"
      );
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("rejects a key that tries to escape its prefix, including a percent-encoded one", async () => {
    const app = await bootApp(R2_CONFIGURED);
    try {
      for (const path of [
        "/media/../../etc/passwd",
        "/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "/media/travel-corner%5Cwindows.jpg",
        "/manus-storage/%2e%2e%2fsecrets.jpg",
        "/media/file%20name.jpg",
      ]) {
        const response = await requestMedia(app, path);
        expect([400, 404], `${path} should be refused`).toContain(response.status);
      }

      expect(getSignedUrlMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("answers 400 for a missing key", async () => {
    const app = await bootApp(R2_CONFIGURED);
    try {
      const response = await requestMedia(app, "/media/");

      expect(response.status).toBe(400);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("answers 502 when R2 cannot resolve the object", async () => {
    const app = await bootApp(R2_CONFIGURED);
    try {
      getSignedUrlMock.mockRejectedValueOnce(new Error("r2 unavailable"));

      const response = await requestMedia(app, "/media/travel-corner/offers/7/a.jpg");

      expect(response.status).toBe(502);
    } finally {
      await app.close();
    }
  });
});

describe("without R2 configured", () => {
  it("falls back to Manus Forge so an unmigrated deployment keeps working", async () => {
    const app = await bootApp(FORGE_CONFIGURED);
    try {
      const response = await requestMedia(app, "/manus-storage/travel-corner-hero_7b834ed9.jpg");

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("https://forge.example.com/signed?sig=forge");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("answers 503 when neither backend is configured", async () => {
    const app = await bootApp({});
    try {
      const response = await requestMedia(app, "/manus-storage/travel-corner-hero_7b834ed9.jpg");

      expect(response.status).toBe(503);
      expect(await response.text()).toMatch(/not configured/i);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("still validates the key before contacting Forge", async () => {
    const app = await bootApp(FORGE_CONFIGURED);
    try {
      const response = await requestMedia(app, "/manus-storage/%2e%2e%2fsecrets.jpg");

      expect([400, 404]).toContain(response.status);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
