/**
 * Travel Corner — analytics tag handling in the built HTML (Phase 3b).
 *
 * The production page used to ship `src="%VITE_ANALYTICS_ENDPOINT%/umami"` verbatim whenever the
 * analytics variables were unset, so every page load fetched a path that could not exist. These
 * cover the two directions that matter: an unconfigured tag is removed, and a configured one is left
 * exactly as it is.
 */
import { describe, expect, it } from "vitest";
import {
  ANALYTICS_PLACEHOLDERS,
  hasUnresolvedAnalyticsPlaceholder,
  stripUnconfiguredAnalytics,
} from "@shared/analyticsHtml";

/** The tag as client/index.html carries it, before Vite substitutes anything. */
const UNCONFIGURED =
  '    <script defer src="%VITE_ANALYTICS_ENDPOINT%/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>\n';

/** The same tag after Vite substituted both variables. */
const CONFIGURED =
  '    <script defer src="https://analytics.example.com/umami" data-website-id="site-123"></script>\n';

function page(tag: string): string {
  return `<!doctype html>\n<html>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/assets/index.js"></script>\n${tag}  </body>\n</html>\n`;
}

describe("unconfigured analytics", () => {
  it("removes the tag that still carries placeholders", () => {
    const html = stripUnconfiguredAnalytics(page(UNCONFIGURED));

    expect(html).not.toContain("umami");
    for (const placeholder of ANALYTICS_PLACEHOLDERS) expect(html).not.toContain(placeholder);
  });

  it("leaves the rest of the document intact", () => {
    const html = stripUnconfiguredAnalytics(page(UNCONFIGURED));

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<script type="module" src="/assets/index.js"></script>');
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
    // No blank line is left where the tag was.
    expect(html).not.toMatch(/\n[ \t]*\n[ \t]*<\/body>/);
  });

  it("removes the tag when only one variable was supplied", () => {
    const halfConfigured =
      '    <script defer src="https://analytics.example.com/umami" data-website-id="%VITE_ANALYTICS_WEBSITE_ID%"></script>\n';

    // A half-configured tag would still request a broken URL, so it goes too.
    expect(stripUnconfiguredAnalytics(page(halfConfigured))).not.toContain("umami");
  });
});

describe("configured analytics", () => {
  it("ships the substituted tag untouched", () => {
    const html = page(CONFIGURED);

    expect(stripUnconfiguredAnalytics(html)).toBe(html);
    expect(stripUnconfiguredAnalytics(html)).toContain("https://analytics.example.com/umami");
    expect(stripUnconfiguredAnalytics(html)).toContain('data-website-id="site-123"');
  });

  it("leaves a document with no analytics tag alone", () => {
    const html = page("");

    expect(stripUnconfiguredAnalytics(html)).toBe(html);
  });

  it("touches no other script, even one whose own placeholder is unresolved", () => {
    const other = '    <script defer src="%VITE_SOMETHING_ELSE%/app.js"></script>\n';
    const html = page(other);

    // Only the analytics placeholders are this transform's business.
    expect(stripUnconfiguredAnalytics(html)).toBe(html);
  });
});

describe("placeholder detection", () => {
  it("reports whether a document is still unconfigured", () => {
    expect(hasUnresolvedAnalyticsPlaceholder(page(UNCONFIGURED))).toBe(true);
    expect(hasUnresolvedAnalyticsPlaceholder(page(CONFIGURED))).toBe(false);
    expect(hasUnresolvedAnalyticsPlaceholder(page(""))).toBe(false);
  });
});
