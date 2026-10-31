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

// ---------------------------------------------------------------------------
// Operator-safe failure messages for the admin control room.
//
// A thrown server Error.message is forwarded verbatim by tRPC, so raw driver text would otherwise
// reach the operator's browser — which is why the dashboard refuses to display anything it does not
// recognise. The result was that every save failure looked identical ("could not be saved"), with
// the actual reason visible only in the host's logs. These constants name the reasons that are both
// safe to disclose and actionable, so the dashboard can show them verbatim and the operator can
// tell a duplicate slug from an unapplied migration without reading a server log.
// ---------------------------------------------------------------------------

/** A unique slug is already taken by another record. */
export const DUPLICATE_SLUG_ERR_MSG = 'Another record already uses this web address (slug). Choose a different slug (10005)';

/** The database is missing a column or table the code writes, i.e. migrations have not been applied. */
export const SCHEMA_OUT_OF_DATE_ERR_MSG = 'The database schema is out of date, so nothing was saved. The pending database migrations have to be applied before content can be edited (10006)';

/** The database could not be reached or authenticated against. Nothing was written. */
export const DATABASE_UNREACHABLE_ERR_MSG = 'The database could not be reached, so nothing was saved. Try again in a moment (10007)';

/** An image upload was attempted while no media storage backend is configured. */
export const MEDIA_STORAGE_UNCONFIGURED_ERR_MSG = 'Image storage is not configured yet, so images cannot be uploaded. Cloudflare R2 has to be set up first (10008)';

/**
 * Every message above, plus the two headline-price refusals. The dashboard shows a server message
 * verbatim only when it is in this set; anything else falls back to a generic sentence, so adding a
 * new server error can never start leaking database text into the UI by accident.
 */
export const OPERATOR_SAFE_ERR_MSGS: readonly string[] = [
  MULTI_RATE_HEADLINE_PRICE_ERR_MSG,
  MULTI_RATE_UMRAH_PRICE_ERR_MSG,
  DUPLICATE_SLUG_ERR_MSG,
  SCHEMA_OUT_OF_DATE_ERR_MSG,
  DATABASE_UNREACHABLE_ERR_MSG,
  MEDIA_STORAGE_UNCONFIGURED_ERR_MSG,
];
