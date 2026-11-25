import { listAgentDefinitions } from "@/lib/ai-workforce/registry";
import type { WorkforceTask } from "@/lib/ai-workforce/orchestrator";
import type { StoredOwnerReport } from "@/lib/ai-workforce/owner-report";
import type { AgentId } from "@/lib/ai-workforce/types";

export interface AgentScorecardRow {
  agentId: AgentId;
  displayName: string;
  tasksDone: number;
  onTimePct: number;
  qaReworkRatePct: number;
  thumbsUp: number;
  thumbsDown: number;
  openCount: number;
  overdueCount: number;
}

const OPEN_STATUSES = new Set([
  "queued",
  "accepted",
  "in_progress",
  "running",
  "rework",
  "waiting_approval",
  "submitted",
  "qa_review",
  "approved_by_ops",
]);

export function computeAgentScorecards(
  tasks: WorkforceTask[],
  reports: StoredOwnerReport[],
  now: Date = new Date()
): AgentScorecardRow[] {
  const nowMs = now.getTime();
  return listAgentDefinitions().map((agent) => {
    const agentTasks = tasks.filter(
      (t) => (t.ownerAgent || t.assignedAgentId) === agent.id
    );
    const done = agentTasks.filter(
      (t) => t.status === "closed" || t.status === "completed" || t.status === "reported"
    );
    const withDue = done.filter((t) => Boolean(t.dueAt && t.completedAt));
    const onTimeCount = withDue.filter(
      (t) => new Date(t.completedAt!).getTime() <= new Date(t.dueAt!).getTime()
    ).length;
    const onTimePct =
      done.length === 0
        ? 100
        : withDue.length === 0
          ? 100
          : Math.round((onTimeCount / withDue.length) * 100);

    const submittedOrDone = agentTasks.filter(
      (t) =>
        t.reworkCount > 0 ||
        ["submitted", "qa_review", "approved_by_ops", "rework", "reported", "closed", "completed", "blocked"].includes(
          t.status
        )
    );
    const reworkedCount = submittedOrDone.filter((t) => (t.reworkCount || 0) > 0).length;
    const qaReworkRatePct =
      submittedOrDone.length === 0
        ? 0
        : Math.round((reworkedCount / submittedOrDone.length) * 100);

    const open = agentTasks.filter((t) => OPEN_STATUSES.has(t.status));
    const overdue = open.filter((t) => {
      if (!t.dueAt) return false;
      const ms = new Date(t.dueAt).getTime();
      return Number.isFinite(ms) && ms < nowMs;
    });

    const agentReports = reports.filter((r) => r.agentId === agent.id);
    const thumbsUp = agentReports.filter((r) => r.feedback === "up").length;
    const thumbsDown = agentReports.filter((r) => r.feedback === "down").length;

    return {
      agentId: agent.id,
      displayName: agent.displayName,
      tasksDone: done.length,
      onTimePct,
      qaReworkRatePct,
      thumbsUp,
      thumbsDown,
      openCount: open.length,
      overdueCount: overdue.length,
    };
  });
}
