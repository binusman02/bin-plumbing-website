import { randomUUID } from "node:crypto";
import {
  postJobMessage,
  type RequestStatus,
  updateComplaintStatus,
  updateMarketplaceSettings,
  updatePlumberVerification,
  updateServiceRequest,
  verifyPaymentById,
} from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { ToolGateway } from "@/lib/ai-workforce/tool-gateway";
import { getAgentDefinition, listAgentDefinitions } from "@/lib/ai-workforce/registry";
import { recordTeamNote } from "@/lib/ai-workforce/team-memory";
import { registerEngineeringTools } from "@/lib/ai-workforce/specialists/engineering";
import { registerResearchTools } from "@/lib/ai-workforce/specialists/research";
import { registerSalesTools } from "@/lib/ai-workforce/specialists/sales";
import { registerSupportTools } from "@/lib/ai-workforce/specialists/support";
import type { AgentId, ToolExecutionContext } from "@/lib/ai-workforce/types";

export const MAX_HANDOFF_DEPTH = 2;

export type HandoffRunner = (params: {
  requesterId: string;
  title: string;
  instruction: string;
  targetAgentId: AgentId;
  priority?: "low" | "normal" | "high" | "urgent";
  parentTaskId: string | null;
  handoffDepth: number;
  handoffChain: AgentId[];
  isHandoffChild: boolean;
}) => Promise<{
  id: string;
  parentTaskId: string | null;
  assignedAgentId: AgentId;
  status: string;
  outputSummary: string | null;
  errorMessage: string | null;
}>;

function asNonEmptyString(val: unknown): string | null {
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}

const VALID_REQUEST_STATUSES = new Set<RequestStatus>([
  "new",
  "contacted",
  "scheduled",
  "inspection_required",
  "in_progress",
  "work_completed",
  "awaiting_final_payment",
  "completed",
  "cancelled",
]);

export function registerAdminWorkforceTools(
  gateway: ToolGateway,
  options: { handoffRunner?: HandoffRunner } = {}
): void {
  gateway.registerTool({
    name: "assign_plumber_to_ticket",
    description: "Assign an approved plumber to a service request ticket",
    tier: "amber",
    requiredScope: "admin:requests:assign",
    inputJsonSchema: {
      type: "object",
      properties: {
        ticketNumber: { type: "string", description: "Ticket number e.g. BP-261122-1234" },
        plumberNameOrId: { type: "string", description: "Approved plumber full name or ID" },
      },
      required: ["ticketNumber", "plumberNameOrId"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = asNonEmptyString(obj.ticketNumber);
      const plumberNameOrId = asNonEmptyString(obj.plumberNameOrId);
      if (!ticketNumber || !plumberNameOrId) {
        return { ok: false, error: "ticketNumber and plumberNameOrId are required." };
      }
      return { ok: true, data: { ticketNumber, plumberNameOrId } };
    },
    async execute(input, ctx: ToolExecutionContext) {
      const supabase = getServiceSupabase();
      const { data: plumbers } = await supabase
        .from("plumbers")
        .select("id, full_name, verification_status")
        .eq("verification_status", "approved")
        .is("deleted_at", null);

      const needle = input.plumberNameOrId.toLowerCase();
      const match = (plumbers || []).find(
        (p) =>
          String(p.id).toLowerCase() === needle ||
          String(p.full_name || "").toLowerCase().includes(needle)
      );
      if (!match) {
        throw new Error(`No approved plumber matching "${input.plumberNameOrId}" found.`);
      }

      const updated = await updateServiceRequest(
        input.ticketNumber,
        {
          assigned_plumber_id: String(match.id),
          assigned_technician: String(match.full_name),
          status: "scheduled",
        },
        {
          actor: ctx.actorEmail,
          action: "Assigned Technician",
          details: `Assigned ${match.full_name} via Owner-approved AI action (${ctx.approvalId || "direct"})`,
        }
      );
      if (!updated) throw new Error(`Ticket ${input.ticketNumber} not found.`);
      return {
        ticketNumber: updated.ticket_number,
        plumber: match.full_name,
        status: updated.status,
      };
    },
  });

  gateway.registerTool({
    name: "update_ticket_status",
    description: "Update the status or internal notes of a service request ticket",
    tier: "amber",
    requiredScope: "admin:requests:status",
    inputJsonSchema: {
      type: "object",
      properties: {
        ticketNumber: { type: "string" },
        status: {
          type: "string",
          enum: [
            "new",
            "contacted",
            "scheduled",
            "inspection_required",
            "in_progress",
            "work_completed",
            "awaiting_final_payment",
            "completed",
            "cancelled",
          ],
        },
        internalNote: { type: "string" },
      },
      required: ["ticketNumber", "status"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = asNonEmptyString(obj.ticketNumber);
      const status = asNonEmptyString(obj.status) as RequestStatus | null;
      const internalNote = asNonEmptyString(obj.internalNote) ?? undefined;
      if (!ticketNumber || !status || !VALID_REQUEST_STATUSES.has(status)) {
        return { ok: false, error: "Valid ticketNumber and status are required." };
      }
      return { ok: true, data: { ticketNumber, status, internalNote } };
    },
    async execute(input, ctx) {
      const updated = await updateServiceRequest(
        input.ticketNumber,
        {
          status: input.status,
          ...(input.internalNote ? { internal_notes: input.internalNote } : {}),
        },
        {
          actor: ctx.actorEmail,
          action: `Status updated to ${input.status}`,
          details: input.internalNote || `Owner-approved AI action (${ctx.approvalId || "direct"})`,
        }
      );
      if (!updated) throw new Error(`Ticket ${input.ticketNumber} not found.`);
      return { ticketNumber: updated.ticket_number, status: updated.status };
    },
  });

  gateway.registerTool({
    name: "send_ticket_message",
    description: "Send a chat message on a ticket to a customer or plumber",
    tier: "amber",
    requiredScope: "admin:messages:send",
    inputJsonSchema: {
      type: "object",
      properties: {
        ticketNumber: { type: "string" },
        recipientRole: { type: "string", enum: ["customer", "plumber"] },
        message: { type: "string" },
        isInternal: { type: "boolean" },
      },
      required: ["ticketNumber", "recipientRole", "message"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = asNonEmptyString(obj.ticketNumber);
      const recipientRole =
        obj.recipientRole === "customer"
          ? ("customer" as const)
          : obj.recipientRole === "plumber"
            ? ("plumber" as const)
            : null;
      const message = asNonEmptyString(obj.message);
      if (!ticketNumber || !recipientRole || !message) {
        return { ok: false, error: "ticketNumber, recipientRole, and message are required." };
      }
      return {
        ok: true,
        data: { ticketNumber, recipientRole, message, isInternal: Boolean(obj.isInternal) },
      };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("id, customer_id, assigned_plumber_id")
        .eq("ticket_number", input.ticketNumber)
        .maybeSingle();
      if (!reqRow) throw new Error(`Ticket ${input.ticketNumber} not found.`);

      const recId =
        input.recipientRole === "customer"
          ? reqRow.customer_id
            ? String(reqRow.customer_id)
            : null
          : reqRow.assigned_plumber_id
            ? String(reqRow.assigned_plumber_id)
            : null;

      await postJobMessage({
        requestId: String(reqRow.id),
        ticketNumber: input.ticketNumber,
        senderRole: "admin",
        senderName: "FlowGuard Admin",
        recipientRole: input.recipientRole,
        recipientId: recId,
        message: input.message,
        isInternal: input.isInternal,
      });
      return { ticketNumber: input.ticketNumber, recipientRole: input.recipientRole };
    },
  });

  gateway.registerTool({
    name: "verify_payment",
    description: "Verify or reject a pending payment by ticket number",
    tier: "amber",
    requiredScope: "admin:payments:verify",
    inputJsonSchema: {
      type: "object",
      properties: {
        ticketNumber: { type: "string" },
        decision: { type: "string", enum: ["verified", "rejected"] },
      },
      required: ["ticketNumber", "decision"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = asNonEmptyString(obj.ticketNumber);
      const decision =
        obj.decision === "verified"
          ? ("verified" as const)
          : obj.decision === "rejected"
            ? ("rejected" as const)
            : null;
      if (!ticketNumber || !decision) {
        return { ok: false, error: "ticketNumber and decision ('verified' | 'rejected') required." };
      }
      return { ok: true, data: { ticketNumber, decision } };
    },
    async execute(input, ctx) {
      const supabase = getServiceSupabase();
      const { data: payRows } = await supabase
        .from("payments")
        .select("id")
        .eq("ticket_number", input.ticketNumber)
        .order("created_at", { ascending: false })
        .limit(1);
      const pay = payRows?.[0];
      if (!pay) throw new Error(`No payment record found for ${input.ticketNumber}.`);
      const ok = await verifyPaymentById(String(pay.id), input.decision, ctx.actorEmail);
      if (!ok) throw new Error("Could not update payment status.");
      return { ticketNumber: input.ticketNumber, decision: input.decision };
    },
  });

  gateway.registerTool({
    name: "update_plumber_status",
    description: "Approve, reject, or suspend a plumber account",
    tier: "amber",
    requiredScope: "admin:plumbers:verify",
    inputJsonSchema: {
      type: "object",
      properties: {
        plumberNameOrId: { type: "string" },
        status: { type: "string", enum: ["approved", "rejected", "suspended"] },
        notes: { type: "string" },
      },
      required: ["plumberNameOrId", "status"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const plumberNameOrId = asNonEmptyString(obj.plumberNameOrId);
      const status =
        obj.status === "approved"
          ? ("approved" as const)
          : obj.status === "rejected"
            ? ("rejected" as const)
            : obj.status === "suspended"
              ? ("suspended" as const)
              : null;
      const notes = asNonEmptyString(obj.notes) ?? undefined;
      if (!plumberNameOrId || !status) {
        return { ok: false, error: "plumberNameOrId and valid status are required." };
      }
      return { ok: true, data: { plumberNameOrId, status, notes } };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data: plumbers } = await supabase
        .from("plumbers")
        .select("id, full_name")
        .is("deleted_at", null);
      const needle = input.plumberNameOrId.toLowerCase();
      const match = (plumbers || []).find(
        (p) =>
          String(p.id).toLowerCase() === needle ||
          String(p.full_name || "").toLowerCase().includes(needle)
      );
      if (!match) throw new Error(`No plumber matching "${input.plumberNameOrId}" found.`);
      const ok = await updatePlumberVerification(String(match.id), input.status, input.notes);
      if (!ok) throw new Error("Could not update plumber verification.");
      return { plumber: match.full_name, status: input.status };
    },
  });

  gateway.registerTool({
    name: "resolve_complaint",
    description: "Update a complaint status with a resolution note",
    tier: "amber",
    requiredScope: "admin:complaints:update",
    inputJsonSchema: {
      type: "object",
      properties: {
        complaintIdOrTicket: { type: "string" },
        status: { type: "string", enum: ["under_review", "investigating", "resolved"] },
        adminNote: { type: "string" },
      },
      required: ["complaintIdOrTicket", "status"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const complaintIdOrTicket = asNonEmptyString(obj.complaintIdOrTicket);
      const status =
        obj.status === "under_review"
          ? ("under_review" as const)
          : obj.status === "investigating"
            ? ("investigating" as const)
            : obj.status === "resolved"
              ? ("resolved" as const)
              : null;
      const adminNote = asNonEmptyString(obj.adminNote) ?? undefined;
      if (!complaintIdOrTicket || !status) {
        return { ok: false, error: "complaintIdOrTicket and valid status are required." };
      }
      return { ok: true, data: { complaintIdOrTicket, status, adminNote } };
    },
    async execute(input, ctx) {
      const supabase = getServiceSupabase();
      const { data: complaints } = await supabase
        .from("complaints")
        .select("id, ticket_number")
        .order("created_at", { ascending: false })
        .limit(50);
      const match = (complaints || []).find(
        (c) =>
          String(c.id) === input.complaintIdOrTicket ||
          String(c.ticket_number || "") === input.complaintIdOrTicket
      );
      if (!match) throw new Error(`Complaint "${input.complaintIdOrTicket}" not found.`);
      const ok = await updateComplaintStatus(
        String(match.id),
        input.status,
        input.adminNote,
        ctx.actorEmail
      );
      if (!ok) throw new Error("Could not update complaint.");
      return { id: match.id, status: input.status };
    },
  });

  gateway.registerTool({
    name: "update_commission_settings",
    description: "Update marketplace commission rates or small-job threshold",
    tier: "amber",
    requiredScope: "admin:settings:commission",
    inputJsonSchema: {
      type: "object",
      properties: {
        commissionDefaultRate: { type: "number" },
        commissionSmallJobRate: { type: "number" },
        smallJobThreshold: { type: "number" },
        smallJobRuleEnabled: { type: "boolean" },
      },
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (typeof obj.commissionDefaultRate === "number") {
        patch.commissionDefaultRate = obj.commissionDefaultRate;
      }
      if (typeof obj.commissionSmallJobRate === "number") {
        patch.commissionSmallJobRate = obj.commissionSmallJobRate;
      }
      if (typeof obj.smallJobThreshold === "number") {
        patch.smallJobThreshold = obj.smallJobThreshold;
      }
      if (typeof obj.smallJobRuleEnabled === "boolean") {
        patch.smallJobRuleEnabled = obj.smallJobRuleEnabled;
      }
      if (Object.keys(patch).length === 0) {
        return { ok: false, error: "At least one commission setting must be provided." };
      }
      return { ok: true, data: patch };
    },
    async execute(input, ctx) {
      const next = await updateMarketplaceSettings(
        {
          ...(input.commissionDefaultRate !== undefined
            ? { commission_default_rate: Number(input.commissionDefaultRate) }
            : {}),
          ...(input.commissionSmallJobRate !== undefined
            ? { commission_small_job_rate: Number(input.commissionSmallJobRate) }
            : {}),
          ...(input.smallJobThreshold !== undefined
            ? { small_job_threshold: Number(input.smallJobThreshold) }
            : {}),
          ...(input.smallJobRuleEnabled !== undefined
            ? { small_job_rule_enabled: Boolean(input.smallJobRuleEnabled) }
            : {}),
        },
        ctx.actorEmail
      );
      return {
        commission_default_rate: next.commission_default_rate,
        commission_small_job_rate: next.commission_small_job_rate,
        small_job_threshold: next.small_job_threshold,
        small_job_rule_enabled: next.small_job_rule_enabled,
      };
    },
  });

  // Green read-only operations & workforce tools for Sadiq (Operations Manager)
  gateway.registerTool({
    name: "get_live_operations_feed",
    description: "Fetch latest live tickets, pending payments, unread messages, and recent enquiries",
    tier: "green",
    requiredScope: "admin:operations:read",
    inputJsonSchema: { type: "object", properties: {} },
    validateInput() {
      return { ok: true, data: {} };
    },
    async execute() {
      const supabase = getServiceSupabase();
      const [reqs, pays, unread, enqs] = await Promise.all([
        supabase
          .from("service_requests")
          .select("ticket_number, status, urgency, problem_category, customer_name, city_lga, assigned_technician, created_at")
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("payments")
          .select("ticket_number, total_payment, verification_status, created_at")
          .eq("verification_status", "pending")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("messages")
          .select("ticket_number, sender_name, sender_role, message, created_at")
          .eq("admin_read", false)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("enquiries")
          .select("id, full_name, service_category, area_in_kano, status, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      return {
        recentRequests: reqs.data || [],
        pendingPayments: pays.data || [],
        unreadMessages: unread.data || [],
        recentEnquiries: enqs.data || [],
      };
    },
  });

  gateway.registerTool({
    name: "inspect_ticket",
    description: "Inspect full details of a specific ticket by ticketNumber",
    tier: "green",
    requiredScope: "admin:requests:read",
    inputJsonSchema: {
      type: "object",
      properties: { ticketNumber: { type: "string" } },
      required: ["ticketNumber"],
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = asNonEmptyString(obj.ticketNumber);
      if (!ticketNumber) return { ok: false, error: "ticketNumber is required." };
      return { ok: true, data: { ticketNumber } };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("service_requests")
        .select("ticket_number, status, urgency, problem_category, customer_name, city_lga, assigned_technician, created_at")
        .eq("ticket_number", input.ticketNumber)
        .maybeSingle();
      if (!data) throw new Error(`Ticket ${input.ticketNumber} not found.`);
      return data;
    },
  });

  gateway.registerTool({
    name: "find_best_plumbers_for_area",
    description: "Rank approved plumbers by availability, area match, and active workload",
    tier: "green",
    requiredScope: "admin:plumbers:read",
    inputJsonSchema: {
      type: "object",
      properties: { area: { type: "string" } },
    },
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      return { ok: true, data: { area: asNonEmptyString(obj.area) ?? "" } };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("plumbers")
        .select("id, full_name, is_available, preferred_locations, residential_location, rating, total_jobs")
        .eq("verification_status", "approved")
        .is("deleted_at", null)
        .limit(25);
      const areaLower = input.area.toLowerCase();
      return (data || []).map((p) => {
        const locs = Array.isArray(p.preferred_locations)
          ? p.preferred_locations.join(", ")
          : String(p.residential_location || "Kano");
        return {
          id: p.id,
          name: p.full_name,
          onDuty: Boolean(p.is_available),
          areas: locs,
          areaMatch: areaLower ? locs.toLowerCase().includes(areaLower) : true,
          rating: p.rating,
        };
      });
    },
  });

  gateway.registerTool({
    name: "inspect_financial_summary",
    description: "Summarize verified revenue, commission, and pending payments",
    tier: "green",
    requiredScope: "admin:financials:read",
    inputJsonSchema: { type: "object", properties: {} },
    validateInput() {
      return { ok: true, data: {} };
    },
    async execute() {
      const supabase = getServiceSupabase();
      const { data: payments } = await supabase
        .from("payments")
        .select("total_payment, company_commission, verification_status")
        .order("created_at", { ascending: false })
        .limit(100);
      const rows = payments || [];
      const verified = rows.filter((p) => p.verification_status === "verified");
      const pending = rows.filter((p) => p.verification_status === "pending");
      return {
        verifiedCount: verified.length,
        pendingCount: pending.length,
        verifiedRevenueNGN: verified.reduce((s, p) => s + (Number(p.total_payment) || 0), 0),
        verifiedCommissionNGN: verified.reduce((s, p) => s + (Number(p.company_commission) || 0), 0),
        pendingAmountNGN: pending.reduce((s, p) => s + (Number(p.total_payment) || 0), 0),
      };
    },
  });

  gateway.registerTool({
    name: "workforce_read_agent_status",
    description: "List all 5 AI Workforce agents, their names, roles, and configured model routes",
    tier: "green",
    requiredScope: "workforce:agents:read",
    inputJsonSchema: { type: "object", properties: {} },
    validateInput() {
      return { ok: true, data: {} };
    },
    async execute() {
      return listAgentDefinitions().map((a) => ({
        id: a.id,
        displayName: a.displayName,
        roleTitle: a.roleTitle,
        modelRoute: a.modelRoute,
        enabled: a.enabled,
      }));
    },
  });

  gateway.registerTool({
    name: "workforce_read_tasks",
    description: "Read recent AI Workforce tasks and statuses",
    tier: "green",
    requiredScope: "workforce:tasks:read",
    inputJsonSchema: { type: "object", properties: {} },
    validateInput() {
      return { ok: true, data: {} };
    },
    async execute() {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("ai_tasks")
        .select("id, title, assigned_agent_id, status, created_at")
        .order("created_at", { ascending: false })
        .limit(15);
      return data || [];
    },
  });

  async function executeAgentHandoff(
    input: {
      targetAgentId: AgentId;
      title: string;
      instruction: string;
      ticketNumber?: string;
      priority?: "low" | "normal" | "high" | "urgent";
    },
    ctx: ToolExecutionContext
  ) {
    const depth = ctx.handoffDepth ?? 0;
    const chain = ctx.handoffChain ?? [];

    if (input.targetAgentId === ctx.agentId) {
      throw new Error("Self-handoff is forbidden: an agent cannot hand off work to itself.");
    }
    if (chain.includes(input.targetAgentId)) {
      throw new Error(
        `Handoff loop blocked: "${input.targetAgentId}" is already in the handoff chain.`
      );
    }
    if (depth >= MAX_HANDOFF_DEPTH) {
      throw new Error(
        `Maximum handoff depth (${MAX_HANDOFF_DEPTH}) reached for this task.`
      );
    }

    // Log handoff in ai_task_events & ai_audit_logs (best-effort when running against Supabase)
    try {
      const supabase = getServiceSupabase();
      if (ctx.taskId) {
        await supabase.from("ai_task_events").insert({
          id: randomUUID(),
          task_id: ctx.taskId,
          agent_id: ctx.agentId,
          event_type: "routed",
          message: `Handoff from ${ctx.agentId} to ${input.targetAgentId} (depth ${depth + 1}): ${input.title}`,
        });
      }
      await supabase.from("ai_audit_logs").insert({
        actor_type: "agent",
        actor_id: ctx.agentId,
        event_type: "workforce_handoff",
        target_resource: input.ticketNumber || ctx.taskId || input.targetAgentId,
        details: {
          fromAgent: ctx.agentId,
          toAgent: input.targetAgentId,
          parentTaskId: ctx.taskId ?? null,
          handoffDepth: depth + 1,
          title: input.title,
        },
      });
    } catch {
      // Non-fatal in unit tests / unmigrated dev DB
    }

    await recordTeamNote({
      fromAgent: ctx.agentId,
      toAgent: input.targetAgentId,
      taskId: ctx.taskId ?? null,
      ticketNumber: input.ticketNumber ?? null,
      note: `${ctx.agentId} handed off "${input.title}" to ${input.targetAgentId}.`,
    }).catch(() => {});

    const runner: HandoffRunner =
      options.handoffRunner ??
      (async (p) => {
        const { defaultWorkforceOrchestrator } = await import(
          "@/lib/ai-workforce/orchestrator"
        );
        return defaultWorkforceOrchestrator.dispatchInstruction(p);
      });

    const childTask = await runner({
      requesterId: ctx.actorUserId || ctx.agentId,
      title: input.title,
      instruction: input.instruction,
      targetAgentId: input.targetAgentId,
      priority: input.priority ?? "normal",
      parentTaskId: ctx.taskId ?? null,
      handoffDepth: depth + 1,
      handoffChain: [...chain, ctx.agentId],
      isHandoffChild: true,
    });

    return {
      taskId: childTask.id,
      parentTaskId: childTask.parentTaskId,
      assignedAgentId: childTask.assignedAgentId,
      status: childTask.status,
      summary: childTask.outputSummary || childTask.errorMessage || "Completed.",
    };
  }

  function validateHandoffInput(raw: unknown) {
    const obj = (raw || {}) as Record<string, unknown>;
    const targetAgentId = asNonEmptyString(obj.targetAgentId) as AgentId | null;
    const title = asNonEmptyString(obj.title);
    const instruction = asNonEmptyString(obj.instruction);
    const ticketNumber = asNonEmptyString(obj.ticketNumber) ?? undefined;
    const priorityRaw = asNonEmptyString(obj.priority);
    const priority: "low" | "normal" | "high" | "urgent" =
      priorityRaw === "low" ||
      priorityRaw === "normal" ||
      priorityRaw === "high" ||
      priorityRaw === "urgent"
        ? priorityRaw
        : "normal";

    if (!targetAgentId || !getAgentDefinition(targetAgentId)) {
      return { ok: false as const, error: "Valid targetAgentId is required." };
    }
    if (!title || !instruction) {
      return { ok: false as const, error: "title and instruction are required." };
    }
    return {
      ok: true as const,
      data: { targetAgentId, title, instruction, ticketNumber, priority },
    };
  }

  const handoffSchema = {
    type: "object",
    properties: {
      targetAgentId: {
        type: "string",
        enum: [
          "operations_manager",
          "sales_ai",
          "customer_support_ai",
          "research_ai",
          "engineering_ai",
        ],
      },
      title: { type: "string" },
      instruction: { type: "string" },
      ticketNumber: { type: "string" },
      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    },
    required: ["targetAgentId", "title", "instruction"],
  };

  gateway.registerTool({
    name: "workforce_request_specialist_run",
    description:
      "Hand off a bounded task to a specialist agent (Sadiq only, max 2 levels, no loops) and return the result",
    tier: "green",
    requiredScope: "workforce:handoff:specialist",
    inputJsonSchema: handoffSchema,
    validateInput: validateHandoffInput,
    execute: executeAgentHandoff,
  });

  gateway.registerTool({
    name: "workforce_create_task",
    description:
      "Create and run a child handoff task for a teammate (max 2 levels, no self-handoff or loops)",
    tier: "green",
    requiredScope: "workforce:tasks:create",
    inputJsonSchema: handoffSchema,
    validateInput: validateHandoffInput,
    execute: executeAgentHandoff,
  });
}

export function getOpenAiToolsForAgent(
  gateway: ToolGateway,
  agentId: AgentId
): Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const agent = getAgentDefinition(agentId);
  if (!agent) return [];
  const defs: Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> = [];

  for (const toolName of agent.allowedTools) {
    const spec = gateway.getTool(toolName);
    if (!spec || spec.tier === "red") continue;
    defs.push({
      type: "function",
      function: {
        name: spec.name,
        description: spec.description,
        parameters: spec.inputJsonSchema ?? { type: "object", properties: {} },
      },
    });
  }
  return defs;
}

let _defaultGateway: ToolGateway | null = null;

export function getAdminToolGateway(): ToolGateway {
  if (!_defaultGateway) {
    _defaultGateway = new ToolGateway();
    registerAdminWorkforceTools(_defaultGateway);
    registerEngineeringTools(_defaultGateway);
    registerResearchTools(_defaultGateway);
    registerSalesTools(_defaultGateway);
    registerSupportTools(_defaultGateway);
  }
  return _defaultGateway;
}

export function getOwnerApprovalDeepLink(approvalId: string): string {
  return `/admin/workforce?tab=approvals&approvalId=${encodeURIComponent(approvalId)}`;
}
