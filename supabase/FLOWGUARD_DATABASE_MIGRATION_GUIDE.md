# FlowGuard Database Migration Guide

## Overview
`supabase/schema.sql` contains the legacy baseline schema. Production and staging databases **must** apply all migrations in `supabase/migrations/` in exact chronological dependency order.

## Required PostgreSQL Extensions
- `uuid-ossp`
- `pgcrypto`

## Exact Migration Execution Order
Run these files in order on a fresh or staging Supabase PostgreSQL database:

1. `20261113_phase0_security_and_tables.sql` — Core normalized tables (`admin_users`, `customers`, `plumbers`, `plumber_documents`, `service_categories`, `service_areas`, `service_requests`, `request_history`, `quotations`, `messages`, `payments`, `enquiries`, `complaints`, `gallery_items`, `settings`, `audit_log`), `is_admin()` helper, strict RLS, and private storage buckets (`chat-uploads`, `plumber-documents`).
2. `20261113_crm_messaging_notifications_profiles.sql` — CRM views, notifications table, message metadata, customer/plumber profile enhancements.
3. `20261113_reviews_and_guides.sql` — Customer reviews & CMS guides tables + RLS.
4. `20261113_whatsapp_messaging_upgrade.sql` — Attachments, reply threading, internal notes, and chat read-receipt columns.
5. `20261114_enable_realtime_sync.sql` — Adds key tables (`messages`, `notifications`, `service_requests`, `quotations`, `payments`) to `supabase_realtime` publication.
6. `20261114_live_location.sql` — Live location columns/policies.
7. `20261114_sync_request_status_enum.sql` — Syncs allowed `service_requests.status` lifecycle values (`new`, `under_review`, `qualified`, `assigned`, `scheduled`, `in_progress`, `work_completed`, `awaiting_final_payment`, `completed`, `cancelled`).
8. `20261115_bilingual_blog_seo.sql` — Bilingual English/Hausa guide columns.
9. `20261115_live_location_system.sql` — `plumber_live_locations` table, trip tracking, and strict location RLS.
10. `20261116_rate_limits.sql` — `rate_limits` table (service-role only, RLS enabled, `REVOKE ALL` from `anon, authenticated`).
11. `20261120_mobile_device_tokens.sql` — `device_tokens` table for FCM push notifications.
12. `20261121_conversations_and_ownership.sql` — `conversations` and `conversation_participants` tables + `messages.conversation_id` + participant RLS.
13. `20261123_security_hardening_and_backfill.sql` — Removes broad public direct-`INSERT` RLS policies, adds `guard_plumber_self_update` trigger, `check_rate_limit_atomic` RPC, legacy ownership backfills, and unique active `payments.transaction_ref` index.

## Storage Buckets (Private)
- `chat-uploads` (`public = false`, 20 MB limit)
- `plumber-documents` (`public = false`, 10 MB limit)
- Access for customers/plumbers is mediated strictly through permission-checked server routes (`/api/chat/file/[filename]`) and short-lived signed URLs.

## Realtime Requirements
Ensure `supabase_realtime` includes: `messages`, `notifications`, `service_requests`, `quotations`, `payments`, `plumber_live_locations`, `conversations`.
