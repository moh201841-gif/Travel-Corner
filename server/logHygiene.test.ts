/**
 * Travel Corner — the two log lines the production report singled out.
 *
 * Neither was a fault in itself, and that is exactly why they mattered: both are printed on an
 * ordinary request, so they filled the host's log and buried the lines that do mean something.
 *
 *   "[Media] no media backend configured: set the R2 variables" — printed once per request. The
 *   static brand and editorial images are still referenced under /manus-storage/, so an
 *   unconfigured deployment printed it several times on every single page load.
 *
 *   "[Auth] Missing session cookie" — printed for every request without a session cookie, which is
 *   every request from a signed-out visitor, because each page calls auth.me once.
 *
 * Reducing both is only safe if nothing diagnostic is lost, so these cases also pin what must still
 * be reported: the condition is still stated once, with its suppressed count available, and a
 * cookie that is present and fails verification is still warned about.
 */
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerStorageProxy, resetMediaBackendNotice, unconfiguredBackendRequestCount } from "./_core/storageProxy";
import { sdk } from "./_core/sdk";

const R2_AND_FORGE_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ENDPOINT",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "BUILT_IN_FORGE_API_URL",
  "BUILT_IN_FORGE_API_KEY",
] as const;

describe("the unconfigured media backend notice", () => {
  const saved = new Map<string, string | undefined>();
  let server: Server;
  let baseUrl = "";

  beforeEach(async () => {
    for (const name of R2_AND_FORGE_ENV) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }
    resetMediaBackendNotice();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const app = express();
    registerStorageProxy(app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    saved.clear();
    vi.restoreAllMocks();
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  /** The nine static assets the site still references under /manus-storage/. */
  const STATIC_ASSETS = [
    "travel-corner-hero_7b834ed9.jpg",
    "travel-corner-official-logo_25ee64eb.jpg",
    "travel-corner-mark_68e5868a.png",
    "travel-corner-sharm-editorial_a1a4794f.jpg",
    "travel-corner-hurghada-editorial_79677206.jpg",
    "travel-corner-umrah-editorial_32b3518d.jpg",
    "travel-corner-paris-alps_6e640794.jpg",
    "travel-corner-maldives_08394876.jpg",
    "travel-corner-dubai_9f765ca5.jpg",
  ];

  it("still answers 503 for every request", async () => {
    const statuses = await Promise.all(
      STATIC_ASSETS.map(async (asset) => (await fetch(`${baseUrl}/manus-storage/${asset}`)).status)
    );

    // Behaviour is unchanged; only the logging is.
    expect(statuses).toEqual(STATIC_ASSETS.map(() => 503));
  });

  it("is printed once however many requests arrive", async () => {
    for (const asset of STATIC_ASSETS) {
      await fetch(`${baseUrl}/manus-storage/${asset}`);
    }
    await fetch(`${baseUrl}/media/travel-corner/offers/1/1.jpg`);

    expect(console.error).toHaveBeenCalledTimes(1);
    expect(unconfiguredBackendRequestCount()).toBe(STATIC_ASSETS.length + 1);
  });

  it("names the variables to set and says it will not repeat", async () => {
    await fetch(`${baseUrl}/manus-storage/${STATIC_ASSETS[0]}`);

    const [line] = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect(String(line)).toContain("no media backend configured");
    expect(String(line)).toContain(".env.example");
    expect(String(line)).toContain("once per process");
  });

  it("prints it again in a fresh process", async () => {
    await fetch(`${baseUrl}/manus-storage/${STATIC_ASSETS[0]}`);
    expect(console.error).toHaveBeenCalledTimes(1);

    // resetMediaBackendNotice stands in for a restart: a redeploy that is still unconfigured must
    // say so, otherwise the condition could go unreported after the first deploy that logged it.
    resetMediaBackendNotice();
    await fetch(`${baseUrl}/manus-storage/${STATIC_ASSETS[0]}`);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

describe("session verification logging", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says nothing when there is no cookie, which is every signed-out request", async () => {
    await expect(sdk.verifySession(undefined)).resolves.toBeNull();
    await expect(sdk.verifySession(null)).resolves.toBeNull();
    await expect(sdk.verifySession("")).resolves.toBeNull();

    expect(console.warn).not.toHaveBeenCalled();
  });

  it("still warns when a cookie is present and cannot be verified", async () => {
    // A cookie that fails is a real signal: a rotated JWT_SECRET, a tampered value, an expired
    // session. Silencing the absent-cookie case must not silence this one.
    await expect(sdk.verifySession("not-a-jwt")).resolves.toBeNull();

    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(String((console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![0])).toContain(
      "Session verification failed"
    );
  });

});
