/**
 * Operator-facing error messages for the Travel Corner control room.
 *
 * tRPC forwards a thrown server `Error.message` verbatim, so echoing it into a toast would show raw
 * database text to the operator — for example a duplicate-slug failure surfacing the table and index
 * names. Only messages the application itself defines are shown; everything else falls back to a
 * generic message.
 */
import { MULTI_RATE_HEADLINE_PRICE_ERR_MSG } from "@shared/const";

/** Business refusals that are safe and useful to show exactly as the server phrased them. */
const KNOWN_OPERATOR_MESSAGES: ReadonlySet<string> = new Set([
  MULTI_RATE_HEADLINE_PRICE_ERR_MSG,
]);

function messageOf(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * Return the server's message when it is a known business refusal, otherwise the caller's generic
 * fallback. Unknown server text is never shown.
 */
export function operatorErrorMessage(error: unknown, fallback: string): string {
  const message = messageOf(error);
  return KNOWN_OPERATOR_MESSAGES.has(message) ? message : fallback;
}
