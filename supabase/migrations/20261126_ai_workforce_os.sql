-- ============================================================================
-- FLOWGUARD AI WORKFORCE OPERATING SYSTEM UPGRADE
-- Adds Work Order fields on ai_tasks, ai_handoffs, and ai_reports with
-- strict owner/admin-only RLS. Never edits earlier migration files.
-- ============================================================================

-- 1. Extend ai_tasks into enforceable Work Orders
ALTER TABLE public.ai_tasks
  ADD COLUMN IF NOT EXISTS owner_agent TEXT REFERENCES public.ai_agents(id),
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS definition_of_done TEXT,
  ADD COLUMN IF NOT EXISTS deliverable TEXT,
  ADD COLUMN IF NOT EXISTS evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qa_status TEXT,
  ADD COLUMN IF NOT EXISTS qa_notes TEXT,
  ADD COLUMN IF NOT EXISTS rework_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chased_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lessons TEXT[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.ai_tasks DROP CONSTRAINT IF EXISTS ai_tasks_status_check;
ALTER TABLE public.ai_tasks ADD CONSTRAINT ai_tasks_status_check
  CHECK (status IN (
    'queued', 'accepted', 'in_progress', 'running',
    'submitted', 'qa_review', 'approved_by_ops', 'rework',
    'reported', 'closed', 'waiting_approval', 'blocked',
    'failed', 'cancelled'
  ));

ALTER TABLE public.ai_tasks DROP CONSTRAINT IF EXISTS ai_tasks_qa_status_check;
ALTER TABLE public.ai_tasks ADD CONSTRAINT ai_tasks_qa_status_check
  CHECK (qa_status IS NULL OR qa_status IN ('pending', 'approved', 'rework', 'skipped'));

CREATE INDEX IF NOT EXISTS idx_ai_tasks_due_status ON public.ai_tasks(status, due_at);

ALTER TABLE public.ai_task_events DROP CONSTRAINT IF EXISTS ai_task_events_event_type_check;
ALTER TABLE public.ai_task_events ADD CONSTRAINT ai_task_events_event_type_check
  CHECK (event_type IN (
    'created', 'routed', 'started', 'progress', 'approval_requested',
    'approved', 'rejected', 'completed', 'failed', 'cancelled',
    'status_changed', 'qa_review', 'rework', 'chased', 'reported',
    'handoff', 'closed'
  ));

-- 2. Structured Handoffs (accept / decline / overdue)
CREATE TABLE IF NOT EXISTS public.ai_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent TEXT NOT NULL REFERENCES public.ai_agents(id),
  to_agent TEXT NOT NULL REFERENCES public.ai_agents(id),
  task_id UUID NOT NULL REFERENCES public.ai_tasks(id) ON DELETE CASCADE,
  context TEXT NOT NULL,
  ask TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'overdue', 'completed')),
  decline_reason TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_handoffs_status_due ON public.ai_handoffs(status, due_at);

-- 3. Stored Owner Reports + Owner Feedback
CREATE TABLE IF NOT EXISTS public.ai_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  message TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'urgent')),
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('up', 'down')),
  feedback_note TEXT,
  feedback_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_reports_delivered ON public.ai_reports(delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reports_agent ON public.ai_reports(agent_id, delivered_at DESC);

-- Owner/Admin-only RLS on new OS tables
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['ai_handoffs', 'ai_reports']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_admin_only_select ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY owner_admin_only_select ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.auth_user_id = auth.uid() AND au.is_active = true));',
      tbl
    );
  END LOOP;
END $$;
