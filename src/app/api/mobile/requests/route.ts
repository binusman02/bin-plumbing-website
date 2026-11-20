import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import {
  appendRequestHistoryEntry,
  createUniversalServiceRequest,
  updateServiceRequest,
} from "@/lib/marketplace";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("customer");
    if (!actor || actor.role !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const problemCategory =
      typeof body?.problemCategory === "string" && body.problemCategory.trim()
        ? body.problemCategory.trim()
        : "General Plumbing";
    const propertyType =
      typeof body?.propertyType === "string" && body.propertyType.trim()
        ? body.propertyType.trim()
        : "Residential";
    const priority = body?.priority === "urgent" ? "urgent" : "standard";
    const address =
      typeof body?.address === "string" ? body.address.trim() : "";
    const issueDescription =
      typeof body?.issueDescription === "string"
        ? body.issueDescription.trim()
        : "";
    const photos = Array.isArray(body?.photos)
      ? body.photos.filter((p: unknown) => typeof p === "string")
      : [];

    if (!address || !issueDescription) {
      return NextResponse.json(
        { error: "Address and issue description are required." },
        { status: 400 }
      );
    }

    const created = await createUniversalServiceRequest({
      customerId: actor.id,
      customerName: actor.name,
      customerPhone: actor.phone || "08000000000",
      customerEmail: actor.email,
      problemCategory,
      propertyType,
      priority,
      address,
      issueDescription,
      photos,
      createdByRole: "customer",
    });

    if (
      typeof body?.customerLat === "number" &&
      typeof body?.customerLng === "number"
    ) {
      const supabase = getServiceSupabase();
      await supabase
        .from("service_requests")
        .update({
          customer_lat: body.customerLat,
          customer_lng: body.customerLng,
          customer_location_source: "gps",
          customer_location_updated_at: new Date().toISOString(),
        })
        .eq("id", created.id);
    }

    return NextResponse.json({ success: true, request: created });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to submit plumbing request.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolvePortalActor("customer");
    if (!actor || actor.role !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
    const action = typeof body?.action === "string" ? body.action.trim() : "";

    if (!ticketNumber || action !== "cancel") {
      return NextResponse.json(
        { error: "ticketNumber and action=cancel are required." },
        { status: 400 }
      );
    }

    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("status")
      .eq("id", ctx.requestId)
      .maybeSingle();

    const currentStatus = String(reqRow?.status || "new");
    if (
      !["new", "pending", "contacted", "inspection_required"].includes(
        currentStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            "This request has already progressed and can only be cancelled by FlowGuard Support.",
        },
        { status: 400 }
      );
    }

    await updateServiceRequest(ctx.ticketNumber, { status: "cancelled" });
    await appendRequestHistoryEntry(ctx.ticketNumber, {
      actor: actor.name,
      action: "Request Cancelled",
      details: "Customer cancelled the service request via mobile app.",
    });

    await createNotification({
      recipientRole: "admin",
      recipientId: "admin",
      type: "request_cancelled",
      title: "Request Cancelled by Customer",
      body: `${actor.name} cancelled request ${ctx.ticketNumber}.`,
      destination: `/admin?ticket=${ctx.ticketNumber}`,
    });

    return NextResponse.json({ success: true, status: "cancelled" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to cancel request." },
      { status: 500 }
    );
  }
}
