/**
 * Reads the verified application role strictly from `app_metadata` (server-managed).
 * Never reads `user_metadata`, which is client-writable via Supabase Auth.
 */
export function getVerifiedAppRole(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): string | undefined {
  const role = user?.app_metadata?.role;
  return typeof role === "string" && role.trim().length > 0 ? role.trim() : undefined;
}
