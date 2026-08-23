/** Travel Corner CMS route gate: authenticated visitors still require the administrator role. */
export function canManageTravelContent(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}
