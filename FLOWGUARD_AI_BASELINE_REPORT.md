# FLOWGUARD AI WORKFORCE — STAGE 0 BASELINE REPORT

**Date:** 2026-11-23  
**Active Project Root:** `c:\Users\HP\OneDrive\Documents\bin-plumbing-website`  
**Development Branch:** `feat/ai-workforce` (branched from `master` at `67f5c70`, pre-audit tag `pre-audit-baseline-20261123` at `fe7f677`)  
**Next.js / SDK Versions:** `next@16.4.6`, `react@19.3.0`, `ai@7.0.179`, `@ai-sdk/google@4.0.124`, `@supabase/supabase-js@2.119.0`

---

## 1. Current Architecture & Verified File Paths

### Existing AI Surfaces (to audit / refactor / retire)
- **Customer-Facing Ziat Assistant (to retire in Stage 1A):**
  - `src/app/api/ai/chat/route.ts` — public/authenticated customer chat endpoint calling `generateSupportReply` + `synthesizeZiatSpeech`.
  - `src/components/ai/FlowGuardAiAssistant.tsx` — public/customer Ziat chat & voice widget.
  - `src/components/ai/useZiatVoice.ts` & `src/components/ai/useZiatLiveCall.ts` — voice/live-call hooks.
  - `mobile/lib/features/customer/ziat_assistant_sheet.dart`, `mobile/lib/features/customer/customer_shell.dart`, `mobile/lib/core/api_client.dart` — mobile Ask Ziat sheet & `/api/ai/chat` calls.
- **Admin AI Copilot (to integrate into Workforce + protect with Approval Service in Stage 1):**
  - `src/app/api/ai/admin/route.ts` — admin-only endpoint (`resolvePortalActor("admin")` + `enforceTrackingRateLimit("ai_admin", actor.id, 30)`).
  - `src/components/admin/AdminAiCopilot.tsx` — Admin portal copilot UI.
  - `src/lib/ai-assistant.ts` — contains `generateSupportReply` and `generateAdminCopilotReply` (using `createGoogleGenerativeAI` with `gemini-3-flash-preview` / `gemini-3.1-flash-lite-preview`), plus 11 tools:
    - **Read-only (4):** `getLiveOperationsFeed`, `inspectTicket`, `findBestPlumbersForArea`, `inspectFinancialSummary`
    - **Mutating (7 — currently prompt-gated only!):** `assignPlumberToTicket`, `updateTicketStatus`, `sendTicketMessage`, `verifyPayment`, `updatePlumberStatus`, `resolveComplaint`, `updateCommissionSettings`
- **Reusable Shared Utilities:**
  - `src/lib/ai-voice.ts` — audio helpers (reusable if voice is needed for Owner Console).
  - `src/lib/security.ts` — `requireAdminUser()`, `checkRateLimit()` (atomic RPC `consume_rate_limit`), `validateUploadFile()`.
  - `src/lib/portal-auth.ts`, `src/lib/auth-role.ts`, `src/lib/chat-auth.ts`, `src/lib/customer-session.ts`.
  - `src/lib/marketplace.ts`, `src/lib/job-lifecycle.ts`, `src/lib/payment-integrity.ts`, `src/lib/admin-notifications.ts`.

### Admin Portal & Mobile Access
- **Admin Portal:** `src/app/admin/(portal)/layout.tsx` enforces `await connection()`, `supabase.auth.getUser()`, `getVerifiedAppRole(user)`, and `requireAdminUser()` (verified against `admin_users` table with `is_active = true`).
- **Admin Pages:** `overview`, `requests`, `plumbers`, `customers`, `enquiries`, `complaints`, `financials`, `communications`, `guides`, `gallery`, `notifications`, `audit-log`, `profile`, `settings`.
- **Mobile (`mobile/lib/features/`):** Contains `auth`, `customer`, `plumber`, `shared` only. **No Admin/Owner Flutter flavour exists.** Responsive Web/PWA Owner Console is the primary mobile owner path.

### External Channels & Integrations
- **Company Email:** **No email provider** (`resend`, `nodemailer`, `sendgrid`, `smtp`, `gmail`, `mailgun`, `postmark`) is currently installed or configured in `src/` or `package.json`.
- **GitHub:** Remote `origin` is `https://github.com/binusman02/bin-plumbing-website.git`. No GitHub App credentials or webhook/API client exist in `src/` yet.
- **Database Migrations (`supabase/migrations/`):** 13 migrations exist (chronological from `20261113_crm_messaging_notifications_profiles.sql` through `20261123_security_hardening_and_backfill.sql`).

---

## 2. Verified Problems & Severity

| Severity | Finding | Location |
|---|---|---|
| **Critical** | **Admin AI mutating tools execute directly on LLM tool calls** without server-side payload-bound owner approval (`assignPlumberToTicket`, `updateTicketStatus`, `sendTicketMessage`, `verifyPayment`, `updatePlumberStatus`, `resolveComplaint`, `updateCommissionSettings`). | `src/lib/ai-assistant.ts` |
| **Critical** | **No server-side Tool Gateway, Agent Registry, Role Scope Enforcement, or Budget/Zero-Spend Controller** exists yet. | `src/lib/ai-assistant.ts` |
| **High** | **Ziat assistant is still active** on Web (`/api/ai/chat`, `FlowGuardAiAssistant.tsx`) and Mobile (`ziat_assistant_sheet.dart`). | `src/`, `mobile/` |
| **Medium** | **Pre-launch security audit** (`67f5c70`) already repaired the legacy code-level defects (`AUTH_SESSION_SECRET`, `/api/mobile/auth/sign-in`, `job-lifecycle.ts`, `payment-integrity.ts`, atomic rate limits, magic-byte upload validation), **pending staging/production deployment** of `20261123_security_hardening_and_backfill.sql` and `AUTH_SESSION_SECRET`. | `FLOWGUARD_PRE_LAUNCH_AUDIT_REPORT.md` |

---

## 3. Missing Prerequisites & External Credentials Needed (Names Only)

- **Staging / Production DB Migration:** `20261123_security_hardening_and_backfill.sql` + new AI Workforce migration must be applied to staging first.
- **Free-First Model Providers (Names Only):**
  - `GOOGLE_GENERATIVE_AI_API_KEY` (already referenced in `src/lib/ai-assistant.ts`).
  - Provider-independent adapter configuration for free-first candidates (e.g., MiMo V2.6 Flash / Flint by Recursive / OpenRouter or provider API keys) — **pending verified provider terms & zero-paid-spend guarantee**.
- **Company Email OAuth / API:** Email provider selection & OAuth credentials (not yet configured in repo).
- **GitHub App:** Least-privilege GitHub App ID / Private Key / Installation ID for Engineering AI (Stage 3).

---

## 4. Baseline Verification Results

- `npm test` (`tsx --test tests/*.test.ts`): **42 passed, 0 failed** (9 suites).
- `npx tsc --noEmit`: **0 errors**.
- `npm run lint` (`eslint`): Running cleanly with prior baseline verified at `67f5c70`.

---

## 5. Recommended Implementation Sequence

1. **Stage 1 (Next):** Security & Approval Foundation — Agent/Role policy definitions, Typed Tool Gateway, Payload-Bound Approval Service (SHA-256 payload hash, expiry, owner-only approve/reject, self-approval block, audit logging), and wrapping all 7 mutating Admin AI tools behind the Approval Service + unit/security tests.
2. **Stage 1A:** Retire Ziat safely (HTTP `410 Gone` on `/api/ai/chat`, remove UI/mobile entry points, preserve historical records without auto-ingesting into AI memory, regression tests).
3. **Stage 2:** AI Workforce DB migration (`ai_agents`, `ai_tasks`, `ai_task_events`, `ai_agent_runs`, `ai_approvals`, `ai_tool_executions`, `ai_agent_memory`, `ai_knowledge_documents`, `ai_model_usage`, `ai_audit_logs`), Provider-Independent Model Adapter with hard zero-paid-spend cap, Operations Manager orchestrator, and responsive Private Owner Console (`/admin/workforce`).
4. **Stages 3–7:** Engineering AI, Research AI, Sales AI, Customer Support AI, and Mobile Owner PWA/notifications.
