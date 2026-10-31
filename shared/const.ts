export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// Raised when the offer editor's single headline price cannot be applied because the package has
// several price periods. Shared so the admin UI can recognise this one known business refusal and
// show it verbatim, while every other server failure falls back to a generic message rather than
// leaking raw database error text to the operator.
export const MULTI_RATE_HEADLINE_PRICE_ERR_MSG = 'This package has more than one price period, so the headline price cannot be applied here. Use "Price periods & occupancy" to edit the intended period (10003)';

// The Umrah equivalent. A program normally carries several occupancies (Quad/Triple/Double), so the
// single "Starting price" field cannot say which one it means; the editor must send no price and the
// server refuses if one arrives anyway.
export const MULTI_RATE_UMRAH_PRICE_ERR_MSG = 'This program has more than one occupancy rate, so the starting price cannot be applied here. Use "Occupancy rates" to edit the intended room type (10004)';

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};
