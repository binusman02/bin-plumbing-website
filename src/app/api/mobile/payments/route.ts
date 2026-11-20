import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import { recordPayment } from "@/lib/marketplace";
import { createNotification } from "@/lib/notifications";
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
    const { data: quote } = await supabase
      .from("quotations")
      .select(
        "labour_charge, materials_cost, total_amount, company_commission, plumber_payable"
      )
      .eq("ticket_number", ctx.ticketNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const total = Number(body?.amount) || Number(quote?.total_amount) || 0;
    const labour = Number(quote?.labour_charge) || total;
    const materials = Number(quote?.materials_cost) || 0;
    const commission = Number(quote?.company_commission) || 0;
    const plumberPayable = Number(quote?.plumber_payable) || Math.max(0, total - commission);

    const payment = await recordPayment({
      requestId: ctx.requestId,
      ticketNumber: ctx.ticketNumber,
      customerName: actor.name,
      totalPayment: total,
      labourPortion: labour,
      materialsPortion: materials,
      companyCommission: commission,
      plumberPayable,
      paymentMethod: "bank_transfer",
      transactionRef:
        typeof body?.transactionRef === "string" ? body.transactionRef : undefined,
      proofStoragePath:
        typeof body?.proofUrl === "string" ? body.proofUrl : undefined,
      notes: typeof body?.notes === "string" ? body.notes : "Uploaded via mobile app",
    });

    await createNotification({
      recipientRole: "admin",
      recipientId: "admin",
      type: "payment_submitted",
      title: "Payment Proof Uploaded",
      body: `${actor.name} uploaded proof of payment for ${ctx.ticketNumber}.`,
      destination: `/admin?ticket=${ctx.ticketNumber}`,
    });

    return NextResponse.json({ success: true, payment });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to record payment" },
      { status: 500 }
    );
  }
}
