import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}
