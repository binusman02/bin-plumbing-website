import { getServiceSupabase } from "@/lib/supabase/admin";
import type { ToolGateway } from "@/lib/ai-workforce/tool-gateway";

export interface SupportTriageResult {
  urgency: "critical" | "high" | "normal";
  category: string;
  escalateToOwner: boolean;
  escalationReasons: string[];
  summary: string;
}

export function triageSupportMessage(message: string): SupportTriageResult {
  const lower = message.toLowerCase();
  const reasons: string[] = [];

  if (/\b(flood|flooding|burst\s+pipe|gushing|ruwa\s+yana\s+zuba|water\s+everywhere)\b/.test(lower)) {
    reasons.push("Active leak / flooding emergency");
  }
  if (/\b(electric|shock|spark|fire|gas|collapse|injury)\b/.test(lower)) {
    reasons.push("Safety hazard");
  }
  if (/\b(refund|chargeback|scam|fraud|dispute|double\s+charged|paid\s+twice)\b/.test(lower)) {
    reasons.push("Payment dispute / refund request");
  }
  if (/\b(lawyer|legal|police|court|sue|threat)\b/.test(lower)) {
    reasons.push("Legal / serious escalation");
  }

  const urgency: SupportTriageResult["urgency"] =
    reasons.some((r) => r.includes("Safety") || r.includes("flooding"))
      ? "critical"
      : reasons.length > 0
        ? "high"
        : "normal";

  return {
    urgency,
    category: reasons[0] || "General support enquiry",
    escalateToOwner: reasons.length > 0,
    escalationReasons: reasons,
    summary: message.trim().slice(0, 300),
  };
}

/**
 * Security invariant: Customer Support AI must NEVER infer ownership from
 * unverified phone numbers or display names. Verified customerUserId must
 * match the ticket's customer_id.
 */
export function verifySupportTicketOwnership(params: {
  verifiedCustomerUserId: string | null | undefined;
  ticketCustomerId: string | null | undefined;
}): boolean {
  if (!params.verifiedCustomerUserId || !params.ticketCustomerId) {
    return false;
  }
  return params.verifiedCustomerUserId.trim() === params.ticketCustomerId.trim();
}

export function registerSupportTools(gateway: ToolGateway): void {
  gateway.registerTool({
    name: "support_triage_intake",
    description: "Triage incoming support form/email message for urgency and safety/payment escalation",
    tier: "green",
    requiredScope: "support:intake:triage",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const message = typeof obj.message === "string" ? obj.message.trim() : "";
      if (!message) return { ok: false, error: "message is required." };
      return { ok: true, data: { message } };
    },
    async execute(input) {
      return triageSupportMessage(input.message);
    },
  });

  gateway.registerTool({
    name: "support_read_verified_ticket",
    description: "Read ticket summary ONLY after verified customer_id ownership check passes",
    tier: "green",
    requiredScope: "support:ticket:read_verified",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = typeof obj.ticketNumber === "string" ? obj.ticketNumber.trim() : "";
      const verifiedCustomerUserId =
        typeof obj.verifiedCustomerUserId === "string" ? obj.verifiedCustomerUserId.trim() : "";
      if (!ticketNumber || !verifiedCustomerUserId) {
        return {
          ok: false,
          error: "ticketNumber and verifiedCustomerUserId are required.",
        };
      }
      return { ok: true, data: { ticketNumber, verifiedCustomerUserId } };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("ticket_number, status, problem_category, assigned_technician, customer_id, created_at")
        .eq("ticket_number", input.ticketNumber)
        .maybeSingle();

      if (!reqRow) {
        throw new Error(`Ticket ${input.ticketNumber} not found.`);
      }
      if (
        !verifySupportTicketOwnership({
          verifiedCustomerUserId: input.verifiedCustomerUserId,
          ticketCustomerId: reqRow.customer_id ? String(reqRow.customer_id) : null,
        })
      ) {
        throw new Error("Ownership verification failed for this ticket.");
      }

      return {
        ticketNumber: reqRow.ticket_number,
        status: reqRow.status,
        problemCategory: reqRow.problem_category,
        assignedTechnician: reqRow.assigned_technician,
        createdAt: reqRow.created_at,
      };
    },
  });

  gateway.registerTool({
    name: "support_draft_reply",
    description: "Draft a customer support reply without sending it",
    tier: "green",
    requiredScope: "support:draft:create",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = typeof obj.ticketNumber === "string" ? obj.ticketNumber.trim() : "";
      const draftBody = typeof obj.draftBody === "string" ? obj.draftBody.trim() : "";
      if (!ticketNumber || !draftBody) {
        return { ok: false, error: "ticketNumber and draftBody are required." };
      }
      return { ok: true, data: { ticketNumber, draftBody, draftOnly: true } };
    },
    async execute(input) {
      return input;
    },
  });

  gateway.registerTool({
    name: "support_send_reply",
    description: "Send an approved customer support reply (Amber: requires Owner approval)",
    tier: "amber",
    requiredScope: "support:reply:send",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = typeof obj.ticketNumber === "string" ? obj.ticketNumber.trim() : "";
      const replyBody = typeof obj.replyBody === "string" ? obj.replyBody.trim() : "";
      if (!ticketNumber || !replyBody) {
        return { ok: false, error: "ticketNumber and replyBody are required." };
      }
      return { ok: true, data: { ticketNumber, replyBody } };
    },
    async execute(input) {
      return { sent: true, ticketNumber: input.ticketNumber, replyBody: input.replyBody };
    },
  });

  gateway.registerTool({
    name: "support_escalate_case",
    description: "Escalate urgent safety, flooding, or payment dispute case to the Founder",
    tier: "green",
    requiredScope: "support:escalate",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const ticketNumber = typeof obj.ticketNumber === "string" ? obj.ticketNumber.trim() : "general";
      const reason = typeof obj.reason === "string" ? obj.reason.trim() : "";
      if (!reason) return { ok: false, error: "reason is required." };
      return { ok: true, data: { ticketNumber, reason } };
    },
    async execute(input) {
      return { escalated: true, ...input };
    },
  });
}
