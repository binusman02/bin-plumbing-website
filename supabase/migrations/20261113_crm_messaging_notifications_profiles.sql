-- ==============================================================================
-- CRM, WHATSAPP MESSAGING, PERSISTENT NOTIFICATIONS, PROFILES & SOFT ARCHIVE
-- Additive migration: safe to run on existing databases; preserves all data.
-- ==============================================================================

-- 1. PERSISTENT NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    recipient_id TEXT NOT NULL,
    recipient_role TEXT NOT NULL CHECK (recipient_role IN ('admin', 'customer', 'plumber')),
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    entity_type TEXT DEFAULT '',
    entity_id TEXT DEFAULT '',
    destination TEXT DEFAULT '',
    dedupe_key TEXT,
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications(recipient_role, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications(recipient_id, read_at)
  WHERE deleted_at IS NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications(recipient_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage admin notifications" ON public.notifications;
CREATE POLICY "Admins manage admin notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin() AND recipient_role = 'admin')
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Customers manage own notifications" ON public.notifications;
CREATE POLICY "Customers manage own notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (
    recipient_role = 'customer'
    AND recipient_id IN (SELECT id::text FROM public.customers WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    recipient_role = 'customer'
    AND recipient_id IN (SELECT id::text FROM public.customers WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Plumbers manage own notifications" ON public.notifications;
CREATE POLICY "Plumbers manage own notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (
    recipient_role = 'plumber'
    AND recipient_id IN (SELECT id::text FROM public.plumbers WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    recipient_role = 'plumber'
    AND recipient_id IN (SELECT id::text FROM public.plumbers WHERE auth_user_id = auth.uid())
  );

-- 2. SAVED CRM VIEWS TABLE
CREATE TABLE IF NOT EXISTS public.crm_saved_views (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_email TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'service_requests',
    name TEXT NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    visible_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_by TEXT DEFAULT 'created_at',
    sort_dir TEXT DEFAULT 'desc',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.crm_saved_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage crm_saved_views" ON public.crm_saved_views;
CREATE POLICY "Admins manage crm_saved_views"
  ON public.crm_saved_views FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. PROFILE PHOTO & EXTENDED PROFILE COLUMNS
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS state TEXT DEFAULT '';
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS city_lga TEXT DEFAULT '';

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS avatar_storage_path TEXT;

-- 4. WHATSAPP RECEIPTS, REPLIES & TOMBSTONE DELETION ON MESSAGES
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to_id TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS deleted_by_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_ticket_created
  ON public.messages(ticket_number, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_request_id
  ON public.messages(request_id);

-- 5. SOFT ARCHIVE / SOFT DELETE COLUMNS FOR RECORD MANAGEMENT
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.plumbers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.guides ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.service_categories ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.service_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_service_requests_status_created
  ON public.service_requests(status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_service_requests_plumber
  ON public.service_requests(assigned_plumber_id, status)
  WHERE deleted_at IS NULL;
