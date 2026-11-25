import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { AgentId } from "@/lib/ai-workforce/types";

export const TEAM_MEMORY_NAMESPACE = "ns_team";

export function playbookNamespace(agentId: AgentId): string {
  return `playbook:${agentId}`;
}

export interface TeamNoteRecord {
  id: string;
  fromAgent: AgentId;
  toAgent: AgentId | null;
  taskId: string | null;
  ticketNumber: string | null;
  note: string;
  createdAt: string;
}

export interface AgentMemoryRecord {
  id: string;
  agentId: AgentId;
  namespace: string;
  memoryKey: string;
  content: string;
  source: string;
  createdAt: string;
}

export interface TeamBoardAndMemoryStore {
  addNote(note: TeamNoteRecord): Promise<void>;
  listNotesForAgent(agentId: AgentId, limit?: number): Promise<TeamNoteRecord[]>;
  saveMemories(entries: AgentMemoryRecord[]): Promise<void>;
  loadMemories(agentId: AgentId, namespace: string, limit?: number): Promise<AgentMemoryRecord[]>;
  listPlaybookRules(agentId?: AgentId): Promise<AgentMemoryRecord[]>;
  updateMemoryContent(id: string, content: string): Promise<void>;
  deleteMemory(id: string): Promise<void>;
}

const SECRET_OR_PII_RX =
  /(sk_[a-z0-9_]{10,}|tvly-[a-z0-9_-]{8,}|re_[a-z0-9_]{8,}|github_pat_[a-z0-9_]+|password\s*[:=]|secret\s*[:=]|bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{12,})/i;

export function sanitizeMemoryFact(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, 200);
  if (cleaned.length < 8) return null;
  if (SECRET_OR_PII_RX.test(cleaned)) return null;
  return cleaned;
}

export function extractShortFactsFromOutput(text: string, maxFacts = 3): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => sanitizeMemoryFact(s))
    .filter((s): s is string => Boolean(s));

  const unique: string[] = [];
  for (const s of sentences) {
    if (!unique.includes(s)) unique.push(s);
    if (unique.length >= maxFacts) break;
  }
  return unique;
}

export class InMemoryTeamBoardAndMemoryStore implements TeamBoardAndMemoryStore {
  public notes: TeamNoteRecord[] = [];
  public memories: AgentMemoryRecord[] = [];

  async addNote(note: TeamNoteRecord): Promise<void> {
    this.notes.unshift(structuredClone(note));
  }

  async listNotesForAgent(agentId: AgentId, limit = 10): Promise<TeamNoteRecord[]> {
    return this.notes
      .filter((n) => n.toAgent === null || n.toAgent === agentId || n.fromAgent === agentId)
      .slice(0, limit)
      .map((n) => structuredClone(n));
  }

  async saveMemories(entries: AgentMemoryRecord[]): Promise<void> {
    for (const entry of entries) {
      const idx = this.memories.findIndex(
        (m) => m.namespace === entry.namespace && m.memoryKey === entry.memoryKey
      );
      if (idx >= 0) {
        this.memories[idx] = structuredClone(entry);
      } else {
        this.memories.unshift(structuredClone(entry));
      }
    }
  }

  async loadMemories(
    agentId: AgentId,
    namespace: string,
    limit = 10
  ): Promise<AgentMemoryRecord[]> {
    const pbNs = playbookNamespace(agentId);
    const matching = this.memories.filter(
      (m) =>
        (m.namespace === namespace && m.agentId === agentId) ||
        m.namespace === pbNs ||
        m.namespace === TEAM_MEMORY_NAMESPACE
    );
    // Prioritize playbook rules first, then recent memories, up to limit
    const playbookFirst = [
      ...matching.filter((m) => m.namespace === pbNs),
      ...matching.filter((m) => m.namespace !== pbNs),
    ];
    return playbookFirst.slice(0, limit).map((m) => structuredClone(m));
  }

  async listPlaybookRules(agentId?: AgentId): Promise<AgentMemoryRecord[]> {
    return this.memories
      .filter((m) =>
        agentId ? m.namespace === playbookNamespace(agentId) : m.namespace.startsWith("playbook:")
      )
      .map((m) => structuredClone(m));
  }

  async updateMemoryContent(id: string, content: string): Promise<void> {
    const clean = sanitizeMemoryFact(content);
    if (!clean) return;
    const item = this.memories.find((m) => m.id === id);
    if (item) item.content = clean;
  }

  async deleteMemory(id: string): Promise<void> {
    this.memories = this.memories.filter((m) => m.id !== id);
  }
}

export class SupabaseTeamBoardAndMemoryStore implements TeamBoardAndMemoryStore {
  async addNote(note: TeamNoteRecord): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_team_notes").insert({
        id: note.id,
        from_agent: note.fromAgent,
        to_agent: note.toAgent,
        task_id: note.taskId,
        ticket_number: note.ticketNumber,
        note: note.note.slice(0, 400),
      });
    } catch {
      // Non-fatal if migration not yet applied
    }
  }

  async listNotesForAgent(agentId: AgentId, limit = 10): Promise<TeamNoteRecord[]> {
    try {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_team_notes")
        .select("id, from_agent, to_agent, task_id, ticket_number, note, created_at")
        .or(`to_agent.is.null,to_agent.eq.${agentId},from_agent.eq.${agentId}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      return (data || []).map((r) => ({
        id: String(r.id),
        fromAgent: String(r.from_agent) as AgentId,
        toAgent: r.to_agent ? (String(r.to_agent) as AgentId) : null,
        taskId: r.task_id ? String(r.task_id) : null,
        ticketNumber: r.ticket_number ? String(r.ticket_number) : null,
        note: String(r.note),
        createdAt: String(r.created_at),
      }));
    } catch {
      return [];
    }
  }

  async saveMemories(entries: AgentMemoryRecord[]): Promise<void> {
    if (entries.length === 0) return;
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_agent_memory").upsert(
        entries.map((e) => ({
          id: e.id,
          agent_id: e.agentId,
          namespace: e.namespace,
          memory_key: e.memoryKey,
          content: e.content,
          source: e.source,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "namespace,memory_key" }
      );
    } catch {
      // Non-fatal if migration not yet applied
    }
  }

  async loadMemories(
    agentId: AgentId,
    namespace: string,
    limit = 10
  ): Promise<AgentMemoryRecord[]> {
    try {
      const pbNs = playbookNamespace(agentId);
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_agent_memory")
        .select("id, agent_id, namespace, memory_key, content, source, created_at")
        .in("namespace", [namespace, pbNs, TEAM_MEMORY_NAMESPACE])
        .order("updated_at", { ascending: false })
        .limit(limit);

      const mapped = (data || [])
        .filter(
          (r) =>
            r.namespace === TEAM_MEMORY_NAMESPACE ||
            r.namespace === pbNs ||
            r.agent_id === agentId
        )
        .map((r) => ({
          id: String(r.id),
          agentId: String(r.agent_id) as AgentId,
          namespace: String(r.namespace),
          memoryKey: String(r.memory_key),
          content: String(r.content),
          source: String(r.source),
          createdAt: String(r.created_at),
        }));

      return [
        ...mapped.filter((m) => m.namespace === pbNs),
        ...mapped.filter((m) => m.namespace !== pbNs),
      ].slice(0, limit);
    } catch {
      return [];
    }
  }

  async listPlaybookRules(agentId?: AgentId): Promise<AgentMemoryRecord[]> {
    try {
      const supabase = getServiceSupabase();
      const query = supabase
        .from("ai_agent_memory")
        .select("id, agent_id, namespace, memory_key, content, source, created_at")
        .order("updated_at", { ascending: false })
        .limit(50);

      const { data } = agentId
        ? await query.eq("namespace", playbookNamespace(agentId))
        : await query.like("namespace", "playbook:%");

      return (data || []).map((r) => ({
        id: String(r.id),
        agentId: String(r.agent_id) as AgentId,
        namespace: String(r.namespace),
        memoryKey: String(r.memory_key),
        content: String(r.content),
        source: String(r.source),
        createdAt: String(r.created_at),
      }));
    } catch {
      return [];
    }
  }

  async updateMemoryContent(id: string, content: string): Promise<void> {
    const clean = sanitizeMemoryFact(content);
    if (!clean) return;
    try {
      const supabase = getServiceSupabase();
      await supabase
        .from("ai_agent_memory")
        .update({ content: clean, updated_at: new Date().toISOString() })
        .eq("id", id);
    } catch {
      // Non-fatal
    }
  }

  async deleteMemory(id: string): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_agent_memory").delete().eq("id", id);
    } catch {
      // Non-fatal
    }
  }
}

export const defaultTeamMemoryStore = new SupabaseTeamBoardAndMemoryStore();

export async function recordTeamNote(
  params: {
    fromAgent: AgentId;
    toAgent?: AgentId | null;
    taskId?: string | null;
    ticketNumber?: string | null;
    note: string;
  },
  store: TeamBoardAndMemoryStore = defaultTeamMemoryStore
): Promise<void> {
  const clean = sanitizeMemoryFact(params.note) || params.note.trim().slice(0, 300);
  if (!clean) return;
  await store.addNote({
    id: randomUUID(),
    fromAgent: params.fromAgent,
    toAgent: params.toAgent ?? null,
    taskId: params.taskId ?? null,
    ticketNumber: params.ticketNumber ?? null,
    note: clean,
    createdAt: new Date().toISOString(),
  });
}

export async function saveTaskMemories(
  params: {
    agentId: AgentId;
    namespace: string;
    taskId: string;
    outputText: string;
    shareWithTeam?: boolean;
  },
  store: TeamBoardAndMemoryStore = defaultTeamMemoryStore
): Promise<void> {
  const facts = extractShortFactsFromOutput(params.outputText, 3);
  if (facts.length === 0) return;

  const now = new Date().toISOString();
  const entries: AgentMemoryRecord[] = facts.map((fact, idx) => ({
    id: randomUUID(),
    agentId: params.agentId,
    namespace: params.namespace,
    memoryKey: `task:${params.taskId}:${idx + 1}`,
    content: fact,
    source: `task:${params.taskId}`,
    createdAt: now,
  }));

  if (params.shareWithTeam) {
    entries.push({
      id: randomUUID(),
      agentId: params.agentId,
      namespace: TEAM_MEMORY_NAMESPACE,
      memoryKey: `team:${params.taskId}`,
      content: facts[0],
      source: `task:${params.taskId}`,
      createdAt: now,
    });
  }

  await store.saveMemories(entries);
}

export async function savePlaybookRule(
  params: {
    agentId: AgentId;
    rule: string;
    source?: string;
    memoryKey?: string;
  },
  store: TeamBoardAndMemoryStore = defaultTeamMemoryStore
): Promise<AgentMemoryRecord | null> {
  const clean = sanitizeMemoryFact(params.rule);
  if (!clean) return null;
  const entry: AgentMemoryRecord = {
    id: randomUUID(),
    agentId: params.agentId,
    namespace: playbookNamespace(params.agentId),
    memoryKey: params.memoryKey || `rule:${randomUUID()}`,
    content: clean,
    source: params.source || "owner_feedback",
    createdAt: new Date().toISOString(),
  };
  await store.saveMemories([entry]);
  return entry;
}
