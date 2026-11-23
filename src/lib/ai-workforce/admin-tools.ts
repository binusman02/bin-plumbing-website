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
import { registerEngineeringTools } from "@/lib/ai-workforce/specialists/engineering";
import { registerResearchTools } from "@/lib/ai-workforce/specialists/research";
import { registerSalesTools } from "@/lib/ai-workforce/specialists/sales";
import { registerSupportTools } from "@/lib/ai-workforce/specialists/support";
import type { ToolExecutionContext } from "@/lib/ai-workforce/types";

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

export function registerAdminWorkforceTools(gateway: ToolGateway): void {
  gateway.registerTool({
    name: "assign_plumber_to_ticket",
    description: "Assign an approved plumber to a service request ticket",
    tier: "amber",
    requiredScope: "admin:requests:assign",
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
