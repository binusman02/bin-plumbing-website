import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import { getAdminToolGateway, getOpenAiToolsForAgent } from "@/lib/ai-workforce/admin-tools";
import { getFlowGuardKnowledgeContext } from "@/lib/ai-workforce/knowledge";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import { reportToOwner } from "@/lib/ai-workforce/owner-report";
import {
  defaultTeamMemoryStore,
  recordTeamNote,
  saveTaskMemories,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";
import type { AgentId } from "@/lib/ai-workforce/types";

export type WorkforceTaskStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkforceTask {
  id: string;
  title: string;
  description: string;
  requesterId: string;
  assignedAgentId: AgentId;
  parentTaskId: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: WorkforceTaskStatus;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface WorkforceTaskEvent {
  id: string;
  taskId: string;
  agentId: AgentId;
  eventType: string;
  message: string;
  createdAt: string;
}

export interface TaskStore {
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

  async createTask(task: WorkforceTask): Promise<WorkforceTask> {
    const clone = structuredClone(task);
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

  async countTodayRuns(): Promise<number> {
    return 0;
  }
}

function mapTaskRow(row: Record<string, unknown>): WorkforceTask {
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description),
    requesterId: String(row.requester_id),
    assignedAgentId: String(row.assigned_agent_id) as AgentId,
    parentTaskId: row.parent_task_id ? String(row.parent_task_id) : null,
    priority: (String(row.priority || "normal") as WorkforceTask["priority"]),
    status: String(row.status) as WorkforceTaskStatus,
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
        parent_task_id: task.parentTaskId,
        priority: task.priority,
        status: task.status,
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
    private readonly notifyFn: typeof createNotification = createNotification
  ) {}

  async listTasks(limit = 40): Promise<WorkforceTask[]> {
    return this.store.listTasks(limit);
  }

  async cancelTask(taskId: string): Promise<WorkforceTask | null> {
    const existing = await this.store.findTask(taskId);
    if (!existing) return null;
    if (["completed", "failed", "cancelled"].includes(existing.status)) {
      return existing;
    }
    const updated = await this.store.updateTask(taskId, {
      status: "cancelled",
      completedAt: new Date().toISOString(),
    });
    await this.store.appendEvent({
      id: randomUUID(),
      taskId,
      agentId: existing.assignedAgentId,
      eventType: "cancelled",
      message: "Task cancelled by Owner.",
      createdAt: new Date().toISOString(),
    });
    return updated;
  }

  async dispatchInstruction(params: {
    requesterId: string;
    title: string;
    instruction: string;
    targetAgentId?: AgentId;
    priority?: WorkforceTask["priority"];
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

    const nowIso = new Date().toISOString();
    const task = await this.store.createTask({
      id: randomUUID(),
      title: params.title.trim() || params.instruction.slice(0, 80),
      description: params.instruction.trim(),
      requesterId: params.requesterId,
      assignedAgentId,
      parentTaskId: params.parentTaskId ?? null,
      priority: params.priority ?? "normal",
      status: "queued",
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
      message: `Operations Manager routed task to ${agent.displayName} (allowed tools: ${agent.allowedTools.join(", ")}).`,
      createdAt: nowIso,
    });

    await this.store.updateTask(task.id, { status: "running" });

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

    const res = await runner({
      agentId: assignedAgentId,
      routeId: agent.modelRoute,
      systemPrompt: `${agent.systemPrompt}\n\nAPPROVED FLOWGUARD KNOWLEDGE:\n${knowledge}${notesBlock}${memoryBlock}\n\nAllowed tools for your role: ${agent.allowedTools.join(", ")}. Never claim to have executed an Amber action without Owner approval.`,
      userPrompt: `Task Title: ${task.title}\nInstruction: ${task.description}`,
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
        if (outcome.status === "pending_approval" && outcome.approvalId) {
          pendingApprovalId = outcome.approvalId;
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
      const failed = await this.store.updateTask(task.id, {
        status: "failed",
        errorMessage: errMsg,
        completedAt: new Date().toISOString(),
      });
      await this.store.appendEvent({
        id: randomUUID(),
        taskId: task.id,
        agentId: assignedAgentId,
        eventType: "failed",
        message: errMsg,
        createdAt: new Date().toISOString(),
      });
      await recordTeamNote(
        {
          fromAgent: assignedAgentId,
          taskId: task.id,
          note: `Task failed (${task.title}): ${errMsg.slice(0, 180)}`,
        },
        this.teamStore
      ).catch(() => {});
      await reportToOwner(
        {
          agentId: assignedAgentId,
          status: "failed",
          summary: `${task.title} failed: ${errMsg}`,
          taskId: task.id,
          urgent: task.priority === "urgent",
          isHandoffChild: params.isHandoffChild,
        },
        this.notifyFn
      ).catch(() => {});
      return failed ?? task;
    }

    const finalStatus: WorkforceTaskStatus = pendingApprovalId ? "waiting_approval" : "completed";
    const summaryText = res.text || "Completed.";
    const updated = await this.store.updateTask(task.id, {
      status: finalStatus,
      outputSummary: summaryText,
      completedAt: finalStatus === "completed" ? new Date().toISOString() : null,
    });
    await this.store.appendEvent({
      id: randomUUID(),
      taskId: task.id,
      agentId: assignedAgentId,
      eventType: finalStatus === "waiting_approval" ? "approval_requested" : "completed",
      message: `Completed via ${res.provider}/${res.modelId} (${res.inputTokens ?? 0} in / ${res.outputTokens ?? 0} out tokens, $0.00 paid spend).`,
      createdAt: new Date().toISOString(),
    });

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

    await reportToOwner(
      {
        agentId: assignedAgentId,
        status: finalStatus === "waiting_approval" ? "waiting_approval" : "completed",
        summary: summaryText,
        taskId: task.id,
        approvalId: pendingApprovalId,
        urgent: task.priority === "urgent",
        isHandoffChild: params.isHandoffChild,
      },
      this.notifyFn
    ).catch(() => {});

    return updated ?? task;
  }
}

export const defaultWorkforceOrchestrator = new WorkforceOrchestrator();
