# FLOWGUARD AI WORKFORCE — SECURITY & APPROVALS

## 1. Server-Side Access Control
- Every `/admin/workforce` page and `/api/admin/workforce/*` endpoint calls `requireAdminUser()` (`src/lib/security.ts`), which verifies both a valid Supabase Auth session (`supabase.auth.getUser()`) and an active row in `public.admin_users` (`is_active = true`).
- All 10 workforce tables in `supabase/migrations/20261123_ai_workforce_foundation.sql` have Row Level Security enabled with `owner_admin_only_select` policies. Anonymous, customer, and plumber accounts have zero access.

## 2. Three-Tier Permission Model
- **Green:** Read-only system snapshots, ticket/financial inspection, routing, drafting, and research.
- **Amber:** Mutating actions (plumber assignment, ticket status changes, outbound ticket messages, payment verification, plumber approval/suspension, complaint resolution, commission settings). Never execute on LLM tool call; create an `ai_approvals` record bound to `SHA-256(toolName, targetResource, canonicalPayload)`.
- **Red:** Secrets access, RLS bypass, protected branch merges, production DB writes/deletes — blocked unconditionally in `ToolGateway`.

## 3. Approval Invariants (Verified by `tests/ai-workforce-security.test.ts`)
1. Agents cannot approve their own or another agent's Amber requests (`SELF_APPROVAL_FORBIDDEN`).
2. Expired approvals transition to `expired` and cannot execute (`EXPIRED`).
3. Any payload or hash mismatch rejects execution (`PAYLOAD_HASH_MISMATCH`).
4. Concurrent or duplicate approvals execute at most once (`ALREADY_DECIDED`).
5. Rejected approvals cannot be retried as approved (`ALREADY_DECIDED`).
6. Secret-like argument keys (`password`, `secret`, `token`, `apiKey`) are redacted before logging.
