# FLOWGUARD — LAUNCH CHECKLIST

## Security & Environment
- [ ] Set `AUTH_SESSION_SECRET` (random 32+ char string, distinct from `SUPABASE_SERVICE_ROLE_KEY`) in production hosting.
- [ ] Set `MAPBOX_ACCESS_TOKEN` (`pk....`) in production hosting for `/api/mobile/map-config`.
- [ ] Verify `GOOGLE_GENERATIVE_AI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `FIREBASE_SERVICE_ACCOUNT_BASE64` are set in production.
- [ ] If Turnstile is required in production, set `TURNSTILE_SECRET_KEY` and `REQUIRE_TURNSTILE=true`.

## Database & RLS (Staging First -> Production)
- [ ] Apply all 13 migrations in `supabase/FLOWGUARD_DATABASE_MIGRATION_GUIDE.md` order on staging, ending with `20261123_security_hardening_and_backfill.sql`.
- [ ] Verify `anon` cannot `INSERT` directly into `service_requests`, `plumbers`, or `enquiries`.
- [ ] Verify `service_requests` legacy rows have `customer_id` and `assigned_plumber_id` backfilled.
- [ ] Verify private buckets `chat-uploads` and `plumber-documents` have `public = false`.
- [ ] After staging passes, authorize and apply `20261123_security_hardening_and_backfill.sql` to production.

## Mobile Release Signing & Device QA
- [ ] Generate private production Android keystore (`.jks`) — never commit it to Git.
- [ ] Configure `mobile/android/key.properties` or `FLOWGUARD_KEYSTORE_*` environment variables.
- [ ] Build signed release APKs/AABs for `customer` and `technician` flavors.
- [ ] Test on physical Android devices: phone/email/Google login, request creation, Ziat voice/chat, live GPS tracking, quotation approval, payment proof upload, and FCM push notifications.

## Legal & Business Sign-Off
- [ ] Confirm Privacy Policy & Terms & Conditions accuracy (live location tracking, payment verification, commission, and retention).
- [ ] Confirm production domain (`NEXT_PUBLIC_SITE_URL`) and Google Search Console sitemap submission.
