/**
 * Build-time helper: drop the analytics tag when analytics is not configured.
 *
 * client/index.html carries an optional Umami tag whose attributes use Vite's `%VAR%` syntax. Vite
 * substitutes those from the loaded environment, but when the variables are absent it leaves the
 * placeholders in the HTML verbatim — so the shipped page asked the browser for
 * `https://<host>/%VITE_ANALYTICS_ENDPOINT%/umami` and 404'd on every page load.
 *
 * This runs as a `post` HTML transform, after Vite has done its substitution, so the rule is simply:
 * a placeholder that is still present was never configured, and the tag carrying it is removed. When
 * the variables *are* set nothing remains to match and the tag ships untouched, so configuring
 * analytics keeps working exactly as before.
 *
 * Used by vite.config.ts only; it is not part of the application bundle.
 */

/** The placeholders client/index.html uses for the analytics tag. */
export const ANALYTICS_PLACEHOLDERS = ["%VITE_ANALYTICS_ENDPOINT%", "%VITE_ANALYTICS_WEBSITE_ID%"] as const;

/** Matches a <script> element that still carries an unsubstituted analytics placeholder. */
const UNRESOLVED_ANALYTICS_TAG =
  /[ \t]*<script\b[^>]*%VITE_ANALYTICS_(?:ENDPOINT|WEBSITE_ID)%[^>]*>\s*<\/script>[ \t]*\r?\n?/g;

/** True when the HTML still contains an unsubstituted analytics placeholder. */
export function hasUnresolvedAnalyticsPlaceholder(html: string): boolean {
  return ANALYTICS_PLACEHOLDERS.some((placeholder) => html.includes(placeholder));
}

/**
 * Remove any script element carrying an unresolved analytics placeholder.
 * Returns the HTML unchanged when analytics was configured, or when there is no such tag.
 */
export function stripUnconfiguredAnalytics(html: string): string {
  if (!hasUnresolvedAnalyticsPlaceholder(html)) return html;
  return html.replace(UNRESOLVED_ANALYTICS_TAG, "");
}
