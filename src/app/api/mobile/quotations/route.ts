import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import {
  setCustomerQuotationApproval,
  submitStructuredQuotation,
} from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("plumber");
    if (!actor || (actor.role !== "plumber" && actor.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
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

    const quotation = await submitStructuredQuotation({
      requestId: ctx.requestId,
      ticketNumber: ctx.ticketNumber,
      plumberId: actor.role === "plumber" ? actor.id : String(body?.plumberId || ""),
      plumberName: actor.name,
      labourCharge: Number(body?.labourCharge) || 0,
      materialsCost: Number(body?.materialsCost) || 0,
      transportCharge: Number(body?.transportCharge) || 0,
      otherCharges: Number(body?.otherCharges) || 0,
      notes: typeof body?.notes === "string" ? body.notes : undefined,
      actorRole: actor.role === "admin" ? "admin" : "plumber",
    });

    return NextResponse.json({ success: true, quotation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to submit quotation" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await resolvePortalActor("customer");
    if (!actor || (actor.role !== "customer" && actor.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const quotationId =
      typeof body?.quotationId === "string" ? body.quotationId.trim() : "";
    const decision =
      body?.decision === "approved" || body?.decision === "rejected"
        ? body.decision
        : null;

    if (!quotationId || !decision) {
      return NextResponse.json(
        { error: "quotationId and decision (approved|rejected) are required" },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const { data: q } = await supabase
      .from("quotations")
      .select("ticket_number")
      .eq("id", quotationId)
      .maybeSingle();
    if (!q) {
      return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
    }

    const ctx = await verifyTicketAccess(actor, String(q.ticket_number));
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await setCustomerQuotationApproval(
      quotationId,
      decision,
      actor.name,
      typeof body?.feedback === "string" ? body.feedback : undefined,
      actor.role === "admin" ? "admin" : "customer"
    );

    return NextResponse.json({ success: true, quotation: updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update quotation" },
      { status: 500 }
    );
  }
}
