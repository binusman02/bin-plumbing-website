-- ============================================================================
-- PUBLIC AMINA CUSTOMER CONCIERGE & MEMORY SYNC
-- Stores website visitor chat sessions + messages for Amina, synced with
-- ticket numbers and plumber assignment updates. Strict owner/admin RLS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_public_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  visitor_name TEXT,
  visitor_phone TEXT,
  visitor_email TEXT,
  ticket_number TEXT,
  last_topic TEXT,
  reported_to_owner_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_public_sessions_token ON public.ai_public_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_ai_public_sessions_ticket ON public.ai_public_sessions(ticket_number);

CREATE TABLE IF NOT EXISTS public.ai_public_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.ai_public_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'assistant', 'system')),
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text', 'voice', 'assignment_update')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_public_messages_session ON public.ai_public_messages(session_id, created_at ASC);

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['ai_public_sessions', 'ai_public_messages']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_admin_only_select ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY owner_admin_only_select ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.auth_user_id = auth.uid() AND au.is_active = true));',
      tbl
    );
  END LOOP;
END $$;
