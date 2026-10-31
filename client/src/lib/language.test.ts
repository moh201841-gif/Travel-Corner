/** Route language resolution and document language/direction — previously duplicated in two pages. */
import { describe, expect, it } from "vitest";
import { applyDocumentLanguage, directionFor, languageFromPath } from "./language";

describe("languageFromPath", () => {
  it("resolves Arabic for the Arabic prefix and its sub-paths", () => {
    expect(languageFromPath("/ar")).toBe("ar");
    expect(languageFromPath("/ar/packages")).toBe("ar");
    expect(languageFromPath("/ar/umrah/first-umrah")).toBe("ar");
  });

  it("resolves English for English routes and the root", () => {
    expect(languageFromPath("/")).toBe("en");
    expect(languageFromPath("/en")).toBe("en");
    expect(languageFromPath("/en/packages")).toBe("en");
  });

  it("does not treat the admin route or unmatched routes as Arabic", () => {
    expect(languageFromPath("/admin")).toBe("en");
    expect(languageFromPath("/nonsense")).toBe("en");
  });

  it("does not match a path that merely starts with the letters 'ar'", () => {
    // The previous `startsWith("/ar")` check would have classified these as Arabic.
    expect(languageFromPath("/article")).toBe("en");
    expect(languageFromPath("/arrivals")).toBe("en");
  });
});

describe("directionFor", () => {
  it("pairs Arabic with RTL and English with LTR", () => {
    expect(directionFor("ar")).toBe("rtl");
    expect(directionFor("en")).toBe("ltr");
  });
});

describe("applyDocumentLanguage", () => {
  it("writes both language and direction to the document root", () => {
    const root = { lang: "en", dir: "ltr" };
    applyDocumentLanguage("ar", root);
    expect(root).toEqual({ lang: "ar", dir: "rtl" });
  });

  it("resets cleanly when moving back to an English route", () => {
    const root = { lang: "ar", dir: "rtl" };
    applyDocumentLanguage("en", root);
    expect(root).toEqual({ lang: "en", dir: "ltr" });
  });
});
