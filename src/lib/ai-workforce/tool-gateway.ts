import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  ApprovalService,
  defaultApprovalService,
  type ApprovalDecisionResult,
  type ApproverIdentity,
} from "@/lib/ai-workforce/approvals";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import type {
  AgentId,
  ApprovalRecord,
  PermissionTier,
  ToolExecutionContext,
  ToolGatewayResponse,
  ToolSpec,
} from "@/lib/ai-workforce/types";

const REDACTED_KEYS = /(password|secret|token|api[_-]?key|private[_-]?key|authorization|cookie)/i;

export function redactSensitiveArgs(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (REDACTED_KEYS.test(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSensitiveArgs(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface ToolExecutionLogger {
  logExecution(entry: {
    taskId?: string | null;
    approvalId?: string | null;
    agentId: AgentId;
    toolName: string;
    tier: PermissionTier;
    validatedScope: string;
    redactedArgs: Record<string, unknown>;
    status: "executed" | "pending_approval" | "blocked" | "failed";
    resultSummary?: string;
  }): Promise<void>;
}

export class InMemoryToolExecutionLogger implements ToolExecutionLogger {
  public entries: Array<Record<string, unknown>> = [];
  async logExecution(entry: Parameters<ToolExecutionLogger["logExecution"]>[0]): Promise<void> {
    this.entries.push(structuredClone(entry));
  }
}

export class SupabaseToolExecutionLogger implements ToolExecutionLogger {
  async logExecution(entry: Parameters<ToolExecutionLogger["logExecution"]>[0]): Promise<void> {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_tool_executions").insert({
        task_id: entry.taskId ?? null,
        approval_id: entry.approvalId ?? null,
        agent_id: entry.agentId,
        tool_name: entry.toolName,
        tier: entry.tier,
        validated_scope: entry.validatedScope,
        redacted_args: entry.redactedArgs,
        status: entry.status,
        result_summary: entry.resultSummary ?? null,
      });
    } catch {
      // Non-fatal in case staging migration has not been applied yet
    }
  }
}

export class ToolGateway {
  private readonly tools = new Map<string, ToolSpec<Record<string, unknown>, unknown>>();

  constructor(
    private readonly approvals: ApprovalService = defaultApprovalService,
    private readonly logger: ToolExecutionLogger = new SupabaseToolExecutionLogger()
  ) {}

  registerTool<TInput extends Record<string, unknown>, TOutput>(
    spec: ToolSpec<TInput, TOutput>
  ): void {
    this.tools.set(spec.name, spec as unknown as ToolSpec<Record<string, unknown>, unknown>);
  }

  getTool(name: string): ToolSpec<Record<string, unknown>, unknown> | undefined {
    return this.tools.get(name);
  }

  async invoke(params: {
    ctx: ToolExecutionContext;
    toolName: string;
    rawInput: unknown;
    targetResource?: string;
    actionSummary?: string;
    reason?: string;
    evidence?: string;
    expectedEffect?: string;
    idempotencyKey?: string;
  }): Promise<ToolGatewayResponse> {
    const { ctx, toolName } = params;
    const agent = getAgentDefinition(ctx.agentId);
    if (!agent || !agent.enabled) {
      return {
        ok: false,
        status: "blocked",
        tier: "red",
        toolName,
        error: `Agent "${ctx.agentId}" is not registered or is disabled.`,
      };
    }

    const spec = this.tools.get(toolName);
    if (!spec) {
      return {
        ok: false,
        status: "blocked",
        tier: "red",
        toolName,
        error: `Tool "${toolName}" is not registered in the Tool Gateway.`,
      };
    }

    if (!agent.allowedTools.includes(toolName)) {
      await this.logger.logExecution({
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        toolName,
        tier: spec.tier,
        validatedScope: "DENIED_OUT_OF_SCOPE",
        redactedArgs: redactSensitiveArgs(params.rawInput),
        status: "blocked",
        resultSummary: `Agent ${ctx.agentId} is not permitted to invoke ${toolName}`,
      });
      return {
        ok: false,
        status: "blocked",
        tier: spec.tier,
        toolName,
        error: `Agent "${ctx.agentId}" is not permitted to call "${toolName}".`,
      };
    }

    const validation = spec.validateInput(params.rawInput);
    if (!validation.ok) {
      await this.logger.logExecution({
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        toolName,
        tier: spec.tier,
        validatedScope: spec.requiredScope,
        redactedArgs: redactSensitiveArgs(params.rawInput),
        status: "failed",
        resultSummary: validation.error,
      });
      return {
        ok: false,
        status: "failed",
        tier: spec.tier,
        toolName,
        error: validation.error,
      };
    }

    if (spec.tier === "red") {
      await this.logger.logExecution({
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        toolName,
        tier: "red",
        validatedScope: spec.requiredScope,
        redactedArgs: redactSensitiveArgs(validation.data),
        status: "blocked",
        resultSummary: "Red-tier actions are never permitted autonomously.",
      });
      return {
        ok: false,
        status: "blocked",
        tier: "red",
        toolName,
        error: `Tool "${toolName}" is classified as RED and cannot be executed.`,
      };
    }

    if (spec.tier === "amber") {
      const targetResource =
        params.targetResource?.trim() ||
        String(
          validation.data.ticketNumber ||
            validation.data.plumberNameOrId ||
            validation.data.complaintIdOrTicket ||
            toolName
        );
      const approval = await this.approvals.createApprovalRequest({
        taskId: ctx.taskId ?? null,
        requestedByAgent: ctx.agentId,
        toolName,
        targetResource,
        actionSummary: params.actionSummary || `${spec.description} (${targetResource})`,
        payload: validation.data,
        reason: params.reason || `Requested by ${agent.displayName} for ${targetResource}`,
        evidence: params.evidence ?? null,
        expectedEffect: params.expectedEffect ?? spec.description,
        riskLevel: "amber",
        idempotencyKey: params.idempotencyKey,
      });

      await this.logger.logExecution({
        taskId: ctx.taskId,
        approvalId: approval.id,
        agentId: ctx.agentId,
        toolName,
        tier: "amber",
        validatedScope: spec.requiredScope,
        redactedArgs: redactSensitiveArgs(validation.data),
        status: "pending_approval",
        resultSummary: `Approval ${approval.id} created (hash ${approval.payloadHash.slice(0, 12)})`,
      });

      return {
        ok: true,
        status: "pending_approval",
        tier: "amber",
        toolName,
        approvalId: approval.id,
        payloadHash: approval.payloadHash,
        expiresAt: approval.expiresAt,
        data: {
          pendingApproval: true,
          approvalId: approval.id,
          payloadHash: approval.payloadHash,
          expiresAt: approval.expiresAt,
          message: `Action "${toolName}" requires Owner approval before execution (Approval ID: ${approval.id}).`,
        },
      };
    }

    // Green tier: execute directly after access + schema checks.
    try {
      const result = await spec.execute(validation.data, ctx);
      await this.logger.logExecution({
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        toolName,
        tier: "green",
        validatedScope: spec.requiredScope,
        redactedArgs: redactSensitiveArgs(validation.data),
        status: "executed",
        resultSummary: "Executed green-tier tool successfully",
      });
      return {
        ok: true,
        status: "executed",
        tier: "green",
        toolName,
        data: result,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Tool execution failed.";
      await this.logger.logExecution({
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        toolName,
        tier: "green",
        validatedScope: spec.requiredScope,
        redactedArgs: redactSensitiveArgs(validation.data),
        status: "failed",
        resultSummary: error,
      });
      return {
        ok: false,
        status: "failed",
        tier: "green",
        toolName,
        error,
      };
    }
  }

  async decideApproval(params: {
    approvalId: string;
    decision: "approve" | "reject";
    approver: ApproverIdentity;
    decisionNote?: string;
    expectedPayloadHash?: string;
  }): Promise<ApprovalDecisionResult> {
    return this.approvals.decideAndExecute({
      ...params,
      executor: async (record: ApprovalRecord) => {
        const spec = this.tools.get(record.toolName);
        if (!spec) {
          return { ok: false, error: `No registered tool executor for "${record.toolName}".` };
        }
        if (spec.tier === "red") {
          return { ok: false, error: `Red-tier tool "${record.toolName}" cannot execute.` };
        }
        const validation = spec.validateInput(record.payload);
        if (!validation.ok) {
          return { ok: false, error: validation.error };
        }
        const result = await spec.execute(validation.data, {
          agentId: record.requestedByAgent,
          actorUserId: params.approver.userId,
          actorEmail: params.approver.email,
          taskId: record.taskId,
          approvalId: record.id,
        });
        await this.logger.logExecution({
          taskId: record.taskId,
          approvalId: record.id,
          agentId: record.requestedByAgent,
          toolName: record.toolName,
          tier: spec.tier,
          validatedScope: spec.requiredScope,
          redactedArgs: redactSensitiveArgs(validation.data),
          status: "executed",
          resultSummary: `Executed after Owner approval (${params.approver.email})`,
        });
        return { ok: true, result };
      },
    });
  }
}
