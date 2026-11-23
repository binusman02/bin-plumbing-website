import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { AgentId } from "@/lib/ai-workforce/types";

export type ModelBillingTier = "free" | "paid";

export interface ModelRouteConfig {
  routeId: string;
  provider: "google" | "openai_compatible";
  modelId: string;
  billingTier: ModelBillingTier;
  envKeyName: string;
  baseUrl?: string;
  dataTermsVerified: boolean;
  notes: string;
}

/**
 * Hard global spend cap: 0 USD until the Founder explicitly updates billing policy.
 * No paid fallback or automatic top-up is permitted.
 */
export const GLOBAL_PAID_SPEND_CAP_USD = 0;

export const DEFAULT_MODEL_ROUTES: Record<string, ModelRouteConfig> = {
  "free-first-default": {
    routeId: "free-first-default",
    provider: "google",
    modelId: "gemini-3-flash-preview",
    billingTier: "free",
    envKeyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    dataTermsVerified: true,
    notes: "Primary free-tier route via configured Google Generative AI key.",
  },
  "mimo-v2-6-flash-free": {
    routeId: "mimo-v2-6-flash-free",
    provider: "openai_compatible",
    modelId: process.env.MIMO_MODEL_ID?.trim() || "mimo-v2.6-flash",
    billingTier: "free",
    envKeyName: "MIMO_FREE_API_KEY",
    baseUrl: process.env.MIMO_API_BASE_URL?.trim() || "",
    dataTermsVerified: false,
    notes: "Xiaomi MiMo V2.6 Flash (free-first): set MIMO_FREE_API_KEY & MIMO_API_BASE_URL after verifying free tier and data terms.",
  },
  "flint-recursive-eval": {
    routeId: "flint-recursive-eval",
    provider: "openai_compatible",
    modelId: process.env.FLINT_MODEL_ID?.trim() || "flint-recursive",
    billingTier: "free",
    envKeyName: "FLINT_API_KEY",
    baseUrl: process.env.FLINT_API_BASE_URL?.trim() || "",
    dataTermsVerified: false,
    notes: "Recursive Flint (sanitised eval only): set FLINT_API_KEY & FLINT_API_BASE_URL after verifying hosted data retention terms.",
  },
};

export interface ModelExecutionRequest {
  agentId: AgentId;
  routeId: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  allowPaid?: boolean;
  dailyRunCount?: number;
  dailyRunLimit?: number;
}

export interface ModelExecutionResult {
  ok: boolean;
  code?:
    | "PAID_SPEND_BLOCKED"
    | "NO_ELIGIBLE_FREE_MODEL"
    | "DAILY_LIMIT_REACHED"
    | "PROVIDER_ERROR";
  text?: string;
  provider?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  error?: string;
}

export function checkModelEligibility(
  route: ModelRouteConfig | undefined,
  options: { allowPaid?: boolean; env?: Record<string, string | undefined> } = {}
): { ok: true; apiKey: string } | { ok: false; code: "PAID_SPEND_BLOCKED" | "NO_ELIGIBLE_FREE_MODEL"; error: string } {
  if (!route) {
    return {
      ok: false,
      code: "NO_ELIGIBLE_FREE_MODEL",
      error: "No configured model route found; paid fallback is disabled.",
    };
  }

  if (route.billingTier === "paid" && (!options.allowPaid || GLOBAL_PAID_SPEND_CAP_USD <= 0)) {
    return {
      ok: false,
      code: "PAID_SPEND_BLOCKED",
      error: `Model "${route.modelId}" is paid and global paid spend cap is $0.00.`,
    };
  }

  const env = options.env ?? process.env;
  const apiKey = env[route.envKeyName]?.trim();
  if (!apiKey) {
    return {
      ok: false,
      code: "NO_ELIGIBLE_FREE_MODEL",
      error: `Missing ${route.envKeyName} for free model "${route.modelId}". Paid fallback is disabled.`,
    };
  }

  if (route.provider === "openai_compatible" && !route.baseUrl) {
    return {
      ok: false,
      code: "NO_ELIGIBLE_FREE_MODEL",
      error: `Missing base URL for "${route.modelId}". Configure provider endpoint first.`,
    };
  }

  return { ok: true, apiKey };
}

export async function runWithFreeFirstModel(
  req: ModelExecutionRequest,
  routes: Record<string, ModelRouteConfig> = DEFAULT_MODEL_ROUTES
): Promise<ModelExecutionResult> {
  if (
    typeof req.dailyRunCount === "number" &&
    typeof req.dailyRunLimit === "number" &&
    req.dailyRunCount >= req.dailyRunLimit
  ) {
    return {
      ok: false,
      code: "DAILY_LIMIT_REACHED",
      error: `Agent "${req.agentId}" reached its daily run limit (${req.dailyRunLimit}).`,
    };
  }

  const route = routes[req.routeId];
  const eligibility = checkModelEligibility(route, { allowPaid: req.allowPaid });
  if (!eligibility.ok) {
    return {
      ok: false,
      code: eligibility.code,
      error: eligibility.error,
    };
  }

  const startedAt = Date.now();
  try {
    if (route.provider === "google") {
      const google = createGoogleGenerativeAI({ apiKey: eligibility.apiKey });
      const res = await generateText({
        model: google(route.modelId),
        system: req.systemPrompt,
        prompt: req.userPrompt,
        maxOutputTokens: Math.min(req.maxTokens, 2048),
        abortSignal: AbortSignal.timeout(25000),
      });
      const latencyMs = Date.now() - startedAt;
      const inputTokens = res.usage?.inputTokens ?? 0;
      const outputTokens = res.usage?.outputTokens ?? 0;
      await recordModelUsageSafe({
        agentId: req.agentId,
        provider: route.provider,
        modelId: route.modelId,
        inputTokens,
        outputTokens,
      });
      return {
        ok: true,
        text: res.text.trim(),
        provider: route.provider,
        modelId: route.modelId,
        inputTokens,
        outputTokens,
        latencyMs,
      };
    }

    // OpenAI-compatible free endpoint (e.g. MiMo / Flint when configured & verified)
    const response = await fetch(`${route.baseUrl!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${eligibility.apiKey}`,
      },
      body: JSON.stringify({
        model: route.modelId,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
        max_tokens: Math.min(req.maxTokens, 2048),
      }),
      signal: AbortSignal.timeout(25000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        code: "PROVIDER_ERROR",
        provider: route.provider,
        modelId: route.modelId,
        error: `Provider returned HTTP ${response.status}`,
      };
    }

    const text = String(data?.choices?.[0]?.message?.content || "").trim();
    const inputTokens = Number(data?.usage?.prompt_tokens || 0);
    const outputTokens = Number(data?.usage?.completion_tokens || 0);
    await recordModelUsageSafe({
      agentId: req.agentId,
      provider: route.provider,
      modelId: route.modelId,
      inputTokens,
      outputTokens,
    });

    return {
      ok: true,
      text,
      provider: route.provider,
      modelId: route.modelId,
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      provider: route.provider,
      modelId: route.modelId,
      error: err instanceof Error ? err.message : "Model execution failed.",
    };
  }
}

async function recordModelUsageSafe(params: {
  agentId: AgentId;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    await supabase.from("ai_model_usage").insert({
      agent_id: params.agentId,
      provider: params.provider,
      model_id: params.modelId,
      billing_mode: "free",
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost_usd: 0,
    });
  } catch {
    // Non-fatal if migration not yet applied in dev
  }
}
