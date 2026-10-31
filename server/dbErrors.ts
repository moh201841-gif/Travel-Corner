/**
 * Translate database write failures into messages an operator can act on.
 *
 * Why this module exists: tRPC forwards a thrown `Error.message` verbatim to the browser, so the
 * dashboard deliberately refuses to display any server message it does not recognise — otherwise a
 * duplicate-key failure would print the table and index names into a toast. The side effect was
 * that *every* failure in the control room looked the same ("the hotel package could not be
 * saved"), and the only way to learn the actual reason was to read the host's log. An operator with
 * no log access therefore could not tell "pick a different slug" from "the migrations were never
 * applied" — two problems with completely different remedies.
 *
 * So the driver's error code is mapped here to one of a small number of messages that are both safe
 * to disclose (they name no schema object, no credential and no host) and actionable. Anything
 * unrecognised is re-thrown unchanged, which keeps the dashboard's generic fallback for it: adding a
 * new failure mode can never start leaking database text by accident.
 *
 * The original error is always logged in full, so nothing is lost for whoever can read the log.
 */
import {
  DATABASE_UNREACHABLE_ERR_MSG,
  DUPLICATE_SLUG_ERR_MSG,
  OPERATOR_SAFE_ERR_MSGS,
  SCHEMA_OUT_OF_DATE_ERR_MSG,
} from "@shared/const";

/** mysql2 surfaces a `code` string on driver errors; Node surfaces one on socket/TLS errors. */
function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "";
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * The code refers to a column, table or database the server expects and the database does not have.
 * In practice this means the committed migrations have not been applied to this database.
 */
const SCHEMA_CODES = new Set([
  "ER_BAD_FIELD_ERROR", // Unknown column '…' in 'field list'
  "ER_NO_SUCH_TABLE", // Table '….travelOffers' doesn't exist
  "ER_BAD_DB_ERROR", // Unknown database '…'
  "ER_WRONG_COLUMN_NAME",
  "ER_NO_SUCH_INDEX",
  "ER_KEY_COLUMN_DOES_NOT_EXITS",
]);

/**
 * The database was not reached, not authenticated against, or the connection dropped. Includes the
 * TLS failures the Aiven CA configuration can produce, because from the operator's seat they are
 * the same event: nothing was written and the remedy is not in the form they are filling in.
 */
const UNREACHABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_SEQUENCE_TIMEOUT",
  "ER_CON_COUNT_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
  "ER_LOCK_WAIT_TIMEOUT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_HAS_EXPIRED",
]);

/** True for a message the dashboard is already allowed to show, so it must pass through untouched. */
function isAlreadyOperatorSafe(error: unknown): boolean {
  return OPERATOR_SAFE_ERR_MSGS.includes(errorMessage(error));
}

/**
 * The operator-facing error for a failed write, or the original error when nothing is safe to say
 * about it. Never returns a message built from driver text.
 */
export function operatorSafeDbError(error: unknown): unknown {
  if (isAlreadyOperatorSafe(error)) return error;

  const code = errorCode(error);

  if (code === "ER_DUP_ENTRY") {
    // travelOffers, umrahPrograms and campaigns each carry exactly one unique key, on `slug`, so a
    // duplicate-entry failure on a content write is a slug collision. The index name is checked
    // rather than assumed, because a future unique key would otherwise be reported as a slug clash.
    if (/slug/i.test(errorMessage(error))) return new Error(DUPLICATE_SLUG_ERR_MSG);
    return error;
  }
  if (SCHEMA_CODES.has(code)) return new Error(SCHEMA_OUT_OF_DATE_ERR_MSG);
  if (UNREACHABLE_CODES.has(code)) return new Error(DATABASE_UNREACHABLE_ERR_MSG);

  return error;
}

/**
 * Run a database write and re-throw its failure as an operator-facing error where one exists.
 *
 * `context` identifies the operation in the log only; it is never sent to the client.
 */
export async function withOperatorSafeDbErrors<T>(context: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const translated = operatorSafeDbError(error);
    // Logged whether or not a translation was found: the full driver error is the only record of
    // what actually happened, and the client is never told more than the message above.
    if (translated !== error) {
      console.error(`[Database] ${context} failed (${errorCode(error) || "no code"}):`, error);
    } else {
      console.error(`[Database] ${context} failed:`, error);
    }
    throw translated;
  }
}
