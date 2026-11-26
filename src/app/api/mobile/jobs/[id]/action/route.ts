import { NextResponse } from "next/server";
import { captureActionError } from "@/lib/ai-workforce/incident-monitor";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import { validateJobTransition, type JobAction } from "@/lib/job-lifecycle";
import { deriveJobTripState } from "@/lib/live-location";
import {
  appendRequestHistoryEntry,
  updateServiceRequest,
  type RequestStatus,
} from "@/lib/marketplace";
import { reconcilePlumberSharing } from "@/lib/live-location-server";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";

const ALLOWED_ACTIONS = new Set([
  "accept",
  "start_trip",
  "arrived",
  "start_work",
  "complete_work",
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await resolvePortalActor("plumber");
    if (!actor || (actor.role !== "plumber" && actor.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (actor.role === "plumber" && !actor.isApproved) {
      return NextResponse.json(
        { error: "Only approved technicians can perform job actions." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await request.json();
    const action = typeof body?.action === "string" ? body.action.trim() : "";

    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const ctx = await verifyTicketAccess(actor, id);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceSupabase();
    const [{ data: reqRow }, { data: quoteRows }, { data: historyRows }] = await Promise.all([
      supabase
        .from("service_requests")
        .select("status")
        .eq("id", ctx.requestId)
        .maybeSingle(),
      supabase
        .from("quotations")
        .select("customer_approval_status")
        .eq("ticket_number", ctx.ticketNumber)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("request_history")
        .select("action, created_at")
        .eq("request_id", ctx.requestId)
        .order("created_at", { ascending: true }),
    ]);

    const currentStatus = String(reqRow?.status || "new");
    const hasAnyQuotation = (quoteRows || []).length > 0;
    const hasApprovedQuotation = (quoteRows || []).some(
      (q) => q.customer_approval_status === "approved"
    );
    const tripState = deriveJobTripState(
      (historyRows || []).map((h) => ({
        action: String(h.action || ""),
        created_at: String(h.created_at || ""),
      }))
    );

    const transition = validateJobTransition({
      action: action as JobAction,
      currentStatus,
      hasApprovedQuotation,
      hasAnyQuotation,
      tripStarted: tripState === "on_the_way" || tripState === "arrived",
    });

    if (!transition.allowed) {
      return NextResponse.json(
        { error: transition.error || "Invalid job state transition." },
        { status: 409 }
      );
    }

    if (transition.idempotent) {
      return NextResponse.json({
        success: true,
        idempotent: true,
        status: transition.nextStatus || currentStatus,
      });
    }

    let nextStatus: RequestStatus | undefined;
    let historyAction = action;
    let details = "";

    switch (action) {
      case "accept":
        nextStatus = "scheduled";
        historyAction = "assignment_accepted";
        details = `${actor.name} accepted the job assignment.`;
        break;
      case "start_trip":
        historyAction = "trip_started";
        details = `${actor.name} started the trip to the property.`;
        break;
      case "arrived":
        historyAction = "arrived";
        details = `${actor.name} arrived at the customer property.`;
        break;
      case "start_work":
        nextStatus = "in_progress";
        historyAction = "work_started";
        details = `${actor.name} started plumbing work.`;
        break;
      case "complete_work":
        nextStatus = "work_completed";
        historyAction = "work_completed";
        details = `${actor.name} marked plumbing work complete.`;
        break;
    }

    await appendRequestHistoryEntry(ctx.ticketNumber, {
      actor: actor.name,
      action: historyAction,
      details,
    });

    if (nextStatus) {
      await updateServiceRequest(ctx.ticketNumber, { status: nextStatus });
    }

    if (action === "arrived" || action === "complete_work") {
      await reconcilePlumberSharing(ctx.assignedPlumberId);
    }

    // Attach completion photos if supplied
    if (Array.isArray(body?.photos) && body.photos.length > 0) {
      const supabase = getServiceSupabase();
      const { data: existing } = await supabase
        .from("service_requests")
        .select("photos")
        .eq("id", ctx.requestId)
        .maybeSingle();
      const merged = [
        ...(Array.isArray(existing?.photos) ? existing.photos : []),
        ...body.photos.filter((p: unknown) => typeof p === "string"),
      ];
      await supabase
        .from("service_requests")
        .update({ photos: merged })
        .eq("id", ctx.requestId);
    }

    if (ctx.customerId) {
      const titleMap: Record<string, string> = {
        accept: "Technician Accepted Assignment",
        start_trip: "Technician Is on the Way",
        arrived: "Technician Has Arrived",
        start_work: "Work in Progress",
        complete_work: "Plumbing Work Completed",
      };
      await createNotification({
        recipientRole: "customer",
        recipientId: ctx.customerId,
        type: historyAction,
        title: titleMap[action] || "Request Updated",
        body: `${ctx.ticketNumber}: ${details}`,
        destination: `/track?ticket=${ctx.ticketNumber}`,
      });
    }

    return NextResponse.json({
      success: true,
      status: nextStatus,
      historyAction,
    });
  } catch (err) {
    void captureActionError("/api/mobile/jobs/[id]/action:POST", err, { area: "mobile" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
