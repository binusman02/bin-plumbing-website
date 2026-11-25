import { NextResponse } from "next/server";
import { defaultApprovalService } from "@/lib/ai-workforce/approvals";
import {
  DEFAULT_MODEL_ROUTES,
  GLOBAL_PAID_SPEND_CAP_USD,
} from "@/lib/ai-workforce/model-adapter";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import { defaultReportStore } from "@/lib/ai-workforce/owner-report";
import { listAgentDefinitions } from "@/lib/ai-workforce/registry";
import { computeAgentScorecards } from "@/lib/ai-workforce/scorecard";
import { defaultTeamMemoryStore } from "@/lib/ai-workforce/team-memory";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [agents, tasks, approvals, aiReports, playbookRules] = await Promise.all([
    Promise.resolve(listAgentDefinitions()),
    defaultWorkforceOrchestrator.listTasks(100).catch(() => []),
    defaultApprovalService.listApprovals(30).catch(() => []),
    defaultReportStore.listReports(40).catch(() => []),
    defaultTeamMemoryStore.listPlaybookRules().catch(() => []),
  ]);

  const scorecards = computeAgentScorecards(tasks, aiReports);

  let usageRows: Array<Record<string, unknown>> = [];
  let auditRows: Array<Record<string, unknown>> = [];
  let ownerReports: Array<Record<string, unknown>> = [];
  let teamNotes: Array<Record<string, unknown>> = [];
  try {
    const supabase = getServiceSupabase();
    const [uRes, aRes, nRes, notesRes] = await Promise.all([
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
      supabase
        .from("notifications")
        .select("id, type, title, body, destination, read_at, created_at")
        .eq("recipient_role", "admin")
        .is("deleted_at", null)
        .in("type", [
          "ai_approval_pending",
          "engineering_incident",
          "ai_workforce_report",
          "ai_urgent_alert",
          "ai_task_failed",
        ])
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("ai_team_notes")
        .select("id, from_agent, to_agent, ticket_number, note, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);
    usageRows = (uRes.data || []) as Array<Record<string, unknown>>;
    auditRows = (aRes.data || []) as Array<Record<string, unknown>>;
    ownerReports = (nRes.data || []) as Array<Record<string, unknown>>;
    teamNotes = (notesRes.data || []) as Array<Record<string, unknown>>;
  } catch {
    // Migration may not be applied in local dev yet
  }

  const unreadReportCount = ownerReports.filter((r) => !r.read_at).length;

  return NextResponse.json({
    agents,
    tasks,
    approvals,
    ownerReports,
    aiReports,
    playbookRules,
    scorecards,
    unreadReportCount,
    teamNotes,
    usage: {
      globalPaidSpendCapUsd: GLOBAL_PAID_SPEND_CAP_USD,
      routes: Object.values(DEFAULT_MODEL_ROUTES).map((r) => ({
        routeId: r.routeId,
        provider: r.provider,
        modelId: r.modelId,
        billingTier: r.billingTier,
        dataTermsVerified: r.dataTermsVerified,
        configured: Boolean(
          process.env[r.envKeyName]?.trim() ||
            (r.fallbackEnvKeyName ? process.env[r.fallbackEnvKeyName]?.trim() : "")
        ),
        notes: r.notes,
      })),
      recentRuns: usageRows,
    },
    auditLogs: auditRows,
  });
}
