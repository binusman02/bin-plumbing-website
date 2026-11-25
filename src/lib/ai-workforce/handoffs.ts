import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { AgentId } from "@/lib/ai-workforce/types";

export type HandoffStatus = "pending" | "accepted" | "declined" | "overdue" | "completed";

export interface HandoffRecord {
  id: string;
  fromAgent: AgentId;
  toAgent: AgentId;
  taskId: string;
  context: string;
  ask: string;
  status: HandoffStatus;
  declineReason: string | null;
  dueAt: string;
  respondedAt: string | null;
  createdAt: string;
}

export interface HandoffStore {
  createHandoff(record: HandoffRecord): Promise<HandoffRecord>;
  findHandoff(id: string): Promise<HandoffRecord | null>;
  updateHandoff(id: string, patch: Partial<HandoffRecord>): Promise<HandoffRecord | null>;
  listPendingHandoffs(): Promise<HandoffRecord[]>;
}

export class InMemoryHandoffStore implements HandoffStore {
  private rows = new Map<string, HandoffRecord>();

  async createHandoff(record: HandoffRecord): Promise<HandoffRecord> {
    const clone = structuredClone(record);
    this.rows.set(clone.id, clone);
    return structuredClone(clone);
  }

  async findHandoff(id: string): Promise<HandoffRecord | null> {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }

  async updateHandoff(
    id: string,
    patch: Partial<HandoffRecord>
  ): Promise<HandoffRecord | null> {
    const cur = this.rows.get(id);
    if (!cur) return null;
    const next = { ...cur, ...structuredClone(patch) };
    this.rows.set(id, next);
    return structuredClone(next);
  }

  async listPendingHandoffs(): Promise<HandoffRecord[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.status === "pending")
      .map((r) => structuredClone(r));
  }
}

export class SupabaseHandoffStore implements HandoffStore {
  async createHandoff(record: HandoffRecord): Promise<HandoffRecord> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_handoffs").insert({
        id: record.id,
        from_agent: record.fromAgent,
        to_agent: record.toAgent,
        task_id: record.taskId,
        context: record.context,
        ask: record.ask,
        status: record.status,
        due_at: record.dueAt,
      });
    } catch {
      // Non-fatal in dev
    }
    return record;
  }

  async findHandoff(id: string): Promise<HandoffRecord | null> {
    try {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_handoffs")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!data) return null;
      return {
        id: String(data.id),
        fromAgent: String(data.from_agent) as AgentId,
        toAgent: String(data.to_agent) as AgentId,
        taskId: String(data.task_id),
        context: String(data.context),
        ask: String(data.ask),
        status: String(data.status) as HandoffStatus,
        declineReason: data.decline_reason ? String(data.decline_reason) : null,
        dueAt: String(data.due_at),
        respondedAt: data.responded_at ? String(data.responded_at) : null,
        createdAt: String(data.created_at),
      };
    } catch {
      return null;
    }
  }

  async updateHandoff(
    id: string,
    patch: Partial<HandoffRecord>
  ): Promise<HandoffRecord | null> {
    try {
      const supabase = getServiceSupabase();
      const dbPatch: Record<string, unknown> = {};
      if (patch.status !== undefined) dbPatch.status = patch.status;
      if (patch.declineReason !== undefined) dbPatch.decline_reason = patch.declineReason;
      if (patch.respondedAt !== undefined) dbPatch.responded_at = patch.respondedAt;
      await supabase.from("ai_handoffs").update(dbPatch).eq("id", id);
    } catch {
      // Non-fatal
    }
    return this.findHandoff(id);
  }

  async listPendingHandoffs(): Promise<HandoffRecord[]> {
    try {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_handoffs")
        .select("*")
        .eq("status", "pending")
        .order("due_at", { ascending: true })
        .limit(50);
      return (data || []).map((r) => ({
        id: String(r.id),
        fromAgent: String(r.from_agent) as AgentId,
        toAgent: String(r.to_agent) as AgentId,
        taskId: String(r.task_id),
        context: String(r.context),
        ask: String(r.ask),
        status: String(r.status) as HandoffStatus,
        declineReason: r.decline_reason ? String(r.decline_reason) : null,
        dueAt: String(r.due_at),
        respondedAt: r.responded_at ? String(r.responded_at) : null,
        createdAt: String(r.created_at),
      }));
    } catch {
      return [];
    }
  }
}

export const defaultHandoffStore = new SupabaseHandoffStore();

export async function createStructuredHandoff(
  params: {
    from: AgentId;
    to: AgentId;
    taskId: string;
    context: string;
    ask: string;
    dueAt?: string;
  },
  store: HandoffStore = defaultHandoffStore
): Promise<HandoffRecord> {
  if (params.from === params.to) {
    throw new Error("Self-handoff is forbidden.");
  }
  const now = new Date();
  return store.createHandoff({
    id: randomUUID(),
    fromAgent: params.from,
    toAgent: params.to,
    taskId: params.taskId,
    context: params.context.slice(0, 500),
    ask: params.ask.slice(0, 400),
    status: "pending",
    declineReason: null,
    dueAt: params.dueAt || new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    respondedAt: null,
    createdAt: now.toISOString(),
  });
}

export async function respondToHandoff(
  params: {
    handoffId: string;
    receiverAgent: AgentId;
    decision: "accept" | "decline";
    reason?: string;
  },
  store: HandoffStore = defaultHandoffStore
): Promise<HandoffRecord | null> {
  const existing = await store.findHandoff(params.handoffId);
  if (!existing) throw new Error("Handoff not found.");
  if (existing.toAgent !== params.receiverAgent) {
    throw new Error(`Only "${existing.toAgent}" can respond to this handoff.`);
  }
  if (params.decision === "decline" && (!params.reason || !params.reason.trim())) {
    throw new Error("Declining a handoff requires a reason.");
  }
  return store.updateHandoff(existing.id, {
    status: params.decision === "accept" ? "accepted" : "declined",
    declineReason: params.decision === "decline" ? params.reason!.trim() : null,
    respondedAt: new Date().toISOString(),
  });
}

export async function markOverdueHandoffs(
  store: HandoffStore = defaultHandoffStore,
  now: Date = new Date()
): Promise<HandoffRecord[]> {
  const pending = await store.listPendingHandoffs();
  const overdue: HandoffRecord[] = [];
  const nowMs = now.getTime();
  for (const h of pending) {
    if (new Date(h.dueAt).getTime() < nowMs) {
      const updated = await store.updateHandoff(h.id, { status: "overdue" });
      overdue.push(updated ?? { ...h, status: "overdue" });
    }
  }
  return overdue;
}
