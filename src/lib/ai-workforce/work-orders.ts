import { randomUUID } from "node:crypto";
import type { AgentId } from "@/lib/ai-workforce/types";

export type WorkOrderStatus =
  | "queued"
  | "accepted"
  | "in_progress"
  | "running"
  | "submitted"
  | "qa_review"
  | "approved_by_ops"
  | "rework"
  | "reported"
  | "closed"
  | "waiting_approval"
  | "blocked"
  | "failed"
  | "cancelled"
  | "completed";

export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";

export const ALLOWED_WORK_ORDER_TRANSITIONS: Record<
  WorkOrderStatus,
  readonly WorkOrderStatus[]
> = {
  queued: ["accepted", "blocked", "failed", "cancelled"],
  accepted: ["in_progress", "blocked", "failed", "cancelled"],
  in_progress: ["submitted", "waiting_approval", "blocked", "failed", "cancelled"],
  running: ["submitted", "waiting_approval", "blocked", "failed", "cancelled"],
  waiting_approval: ["in_progress", "submitted", "blocked", "failed", "cancelled"],
  submitted: ["qa_review", "failed", "cancelled"],
  qa_review: ["approved_by_ops", "rework", "waiting_approval", "blocked", "failed", "cancelled"],
  rework: ["in_progress", "blocked", "failed", "cancelled"],
  approved_by_ops: ["reported", "failed", "cancelled"],
  reported: ["closed", "rework", "failed"],
  blocked: ["in_progress", "queued", "failed", "cancelled"],
  closed: [],
  failed: [],
  cancelled: [],
  completed: [],
};

export function computeDueAtFromPriority(
  priority: WorkOrderPriority,
  fromDate: Date = new Date()
): string {
  const msByPriority: Record<WorkOrderPriority, number> = {
    urgent: 15 * 60 * 1000,
    high: 2 * 60 * 60 * 1000,
    normal: 24 * 60 * 60 * 1000,
    low: 3 * 24 * 60 * 60 * 1000,
  };
  return new Date(fromDate.getTime() + (msByPriority[priority] ?? msByPriority.normal)).toISOString();
}

export class IllegalTaskTransitionError extends Error {
  constructor(
    public readonly taskId: string,
    public readonly fromStatus: WorkOrderStatus,
    public readonly toStatus: WorkOrderStatus,
    message: string
  ) {
    super(message);
    this.name = "IllegalTaskTransitionError";
  }
}

export interface WorkOrderRecord {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  assignedAgentId: AgentId;
  ownerAgent: AgentId;
  createdBy: string;
  parentTaskId: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  dueAt: string | null;
  definitionOfDone: string | null;
  deliverable: string | null;
  evidence: string[];
  qaStatus: "pending" | "approved" | "rework" | "skipped" | null;
  qaNotes: string | null;
  reworkCount: number;
  chasedCount: number;
  lessons: string[];
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkOrderTransitionStore {
  findTask(id: string): Promise<WorkOrderRecord | null>;
  updateTask(id: string, patch: Partial<WorkOrderRecord>): Promise<WorkOrderRecord | null>;
  appendEvent(event: {
    id: string;
    taskId: string;
    agentId: AgentId;
    eventType: string;
    message: string;
    createdAt: string;
  }): Promise<void>;
  logTransitionRejection?: (params: {
    taskId: string;
    agentId: AgentId;
    fromStatus: WorkOrderStatus;
    toStatus: WorkOrderStatus;
    reason: string;
  }) => Promise<void>;
}

export async function transitionTask(params: {
  store: WorkOrderTransitionStore;
  taskId: string;
  toStatus: WorkOrderStatus;
  actorAgentId?: AgentId;
  eventMessage?: string;
  deliverable?: string | null;
  evidence?: string[];
  qaStatus?: WorkOrderRecord["qaStatus"];
  qaNotes?: string | null;
  reworkCount?: number;
  chasedCount?: number;
  lessons?: string[];
  outputSummary?: string | null;
  errorMessage?: string | null;
  reportId?: string | null;
  onReportRequired?: (task: WorkOrderRecord, toStatus: WorkOrderStatus) => Promise<{
    reportId?: string | null;
  }>;
}): Promise<{ task: WorkOrderRecord; reportId?: string | null }> {
  const current = await params.store.findTask(params.taskId);
  if (!current) {
    throw new Error(`Work order "${params.taskId}" not found.`);
  }

  const actor = params.actorAgentId ?? current.ownerAgent ?? current.assignedAgentId;
  const allowedNext = ALLOWED_WORK_ORDER_TRANSITIONS[current.status] || [];

  const reject = async (reason: string): Promise<never> => {
    await params.store
      .logTransitionRejection?.({
        taskId: current.id,
        agentId: actor,
        fromStatus: current.status,
        toStatus: params.toStatus,
        reason,
      })
      .catch(() => {});
    throw new IllegalTaskTransitionError(current.id, current.status, params.toStatus, reason);
  };

  if (!allowedNext.includes(params.toStatus)) {
    await reject(
      `Illegal status transition "${current.status}" -> "${params.toStatus}" on task ${current.id}.`
    );
  }

  const nextDeliverable =
    params.deliverable !== undefined ? params.deliverable : current.deliverable;
  const nextLessons = params.lessons !== undefined ? params.lessons : current.lessons;

  if (params.toStatus === "submitted" && (!nextDeliverable || !nextDeliverable.trim())) {
    await reject("Cannot move work order to 'submitted' without a deliverable.");
  }

  if (params.toStatus === "closed") {
    if (current.status !== "reported") {
      await reject("Cannot move work order to 'closed' until it has reached 'reported'.");
    }
    if (!nextLessons || nextLessons.length === 0) {
      await reject("Cannot move work order to 'closed' without saved lessons (1 to 3 short facts).");
    }
  }

  const patch: Partial<WorkOrderRecord> = {
    status: params.toStatus,
  };
  if (params.deliverable !== undefined) patch.deliverable = params.deliverable;
  if (params.evidence !== undefined) patch.evidence = params.evidence;
  if (params.qaStatus !== undefined) patch.qaStatus = params.qaStatus;
  if (params.qaNotes !== undefined) patch.qaNotes = params.qaNotes;
  if (params.reworkCount !== undefined) patch.reworkCount = params.reworkCount;
  if (params.chasedCount !== undefined) patch.chasedCount = params.chasedCount;
  if (params.lessons !== undefined) patch.lessons = params.lessons;
  if (params.outputSummary !== undefined) patch.outputSummary = params.outputSummary;
  if (params.errorMessage !== undefined) patch.errorMessage = params.errorMessage;
  if (["closed", "failed", "cancelled"].includes(params.toStatus)) {
    patch.completedAt = new Date().toISOString();
  }

  let storedReportId: string | null = params.reportId ?? null;
  const reportMandatoryStatuses: WorkOrderStatus[] = [
    "reported",
    "failed",
    "blocked",
    "waiting_approval",
  ];

  if (reportMandatoryStatuses.includes(params.toStatus) && params.onReportRequired) {
    const draftNext: WorkOrderRecord = { ...current, ...patch };
    const reportOut = await params.onReportRequired(draftNext, params.toStatus);
    if (reportOut?.reportId) {
      storedReportId = reportOut.reportId;
    }
  }

  if (params.toStatus === "reported" && !storedReportId) {
    await reject("Cannot mark work order 'reported' without a stored ai_reports record.");
  }

  const updated = await params.store.updateTask(current.id, patch);
  if (!updated) {
    throw new Error(`Failed to persist transition to "${params.toStatus}" on task ${current.id}.`);
  }

  const eventTypeMap: Partial<Record<WorkOrderStatus, string>> = {
    qa_review: "qa_review",
    rework: "rework",
    reported: "reported",
    closed: "closed",
    waiting_approval: "approval_requested",
    failed: "failed",
    cancelled: "cancelled",
  };

  await params.store.appendEvent({
    id: randomUUID(),
    taskId: current.id,
    agentId: actor,
    eventType: eventTypeMap[params.toStatus] || "status_changed",
    message:
      params.eventMessage ||
      `Transitioned ${current.status} -> ${params.toStatus}.`,
    createdAt: new Date().toISOString(),
  });

  return { task: updated, reportId: storedReportId };
}
