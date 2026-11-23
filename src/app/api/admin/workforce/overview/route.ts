import { NextResponse } from "next/server";
import { defaultApprovalService } from "@/lib/ai-workforce/approvals";
import {
  DEFAULT_MODEL_ROUTES,
  GLOBAL_PAID_SPEND_CAP_USD,
} from "@/lib/ai-workforce/model-adapter";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import { listAgentDefinitions } from "@/lib/ai-workforce/registry";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [agents, tasks, approvals] = await Promise.all([
    Promise.resolve(listAgentDefinitions()),
    defaultWorkforceOrchestrator.listTasks(30).catch(() => []),
    defaultApprovalService.listApprovals(30).catch(() => []),
  ]);

  let usageRows: Array<Record<string, unknown>> = [];
  let auditRows: Array<Record<string, unknown>> = [];
  try {
    const supabase = getServiceSupabase();
    const [uRes, aRes] = await Promise.all([
      supabase
        .from("ai_model_usage")
        .select("agent_id, provider, model_id, billing_mode, input_tokens, output_tokens, estimated_cost_usd, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("ai_audit_logs")
        .select("id, actor_type, actor_id, event_type, target_resource, details, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    usageRows = (uRes.data || []) as Array<Record<string, unknown>>;
    auditRows = (aRes.data || []) as Array<Record<string, unknown>>;
  } catch {
    // Migration may not be applied in local dev yet
  }

  return NextResponse.json({
    agents,
    tasks,
    approvals,
    usage: {
      globalPaidSpendCapUsd: GLOBAL_PAID_SPEND_CAP_USD,
      routes: Object.values(DEFAULT_MODEL_ROUTES).map((r) => ({
        routeId: r.routeId,
        provider: r.provider,
        modelId: r.modelId,
        billingTier: r.billingTier,
        dataTermsVerified: r.dataTermsVerified,
        configured: Boolean(process.env[r.envKeyName]?.trim()),
        notes: r.notes,
      })),
      recentRuns: usageRows,
    },
    auditLogs: auditRows,
  });
}
