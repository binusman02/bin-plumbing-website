# FLOWGUARD — PRE-LAUNCH ENGINEERING AUDIT REPORT

**Date:** 2026-11-23  
**Baseline Recovery Tag:** `pre-audit-baseline-20261123` (`fe7f677`)  
**Scope:** Next.js 16.4.6 Web/PWA (`src/`), Supabase Backend (`supabase/`), Flutter Android Apps (`mobile/` — `customer` & `technician` flavors).

---

## Executive Summary
FlowGuard had strong core features (Ziat AI support, Mapbox/OSRM navigation, itemised quotations, voice notes, and multi-portal workflows), but the pre-launch audit identified **5 Critical (Priority 0)** and **5 High (Priority 1)** production blockers across session key separation, unauthenticated phone-to-email enumeration, overly permissive public `INSERT` RLS policies, non-atomic job claiming, unvalidated job status transitions, client-trusted payment amounts, non-atomic rate limiting, upload magic-byte gaps, and debug-signed Flutter release builds.

All code-level and migration-level repairs have been implemented and verified with automated tests (`42/42` passing). Production deployment of `20261123_security_hardening_and_backfill.sql` and release keystore provisioning remain gated on your explicit authorization / production credentials.

---

## Verified Findings & Status

| ID | Severity | Area | File(s) | Root Cause | Status |
|---|---|---|---|---|---|
| C1 | Critical | Credentials & Sessions | `src/lib/customer-session.ts`, `src/lib/portal-auth.ts` | Session HMAC fell back to `SUPABASE_SERVICE_ROLE_KEY`; lacked `jti`/`iat` and suspended-plumber blocking. | **Repaired** |
| C2 | Critical | Account Enumeration & Scans | `src/app/api/mobile/auth/resolve-identifier/route.ts`, `src/app/actions/portal-auth.ts`, `mobile/lib/features/auth/auth_gate.dart` | Unauthenticated endpoint scanned all tables and returned private email addresses for phone numbers; web login scanned all customers. | **Repaired** (`POST /api/mobile/auth/sign-in` + `src/lib/auth-lookup.ts`) |
| C3 | Critical | Database & RLS | `supabase/migrations/20261113_phase0_security_and_tables.sql` | Public `INSERT` policies on `service_requests`, `plumbers`, `enquiries` checked only `status`/`verification_status`, allowing direct `anon` insertion of privileged columns. | **Repaired in migration** (`20261123_security_hardening_and_backfill.sql`) |
| C4 | Critical | Job Lifecycle & Race | `src/app/actions/marketplace-actions.ts`, `src/app/api/mobile/jobs/[id]/action/route.ts`, `src/lib/job-lifecycle.ts` | Non-atomic claim (`SELECT` then `UPDATE`); mobile action route skipped `actor.isApproved`, quotation approval check, and status transition validation. | **Repaired** |
| C5 | Critical | Payment Integrity | `src/app/api/mobile/payments/route.ts`, `src/lib/payment-integrity.ts`, `src/lib/marketplace.ts` | Trusted client `body.amount`; no duplicate pending/txRef guard or proof-path validation; partial payment marked job `completed`. | **Repaired** |
| H1 | High | Rate Limiting & Turnstile | `src/lib/security.ts`, `20261123_security_hardening_and_backfill.sql` | Non-atomic `delete/select/insert` rate limit; fail-open on DB errors; silent Turnstile bypass. | **Repaired** |
| H2 | High | Upload Security | `src/lib/security.ts`, `src/app/api/chat/upload/route.ts` | `validateUploadFile` checked only extension and client MIME type, not actual file magic bytes. | **Repaired** |
| H3 | High | Legacy Ownership | `src/lib/chat-auth.ts`, `20261123_security_hardening_and_backfill.sql` | Legacy `service_requests` with `NULL` `customer_id`/`assigned_plumber_id` relied on phone/name fallbacks. | **Migration backfill added** |
| H4 | High | Flutter Release Signing | `mobile/android/app/build.gradle.kts` | `buildTypes.release` used `signingConfigs.getByName("debug")`. | **Repaired** (fails release builds if keystore missing) |
| H5 | High | Migration Docs & Lint | `supabase/FLOWGUARD_DATABASE_MIGRATION_GUIDE.md`, `eslint.config.mjs` | Missing chronological guide for all 13 migrations; ESLint scanned `mobile/build/`. | **Repaired** |

---

## Remaining Environment / Business Dependencies
1. **`AUTH_SESSION_SECRET`:** Must be set (min 16 random chars, distinct from `SUPABASE_SERVICE_ROLE_KEY`) in production environment variables before deploying.
2. **Database Migration:** Apply `supabase/migrations/20261123_security_hardening_and_backfill.sql` to staging first, verify RLS with `anon`/`authenticated` test accounts, then authorize production rollout.
3. **Android Release Keystore:** Create a private `.jks` keystore and configure `mobile/android/key.properties` (or `FLOWGUARD_KEYSTORE_*` env vars) locally/CI before building production release APKs/AABs.
4. **Mapbox Public Token:** Ensure `MAPBOX_ACCESS_TOKEN` (`pk....`) is set in production Vercel environment variables for `/api/mobile/map-config`.
5. **Legal & Business Review:** Confirm Privacy Policy and Terms & Conditions wording on live location tracking, retention periods, and payment terms with business owner/legal counsel.
