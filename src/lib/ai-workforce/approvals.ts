import { createHash, randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type {
  AgentId,
  ApprovalRecord,
  ApprovalRequestInput,
  ApprovalStatus,
  AuditLogInput,
} from "@/lib/ai-workforce/types";

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        sorted[key] = sortJsonKeys(record[key]);
      }
    }
    return sorted;
  }
  return value;
}

export function canonicalizePayload(payload: Record<string, unknown>): string {
  return JSON.stringify(sortJsonKeys(payload));
}

export function computePayloadHash(
  toolName: string,
  targetResource: string,
  payload: Record<string, unknown>
): string {
  const canonical = JSON.stringify({
    toolName,
    targetResource,
    payload: sortJsonKeys(payload),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface ApprovalStore {
  findByIdempotencyKey(key: string): Promise<ApprovalRecord | null>;
  findById(id: string): Promise<ApprovalRecord | null>;
  list(limit?: number): Promise<ApprovalRecord[]>;
  insert(record: ApprovalRecord): Promise<ApprovalRecord>;
  updateStatus(
    id: string,
    expectedCurrentStatuses: ApprovalStatus[],
    patch: Partial<ApprovalRecord>
  ): Promise<ApprovalRecord | null>;
  appendAudit(entry: AuditLogInput): Promise<void>;
}

export class InMemoryApprovalStore implements ApprovalStore {
  private records = new Map<string, ApprovalRecord>();
  public audits: AuditLogInput[] = [];

  async findByIdempotencyKey(key: string): Promise<ApprovalRecord | null> {
    for (const r of this.records.values()) {
      if (r.idempotencyKey === key) return structuredClone(r);
    }
    return null;
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    const r = this.records.get(id);
    return r ? structuredClone(r) : null;
  }

  async list(limit = 50): Promise<ApprovalRecord[]> {
    return Array.from(this.records.values())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async insert(record: ApprovalRecord): Promise<ApprovalRecord> {
    const clone = structuredClone(record);
    this.records.set(clone.id, clone);
    return structuredClone(clone);
  }

  async updateStatus(
    id: string,
    expectedCurrentStatuses: ApprovalStatus[],
    patch: Partial<ApprovalRecord>
  ): Promise<ApprovalRecord | null> {
    const existing = this.records.get(id);
    if (!existing || !expectedCurrentStatuses.includes(existing.status)) {
      return null;
    }
    const updated: ApprovalRecord = { ...existing, ...structuredClone(patch) };
    this.records.set(id, updated);
    return structuredClone(updated);
  }

  async appendAudit(entry: AuditLogInput): Promise<void> {
    this.audits.push(structuredClone(entry));
  }
}

function mapDbRow(row: Record<string, unknown>): ApprovalRecord {
  return {
    id: String(row.id),
    taskId: row.task_id ? String(row.task_id) : null,
    requestedByAgent: String(row.requested_by_agent) as AgentId,
    toolName: String(row.tool_name),
    targetResource: String(row.target_resource),
    actionSummary: String(row.action_summary),
    payload: (row.payload as Record<string, unknown>) || {},
    payloadHash: String(row.payload_hash),
    reason: String(row.reason),
    evidence: row.evidence ? String(row.evidence) : null,
    expectedEffect: row.expected_effect ? String(row.expected_effect) : null,
    riskLevel: row.risk_level === "high" ? "high" : "amber",
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as ApprovalStatus,
    approverUserId: row.approver_user_id ? String(row.approver_user_id) : null,
    approverEmail: row.approver_email ? String(row.approver_email) : null,
    decisionNote: row.decision_note ? String(row.decision_note) : null,
    executionResult: row.execution_result ?? null,
    expiresAt: String(row.expires_at),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    executedAt: row.executed_at ? String(row.executed_at) : null,
    createdAt: String(row.created_at),
  };
}

export class SupabaseApprovalStore implements ApprovalStore {
  async findByIdempotencyKey(key: string): Promise<ApprovalRecord | null> {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("ai_approvals")
      .select("*")
      .eq("idempotency_key", key)
      .maybeSingle();
    return data ? mapDbRow(data as Record<string, unknown>) : null;
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("ai_approvals")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapDbRow(data as Record<string, unknown>) : null;
  }

  async list(limit = 50): Promise<ApprovalRecord[]> {
    const supabase = getServiceSupabase();
    const [{ data: pendingRows }, { data: recentRows }] = await Promise.all([
      supabase
        .from("ai_approvals")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(Math.max(limit, 50)),
      supabase
        .from("ai_approvals")
        .select("*")
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);
    const combined = [...(pendingRows || []), ...(recentRows || [])];
    const seen = new Set<string>();
    const deduped: Record<string, unknown>[] = [];
    for (const row of combined) {
      const id = String((row as Record<string, unknown>).id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      deduped.push(row as Record<string, unknown>);
    }
    return deduped.map((row) => mapDbRow(row));
  }

  async insert(record: ApprovalRecord): Promise<ApprovalRecord> {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ai_approvals")
      .insert({
        id: record.id,
        task_id: record.taskId,
        requested_by_agent: record.requestedByAgent,
        tool_name: record.toolName,
        target_resource: record.targetResource,
        action_summary: record.actionSummary,
        payload: record.payload,
        payload_hash: record.payloadHash,
        reason: record.reason,
        evidence: record.evidence,
        expected_effect: record.expectedEffect,
        risk_level: record.riskLevel,
        idempotency_key: record.idempotencyKey,
        status: record.status,
        expires_at: record.expiresAt,
      })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "Failed to persist approval request.");
    }
    return mapDbRow(data as Record<string, unknown>);
  }

  async updateStatus(
    id: string,
    expectedCurrentStatuses: ApprovalStatus[],
    patch: Partial<ApprovalRecord>
  ): Promise<ApprovalRecord | null> {
    const supabase = getServiceSupabase();
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.approverUserId !== undefined) dbPatch.approver_user_id = patch.approverUserId;
    if (patch.approverEmail !== undefined) dbPatch.approver_email = patch.approverEmail;
    if (patch.decisionNote !== undefined) dbPatch.decision_note = patch.decisionNote;
    if (patch.executionResult !== undefined) dbPatch.execution_result = patch.executionResult;
    if (patch.decidedAt !== undefined) dbPatch.decided_at = patch.decidedAt;
    if (patch.executedAt !== undefined) dbPatch.executed_at = patch.executedAt;

    const { data } = await supabase
      .from("ai_approvals")
      .update(dbPatch)
      .eq("id", id)
      .in("status", expectedCurrentStatuses)
      .select("*")
      .maybeSingle();
    return data ? mapDbRow(data as Record<string, unknown>) : null;
  }

  async appendAudit(entry: AuditLogInput): Promise<void> {
    const supabase = getServiceSupabase();
    await supabase.from("ai_audit_logs").insert({
      actor_type: entry.actorType,
      actor_id: entry.actorId,
      event_type: entry.eventType,
      target_resource: entry.targetResource ?? null,
      details: entry.details ?? {},
    });
  }
}

export interface ApproverIdentity {
  actorType: "owner" | "agent";
  userId: string;
  email: string;
}

export interface ApprovalDecisionResult {
  ok: boolean;
  code?:
    | "NOT_FOUND"
    | "SELF_APPROVAL_FORBIDDEN"
    | "OWNER_REQUIRED"
    | "EXPIRED"
    | "ALREADY_DECIDED"
    | "PAYLOAD_HASH_MISMATCH"
    | "EXECUTION_FAILED";
  error?: string;
  approval?: ApprovalRecord;
}

export type ApprovedActionExecutor = (
  record: ApprovalRecord
) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

export class ApprovalService {
  constructor(private readonly store: ApprovalStore = new SupabaseApprovalStore()) {}

  async createApprovalRequest(
    input: ApprovalRequestInput,
    now: Date = new Date()
  ): Promise<ApprovalRecord> {
    const payloadHash = computePayloadHash(
      input.toolName,
      input.targetResource,
      input.payload
    );
    const idempotencyKey =
      input.idempotencyKey?.trim() ||
      `${input.requestedByAgent}:${input.toolName}:${input.targetResource}:${payloadHash}:${randomUUID()}`;

    const existing = await this.store.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing;
    }

    const ttlMs = Math.max(60, input.ttlSeconds ?? 24 * 3600) * 1000;
    const record: ApprovalRecord = {
      id: randomUUID(),
      taskId: input.taskId ?? null,
      requestedByAgent: input.requestedByAgent,
      toolName: input.toolName,
      targetResource: input.targetResource,
      actionSummary: input.actionSummary,
      payload: input.payload,
      payloadHash,
      reason: input.reason,
      evidence: input.evidence ?? null,
      expectedEffect: input.expectedEffect ?? null,
      riskLevel: input.riskLevel ?? "amber",
      idempotencyKey,
      status: "pending",
      approverUserId: null,
      approverEmail: null,
      decisionNote: null,
      executionResult: null,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      decidedAt: null,
      executedAt: null,
      createdAt: now.toISOString(),
    };

    const saved = await this.store.insert(record);
    await this.store.appendAudit({
      actorType: "agent",
      actorId: input.requestedByAgent,
      eventType: "approval_requested",
      targetResource: input.targetResource,
      details: {
        approvalId: saved.id,
        toolName: saved.toolName,
        payloadHash: saved.payloadHash,
      },
    });
    return saved;
  }

  async listApprovals(limit = 50): Promise<ApprovalRecord[]> {
    return this.store.list(limit);
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    return this.store.findById(id);
  }

  async decideAndExecute(params: {
    approvalId: string;
    decision: "approve" | "reject";
    approver: ApproverIdentity;
    decisionNote?: string;
    expectedPayloadHash?: string;
    executor: ApprovedActionExecutor;
    now?: Date;
  }): Promise<ApprovalDecisionResult> {
    const now = params.now ?? new Date();
    const record = await this.store.findById(params.approvalId);
    if (!record) {
      return { ok: false, code: "NOT_FOUND", error: "Approval request not found." };
    }

    // Security invariant: agents CANNOT approve their own or any agent's requests.
    if (
      params.approver.actorType !== "owner" ||
      params.approver.userId === record.requestedByAgent
    ) {
      await this.store.appendAudit({
        actorType: params.approver.actorType,
        actorId: params.approver.userId,
        eventType: "approval_self_or_non_owner_blocked",
        targetResource: record.targetResource,
        details: { approvalId: record.id, requestedByAgent: record.requestedByAgent },
      });
      return {
        ok: false,
        code:
          params.approver.userId === record.requestedByAgent ||
          params.approver.actorType === "agent"
            ? "SELF_APPROVAL_FORBIDDEN"
            : "OWNER_REQUIRED",
        error: "Only the authenticated Owner may approve or reject workforce actions.",
      };
    }

    if (record.status !== "pending") {
      return {
        ok: false,
        code: "ALREADY_DECIDED",
        error: `Approval is already in terminal/decided state (${record.status}).`,
        approval: record,
      };
    }

    if (new Date(record.expiresAt).getTime() <= now.getTime()) {
      const expired = await this.store.updateStatus(record.id, ["pending"], {
        status: "expired",
        decidedAt: now.toISOString(),
        decisionNote: "Approval expired before owner decision.",
      });
      await this.store.appendAudit({
        actorType: "system",
        actorId: "approval_service",
        eventType: "approval_expired",
        targetResource: record.targetResource,
        details: { approvalId: record.id },
      });
      return {
        ok: false,
        code: "EXPIRED",
        error: "Approval request has expired and can no longer be executed.",
        approval: expired ?? record,
      };
    }

    // Verify exact payload integrity before approving or executing.
    const recomputedHash = computePayloadHash(
      record.toolName,
      record.targetResource,
      record.payload
    );
    if (
      recomputedHash !== record.payloadHash ||
      (params.expectedPayloadHash && params.expectedPayloadHash !== record.payloadHash)
    ) {
      await this.store.appendAudit({
        actorType: "system",
        actorId: "approval_service",
        eventType: "approval_payload_hash_mismatch",
        targetResource: record.targetResource,
        details: {
          approvalId: record.id,
          storedHash: record.payloadHash,
          recomputedHash,
          expectedPayloadHash: params.expectedPayloadHash ?? null,
        },
      });
      return {
        ok: false,
        code: "PAYLOAD_HASH_MISMATCH",
        error: "Approval payload hash mismatch; a new approval request is required.",
      };
    }

    if (params.decision === "reject") {
      const rejected = await this.store.updateStatus(record.id, ["pending"], {
        status: "rejected",
        approverUserId: params.approver.userId,
        approverEmail: params.approver.email,
        decisionNote: params.decisionNote || "Rejected by Owner.",
        decidedAt: now.toISOString(),
      });
      if (!rejected) {
        return {
          ok: false,
          code: "ALREADY_DECIDED",
          error: "Approval was already processed concurrently.",
        };
      }
      await this.store.appendAudit({
        actorType: "owner",
        actorId: params.approver.userId,
        eventType: "approval_rejected",
        targetResource: record.targetResource,
        details: { approvalId: record.id, toolName: record.toolName },
      });
      return { ok: true, approval: rejected };
    }

    // Atomic transition pending -> approved so concurrent duplicate approve calls cannot double-execute.
    const claimed = await this.store.updateStatus(record.id, ["pending"], {
      status: "approved",
      approverUserId: params.approver.userId,
      approverEmail: params.approver.email,
      decisionNote: params.decisionNote || "Approved by Owner.",
      decidedAt: now.toISOString(),
    });
    if (!claimed) {
      return {
        ok: false,
        code: "ALREADY_DECIDED",
        error: "Approval was already decided or executed.",
      };
    }

    try {
      const execOutcome = await params.executor(claimed);
      if (!execOutcome.ok) {
        const failed = await this.store.updateStatus(claimed.id, ["approved"], {
          status: "failed",
          executionResult: { ok: false, error: execOutcome.error || "Execution failed" },
          executedAt: new Date().toISOString(),
        });
        await this.store.appendAudit({
          actorType: "owner",
          actorId: params.approver.userId,
          eventType: "approval_execution_failed",
          targetResource: claimed.targetResource,
          details: { approvalId: claimed.id, error: execOutcome.error },
        });
        return {
          ok: false,
          code: "EXECUTION_FAILED",
          error: execOutcome.error || "Execution failed.",
          approval: failed ?? claimed,
        };
      }

      const executed = await this.store.updateStatus(claimed.id, ["approved"], {
        status: "executed",
        executionResult: { ok: true, result: execOutcome.result ?? null },
        executedAt: new Date().toISOString(),
      });
      await this.store.appendAudit({
        actorType: "owner",
        actorId: params.approver.userId,
        eventType: "approval_executed",
        targetResource: claimed.targetResource,
        details: { approvalId: claimed.id, toolName: claimed.toolName },
      });
      return { ok: true, approval: executed ?? claimed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Execution error";
      const failed = await this.store.updateStatus(claimed.id, ["approved"], {
        status: "failed",
        executionResult: { ok: false, error: msg },
        executedAt: new Date().toISOString(),
      });
      return {
        ok: false,
        code: "EXECUTION_FAILED",
        error: msg,
        approval: failed ?? claimed,
      };
    }
  }
}

export const defaultApprovalService = new ApprovalService();
