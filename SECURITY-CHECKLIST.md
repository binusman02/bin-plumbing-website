# Security Checklist — Bin Plumbing Services Ltd

Complete these steps immediately after deploying the Phase 0 security upgrade:

1. **Rotate Supabase Keys**
   - Go to **Supabase Dashboard → Project Settings → API**.
   - Rotate both the **`anon` (public)** key and the **`service_role` (secret)** key.
   - Update `.env.local` locally and update Environment Variables in Vercel / your hosting provider.

2. **Never Share `.env.local` or Secret Archives**
   - Never share a `.zip` file that contains `.env.local`, `backups/`, or `src/data/marketplace-data.json`.
   - Always share `.env.example` (variable names only) instead of `.env.local`.

3. **Verify Server-Only Secrets**
   - Confirm `SUPABASE_SERVICE_ROLE_KEY` and `AUTH_SESSION_SECRET` are set in server environment variables and are **never** prefixed with `NEXT_PUBLIC_`.

4. **Provision Admin Access in `public.admin_users`**
   - Sign in or create your admin user in **Supabase Authentication → Users**, copy the user's UUID, and insert it into `public.admin_users`:
     ```sql
     INSERT INTO public.admin_users (auth_user_id, email, full_name, role, is_active)
     VALUES ('<USER-UUID>', 'your-admin@email.com', 'Operations Admin', 'super_admin', true)
     ON CONFLICT (auth_user_id) DO UPDATE SET is_active = true;
     ```

5. **Run Schema Migration & One-Time Data Import**
   - Run `supabase/migrations/20261113_phase0_security_and_tables.sql` in Supabase SQL Editor.
   - Run `node scripts/migrate-json-to-supabase.mjs` once to migrate existing records (`BP-261112-9670` and existing plumber applications) into the normalized tables.

6. **Verify Private Storage & RLS**
   - Confirm `chat-uploads` and `plumber-documents` buckets are marked **Private** in **Supabase Storage**.
   - Confirm an unauthenticated `anon` request to `/rest/v1/service_requests` or `/rest/v1/plumbers` cannot `SELECT` any rows.
