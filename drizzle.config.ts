import { defineConfig } from "drizzle-kit";
import { drizzleKitCredentials } from "./server/databaseSsl";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

/**
 * The credentials are spelled out field by field rather than passed as `url`, because drizzle-kit's
 * mysql dbCredentials is a union and its `{ url }` branch has no `ssl` option — so a URL alone
 * cannot carry the CA certificate a managed MySQL needs. drizzleKitCredentials derives the fields
 * from DATABASE_URL and attaches the CA from DATABASE_CA_PATH when one is configured, using the same
 * fail-closed validation as the server. With no CA configured the behaviour is unchanged.
 */
export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: drizzleKitCredentials(connectionString),
});
