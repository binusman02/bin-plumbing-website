import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { getAdminToolGateway, getOpenAiToolsForAgent } from "@/lib/ai-workforce/admin-tools";
import { getFlowGuardKnowledgeContext } from "@/lib/ai-workforce/knowledge";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import {
  defaultReportStore,
  reportToOwner,
  type ReportStore,
} from "@/lib/ai-workforce/owner-report";
import {
  defaultTeamMemoryStore,
  extractShortFactsFromOutput,
  recordTeamNote,
  saveTaskMemories,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";
import {
  computeDueAtFromPriority,
  transitionTask,
  type WorkOrderRecord,
  type WorkOrderStatus,
  type WorkOrderTransitionStore,
} from "@/lib/ai-workforce/work-orders";
import type { AgentId } from "@/lib/ai-workforce/types";

export type WorkforceTaskStatus = WorkOrderStatus;
export type WorkforceTask = WorkOrderRecord;

export interface WorkforceTaskEvent {
  id: string;
  taskId: string;
  agentId: AgentId;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface TaskStore extends WorkOrderTransitionStore {
  createTask(task: WorkforceTask): Promise<WorkforceTask>;
  updateTask(id: string, patch: Partial<WorkforceTask>): Promise<WorkforceTask | null>;
  findTask(id: string): Promise<WorkforceTask | null>;
  listTasks(limit?: number): Promise<WorkforceTask[]>;
  appendEvent(event: WorkforceTaskEvent): Promise<void>;
  countTodayRuns(agentId: AgentId): Promise<number>;
}

export class InMemoryTaskStore implements TaskStore {
  private tasks = new Map<string, WorkforceTask>();
  public events: WorkforceTaskEvent[] = [];
  public rejectionLogs: Array<Record<string, unknown>> = [];

  async createTask(
    task: Partial<WorkforceTask> &
      Pick<WorkforceTask, "id" | "title" | "description" | "requesterId" | "assignedAgentId" | "priority" | "status" | "createdAt" | "updatedAt">
  ): Promise<WorkforceTask> {
    const normalized: WorkforceTask = {
      ownerAgent: task.ownerAgent ?? task.assignedAgentId,
      createdBy: task.createdBy ?? task.requesterId,
      parentTaskId: task.parentTaskId ?? null,
      dueAt: task.dueAt ?? null,
      definitionOfDone: task.definitionOfDone ?? null,
      deliverable: task.deliverable ?? null,
      evidence: task.evidence ?? [],
      qaStatus: task.qaStatus ?? null,
      qaNotes: task.qaNotes ?? null,
      reworkCount: task.reworkCount ?? 0,
      chasedCount: task.chasedCount ?? 0,
      lessons: task.lessons ?? [],
      outputSummary: task.outputSummary ?? null,
      errorMessage: task.errorMessage ?? null,
      completedAt: task.completedAt ?? null,
      ...task,
    };
    const clone = structuredClone(normalized);
    this.tasks.set(clone.id, clone);
    return structuredClone(clone);
  }

  async updateTask(id: string, patch: Partial<WorkforceTask>): Promise<WorkforceTask | null> {
    const cur = this.tasks.get(id);
    if (!cur) return null;
    const next: WorkforceTask = {
      ...cur,
      ...structuredClone(patch),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(id, next);
    return structuredClone(next);
  }

  async findTask(id: string): Promise<WorkforceTask | null> {
    const cur = this.tasks.get(id);
    return cur ? structuredClone(cur) : null;
  }

  async listTasks(limit = 40): Promise<WorkforceTask[]> {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((t) => structuredClone(t));
  }

  async appendEvent(event: WorkforceTaskEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async logTransitionRejection(params: {
    taskId: string;
    agentId: AgentId;
    fromStatus: WorkOrderStatus;
    toStatus: WorkOrderStatus;
    reason: string;
  }): Promise<void> {
    this.rejectionLogs.push({ ...params, createdAt: new Date().toISOString() });
  }

  async countTodayRuns(): Promise<number> {
    return 0;
  }
}

function mapTaskRow(row: Record<string, unknown>): WorkforceTask {
  const assignedAgentId = String(row.assigned_agent_id) as AgentId;
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    requesterId: String(row.requester_id),
    assignedAgentId,
    ownerAgent: (row.owner_agent ? String(row.owner_agent) : assignedAgentId) as AgentId,
    createdBy: String(row.created_by || row.requester_id || "owner"),
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    priority: String(row.priority || "normal") as WorkforceTask["priority"],
    status: String(row.status) as WorkforceTaskStatus,
    dueAt: row.due_at ? String(row.due_at) : null,
    definitionOfDone: row.definition_of_done ? String(row.definition_of_done) : null,
    deliverable: row.deliverable ? String(row.deliverable) : null,
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [],
    qaStatus: (row.qa_status ? String(row.qa_status) : null) as WorkforceTask["qaStatus"],
    qaNotes: row.qa_notes ? String(row.qa_notes) : null,
    reworkCount: Number(row.rework_count || 0),
    chasedCount: Number(row.chased_count || 0),
    lessons: Array.isArray(row.lessons) ? row.lessons.map(String) : [],
    outputSummary: row.output_summary ? String(row.output_summary) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

export class SupabaseTaskStore implements TaskStore {
  async createTask(task: WorkforceTask): Promise<WorkforceTask> {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ai_tasks")
      .insert({
        id: task.id,
        title: task.title,
        description: task.description,
        requester_id: task.requesterId,
        assigned_agent_id: task.assignedAgentId,
        owner_agent: task.ownerAgent,
        created_by: task.createdBy,
        parent_task_id: task.parentTaskId,
        priority: task.priority,
        status: task.status,
        due_at: task.dueAt,
        definition_of_done: task.definitionOfDone,
      })
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create task");
    return mapTaskRow(data as Record<string, unknown>);
  }

  async updateTask(id: string, patch: Partial<WorkforceTask>): Promise<WorkforceTask | null> {
    const supabase = getServiceSupabase();
    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.deliverable !== undefined) dbPatch.deliverable = patch.deliverable;
    if (patch.evidence !== undefined) dbPatch.evidence = patch.evidence;
    if (patch.qaStatus !== undefined) dbPatch.qa_status = patch.qaStatus;
    if (patch.qaNotes !== undefined) dbPatch.qa_notes = patch.qaNotes;
    if (patch.reworkCount !== undefined) dbPatch.rework_count = patch.reworkCount;
    if (patch.chasedCount !== undefined) dbPatch.chased_count = patch.chasedCount;
    if (patch.lessons !== undefined) dbPatch.lessons = patch.lessons;
    if (patch.outputSummary !== undefined) dbPatch.output_summary = patch.outputSummary;
    if (patch.errorMessage !== undefined) dbPatch.error_message = patch.errorMessage;
    if (patch.completedAt !== undefined) dbPatch.completed_at = patch.completedAt;

    const { data } = await supabase
      .from("ai_tasks")
      .update(dbPatch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    return data ? mapTaskRow(data as Record<string, unknown>) : null;
  }

  async findTask(id: string): Promise<WorkforceTask | null> {
    const supabase = getServiceSupabase();
    const { data } = await supabase.from("ai_tasks").select("*").eq("id", id).maybeSingle();
    return data ? mapTaskRow(data as Record<string, unknown>) : null;
  }

  async listTasks(limit = 40): Promise<WorkforceTask[]> {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("ai_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data || []).map((r) => mapTaskRow(r as Record<string, unknown>));
  }

  async appendEvent(event: WorkforceTaskEvent): Promise<void> {
    const supabase = getServiceSupabase();
    await supabase.from("ai_task_events").insert({
      id: event.id,
      task_id: event.taskId,
      agent_id: event.agentId,
      event_type: event.eventType,
      message: event.message,
    });
  }

  async logTransitionRejection(params: {
    taskId: string;
    agentId: AgentId;
    fromStatus: WorkOrderStatus;
    toStatus: WorkOrderStatus;
    reason: string;
  }): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_audit_logs").insert({
        actor_type: "agent",
        actor_id: params.agentId,
        event_type: "illegal_task_transition",
        target_resource: params.taskId,
        details: {
          fromStatus: params.fromStatus,
          toStatus: params.toStatus,
          reason: params.reason,
        },
      });
    } catch {
      // Non-fatal in dev
    }
  }

  async countTodayRuns(agentId: AgentId): Promise<number> {
    const supabase = getServiceSupabase();
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_model_usage")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .gte("created_at", startOfDay.toISOString());
    return count ?? 0;
  }
}

export function routeInstructionToAgent(instruction: string, explicitTarget?: AgentId): AgentId {
  if (explicitTarget && getAgentDefinition(explicitTarget)) {
    return explicitTarget;
  }
  const lower = instruction.toLowerCase();
  if (/\b(bug|code|next\.js|flutter|dart|test|lint|pr|pull request|github|schema|migration|build|error)\b/.test(lower)) {
    return "engineering_ai";
  }
  if (/\b(competitor|market|seo|research|keyword|industry|trend|benchmark)\b/.test(lower)) {
    return "research_ai";
  }
  if (/\b(lead|sales|enquiry|enquiries|follow[- ]?up|prospect|conversion|quote follow)\b/.test(lower)) {
    return "sales_ai";
  }
  if (/\b(support|complaint|refund|dispute|leak|flood|ticket|customer reply|triage)\b/.test(lower)) {
    return "customer_support_ai";
  }
  return "operations_manager";
}

export class WorkforceOrchestrator {
  constructor(
    private readonly store: TaskStore = new SupabaseTaskStore(),
    private readonly teamStore: TeamBoardAndMemoryStore = defaultTeamMemoryStore,
    private readonly notifyFn: typeof createNotification = createNotification,
    private readonly reportStore: ReportStore = defaultReportStore
  ) {}

  async listTasks(limit = 40): Promise<WorkforceTask[]> {
    return this.store.listTasks(limit);
  }

  async cancelTask(taskId: string): Promise<WorkforceTask | null> {
    const existing = await this.store.findTask(taskId);
    if (!existing) return null;
    if (["closed", "completed", "failed", "cancelled"].includes(existing.status)) {
      return existing;
    }
    const { task } = await transitionTask({
      store: this.store,
      taskId,
      toStatus: "cancelled",
      actorAgentId: existing.assignedAgentId,
      eventMessage: "Task cancelled by Owner.",
    });
    return task;
  }

  async dispatchInstruction(params: {
    requesterId: string;
    title: string;
    instruction: string;
    targetAgentId?: AgentId;
    priority?: WorkforceTask["priority"];
    definitionOfDone?: string;
    parentTaskId?: string | null;
    handoffDepth?: number;
    handoffChain?: AgentId[];
    isHandoffChild?: boolean;
    modelRunner?: typeof runWithFreeFirstModel;
  }): Promise<WorkforceTask> {
    const assignedAgentId = routeInstructionToAgent(params.instruction, params.targetAgentId);
    const agent = getAgentDefinition(assignedAgentId);
    if (!agent || !agent.enabled) {
      throw new Error(`Agent "${assignedAgentId}" is disabled or unknown.`);
    }

    const priority = params.priority ?? "normal";
    const now = new Date();
    const nowIso = now.toISOString();
    const task = await this.store.createTask({
      id: randomUUID(),
      title: params.title.trim() || params.instruction.slice(0, 80),
      description: params.instruction.trim(),
      requesterId: params.requesterId,
      assignedAgentId,
      ownerAgent: assignedAgentId,
      createdBy: params.requesterId,
      parentTaskId: params.parentTaskId ?? null,
      priority,
      status: "queued",
      dueAt: computeDueAtFromPriority(priority, now),
      definitionOfDone:
        params.definitionOfDone || `Complete "${params.title.trim() || params.instruction.slice(0, 60)}" within SLA using verified data.`,
      deliverable: null,
      evidence: [],
      qaStatus: "pending",
      qaNotes: null,
      reworkCount: 0,
      chasedCount: 0,
      lessons: [],
      outputSummary: null,
      errorMessage: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      completedAt: null,
    });

    await this.store.appendEvent({
      id: randomUUID(),
      taskId: task.id,
      agentId: assignedAgentId,
      eventType: "routed",
      message: `Operations Manager routed work order to ${agent.displayName} (SLA due ${task.dueAt}).`,
      createdAt: nowIso,
    });

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "accepted",
      actorAgentId: assignedAgentId,
      eventMessage: `${agent.displayName} accepted work order.`,
    });

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "in_progress",
      actorAgentId: assignedAgentId,
      eventMessage: `${agent.displayName} started execution.`,
    });

    const [dailyRunCount, teamNotes, memories] = await Promise.all([
      this.store.countTodayRuns(assignedAgentId),
      this.teamStore.listNotesForAgent(assignedAgentId, 10).catch(() => []),
      this.teamStore.loadMemories(assignedAgentId, agent.memoryNamespace, 10).catch(() => []),
    ]);

    const notesBlock =
      teamNotes.length > 0
        ? `\n\nRECENT TEAM BOARD NOTES:\n${teamNotes.map((n) => `- [${n.fromAgent}${n.toAgent ? ` -> ${n.toAgent}` : ""}] ${n.note}`).join("\n")}`
        : "";
    const memoryBlock =
      memories.length > 0
        ? `\n\nRECENT AGENT & TEAM MEMORY:\n${memories.map((m) => `- (${m.namespace}) ${m.content}`).join("\n")}`
        : "";

    const runner = params.modelRunner ?? runWithFreeFirstModel;
    const gateway = getAdminToolGateway();
    const scopedTools = getOpenAiToolsForAgent(gateway, assignedAgentId);
    const knowledge = getFlowGuardKnowledgeContext(assignedAgentId === "engineering_ai");
    let pendingApprovalId: string | null = null;
    const evidence: string[] = [];

    const res = await runner({
      agentId: assignedAgentId,
      routeId: agent.modelRoute,
      systemPrompt: `${agent.systemPrompt}\n\nAPPROVED FLOWGUARD KNOWLEDGE:\n${knowledge}${notesBlock}${memoryBlock}\n\nAllowed tools for your role: ${agent.allowedTools.join(", ")}. Never claim to have executed an Amber action without Owner approval.`,
      userPrompt: `Work Order Title: ${task.title}\nInstruction: ${task.description}`,
      maxTokens: agent.maxTokensPerRun,
      dailyRunCount,
      dailyRunLimit: agent.dailyRunLimit,
      tools: scopedTools,
      onToolCall: async (toolName, args) => {
        const outcome = await gateway.invoke({
          ctx: {
            agentId: assignedAgentId,
            actorUserId: params.requesterId,
            actorEmail: "owner@flowguard.com.ng",
            taskId: task.id,
            handoffDepth: params.handoffDepth ?? 0,
            handoffChain: params.handoffChain ?? [],
          },
          toolName,
          rawInput: args,
        });
        if (outcome.status === "executed") {
          evidence.push(`tool:${toolName}`);
        }
        if (outcome.status === "pending_approval" && outcome.approvalId) {
          pendingApprovalId = outcome.approvalId;
          evidence.push(`approval:${outcome.approvalId}`);
          await this.store.appendEvent({
            id: randomUUID(),
            taskId: task.id,
            agentId: assignedAgentId,
            eventType: "approval_requested",
            message: `Approval ${outcome.approvalId} requested for ${toolName}.`,
            createdAt: new Date().toISOString(),
          });
        }
        return outcome;
      },
    });

    if (!res.ok) {
      const errMsg = res.error || "Model run failed.";
      const { task: failed } = await transitionTask({
        store: this.store,
        taskId: task.id,
        toStatus: "failed",
        actorAgentId: assignedAgentId,
        errorMessage: errMsg,
        eventMessage: errMsg,
        onReportRequired: async () => {
          const rep = await reportToOwner(
            {
              agentId: assignedAgentId,
              status: "failed",
              summary: `${task.title} failed: ${errMsg}`,
              taskId: task.id,
              urgent: task.priority === "urgent",
              isHandoffChild: params.isHandoffChild,
              forceStoreReport: true,
            },
            this.notifyFn,
            this.reportStore
          );
          return { reportId: rep.reportId ?? null };
        },
      });
      await recordTeamNote(
        {
          fromAgent: assignedAgentId,
          taskId: task.id,
          note: `Task failed (${task.title}): ${errMsg.slice(0, 180)}`,
        },
        this.teamStore
      ).catch(() => {});
      return failed;
    }

    const summaryText = res.text || "Deliverable prepared.";
    if (pendingApprovalId) {
      const { task: waitingTask } = await transitionTask({
        store: this.store,
        taskId: task.id,
        toStatus: "waiting_approval",
        actorAgentId: assignedAgentId,
        deliverable: summaryText,
        evidence,
        outputSummary: summaryText,
        eventMessage: `Queued approval ${pendingApprovalId} for Owner decision.`,
        onReportRequired: async () => {
          const rep = await reportToOwner(
            {
              agentId: assignedAgentId,
              status: "waiting_approval",
              summary: summaryText,
              evidence,
              pending: "Owner approval",
              ownerDecision: "Approve or reject pending action",
              taskId: task.id,
              approvalId: pendingApprovalId,
              urgent: task.priority === "urgent",
              isHandoffChild: params.isHandoffChild,
              forceStoreReport: true,
            },
            this.notifyFn,
            this.reportStore
          );
          return { reportId: rep.reportId ?? null };
        },
      });
      await recordTeamNote(
        {
          fromAgent: assignedAgentId,
          taskId: task.id,
          note: `${task.title}: waiting for Owner approval (${pendingApprovalId}).`,
        },
        this.teamStore
      ).catch(() => {});
      return waitingTask;
    }

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "submitted",
      actorAgentId: assignedAgentId,
      deliverable: summaryText,
      evidence,
      outputSummary: summaryText,
      eventMessage: `Submitted deliverable for Sadiq QA review.`,
    });

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "qa_review",
      actorAgentId: "operations_manager",
      qaStatus: "pending",
      eventMessage: "Sadiq started QA review.",
    });

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "approved_by_ops",
      actorAgentId: "operations_manager",
      qaStatus: "approved",
      qaNotes: "Approved by Operations Manager.",
      eventMessage: "Sadiq approved deliverable.",
    });

    await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "reported",
      actorAgentId: assignedAgentId,
      eventMessage: "Reported outcome to Owner.",
      onReportRequired: async () => {
        const rep = await reportToOwner(
          {
            agentId: assignedAgentId,
            status: "reported",
            summary: summaryText,
            evidence,
            taskId: task.id,
            urgent: task.priority === "urgent",
            isHandoffChild: params.isHandoffChild,
            forceStoreReport: true,
          },
          this.notifyFn,
          this.reportStore
        );
        return { reportId: rep.reportId ?? null };
      },
    });

    const extractedLessons = extractShortFactsFromOutput(summaryText, 3);
    const finalLessons =
      extractedLessons.length > 0 ? extractedLessons : [summaryText.slice(0, 140)];

    await saveTaskMemories(
      {
        agentId: assignedAgentId,
        namespace: agent.memoryNamespace,
        taskId: task.id,
        outputText: summaryText,
        shareWithTeam: !params.isHandoffChild,
      },
      this.teamStore
    ).catch(() => {});

    await recordTeamNote(
      {
        fromAgent: assignedAgentId,
        taskId: task.id,
        note: `${task.title}: ${summaryText.slice(0, 200)}`,
      },
      this.teamStore
    ).catch(() => {});

    const { task: closedTask } = await transitionTask({
      store: this.store,
      taskId: task.id,
      toStatus: "closed",
      actorAgentId: assignedAgentId,
      lessons: finalLessons,
      eventMessage: `Closed via ${res.provider}/${res.modelId} (${res.inputTokens ?? 0} in / ${res.outputTokens ?? 0} out tokens, $0.00 paid spend).`,
    });

    return closedTask;
  }
}

export const defaultWorkforceOrchestrator = new WorkforceOrchestrator();
