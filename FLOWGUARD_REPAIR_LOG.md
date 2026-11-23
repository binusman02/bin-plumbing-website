# FLOWGUARD — REPAIR LOG

**Baseline Commit:** `fe7f677` (`pre-audit-baseline-20261123`)

## 1. Credentials & Authentication
- **`src/lib/customer-session.ts`:** Removed fallback to `SUPABASE_SERVICE_ROLE_KEY`; enforced dedicated `AUTH_SESSION_SECRET` (min 16 chars) in production; added `jti` and `iat` claims to session payloads.
- **`src/lib/portal-auth.ts`:** Blocked `suspended` plumbers from resolving active sessions in both Supabase Auth and cookie fallback paths.
- **`src/lib/auth-lookup.ts`:** Added indexed/bounded `findCustomerByIdentifier` and `findPlumberByIdentifier` helpers replacing full-table scans.
- **`src/app/actions/portal-auth.ts`:** Switched `loginCustomerWithPasswordAction` from `getAllCustomers()` to `findCustomerByIdentifier()`.
- **`src/app/api/mobile/auth/sign-in/route.ts`:** Added server-side phone/email password login returning Supabase tokens without exposing private emails to unauthenticated callers.
- **`src/app/api/mobile/auth/resolve-identifier/route.ts`:** Disabled unauthenticated phone-to-email enumeration (`410 Gone` for phone numbers).
- **`mobile/lib/core/api_client.dart` & `mobile/lib/features/auth/auth_gate.dart`:** Updated mobile phone login to use `/api/mobile/auth/sign-in` + `setSession(refreshToken)`.

## 2. Job Assignment & Lifecycle Integrity
- **`src/lib/job-lifecycle.ts`:** Implemented pure `validateJobTransition` state machine enforcing terminal status locks, quotation approval before `start_work`, `in_progress` before `complete_work`, `trip_started` before `arrived`, and idempotent repeat handling.
- **`src/app/api/mobile/jobs/[id]/action/route.ts`:** Enforced `actor.isApproved` for plumbers (`403`), validated current status, quotation approval, and trip state via `validateJobTransition`.
- **`src/app/actions/marketplace-actions.ts`:** Replaced non-atomic `claimServiceRequestAction` read-then-write with atomic conditional `UPDATE ... WHERE assigned_plumber_id IS NULL AND status NOT IN ('completed','cancelled')`; added `validateJobTransition` to `updateRequestStatusByTicketAction`.

## 3. Payment Integrity
- **`src/lib/payment-integrity.ts`:** Added `isValidInternalProofPath`, `computeAuthorizedPaymentAmount`, and `shouldMarkJobCompleted`.
- **`src/app/api/mobile/payments/route.ts`:** Enforced approved quotation requirement, duplicate pending/transaction-ref rejection, internal proof path validation, and server-side proportional calculation of commission/payable.
- **`src/lib/marketplace.ts`:** Updated `verifyPaymentById` so jobs are only marked `completed` when total verified payments reach the approved quotation total.

## 4. Rate Limiting, Turnstile & Upload Protection
- **`src/lib/security.ts`:** Wired `checkRateLimit` to `check_rate_limit_atomic` RPC with fail-closed behavior on sensitive scopes in production; added `REQUIRE_TURNSTILE=true` fail-closed guard; added `validateFileMagicBytes`.
- **`src/app/api/chat/upload/route.ts`:** Enforced `validateFileMagicBytes(buffer, ext)` before uploading to private `chat-uploads` storage.

## 5. Database, Flutter Signing & Tooling
- **`supabase/migrations/20261123_security_hardening_and_backfill.sql`:** Dropped broad public `INSERT` policies, added `guard_plumber_self_update` trigger, `check_rate_limit_atomic` RPC, legacy ownership backfills, and unique active `payments.transaction_ref` index.
- **`supabase/FLOWGUARD_DATABASE_MIGRATION_GUIDE.md`:** Documented all 13 migrations in execution order.
- **`mobile/android/app/build.gradle.kts`:** Replaced debug release signing with `key.properties` / `FLOWGUARD_KEYSTORE_*` release signing and explicit `GradleException` when missing.
- **`eslint.config.mjs`:** Excluded `mobile/**` and `videos/**` from ESLint.
- **`tests/audit-security-workflow.test.ts`:** Added automated tests for session tokens, job lifecycle, payment integrity, and upload magic bytes.
