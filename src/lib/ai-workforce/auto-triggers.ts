import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import {
  getAdminToolGateway,
  getOwnerApprovalDeepLink,
} from "@/lib/ai-workforce/admin-tools";
import { triageSupportMessage } from "@/lib/ai-workforce/specialists/support";

async function recordAutoTask(params: {
  agentId: "operations_manager" | "sales_ai" | "customer_support_ai" | "engineering_ai";
  title: string;
  description: string;
  status: "waiting_approval" | "completed";
  outputSummary: string;
  priority?: "normal" | "high" | "urgent";
}): Promise<string | null> {
  try {
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const supabase = getServiceSupabase();
    await supabase.from("ai_tasks").insert({
      id,
      title: params.title,
      description: params.description,
      requester_id: "system_auto_trigger",
      assigned_agent_id: params.agentId,
      parent_task_id: null,
      priority: params.priority ?? "normal",
      status: params.status,
      output_summary: params.outputSummary,
      completed_at: params.status === "completed" ? nowIso : null,
    });
    await supabase.from("ai_task_events").insert({
      id: randomUUID(),
      task_id: id,
      agent_id: params.agentId,
      event_type: params.status === "waiting_approval" ? "approval_requested" : "completed",
      message: params.outputSummary,
    });
    return id;
  } catch {
    return null;
  }
}

/**
 * Event 1: New Service Request (Web or Mobile)
 * Zainab triages urgency; Sadiq selects the best approved plumber and queues an Amber Approval.
 */
export async function triggerWorkforceOnServiceRequest(params: {
  ticketNumber: string;
  customerName: string;
  problemCategory: string;
  cityLga: string;
  issueDescription: string;
  urgency?: string;
}): Promise<void> {
  try {
    const triage = triageSupportMessage(
      `${params.problemCategory} ${params.issueDescription}`
    );

    if (triage.escalateToOwner) {
      await recordAutoTask({
        agentId: "customer_support_ai",
        title: `Urgent Triage: ${params.ticketNumber}`,
        description: params.issueDescription,
        status: "completed",
        priority: triage.urgency === "critical" ? "urgent" : "high",
        outputSummary: `Zainab flagged ${triage.urgency.toUpperCase()} (${triage.escalationReasons.join(", ")}).`,
      });
    }

    const supabase = getServiceSupabase();
    const { data: plumbers } = await supabase
      .from("plumbers")
      .select("id, full_name, is_available, preferred_locations, residential_location, rating")
      .eq("verification_status", "approved")
      .is("deleted_at", null)
      .limit(25);

    const areaLower = params.cityLga.toLowerCase();
    const candidates = (plumbers || []).sort((a, b) => {
      const aDuty = a.is_available ? 1 : 0;
      const bDuty = b.is_available ? 1 : 0;
      if (aDuty !== bDuty) return bDuty - aDuty;
      const aLoc = Array.isArray(a.preferred_locations)
        ? a.preferred_locations.join(" ").toLowerCase()
        : String(a.residential_location || "").toLowerCase();
      const bLoc = Array.isArray(b.preferred_locations)
        ? b.preferred_locations.join(" ").toLowerCase()
        : String(b.residential_location || "").toLowerCase();
      const aMatch = areaLower && aLoc.includes(areaLower) ? 1 : 0;
      const bMatch = areaLower && bLoc.includes(areaLower) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return (Number(b.rating) || 0) - (Number(a.rating) || 0);
    });

    const best = candidates[0];
    if (!best) {
      await recordAutoTask({
        agentId: "operations_manager",
        title: `No approved plumber available for ${params.ticketNumber}`,
        description: `Area: ${params.cityLga}`,
        status: "completed",
        priority: "high",
        outputSummary: "Sadiq checked approved plumbers; none matched or available yet.",
      });
      return;
    }

    const gateway = getAdminToolGateway();
    const res = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "system_auto_trigger",
        actorEmail: "sadiq@flowguard.com.ng",
      },
      toolName: "assign_plumber_to_ticket",
      rawInput: {
        ticketNumber: params.ticketNumber,
        plumberNameOrId: String(best.full_name),
      },
      targetResource: params.ticketNumber,
      actionSummary: `Assign ${best.full_name} to ${params.ticketNumber}`,
      reason: `Auto-matched by Sadiq (${best.is_available ? "On Duty" : "Approved"} • ${params.cityLga})`,
      idempotencyKey: `auto:assign:${params.ticketNumber}:${best.id}`,
    });

    if (res.approvalId) {
      await recordAutoTask({
        agentId: "operations_manager",
        title: `Approval Ready: Assign ${best.full_name} to ${params.ticketNumber}`,
        description: `${params.customerName} • ${params.problemCategory} (${params.cityLga})`,
        status: "waiting_approval",
        priority: triage.escalateToOwner ? "urgent" : "normal",
        outputSummary: `Sadiq prepared plumber assignment for ${best.full_name} (Approval ID: ${res.approvalId}).`,
      });

      await createNotification({
        recipientId: "admin",
        recipientRole: "admin",
        actorRole: "admin",
        type: "ai_approval_pending",
        title: `Sadiq: Approve plumber for ${params.ticketNumber}`,
        body: `Assign ${best.full_name} to ${params.customerName}'s ${params.problemCategory} request (${params.cityLga}).`,
        entityType: "ai_approval",
        entityId: res.approvalId,
        destination: getOwnerApprovalDeepLink(res.approvalId),
      });
    }
  } catch (err) {
    console.error("[auto-trigger:service_request]", err instanceof Error ? err.message : err);
  }
}

/**
 * Event 2: New Direct Enquiry
 * Amina qualifies the lead and prepares a follow-up draft / Amber email approval.
 */
export async function triggerWorkforceOnEnquiry(params: {
  enquiryId: string;
  fullName: string;
  phone: string;
  email?: string;
  serviceType: string;
  location: string;
  message: string;
}): Promise<void> {
  try {
    const draftBody = `Hello ${params.fullName}, thanks for getting in touch with FlowGuard Plumbing Enterprises regarding ${params.serviceType} in ${params.location}. Would you like us to schedule a verified technician inspection?`;
    if (params.email?.trim()) {
      const res = await getAdminToolGateway().invoke({
        ctx: {
          agentId: "sales_ai",
          actorUserId: "system_auto_trigger",
          actorEmail: "amina@flowguard.com.ng",
        },
        toolName: "sales_send_email",
        rawInput: {
          to: params.email.trim(),
          subject: `FlowGuard Plumbing — ${params.serviceType} Enquiry`,
          body: draftBody,
        },
        targetResource: params.enquiryId,
        actionSummary: `Send follow-up email to ${params.fullName}`,
        reason: `Amina qualified new ${params.serviceType} enquiry in ${params.location}`,
        idempotencyKey: `auto:sales_email:${params.enquiryId}`,
      });

      if (res.approvalId) {
        await recordAutoTask({
          agentId: "sales_ai",
          title: `Lead Follow-up Approval: ${params.fullName}`,
          description: params.message,
          status: "waiting_approval",
          outputSummary: `Amina drafted follow-up email for ${params.fullName} (Approval ID: ${res.approvalId}).`,
        });
        await createNotification({
          recipientId: "admin",
          recipientRole: "admin",
          actorRole: "admin",
          type: "ai_approval_pending",
          title: `Amina: Approve lead reply to ${params.fullName}`,
          body: `Draft follow-up prepared for ${params.serviceType} in ${params.location}.`,
          entityType: "ai_approval",
          entityId: res.approvalId,
          destination: getOwnerApprovalDeepLink(res.approvalId),
        });
        return;
      }
    }

    await recordAutoTask({
      agentId: "sales_ai",
      title: `Qualified Enquiry: ${params.fullName} (${params.location})`,
      description: `${params.serviceType} • Phone: ${params.phone} • ${params.message}`,
      status: "completed",
      outputSummary: `Amina qualified lead & prepared draft message: "${draftBody}"`,
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Event 3: New Payment Recorded / Proof Uploaded
 * Sadiq prepares a verify_payment Amber Approval for the Founder.
 */
export async function triggerWorkforceOnPaymentSubmitted(params: {
  ticketNumber: string;
  customerName: string;
  amount: number;
}): Promise<void> {
  try {
    const res = await getAdminToolGateway().invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "system_auto_trigger",
        actorEmail: "sadiq@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: {
        ticketNumber: params.ticketNumber,
        decision: "verified",
      },
      targetResource: params.ticketNumber,
      actionSummary: `Verify ₦${params.amount.toLocaleString()} payment for ${params.ticketNumber}`,
      reason: `Customer ${params.customerName} submitted payment proof`,
      idempotencyKey: `auto:verify_pay:${params.ticketNumber}:${Math.round(params.amount)}`,
    });

    if (res.approvalId) {
      await recordAutoTask({
        agentId: "operations_manager",
        title: `Payment Verification Ready: ${params.ticketNumber}`,
        description: `₦${params.amount.toLocaleString()} from ${params.customerName}`,
        status: "waiting_approval",
        outputSummary: `Sadiq queued payment verification (Approval ID: ${res.approvalId}).`,
      });
      await createNotification({
        recipientId: "admin",
        recipientRole: "admin",
        actorRole: "admin",
        type: "ai_approval_pending",
        title: `Sadiq: Verify payment on ${params.ticketNumber}`,
        body: `₦${params.amount.toLocaleString()} submitted by ${params.customerName}. Tap to approve or reject.`,
        entityType: "ai_approval",
        entityId: res.approvalId,
        destination: getOwnerApprovalDeepLink(res.approvalId),
      });
    }
  } catch {
    // Non-blocking
  }
}

/**
 * Event 4: Customer Complaint Submitted
 * Zainab triages severity and notifies the Founder if urgent.
 */
export async function triggerWorkforceOnComplaint(params: {
  complaintId: string;
  ticketNumber: string;
  customerName: string;
  message: string;
}): Promise<void> {
  try {
    const triage = triageSupportMessage(params.message);
    await recordAutoTask({
      agentId: "customer_support_ai",
      title: `Complaint Triaged: ${params.ticketNumber || params.customerName}`,
      description: params.message,
      status: "completed",
      priority: triage.escalateToOwner ? "urgent" : "normal",
      outputSummary: `Zainab triaged as ${triage.urgency.toUpperCase()} (${triage.category}).`,
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Event 5: Technical Error / Incident Detected
 * Bashir (Engineering AI) automatically logs an investigation task and notifies the Founder.
 */
export async function triggerEngineeringIncidentWatch(params: {
  source: string;
  errorMessage: string;
}): Promise<void> {
  try {
    const taskId = await recordAutoTask({
      agentId: "engineering_ai",
      title: `Incident Detected: ${params.source}`,
      description: params.errorMessage.slice(0, 1000),
      status: "completed",
      priority: "high",
      outputSummary: `Bashir logged technical incident from ${params.source} for root-cause review: ${params.errorMessage.slice(0, 240)}`,
    });
    if (taskId) {
      await createNotification({
        recipientId: "admin",
        recipientRole: "admin",
        actorRole: "admin",
        type: "engineering_incident",
        title: `Bashir: Technical issue in ${params.source}`,
        body: params.errorMessage.slice(0, 140),
        entityType: "ai_task",
        entityId: taskId,
        destination: "/admin/workforce?tab=tasks",
      });
    }
  } catch {
    // Non-blocking
  }
}
