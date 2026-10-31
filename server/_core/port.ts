/**
 * Listening-port resolution, extracted from index.ts so it can be unit tested.
 *
 * A hosting platform assigns PORT and health-checks exactly that port, so production must bind it
 * or fail loudly. Development keeps the scan, where several instances legitimately run side by side.
 */
export const DEFAULT_PORT = 3000;

export function parsePort(raw: string | undefined): number {
  const value = raw?.trim() ?? "";
  if (value === "") return DEFAULT_PORT;

  // parseInt would accept "80 80" and "8080abc" and silently bind the leading number, which on a
  // health-checked host looks like the app ignoring PORT. Only a whole number is a port.
  if (!/^\d+$/.test(value)) {
    throw new Error(`PORT is not a valid port number: ${JSON.stringify(raw)}`);
  }
  const port = Number(value);
  if (port < 1 || port > 65535) {
    throw new Error(`PORT is not a valid port number: ${JSON.stringify(raw)}`);
  }
  return port;
}

export function shouldScanForPort(nodeEnv: string | undefined): boolean {
  return nodeEnv !== "production";
}
