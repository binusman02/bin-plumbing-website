import { createNotification } from "@/lib/notifications";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import type { AgentId } from "@/lib/ai-workforce/types";

export interface OwnerReportInput {
  agentId: AgentId;
  status: "completed" | "failed" | "waiting_approval" | "urgent";
  summary: string;
  taskId?: string | null;
  approvalId?: string | null;
  ticketNumber?: string | null;
  urgent?: boolean;
  isHandoffChild?: boolean;
  changedNothing?: boolean;
  destination?: string;
}

const NO_CHANGE_PATTERNS =
  /\b(nothing new|no new (enquiries|tickets|leads|issues|changes)|all clear|no action needed|0 pending|checked.*none)\b/i;

export function isRoutineNoChangeReport(input: OwnerReportInput): boolean {
  if (input.urgent || input.status === "urgent" || input.status === "failed" || input.status === "waiting_approval") {
    return false;
  }
  if (input.changedNothing) return true;
  return NO_CHANGE_PATTERNS.test(input.summary);
}

export async function reportToOwner(
  input: OwnerReportInput,
  notifyFn: typeof createNotification = createNotification
): Promise<{ sent: boolean; reason?: string }> {
  // For handoffs, only report the final parent result (unless urgent or waiting_approval)
  if (input.isHandoffChild && !input.urgent && input.status !== "waiting_approval") {
    return { sent: false, reason: "skipped_intermediate_handoff" };
  }

  // Do not spam Owner with routine read-only checks that changed nothing
  if (isRoutineNoChangeReport(input)) {
    return { sent: false, reason: "skipped_routine_no_change" };
  }

  const agent = getAgentDefinition(input.agentId);
  const shortName = agent ? agent.displayName.split("—")[0].trim() : input.agentId;
  const isUrgent = Boolean(input.urgent || input.status === "urgent");

  const statusTag =
    input.status === "waiting_approval"
      ? "Waiting for your okay."
      : input.status === "failed"
        ? "Needs your attention (task failed)."
        : "";

  const cleanSummary = input.summary.replace(/\s+/g, " ").trim().slice(0, 220);
  const titlePrefix = isUrgent ? "[URGENT] " : "";
  const title = `${titlePrefix}${shortName}: ${cleanSummary.slice(0, 72)}`;
  const body = statusTag && !cleanSummary.toLowerCase().includes("approval")
    ? `${shortName}: ${cleanSummary} ${statusTag}`
    : `${shortName}: ${cleanSummary}`;

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
      : input.status === "failed"
        ? "ai_task_failed"
        : "ai_workforce_report";

  await notifyFn({
    recipientId: "admin",
    recipientRole: "admin",
    type,
    title,
    body,
    entityType: input.approvalId ? "ai_approval" : "ai_task",
    entityId: input.approvalId || input.taskId || input.ticketNumber || "",
    destination,
    dedupeKey: input.approvalId
      ? `owner-report:appr:${input.approvalId}`
      : input.taskId
        ? `owner-report:task:${input.taskId}:${input.status}`
        : undefined,
  });

  return { sent: true };
}
