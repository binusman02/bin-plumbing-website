import { randomUUID } from "node:crypto";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import type { AgentId } from "@/lib/ai-workforce/types";

export interface StoredOwnerReport {
  id: string;
  taskId: string | null;
  agentId: AgentId;
  message: string;
  urgency: "low" | "normal" | "high" | "urgent";
  feedback?: "up" | "down" | null;
  feedbackNote?: string | null;
  deliveredAt: string;
}

export interface ReportStore {
  saveReport(report: StoredOwnerReport): Promise<StoredOwnerReport>;
  listReports(limit?: number): Promise<StoredOwnerReport[]>;
}

export class InMemoryReportStore implements ReportStore {
  public reports: StoredOwnerReport[] = [];

  async saveReport(report: StoredOwnerReport): Promise<StoredOwnerReport> {
    const clone = structuredClone(report);
    this.reports.unshift(clone);
    return structuredClone(clone);
  }

  async listReports(limit = 30): Promise<StoredOwnerReport[]> {
    return this.reports.slice(0, limit).map((r) => structuredClone(r));
  }
}

export class SupabaseReportStore implements ReportStore {
  async saveReport(report: StoredOwnerReport): Promise<StoredOwnerReport> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_reports").insert({
        id: report.id,
        task_id: report.taskId,
        agent_id: report.agentId,
        message: report.message,
        urgency: report.urgency,
        delivered_at: report.deliveredAt,
      });
    } catch {
      // Non-fatal if migration not yet applied in staging/test
    }
    return report;
  }

  async listReports(limit = 30): Promise<StoredOwnerReport[]> {
    try {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_reports")
        .select("id, task_id, agent_id, message, urgency, feedback, feedback_note, delivered_at")
        .order("delivered_at", { ascending: false })
        .limit(limit);
      return (data || []).map((r) => ({
        id: String(r.id),
        taskId: r.task_id ? String(r.task_id) : null,
        agentId: String(r.agent_id) as AgentId,
        message: String(r.message),
        urgency: String(r.urgency || "normal") as StoredOwnerReport["urgency"],
        feedback: (r.feedback ? String(r.feedback) : null) as "up" | "down" | null,
        feedbackNote: r.feedback_note ? String(r.feedback_note) : null,
        deliveredAt: String(r.delivered_at),
      }));
    } catch {
      return [];
    }
  }
}

export const defaultReportStore = new SupabaseReportStore();

export interface OwnerReportInput {
  agentId: AgentId;
  status:
    | "completed"
    | "reported"
    | "failed"
    | "blocked"
    | "waiting_approval"
    | "overdue"
    | "urgent";
  summary: string;
  evidence?: string[];
  pending?: string;
  ownerDecision?: string;
  taskId?: string | null;
  approvalId?: string | null;
  ticketNumber?: string | null;
  urgent?: boolean;
  urgency?: "low" | "normal" | "high" | "urgent";
  isHandoffChild?: boolean;
  changedNothing?: boolean;
  forceStoreReport?: boolean;
  destination?: string;
}

const NO_CHANGE_PATTERNS =
  /\b(nothing new|no new (enquiries|tickets|leads|issues|changes)|all clear|no action needed|0 pending|checked.*none)\b/i;

export function isRoutineNoChangeReport(input: OwnerReportInput): boolean {
  if (
    input.forceStoreReport ||
    input.urgent ||
    input.status === "urgent" ||
    input.status === "failed" ||
    input.status === "blocked" ||
    input.status === "overdue" ||
    input.status === "waiting_approval"
  ) {
    return false;
  }
  if (input.changedNothing) return true;
  return NO_CHANGE_PATTERNS.test(input.summary);
}

export async function reportToOwner(
  input: OwnerReportInput,
  notifyFn: typeof createNotification = createNotification,
  reportStore: ReportStore = defaultReportStore
): Promise<{ sent: boolean; reportId?: string; reason?: string }> {
  if (
    input.isHandoffChild &&
    !input.urgent &&
    input.status !== "waiting_approval" &&
    input.status !== "blocked"
  ) {
    return { sent: false, reason: "skipped_intermediate_handoff" };
  }

  if (isRoutineNoChangeReport(input)) {
    return { sent: false, reason: "skipped_routine_no_change" };
  }

  const agent = getAgentDefinition(input.agentId);
  const shortName = agent ? agent.displayName.split("—")[0].trim() : input.agentId;
  const isUrgent = Boolean(
    input.urgent || input.status === "urgent" || input.urgency === "urgent"
  );
  const urgency: StoredOwnerReport["urgency"] = isUrgent
    ? "urgent"
    : input.urgency || (input.status === "failed" || input.status === "blocked" || input.status === "overdue" ? "high" : "normal");

  const statusTag =
    input.status === "waiting_approval"
      ? "Waiting for your okay."
      : input.status === "failed"
        ? "Needs your attention (task failed)."
        : input.status === "blocked"
          ? "Blocked and needs your help."
          : input.status === "overdue"
            ? "Overdue after chase."
            : "";

  const cleanSummary = input.summary.replace(/\s+/g, " ").trim().slice(0, 220);
  const parts = [`${shortName}: ${cleanSummary}`];
  if (input.evidence && input.evidence.length > 0) {
    parts.push(`Evidence: ${input.evidence.slice(0, 2).join(", ")}`);
  }
  if (input.pending) {
    parts.push(`Pending: ${input.pending}`);
  }
  if (input.ownerDecision) {
    parts.push(`Decision needed: ${input.ownerDecision}`);
  } else if (statusTag && !cleanSummary.toLowerCase().includes("approval")) {
    parts.push(statusTag);
  }

  const fullMessage = parts.join(" • ").slice(0, 500);
  const titlePrefix = isUrgent ? "[URGENT] " : "";
  const title = `${titlePrefix}${shortName}: ${cleanSummary.slice(0, 72)}`;

  const saved = await reportStore.saveReport({
    id: randomUUID(),
    taskId: input.taskId ?? null,
    agentId: input.agentId,
    message: fullMessage,
    urgency,
    deliveredAt: new Date().toISOString(),
  });

  const destination =
    input.destination ||
    (input.approvalId
      ? `/admin/workforce?tab=approvals&approvalId=${encodeURIComponent(input.approvalId)}`
      : input.status === "waiting_approval"
        ? "/admin/workforce?tab=approvals"
        : "/admin/workforce?tab=tasks");

  const type = isUrgent
    ? "ai_urgent_alert"
    : input.status === "waiting_approval"
      ? "ai_approval_pending"
      : input.status === "failed" || input.status === "blocked"
        ? "ai_task_failed"
        : "ai_workforce_report";

  await notifyFn({
    recipientId: "admin",
    recipientRole: "admin",
    type,
    title,
    body: fullMessage,
    entityType: input.approvalId ? "ai_approval" : "ai_report",
    entityId: input.approvalId || saved.id,
    destination,
    dedupeKey: input.approvalId
      ? `owner-report:appr:${input.approvalId}`
      : input.taskId
        ? `owner-report:task:${input.taskId}:${input.status}`
        : undefined,
  });

  return { sent: true, reportId: saved.id };
}
