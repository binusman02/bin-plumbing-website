-- ============================================================================
-- FLOWGUARD AI WORKFORCE FOUNDATION (Stages 1 & 2)
-- Creates private AI Workforce tables with strict owner/admin-only RLS.
-- Apply to staging first, verify RLS, then apply to production with approval.
-- ============================================================================

-- 1. Agent Registry
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  role_title TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_version INTEGER NOT NULL DEFAULT 1,
  system_prompt TEXT NOT NULL,
  model_route TEXT NOT NULL DEFAULT 'free-first-default',
  allowed_tools TEXT[] NOT NULL DEFAULT '{}',
  memory_namespace TEXT NOT NULL UNIQUE,
  daily_run_limit INTEGER NOT NULL DEFAULT 50 CHECK (daily_run_limit > 0),
  max_tokens_per_run INTEGER NOT NULL DEFAULT 2048 CHECK (max_tokens_per_run > 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Durable Tasks
CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  assigned_agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  parent_task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'waiting_approval', 'completed', 'failed', 'cancelled')),
  due_date TIMESTAMPTZ,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_tasks_agent_status ON public.ai_tasks(assigned_agent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_parent ON public.ai_tasks(parent_task_id);

-- 3. Append-only Task Events
CREATE TABLE IF NOT EXISTS public.ai_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.ai_tasks(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'routed', 'started', 'progress', 'approval_requested', 'approved', 'rejected', 'completed', 'failed', 'cancelled')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_task_events_task ON public.ai_task_events(task_id, created_at ASC);

-- 4. Agent Runs
CREATE TABLE IF NOT EXISTS public.ai_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'rate_limited', 'cancelled')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_runs_agent_started ON public.ai_agent_runs(agent_id, started_at DESC);

-- 5. Payload-Bound Owner Approvals
CREATE TABLE IF NOT EXISTS public.ai_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  requested_by_agent TEXT NOT NULL REFERENCES public.ai_agents(id),
  tool_name TEXT NOT NULL,
  target_resource TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence TEXT,
  expected_effect TEXT,
  risk_level TEXT NOT NULL DEFAULT 'amber' CHECK (risk_level IN ('amber', 'high')),
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed', 'failed')),
  approver_user_id UUID,
  approver_email TEXT,
  decision_note TEXT,
  execution_result JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_approvals_status_created ON public.ai_approvals(status, created_at DESC);

-- 6. Tool Executions Log
CREATE TABLE IF NOT EXISTS public.ai_tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.ai_tasks(id) ON DELETE SET NULL,
  approval_id UUID REFERENCES public.ai_approvals(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  tool_name TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('green', 'amber', 'red')),
  validated_scope TEXT NOT NULL,
  redacted_args JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('executed', 'pending_approval', 'blocked', 'failed')),
  result_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_executions_agent_created ON public.ai_tool_executions(agent_id, created_at DESC);

-- 7. Agent-Specific Memory
CREATE TABLE IF NOT EXISTS public.ai_agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  namespace TEXT NOT NULL,
  memory_key TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  approved_by_owner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (namespace, memory_key)
);

-- 8. Approved Shared Company Knowledge Documents
CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  access_scope TEXT NOT NULL DEFAULT 'shared_workforce',
  version INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  source_ref TEXT,
  approved_by_owner BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Model Usage & Spend Control
CREATE TABLE IF NOT EXISTS public.ai_model_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ai_agent_runs(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL REFERENCES public.ai_agents(id),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'free' CHECK (billing_mode IN ('free', 'paid')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  period_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_model_usage_period ON public.ai_model_usage(period_date DESC, agent_id);

-- 10. Append-Only Security & Governance Audit Logs
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'agent', 'system')),
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_resource TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_logs_created ON public.ai_audit_logs(created_at DESC);

-- ============================================================================
-- STRICT OWNER / ADMIN-ONLY RLS ON ALL WORKFORCE TABLES
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'ai_agents',
    'ai_tasks',
    'ai_task_events',
    'ai_agent_runs',
    'ai_approvals',
    'ai_tool_executions',
    'ai_agent_memory',
    'ai_knowledge_documents',
    'ai_model_usage',
    'ai_audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_admin_only_select ON public.%I;', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_admin_only_all ON public.%I;', tbl);
    EXECUTE format(
      'CREATE POLICY owner_admin_only_select ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE au.auth_user_id = auth.uid() AND au.is_active = true));',
      tbl
    );
  END LOOP;
END $$;

-- Seed the 5 agreed agents (idempotent)
INSERT INTO public.ai_agents (id, display_name, role_title, description, memory_namespace, system_prompt, allowed_tools)
VALUES
  (
    'operations_manager',
    'AI Operations Manager',
    'Central Workforce Coordinator',
    'Founder''s primary AI contact that breaks instructions into bounded tasks, routes work to specialists, tracks status, and prepares briefings.',
    'ns_operations_manager',
    'You are the FlowGuard AI Operations Manager. Coordinate the four specialist agents, prepare briefings from verified data, and escalate decisions to the Founder.',
    ARRAY['workforce_create_task', 'workforce_read_tasks', 'workforce_read_agent_status', 'workforce_request_specialist_run', 'get_live_operations_feed', 'inspect_ticket', 'inspect_financial_summary', 'find_best_plumbers_for_area']
  ),
  (
    'sales_ai',
    'Sales AI',
    'Lead Qualification & Follow-up Specialist',
    'Monitors approved enquiries, classifies and deduplicates leads, prepares follow-up tasks, and drafts personalised emails for owner approval.',
    'ns_sales_ai',
    'You are the FlowGuard Sales AI. Classify and qualify leads accurately from verified CRM/enquiry records and prepare email drafts for owner approval.',
    ARRAY['sales_read_enquiries', 'sales_draft_followup', 'sales_send_email', 'workforce_create_task']
  ),
  (
    'customer_support_ai',
    'Customer Support AI',
    'Support Triage & Case Management Specialist',
    'Single FlowGuard support agent handling approved intake triage, verified-ownership lookups, summaries, reply drafts, and urgent escalations.',
    'ns_customer_support_ai',
    'You are the FlowGuard Customer Support AI. Triage support intake, verify record ownership before accessing ticket details, draft replies for owner approval, and escalate emergencies.',
    ARRAY['support_read_verified_ticket', 'support_triage_intake', 'support_draft_reply', 'support_send_reply', 'support_escalate_case']
  ),
  (
    'research_ai',
    'Research AI',
    'Market, Competitor & SEO Research Specialist',
    'Conducts public web research with citations, separates facts from assumptions, and produces sourced reports.',
    'ns_research_ai',
    'You are the FlowGuard Research AI. Produce sourced market, competitor, service-area, and SEO research reports with explicit citations and confidence notes.',
    ARRAY['research_web_search', 'research_save_report', 'workforce_create_task']
  ),
  (
    'engineering_ai',
    'Engineering AI',
    'Software Engineering & Maintenance Specialist',
    'Analyses codebase issues, runs dev checks, prepares branch fixes and draft PRs without production secrets or auto-merge.',
    'ns_engineering_ai',
    'You are the FlowGuard Engineering AI. Investigate bugs in isolated development workspaces, write regression tests, and prepare reviewable PRs for owner approval.',
    ARRAY['eng_read_repo', 'eng_run_checks', 'eng_prepare_pr', 'eng_merge_pr']
  )
ON CONFLICT (id) DO NOTHING;
