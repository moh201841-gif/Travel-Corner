/**
 * Travel Corner — inventory of static assets still hosted by Manus (Phase 2).
 *
 * The brand and editorial images are referenced by URL only; no copy of them exists in the
 * repository (`client/public` holds no images). They live in Manus Forge storage, so off-platform
 * they do not load, and once R2 is configured the media route will answer 404 for them until the
 * files themselves are recovered and uploaded.
 *
 * Recovering them is deliberately a separate task from the R2 implementation, so this test does the
 * one thing that is useful now: it pins the exact recovery list, and fails if a new Manus-hosted
 * reference is added or an inventoried one disappears. docs/media-storage.md carries the procedure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_MEDIA_ROUTE_PREFIX, isValidStorageKey } from "./_core/mediaStorage";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/** Files that reference the static assets. The server's own route definitions are not asset uses. */
const SOURCE_FILES = [
  "client/index.html",
  "client/src/data/travelData.ts",
] as const;

/**
 * The complete set of objects that must later be recovered from Manus storage (or replaced by the
 * owner) and uploaded to R2 under exactly these keys, so every existing reference resolves.
 */
const ASSETS_TO_RECOVER = [
  "travel-corner-dubai_9f765ca5.jpg",
  "travel-corner-hero_7b834ed9.jpg",
  "travel-corner-hurghada-editorial_79677206.jpg",
  "travel-corner-maldives_08394876.jpg",
  "travel-corner-mark_68e5868a.png",
  "travel-corner-official-logo_25ee64eb.jpg",
  "travel-corner-paris-alps_6e640794.jpg",
  "travel-corner-sharm-editorial_a1a4794f.jpg",
  "travel-corner-umrah-editorial_32b3518d.jpg",
] as const;

function referencedKeys(): string[] {
  const pattern = new RegExp(`${LEGACY_MEDIA_ROUTE_PREFIX}([A-Za-z0-9._/-]+)`, "g");
  const keys = new Set<string>();

  for (const file of SOURCE_FILES) {
    const contents = readFileSync(path.join(REPO_ROOT, file), "utf8");
    for (const [, key] of contents.matchAll(pattern)) keys.add(key!);
  }

  return [...keys].sort();
}

describe("static assets still hosted by Manus", () => {
  it("matches the recorded recovery list exactly", () => {
    // Fails in both directions: a new Manus-hosted reference, or an inventoried one removed.
    expect(referencedKeys()).toEqual([...ASSETS_TO_RECOVER].sort());
  });

  it("reads the references, so the comparison cannot pass on an empty set", () => {
    const keys = referencedKeys();

    expect(keys.length).toBe(ASSETS_TO_RECOVER.length);
    expect(keys.length).toBeGreaterThan(5);
    for (const key of keys) expect(key).toMatch(/^travel-corner[A-Za-z0-9._-]*\.(jpg|png|webp)$/);
  });

  it("has no copy of them in the repository, which is why they must be recovered", () => {
    for (const key of ASSETS_TO_RECOVER) {
      expect(() => readFileSync(path.join(REPO_ROOT, "client", "public", key))).toThrow();
    }
  });

  it("can be uploaded to R2 under the same keys the references already use", () => {
    // Each reference is root-relative and served by the compatibility route, so recovery is simply
    // uploading the file under this key. A key the storage layer would reject could not be restored
    // without also editing every reference to it.
    for (const key of ASSETS_TO_RECOVER) {
      expect(isValidStorageKey(key), `${key} would be rejected by the storage layer`).toBe(true);
    }
  });
});
