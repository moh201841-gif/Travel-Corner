/** Route-gate checks keep the public admin path separate from the role-protected CMS workspace. */
import { describe, expect, it } from "vitest";
import { canManageTravelContent } from "./travelAdminAccess";

describe("Travel Corner admin route gate", () => {
  it("allows only an administrator role into the content-management workspace", () => {
    expect(canManageTravelContent({ role: "admin" })).toBe(true);
    expect(canManageTravelContent({ role: "user" })).toBe(false);
    expect(canManageTravelContent(null)).toBe(false);
  });
});
