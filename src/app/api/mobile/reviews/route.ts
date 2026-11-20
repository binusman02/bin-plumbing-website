import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("customer");
    if (!actor || actor.role !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
    const rating = Math.min(5, Math.max(1, Number(body?.rating) || 5));
    const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

    if (!ticketNumber) {
      return NextResponse.json(
        { error: "ticketNumber is required" },
        { status: 400 }
      );
    }

    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("reviews")
      .insert({
        ticket_number: ctx.ticketNumber,
        request_id: ctx.requestId,
        customer_id: actor.id,
        customer_name: actor.name,
        plumber_id: ctx.assignedPlumberId,
        rating,
        comment: comment || "Verified job completion review.",
        status: "approved",
        is_verified: true,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, review: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save review" },
      { status: 500 }
    );
  }
}
