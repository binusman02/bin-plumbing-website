# FLOWGUARD AI WORKFORCE — LAUNCH CHECKLIST

## Staging Prerequisites (Before Production)
1. Apply `supabase/migrations/20261123_security_hardening_and_backfill.sql` and `supabase/migrations/20261123_ai_workforce_foundation.sql` to **staging** first.
2. Verify RLS on all 10 `ai_*` tables using `anon` and `authenticated` (customer/plumber) test accounts — confirm zero rows returned.
3. Verify `AUTH_SESSION_SECRET` is set (distinct from `SUPABASE_SERVICE_ROLE_KEY`).
4. Verify `GOOGLE_GENERATIVE_AI_API_KEY` (or verified free-tier `MIMO_FREE_API_KEY` + `MIMO_API_BASE_URL`) is configured server-side only.
5. Confirm `/api/ai/chat` returns HTTP `410 Gone` in staging and no Ziat UI appears on web or mobile.

## External Approvals Needed for Stages 3–6
- [ ] **GitHub App:** Create and install least-privilege GitHub App on `binusman02/bin-plumbing-website` (Stage 3).
- [ ] **Company Email OAuth:** Confirm company email provider and authorise read/draft scopes (Stages 5–6).
- [ ] **Model Provider Terms:** Verify MiMo V2.6 Flash / Flint by Recursive API data retention & no-training terms before sending private data.
- [ ] **Production Deployment:** Explicit Owner approval required before merging `feat/ai-workforce` to `master` or applying migrations to production.
