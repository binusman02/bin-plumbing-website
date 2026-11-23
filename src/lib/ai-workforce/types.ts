export type AgentId =
  | "operations_manager"
  | "sales_ai"
  | "customer_support_ai"
  | "research_ai"
  | "engineering_ai";

export type PermissionTier = "green" | "amber" | "red";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "executed"
  | "failed";

export interface AgentDefinition {
  id: AgentId;
  displayName: string;
  roleTitle: string;
  description: string;
  memoryNamespace: string;
  promptVersion: number;
  systemPrompt: string;
  modelRoute: string;
  allowedTools: readonly string[];
  dailyRunLimit: number;
  maxTokensPerRun: number;
  enabled: boolean;
}

export interface ToolSpec<TInput = Record<string, unknown>, TOutput = unknown> {
  name: string;
  description: string;
  tier: PermissionTier;
  requiredScope: string;
  validateInput: (raw: unknown) => { ok: true; data: TInput } | { ok: false; error: string };
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}

export interface ToolExecutionContext {
  agentId: AgentId;
  actorUserId: string;
  actorEmail: string;
  taskId?: string | null;
  approvalId?: string | null;
}

export interface ApprovalRequestInput {
  taskId?: string | null;
  requestedByAgent: AgentId;
  toolName: string;
  targetResource: string;
  actionSummary: string;
  payload: Record<string, unknown>;
  reason: string;
  evidence?: string | null;
  expectedEffect?: string | null;
  riskLevel?: "amber" | "high";
  idempotencyKey?: string;
  ttlSeconds?: number;
}

export interface ApprovalRecord {
  id: string;
  taskId: string | null;
  requestedByAgent: AgentId;
  toolName: string;
  targetResource: string;
  actionSummary: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  reason: string;
  evidence: string | null;
  expectedEffect: string | null;
  riskLevel: "amber" | "high";
  idempotencyKey: string;
  status: ApprovalStatus;
  approverUserId: string | null;
  approverEmail: string | null;
  decisionNote: string | null;
  executionResult: unknown;
  expiresAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface ToolGatewayResponse {
  ok: boolean;
  status: "executed" | "pending_approval" | "blocked" | "failed";
  tier: PermissionTier;
  toolName: string;
  approvalId?: string;
  payloadHash?: string;
  expiresAt?: string;
  data?: unknown;
  error?: string;
}

export interface AuditLogInput {
  actorType: "owner" | "agent" | "system";
  actorId: string;
  eventType: string;
  targetResource?: string | null;
  details?: Record<string, unknown>;
}
