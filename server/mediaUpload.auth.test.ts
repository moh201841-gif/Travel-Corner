/**
 * Travel Corner — only an administrator may upload media (Phase 2 independent media storage).
 *
 * server/travel.admin.test.ts already asserts that the admin procedures reject a non-admin caller.
 * This file makes the storage-specific guarantee explicit and stronger: the upload is refused by the
 * authorization gate itself, with a genuinely valid image as the payload, so the rejection cannot be
 * mistaken for a validation failure — and the storage layer is never reached, so an unauthenticated
 * caller cannot cause a single write to the bucket.
 */
import { describe, expect, it, vi } from "vitest";
import { NOT_ADMIN_ERR_MSG } from "@shared/const";
import type { TrpcContext } from "./_core/context";

const putMedia = vi.fn(async () => ({ key: "k", url: "/media/k" }));

vi.mock("./_core/mediaStorage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_core/mediaStorage")>();
  return { ...actual, putMedia: (...args: unknown[]) => putMedia(...(args as [])) };
});

import { appRouter } from "./routers";

/** A real, minimal JPEG payload, so only authorization can reject this call. */
function validJpegBase64(): string {
  const bytes = new Uint8Array(64);
  bytes.set([0xff, 0xd8, 0xff], 0);
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function anonymousContext(): TrpcContext {
  return { user: null, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

function nonAdminContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "regular-travel-user",
      name: "Regular user",
      email: "user@example.com",
      loginMethod: "password",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const uploadInput = {
  offerId: 1,
  filename: "attempt.jpg",
  contentType: "image/jpeg" as const,
  base64: validJpegBase64(),
};

describe("uploadOfferImage authorization", () => {
  it("refuses an anonymous caller at the authorization gate and writes nothing", async () => {
    putMedia.mockClear();
    const caller = appRouter.createCaller(anonymousContext());

    await expect(caller.travel.admin.uploadOfferImage(uploadInput)).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin caller and writes nothing", async () => {
    putMedia.mockClear();
    const caller = appRouter.createCaller(nonAdminContext());

    await expect(caller.travel.admin.uploadOfferImage(uploadInput)).rejects.toThrow(NOT_ADMIN_ERR_MSG);
    expect(putMedia).not.toHaveBeenCalled();
  });

  it("stores under a server-chosen key when the caller is an administrator", async () => {
    putMedia.mockClear();
    const admin = { ...nonAdminContext(), user: { ...nonAdminContext().user!, role: "admin" as const } };
    const caller = appRouter.createCaller(admin);

    await expect(caller.travel.admin.uploadOfferImage({ ...uploadInput, offerId: 42 })).resolves.toEqual({
      url: "/media/k",
    });

    expect(putMedia).toHaveBeenCalledTimes(1);
    const sent = putMedia.mock.calls[0]![0] as { key: string; contentType: string; bytes: Uint8Array };
    // The key comes from the server, not from the caller's filename.
    expect(sent.key).toMatch(/^travel-corner\/offers\/42\/\d+\.jpg$/);
    expect(sent.key).not.toContain("attempt");
    expect(sent.contentType).toBe("image/jpeg");
    // The data-URL prefix is stripped before the bytes are stored.
    expect(Array.from(sent.bytes.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });
});
