# Bin Plumbing Services Ltd — Web Platform

Next.js (App Router) + Supabase platform for service requests, dispatch coordination, plumber quotations, customer approvals, payment reconciliation, and real-time job chat.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   Copy `.env.example` to `.env.local` and fill in your values:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
   - `AUTH_SESSION_SECRET` (random 32+ char string for signed customer/plumber session cookies)

3. **Run database migration in Supabase**
   Execute `supabase/migrations/20261113_phase0_security_and_tables.sql` (or `supabase/schema.sql` on a fresh project) in the Supabase SQL Editor.

4. **Migrate existing JSON data (one-time)**
   ```bash
   node scripts/migrate-json-to-supabase.mjs
   ```
   This safely creates a backup in `backups/` and upserts existing records into the normalized Supabase tables.

5. **Add your Admin User**
   Insert your Supabase Auth user UUID into `public.admin_users` (see `SECURITY-CHECKLIST.md`).

6. **Run locally**
   ```bash
   npm run dev
   ```

## Scripts
- `npm run dev` — Start development server
- `npm run lint` — Run ESLint
- `npm run build` — Production build
