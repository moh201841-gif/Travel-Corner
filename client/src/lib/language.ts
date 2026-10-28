/**
 * Travel Corner language resolution.
 *
 * Previously duplicated as `languageFromPath` in OfficialOffers.tsx and `routeLanguage` in
 * TravelPages.tsx. Consolidated here so route language, document language, and reading direction
 * cannot drift apart.
 */
import type { Language } from "@/data/travelData";

export const DEFAULT_LANGUAGE: Language = "en";

/** Reading direction for a language, kept beside the language so the two are always decided together. */
export function directionFor(lang: Language): "rtl" | "ltr" {
  return lang === "ar" ? "rtl" : "ltr";
}

/**
 * Resolve the language from a route path.
 * Only the `/ar` prefix and its sub-paths are Arabic; everything else (including `/admin`,
 * unmatched routes, and the bare root) falls back to the default.
 */
export function languageFromPath(pathname: string): Language {
  if (pathname === "/ar" || pathname.startsWith("/ar/")) return "ar";
  return DEFAULT_LANGUAGE;
}

/** Read the language from the live browser location. Thin wrapper so components stay declarative. */
export function currentLanguage(): Language {
  if (typeof window === "undefined") return DEFAULT_LANGUAGE;
  return languageFromPath(window.location.pathname);
}

type DocumentRoot = { lang: string; dir: string };

/**
 * Apply language and reading direction to the document root.
 *
 * The root element is injectable so this stays unit-testable without a DOM. The wrapper element in
 * TravelLayout keeps its own `dir`, so every existing `[dir="rtl"] .x` descendant rule continues to
 * match exactly as before; setting it here additionally covers portalled UI (toasts, tooltips) that
 * renders outside the layout wrapper.
 */
export function applyDocumentLanguage(lang: Language, root?: DocumentRoot): void {
  const target = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!target) return;
  target.lang = lang;
  target.dir = directionFor(lang);
}
