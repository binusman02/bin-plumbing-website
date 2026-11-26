import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { ApprovalRecord } from "@/lib/ai-workforce/types";

function extractApprovalIdFromSummary(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/Approval ID:\s*([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function extractTicketFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\bBP-\d{6}-\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Synchronizes downstream ai_tasks, notifications, and ai_team_notes immediately
 * after the Owner approves, rejects, or expires an ai_approvals record.
 */
export async function syncWorkforceAfterApprovalDecision(params: {
  record: ApprovalRecord;
  outcome: "executed" | "rejected" | "failed" | "expired";
  actorEmail?: string;
  note?: string;
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const { record, outcome } = params;
    const targetTaskStatus = outcome === "failed" ? "failed" : "closed";
    const outcomeLabel =
      outcome === "executed"
        ? `Owner approved & executed: ${record.actionSummary}`
        : outcome === "rejected"
          ? `Owner rejected: ${record.actionSummary}`
          : outcome === "expired"
            ? `Approval expired: ${record.actionSummary}`
            : `Execution failed: ${record.actionSummary}${params.note ? ` (${params.note})` : ""}`;

    // 1. Find linked ai_tasks either by task_id or by Approval ID / ticket mention in waiting_approval
    const candidateTaskIds = new Set<string>();
    if (record.taskId) candidateTaskIds.add(record.taskId);

    const { data: waitingTasks } = await supabase
      .from("ai_tasks")
      .select("id, title, output_summary")
      .eq("status", "waiting_approval")
      .limit(50);

    for (const row of waitingTasks || []) {
      const id = String(row.id);
      const summary = String(row.output_summary || "");
      const title = String(row.title || "");
      if (
        summary.includes(record.id) ||
        (record.targetResource &&
          title.includes(record.targetResource) &&
          (record.toolName === "assign_plumber_to_ticket"
            ? title.toLowerCase().includes("assign")
            : record.toolName === "verify_payment"
              ? title.toLowerCase().includes("payment")
              : record.toolName === "support_send_reply"
                ? title.toLowerCase().includes("approval") || title.toLowerCase().includes("reply")
                : title.toLowerCase().includes("follow-up")))
      ) {
        candidateTaskIds.add(id);
      }
    }

    for (const taskId of candidateTaskIds) {
      await supabase
        .from("ai_tasks")
        .update({
          status: targetTaskStatus,
          output_summary: outcomeLabel,
          deliverable: outcomeLabel,
          qa_status: outcome === "failed" ? "rework" : "approved",
          lessons: [outcomeLabel.slice(0, 140)],
          completed_at: nowIso,
          ...(outcome === "failed" && params.note ? { error_message: params.note } : {}),
        })
        .eq("id", taskId);

      await supabase.from("ai_task_events").insert({
        id: randomUUID(),
        task_id: taskId,
        agent_id: record.requestedByAgent,
        event_type:
          outcome === "executed"
            ? "approved"
            : outcome === "rejected"
              ? "rejected"
              : outcome === "failed"
                ? "failed"
                : "closed",
        message: `${outcomeLabel}${params.actorEmail ? ` (${params.actorEmail})` : ""}`,
      });
    }

    // 2. Clear matching unread approval notification in notifications bell
    await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("recipient_role", "admin")
      .eq("type", "ai_approval_pending")
      .is("read_at", null)
      .ilike("destination", `%${record.id}%`);

    // 3. Record concise resolution team board note so the thread stays complete & chronological
    const ticketMatch = extractTicketFromText(record.targetResource);
    await supabase.from("ai_team_notes").insert({
      id: randomUUID(),
      from_agent: record.requestedByAgent,
      to_agent: null,
      task_id: record.taskId ?? Array.from(candidateTaskIds)[0] ?? null,
      ticket_number: ticketMatch,
      note: outcomeLabel.slice(0, 380),
    });
  } catch {
    // Non-fatal in case optional tables/columns aren't migrated yet
  }
}

/**
 * Reconciles stale waiting_approval tasks, expired approvals, and approvals whose
 * underlying ticket/payment action was already completed directly in Admin portals.
 */
export async function reconcileStaleWorkforceState(): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const [{ data: pendingRows }, { data: waitingTasks }] = await Promise.all([
      supabase.from("ai_approvals").select("*").eq("status", "pending").limit(100),
      supabase
        .from("ai_tasks")
        .select("id, assigned_agent_id, title, output_summary, created_at")
        .eq("status", "waiting_approval")
        .limit(100),
    ]);

    const pendingApprovals = (pendingRows || []) as Array<Record<string, unknown>>;

    // Gather ticket numbers referenced by pending assign/verify approvals to check live DB state
    const ticketTargets = Array.from(
      new Set(
        pendingApprovals
          .map((a) => extractTicketFromText(String(a.target_resource || "")))
          .filter((t): t is string => Boolean(t))
      )
    );

    const ticketStateMap = new Map<
      string,
      { assigned_plumber_id: string | null; assigned_technician: string | null; paymentVerified: boolean }
    >();

    if (ticketTargets.length > 0) {
      const [{ data: reqRows }, { data: payRows }] = await Promise.all([
        supabase
          .from("service_requests")
          .select("ticket_number, assigned_plumber_id, assigned_technician, payment_status")
          .in("ticket_number", ticketTargets),
        supabase
          .from("payments")
          .select("ticket_number, status")
          .in("ticket_number", ticketTargets)
          .eq("status", "verified"),
      ]);
      const verifiedTickets = new Set(
        (payRows || []).map((p) => String(p.ticket_number || "").toUpperCase())
      );
      for (const r of reqRows || []) {
        const tn = String(r.ticket_number || "").toUpperCase();
        ticketStateMap.set(tn, {
          assigned_plumber_id: r.assigned_plumber_id ? String(r.assigned_plumber_id) : null,
          assigned_technician: r.assigned_technician ? String(r.assigned_technician) : null,
          paymentVerified:
            verifiedTickets.has(tn) || String(r.payment_status || "") === "verified",
        });
      }
    }

    const stillPendingIds = new Set<string>();
    const stillPendingTaskIds = new Set<string>();

    for (const row of pendingApprovals) {
      const id = String(row.id);
      const toolName = String(row.tool_name || "");
      const targetResource = String(row.target_resource || "");
      const taskId = row.task_id ? String(row.task_id) : null;
      const expiresAtMs = new Date(String(row.expires_at || "")).getTime();

      if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
        await supabase
          .from("ai_approvals")
          .update({
            status: "expired",
            decided_at: nowIso,
            decision_note: "Approval expired before owner decision.",
          })
          .eq("id", id)
          .eq("status", "pending");

        await supabase
          .from("notifications")
          .update({ read_at: nowIso })
          .eq("recipient_role", "admin")
          .eq("type", "ai_approval_pending")
          .is("read_at", null)
          .ilike("destination", `%${id}%`);
        continue;
      }

      const tn = extractTicketFromText(targetResource);
      const liveTicket = tn ? ticketStateMap.get(tn) : undefined;
      if (
        liveTicket &&
        toolName === "assign_plumber_to_ticket" &&
        liveTicket.assigned_plumber_id
      ) {
        await supabase
          .from("ai_approvals")
          .update({
            status: "executed",
            decided_at: nowIso,
            executed_at: nowIso,
            decision_note: `Already assigned to ${liveTicket.assigned_technician || liveTicket.assigned_plumber_id} in Requests.`,
            execution_result: {
              ok: true,
              reconciled: true,
              assignedTechnician: liveTicket.assigned_technician,
            },
          })
          .eq("id", id)
          .eq("status", "pending");

        await supabase
          .from("notifications")
          .update({ read_at: nowIso })
          .eq("recipient_role", "admin")
          .eq("type", "ai_approval_pending")
          .is("read_at", null)
          .ilike("destination", `%${id}%`);
        continue;
      }

      if (liveTicket && toolName === "verify_payment" && liveTicket.paymentVerified) {
        await supabase
          .from("ai_approvals")
          .update({
            status: "executed",
            decided_at: nowIso,
            executed_at: nowIso,
            decision_note: "Payment already verified in Financials.",
            execution_result: { ok: true, reconciled: true },
          })
          .eq("id", id)
          .eq("status", "pending");

        await supabase
          .from("notifications")
          .update({ read_at: nowIso })
          .eq("recipient_role", "admin")
          .eq("type", "ai_approval_pending")
          .is("read_at", null)
          .ilike("destination", `%${id}%`);
        continue;
      }

      stillPendingIds.add(id);
      if (taskId) stillPendingTaskIds.add(taskId);
    }

    // Reconcile any waiting_approval ai_tasks whose approval is no longer pending
    const taskList = (waitingTasks || []) as Array<Record<string, unknown>>;
    if (taskList.length === 0) return;

    const approvalIdsToCheck = taskList
      .map((t) => extractApprovalIdFromSummary(String(t.output_summary || "")))
      .filter((id): id is string => Boolean(id));

    const decidedApprovalMap = new Map<string, Record<string, unknown>>();
    if (approvalIdsToCheck.length > 0) {
      const { data: apRows } = await supabase
        .from("ai_approvals")
        .select("id, status, action_summary, decision_note")
        .in("id", approvalIdsToCheck);
      for (const a of apRows || []) {
        decidedApprovalMap.set(String(a.id), a as Record<string, unknown>);
      }
    }

    for (const task of taskList) {
      const taskId = String(task.id);
      if (stillPendingTaskIds.has(taskId)) continue;

      const summary = String(task.output_summary || "");
      const refApprovalId = extractApprovalIdFromSummary(summary);
      if (refApprovalId && stillPendingIds.has(refApprovalId)) {
        continue;
      }

      const refApproval = refApprovalId ? decidedApprovalMap.get(refApprovalId) : undefined;
      const refStatus = refApproval ? String(refApproval.status || "") : "";

      // If referenced approval was decided, OR task has been orphaned from any pending approval, close it cleanly
      const ageMs = nowMs - new Date(String(task.created_at || nowIso)).getTime();
      const shouldClose =
        Boolean(refApproval && refStatus !== "pending") ||
        (!refApprovalId && !stillPendingTaskIds.has(taskId) && ageMs > 60 * 1000);

      if (!shouldClose) continue;

      const closedStatus = refStatus === "failed" ? "failed" : "closed";
      const resolutionText = refApproval
        ? `${String(refApproval.action_summary || task.title)} (${refStatus}${refApproval.decision_note ? `: ${String(refApproval.decision_note)}` : ""})`
        : `${String(task.title)} — no longer pending approval (resolved/superseded).`;

      await supabase
        .from("ai_tasks")
        .update({
          status: closedStatus,
          output_summary: resolutionText,
          deliverable: resolutionText,
          qa_status: closedStatus === "failed" ? "rework" : "approved",
          lessons: [resolutionText.slice(0, 140)],
          completed_at: nowIso,
        })
        .eq("id", taskId)
        .eq("status", "waiting_approval");

      await supabase.from("ai_task_events").insert({
        id: randomUUID(),
        task_id: taskId,
        agent_id: String(task.assigned_agent_id || "operations_manager"),
        event_type: "closed",
        message: resolutionText.slice(0, 260),
      });
    }
  } catch {
    // Best-effort reconciliation; never block overview rendering
  }
}
