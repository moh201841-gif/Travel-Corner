/**
 * Generate the ADMIN_PASSWORD_HASH value for independent hosting.
 *
 *   pnpm admin:hash
 *
 * Reads the password from stdin so it never appears in shell history or process arguments, prints
 * only the hash, and never echoes the password. Paste the output into the host's environment
 * variables as ADMIN_PASSWORD_HASH.
 */
import { createInterface } from "node:readline";
import { hashAdminPassword } from "../server/_core/passwordHash";

async function readPassword(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stderr.write("Administrator password (min 12 chars, not echoed): ");
  }
  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    rl.close();
    return line.trim();
  }
  return "";
}

// Wrapped rather than written as top-level await so the script typechecks under the project's
// compiler options alongside the rest of the codebase.
async function main() {
  const password = await readPassword();
  if (!password) {
    process.stderr.write("No password supplied.\n");
    process.exit(1);
  }

  try {
    process.stdout.write(`${await hashAdminPassword(password)}\n`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
}

void main();
