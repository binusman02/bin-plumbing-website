# FLOWGUARD AI WORKFORCE — ARCHITECTURE

**Branch:** `feat/ai-workforce`  
**Owner:** Founder / Director (FlowGuard Plumbing Enterprises)

## 1. Workforce Topology (1 Coordinator + 4 Specialists)

```text
FOUNDER / DIRECTOR
  └─> Private Owner Console (/admin/workforce, mobile-responsive)
        └─> requireAdminUser() + Supabase Auth + admin_users (is_active = true)
              └─> AI Operations Manager (operations_manager)
                    ├─> Sales AI (sales_ai)
                    ├─> Customer Support AI (customer_support_ai)  [replaces Ziat]
                    ├─> Research AI (research_ai)
                    └─> Engineering AI (engineering_ai)
                          └─> ToolGateway (allowlist + schema + tier gate)
                                ├─> Green: executes & logs to ai_tool_executions
                                ├─> Amber: creates payload-hashed ai_approvals record
                                └─> Red: blocked unconditionally
```

## 2. Implemented Core Modules
- **Registry (`src/lib/ai-workforce/registry.ts`):** Defines all 5 agents with separate prompts, `allowedTools`, `memoryNamespace`, `dailyRunLimit`, and `maxTokensPerRun`.
- **Approval Service (`src/lib/ai-workforce/approvals.ts`):** Canonical JSON + SHA-256 `payload_hash`, expiry enforcement, self-approval block, idempotent once-only execution, and audit logging.
- **Tool Gateway (`src/lib/ai-workforce/tool-gateway.ts`):** Validates agent allowlist, input schema, and `green`/`amber`/`red` tier; redacts secret keys before logging.
- **Admin Mutating Tools (`src/lib/ai-workforce/admin-tools.ts`):** Wraps all 7 mutating Admin AI actions (`assign_plumber_to_ticket`, `update_ticket_status`, `send_ticket_message`, `verify_payment`, `update_plumber_status`, `resolve_complaint`, `update_commission_settings`) behind Amber approval gates.
- **Model Adapter (`src/lib/ai-workforce/model-adapter.ts`):** Provider-independent free-first model router with `$0.00` global paid spend cap.
- **Orchestrator (`src/lib/ai-workforce/orchestrator.ts`):** Durable tasks (`ai_tasks`), append-only events (`ai_task_events`), specialist routing, cancellation, and safe failure handling.
- **Database Schema (`supabase/migrations/20261123_ai_workforce_foundation.sql`):** 10 workforce tables with owner/admin-only RLS.
- **Owner Console UI & APIs:** `/admin/workforce`, `/api/admin/workforce/overview`, `/api/admin/workforce/tasks`, `/api/admin/workforce/tasks/[id]/cancel`, `/api/admin/workforce/approvals`, `/api/admin/workforce/approvals/[id]`.

## 3. Ziat Retirement (Stage 1A)
- `/api/ai/chat` returns HTTP `410 Gone` (`retired: true`).
- `FlowGuardAiAssistant.tsx` and `mobile/lib/features/customer/ziat_assistant_sheet.dart` removed.
- Customer Support AI replaces Ziat as an internal support workflow agent; no public chatbot was added.
