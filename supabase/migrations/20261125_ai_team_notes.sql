-- ============================================================================
-- FLOWGUARD AI WORKFORCE TEAM BOARD (ai_team_notes)
-- Shared short-note board so teammates see each other's handoffs and work.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_team_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL REFERENCES public.ai_agents(id),
  to_agent TEXT REFERENCES public.ai_agents(id),
  task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  ticket_number TEXT,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_team_notes_created ON public.ai_team_notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_team_notes_to_agent ON public.ai_team_notes(to_agent, created_at DESC);

ALTER TABLE public.ai_team_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS owner_admin_only_select ON public.ai_team_notes;
CREATE POLICY owner_admin_only_select ON public.ai_team_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.auth_user_id = auth.uid() AND au.is_active = true
    )
  );
