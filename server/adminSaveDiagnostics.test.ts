/**
 * Travel Corner — what the admin dashboard is actually told when a hotel package will not save.
 *
 * The reported symptom was a single opaque sentence for every failure. Fixing that needed both ends
 * to change, so this drives the real HTTP boundary rather than createCaller: the tRPC error
 * formatter only runs while serialising a response, so a direct caller would never exercise it, and
 * the formatter is the half that carries validation detail.
 *
 * A real Express app on a loopback socket, the real router, the real superjson transformer. Only
 * `../db` is mocked — which is the point: each case picks the failure the database would produce
 * and asserts what reaches the browser.
 */
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import {
  DATABASE_UNREACHABLE_ERR_MSG,
  DUPLICATE_SLUG_ERR_MSG,
  MEDIA_STORAGE_UNCONFIGURED_ERR_MSG,
  SCHEMA_OUT_OF_DATE_ERR_MSG,
} from "@shared/const";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

/**
 * The driver boundary, and nothing above it.
 *
 * `drizzle` is replaced rather than `../db`, so the real saveAdminOffer runs — its transaction, its
 * error wrapper and the router's serialisation are all the production code. `transactionFails` is
 * what each case sets: the failure MySQL would have raised.
 */
let transactionFails: unknown = null;
const insertedValues: unknown[] = [];

const fakeTx = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
  insert: () => ({
    values: async (values: unknown) => {
      insertedValues.push(values);
      return [{ insertId: 7 }];
    },
  }),
  update: () => ({ set: () => ({ where: async () => undefined }) }),
  delete: () => ({ where: async () => undefined }),
};

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    transaction: async (run: (tx: typeof fakeTx) => Promise<unknown>) => {
      if (transactionFails) throw transactionFails;
      return run(fakeTx);
    },
  }),
}));

import { appRouter } from "./routers";

const ADMIN: User = {
  id: 1,
  openId: "owner-open-id",
  name: "Travel Corner administrator",
  email: null,
  loginMethod: "password",
  role: "admin",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

/** A payload the schema accepts, so only the database layer can reject it. */
const VALID_OFFER = {
  slug: "sharm-royal-4n",
  destinationEn: "Sharm El Sheikh",
  destinationAr: "شرم الشيخ",
  hotelNameEn: "Royal Sharm Resort",
  hotelNameAr: "منتجع شرم الملكي",
  days: 4,
  nights: 3,
  mealPlanEn: "All inclusive",
  mealPlanAr: "إقامة كاملة",
  transportationIncluded: true,
  availability: "on_request",
  isActive: false,
};

function driverError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

let server: Server;
let baseUrl = "";

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

beforeAll(async () => {
  // getDb() only builds a pool when DATABASE_URL is set. No connection is opened: drizzle is
  // mocked above. No CA is configured, so the TLS helper is a no-op here.
  process.env.DATABASE_URL = "mysql://user:pass@db.example.test:3306/travelcorner";

  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) =>
        ({ req, res, user: ADMIN }) as unknown as TrpcContext,
    })
  );
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

beforeEach(() => {
  transactionFails = null;
  insertedValues.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * A failed tRPC response, as superjson shapes it: `{ error: { json: { message, code, data } } }`.
 * `error.json` is what the browser client unwraps into the TRPCClientError the dashboard reads.
 */
type TrpcFailure = {
  error: {
    json: {
      message: string;
      data?: { code?: string; zodError?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] } };
    };
  };
};

/** POST a mutation the way the browser client does: superjson envelope, no batching. */
async function callMutation(path: string, input: unknown) {
  const response = await fetch(`${baseUrl}/api/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: input }),
  });
  const body = (await response.json()) as TrpcFailure;
  return { status: response.status, error: body.error?.json };
}

describe("a hotel package the schema rejects", () => {
  it("tells the operator which field is wrong, and never reaches the database", async () => {
    // A price typed with a thousands separator, which the form accepts and the schema does not.
    const { status, error } = await callMutation("travel.admin.saveOffer", { ...VALID_OFFER, price: "6,500" });

    expect(status).toBe(400);
    expect(error.data?.code).toBe("BAD_REQUEST");
    expect(Object.keys(error.data?.zodError?.fieldErrors ?? {})).toContain("price");
    // The schema rejected it, so nothing was written.
    expect(insertedValues).toHaveLength(0);
  });

  it("reports every rejected field, not just the first", async () => {
    const { error } = await callMutation("travel.admin.saveOffer", {
      ...VALID_OFFER,
      slug: "ab",
      hotelNameEn: "R",
      days: 99,
    });

    const fields = Object.keys(error.data?.zodError?.fieldErrors ?? {});
    expect(fields).toEqual(expect.arrayContaining(["slug", "hotelNameEn", "days"]));
  });

  it("carries no validation payload for a failure that is not a validation failure", async () => {
    transactionFails = driverError("ER_DUP_ENTRY", "Duplicate entry for key 'travelOffers_slug_unique'");

    const { error } = await callMutation("travel.admin.saveOffer", VALID_OFFER);

    expect(error.data?.zodError).toBeUndefined();
  });
});

describe("a hotel package the database rejects", () => {
  it("reports a duplicate slug as a slug clash and leaks no schema names", async () => {
    transactionFails = driverError(
      "ER_DUP_ENTRY",
      "Duplicate entry 'sharm-royal-4n' for key 'travelOffers.travelOffers_slug_unique'"
    );

    const { error } = await callMutation("travel.admin.saveOffer", VALID_OFFER);

    expect(error.message).toBe(DUPLICATE_SLUG_ERR_MSG);
    expect(error.message).not.toContain("travelOffers");
  });

  it("reports a missing column as an out-of-date schema", async () => {
    // The shape an unapplied migration takes: migration 0001 adds validUntil, lastPriceUpdatedAt,
    // primaryImageUrl and imageGallery, and the offer write touches the first two on every save.
    transactionFails = driverError("ER_BAD_FIELD_ERROR", "Unknown column 'lastPriceUpdatedAt' in 'field list'");

    const { error } = await callMutation("travel.admin.saveOffer", VALID_OFFER);

    expect(error.message).toBe(SCHEMA_OUT_OF_DATE_ERR_MSG);
  });

  it("reports an unreachable database as such", async () => {
    transactionFails = driverError("ECONNREFUSED", "connect ECONNREFUSED 10.0.0.4:3306");

    const { error } = await callMutation("travel.admin.saveOffer", VALID_OFFER);

    expect(error.message).toBe(DATABASE_UNREACHABLE_ERR_MSG);
    // The host and port the server dialled are not something to hand to a browser.
    expect(error.message).not.toContain("10.0.0.4");
  });

  it("saves normally when the database accepts the write", async () => {
    const response = await fetch(`${baseUrl}/api/trpc/travel.admin.saveOffer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ json: VALID_OFFER }),
    });

    expect(response.status).toBe(200);
    expect(insertedValues).toHaveLength(1);
    // The slug is passed through trimmed, as the schema declares.
    expect(insertedValues[0]).toMatchObject({ slug: "sharm-royal-4n" });
  });
});

describe("an image upload with no media storage configured", () => {
  it("is refused with a message the operator can act on", async () => {
    // The test environment configures no R2 settings, which is also the production state reported
    // in the Render logs. Previously the failure came out of the S3 client naming the missing
    // environment variables, so the dashboard had to suppress it and showed nothing useful.
    const bytes = new Uint8Array(64);
    bytes.set([0xff, 0xd8, 0xff], 0);

    const { error } = await callMutation("travel.admin.uploadOfferImage", {
      offerId: 42,
      filename: "cover.jpg",
      contentType: "image/jpeg",
      base64: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
    });

    expect(error.message).toBe(MEDIA_STORAGE_UNCONFIGURED_ERR_MSG);
    expect(error.message).not.toContain("R2_");
  });

  it("reports uploads as unavailable so the form can say so before a file is chosen", async () => {
    const response = await fetch(`${baseUrl}/api/trpc/travel.admin.mediaStatus`);
    const body = (await response.json()) as { result: { data: { json: { uploadsEnabled: boolean } } } };

    expect(response.status).toBe(200);
    expect(body.result.data.json).toEqual({ uploadsEnabled: false });
  });
});
