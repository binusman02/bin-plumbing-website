import { randomUUID } from "node:crypto";
import { createNotification } from "@/lib/notifications";
import {
  defaultHandoffStore,
  markOverdueHandoffs,
  type HandoffStore,
} from "@/lib/ai-workforce/handoffs";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import {
  SupabaseTaskStore,
  type TaskStore,
  type WorkforceTask,
} from "@/lib/ai-workforce/orchestrator";
import {
  defaultReportStore,
  reportToOwner,
  type ReportStore,
} from "@/lib/ai-workforce/owner-report";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import {
  defaultTeamMemoryStore,
  recordTeamNote,
  saveTaskMemories,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";

export type RoutineKind =
  | "chase_overdue"
  | "morning_standup"
  | "eod_report"
  | "weekly_review";

const OPEN_TASK_STATUSES = new Set([
  "queued",
  "accepted",
  "in_progress",
  "running",
  "rework",
  "waiting_approval",
]);

export function findOverdueTasks(tasks: WorkforceTask[], now: Date = new Date()): WorkforceTask[] {
  const nowMs = now.getTime();
  return tasks.filter((t) => {
    if (!OPEN_TASK_STATUSES.has(t.status)) return false;
    if (!t.dueAt) return false;
    const dueMs = new Date(t.dueAt).getTime();
    return Number.isFinite(dueMs) && dueMs < nowMs;
  });
}

export async function runOverdueChaseRoutine(deps: {
  taskStore?: TaskStore;
  handoffStore?: HandoffStore;
  teamStore?: TeamBoardAndMemoryStore;
  notifyFn?: typeof createNotification;
  reportStore?: ReportStore;
  now?: Date;
} = {}): Promise<{
  overdueHandoffs: number;
  chasedTasks: number;
  escalatedToOwner: number;
}> {
  const taskStore = deps.taskStore ?? new SupabaseTaskStore();
  const handoffStore = deps.handoffStore ?? defaultHandoffStore;
  const teamStore = deps.teamStore ?? defaultTeamMemoryStore;
  const notifyFn = deps.notifyFn ?? createNotification;
  const reportStore = deps.reportStore ?? defaultReportStore;
  const now = deps.now ?? new Date();

  const overdueHandoffs = await markOverdueHandoffs(handoffStore, now);
  for (const h of overdueHandoffs) {
    await recordTeamNote(
      {
        fromAgent: "operations_manager",
        toAgent: h.toAgent,
        taskId: h.taskId,
        note: `Sadiq to ${h.toAgent}: handoff from ${h.fromAgent} is overdue (${h.ask}). Respond now.`,
      },
      teamStore
    ).catch(() => {});
  }

  const allTasks = await taskStore.listTasks(100);
  const overdueTasks = findOverdueTasks(allTasks, now);
  let chasedTasks = 0;
  let escalatedToOwner = 0;

  for (const task of overdueTasks) {
    const nextChased = (task.chasedCount || 0) + 1;
    await taskStore.updateTask(task.id, { chasedCount: nextChased });

    if (task.chasedCount === 0) {
      chasedTasks += 1;
      await taskStore.appendEvent({
        id: randomUUID(),
        taskId: task.id,
        agentId: "operations_manager",
        eventType: "chased",
        message: `Sadiq chased ${task.ownerAgent} — work order overdue (due ${task.dueAt}).`,
        createdAt: now.toISOString(),
      });
      await recordTeamNote(
        {
          fromAgent: "operations_manager",
          toAgent: task.ownerAgent,
          taskId: task.id,
          note: `Sadiq to ${task.ownerAgent}: "${task.title}" is overdue. Please update or submit right away.`,
        },
        teamStore
      ).catch(() => {});
    } else {
      escalatedToOwner += 1;
      await taskStore.appendEvent({
        id: randomUUID(),
        taskId: task.id,
        agentId: "operations_manager",
        eventType: "chased",
        message: `Still stuck after chase #1 — Sadiq escalated "${task.title}" to Owner.`,
        createdAt: now.toISOString(),
      });
      await reportToOwner(
        {
          agentId: "operations_manager",
          status: "overdue",
          urgent: true,
          taskId: task.id,
          summary: `"${task.title}" (assigned to ${task.ownerAgent}) is still overdue after chasing.`,
          pending: "Stuck past SLA",
          ownerDecision: "Reassign, unblock, or cancel",
          forceStoreReport: true,
        },
        notifyFn,
        reportStore
      );
    }
  }

  return {
    overdueHandoffs: overdueHandoffs.length,
    chasedTasks,
    escalatedToOwner,
  };
}

export async function runBriefingRoutine(
  kind: Exclude<RoutineKind, "chase_overdue">,
  deps: {
    taskStore?: TaskStore;
    teamStore?: TeamBoardAndMemoryStore;
    reportStore?: ReportStore;
    notifyFn?: typeof createNotification;
    modelRunner?: typeof runWithFreeFirstModel;
    now?: Date;
  } = {}
): Promise<{ reportId?: string; message: string }> {
  const taskStore = deps.taskStore ?? new SupabaseTaskStore();
  const teamStore = deps.teamStore ?? defaultTeamMemoryStore;
  const reportStore = deps.reportStore ?? defaultReportStore;
  const notifyFn = deps.notifyFn ?? createNotification;
  const now = deps.now ?? new Date();

  const tasks = await taskStore.listTasks(100);
  const reports = await reportStore.listReports(40);
  const openTasks = tasks.filter((t) => OPEN_TASK_STATUSES.has(t.status));
  const overdueTasks = findOverdueTasks(tasks, now);
  const waitingApprovals = tasks.filter((t) => t.status === "waiting_approval");
  const doneRecently = tasks.filter(
    (t) =>
      (t.status === "closed" || t.status === "completed") &&
      t.completedAt &&
      now.getTime() - new Date(t.completedAt).getTime() <= 24 * 60 * 60 * 1000
  );
  const blockedOrFailed = tasks.filter((t) => t.status === "blocked" || t.status === "failed");

  const statsLine =
    kind === "morning_standup"
      ? `Morning Standup: ${openTasks.length} open work orders, ${overdueTasks.length} overdue, ${waitingApprovals.length} waiting Owner approval. Top priorities: ${openTasks.slice(0, 3).map((t) => t.title).join("; ") || "None queued"}.`
      : kind === "eod_report"
        ? `End of Day Report: ${doneRecently.length} done today, ${openTasks.length} still open (${blockedOrFailed.length} blocked/failed). Tomorrow focus: ${openTasks.slice(0, 3).map((t) => t.title).join("; ") || "Clear queue"}.`
        : `Weekly Review: ${tasks.filter((t) => t.status === "closed" || t.status === "completed").length} closed total, ${tasks.filter((t) => t.reworkCount > 0).length} needed QA rework, ${reports.filter((r) => r.feedback === "up").length} Owner thumbs-up, ${reports.filter((r) => r.feedback === "down").length} thumbs-down. Lessons saved: ${tasks.flatMap((t) => t.lessons || []).slice(0, 3).join("; ") || "Keep enforcing checklists"}.`;

  let finalSummary = statsLine;
  const sadiq = getAgentDefinition("operations_manager");
  if (sadiq && deps.modelRunner) {
    const res = await deps.modelRunner({
      agentId: "operations_manager",
      routeId: sadiq.modelRoute,
      systemPrompt: `${sadiq.systemPrompt}\nSummarize this factual operations briefing cleanly in 2 sentences for the Founder. Never invent numbers.`,
      userPrompt: statsLine,
      maxTokens: 200,
    });
    if (res.ok && res.text) {
      finalSummary = res.text;
    }
  }

  if (kind === "weekly_review") {
    await saveTaskMemories(
      {
        agentId: "operations_manager",
        namespace: sadiq?.memoryNamespace || "ns_operations_manager",
        taskId: `weekly:${now.toISOString().slice(0, 10)}`,
        outputText: finalSummary,
        shareWithTeam: true,
      },
      teamStore
    ).catch(() => {});
  }

  await recordTeamNote(
    {
      fromAgent: "operations_manager",
      toAgent: null,
      note: finalSummary.slice(0, 260),
    },
    teamStore
  ).catch(() => {});

  const rep = await reportToOwner(
    {
      agentId: "operations_manager",
      status: overdueTasks.length > 0 ? "overdue" : "reported",
      urgency: overdueTasks.length > 0 ? "high" : "normal",
      summary: finalSummary,
      forceStoreReport: true,
    },
    notifyFn,
    reportStore
  );

  return { reportId: rep.reportId, message: finalSummary };
}
