# FLOWGUARD AI WORKFORCE — MODEL & COST POLICY

## 1. Hard Zero-Paid-Spend Cap
- `GLOBAL_PAID_SPEND_CAP_USD = 0` is enforced in `src/lib/ai-workforce/model-adapter.ts`.
- Any route with `billingTier: "paid"` is blocked with `PAID_SPEND_BLOCKED` even if `allowPaid` is passed.
- If a free route's API key or base URL is missing, execution fails safely with `NO_ELIGIBLE_FREE_MODEL` and **never** falls back to a paid model.

## 2. Configured & Candidate Routes
| Route ID | Provider | Model ID | Tier | Terms Verified | Notes |
|---|---|---|---|---|---|
| `free-first-default` | `google` | `gemini-3-flash-preview` | `free` | Yes | Uses `GOOGLE_GENERATIVE_AI_API_KEY` |
| `mimo-v2-6-flash-free` | `openai_compatible` | `mimo-v2.6-flash` | `free` | Pending | Requires `MIMO_FREE_API_KEY` & `MIMO_API_BASE_URL` + terms review |
| `flint-recursive-eval` | `openai_compatible` | `flint-recursive` | `free` | Pending | Sanitised evaluation only until hosted data retention terms verified |

## 3. Budget & Rate Controls
- Per-agent `dailyRunLimit` and `maxTokensPerRun` are enforced in `WorkforceOrchestrator` and `runWithFreeFirstModel`.
- Usage is recorded in `ai_model_usage` with `billing_mode = 'free'` and `estimated_cost_usd = 0`.
