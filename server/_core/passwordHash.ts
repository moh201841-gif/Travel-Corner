/**
 * Administrator password hashing primitives.
 *
 * Kept in a module of its own, importing nothing but node:crypto, so that `pnpm admin:hash` can
 * generate a hash without loading the server's module graph — which would otherwise print OAuth
 * configuration warnings onto the same stdout the operator copies the hash from.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Promise wrapper for scrypt. Written by hand rather than with promisify, whose typings only cover
 * the 3-argument overload and therefore reject the cost parameters we must pass.
 */
function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

const KEY_LENGTH = 64;
const DEFAULT_COST = { N: 16384, r: 8, p: 1 } as const;

/** Identifies the hash format so the algorithm can be changed later without ambiguity. */
export const ADMIN_HASH_SCHEME = "scrypt";

/** Build a storable `scrypt$N$r$p$salt$hash` digest. Used by the `pnpm admin:hash` helper. */
export async function hashAdminPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Administrator password must be at least 12 characters.");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, { ...DEFAULT_COST });
  return [
    ADMIN_HASH_SCHEME,
    DEFAULT_COST.N,
    DEFAULT_COST.r,
    DEFAULT_COST.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Constant-time verification against a stored digest.
 * Returns false for a malformed digest rather than throwing, so a misconfigured hash cannot be
 * distinguished from a wrong password by the caller.
 */
export async function verifyAdminPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  if (typeof stored !== "string") return false;

  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [scheme, rawN, rawR, rawP, saltB64, hashB64] = parts;
  if (scheme !== ADMIN_HASH_SCHEME) return false;

  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltB64, "base64");
    expected = Buffer.from(hashB64, "base64");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = await scrypt(password, salt, expected.length, { N, r, p });
  } catch {
    // An absurd cost parameter can exceed scrypt's memory limit; treat as a failed check.
    return false;
  }

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
