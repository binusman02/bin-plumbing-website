import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import {
  getMarketplaceSettings,
  recordPayment,
} from "@/lib/marketplace";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roleHint = url.searchParams.get("role") as
      | "customer"
      | "plumber"
      | "admin"
      | null;
    const actor = await resolvePortalActor(roleHint || undefined);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const settings = await getMarketplaceSettings();
    const bankDetails = {
      bankName: settings.bank_name || "",
      accountName: settings.bank_account_name || "",
      accountNumber: settings.bank_account_number || "",
    };

    if (actor.role === "customer") {
      const { data: reqs } = await supabase
        .from("service_requests")
        .select("ticket_number")
        .eq("customer_id", actor.id);
      const tickets = (reqs || []).map((r) => String(r.ticket_number));
      let payments: Record<string, unknown>[] = [];
      if (tickets.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("*")
          .in("ticket_number", tickets)
          .order("created_at", { ascending: false });
        payments = (payRows as Record<string, unknown>[]) || [];
      }
      return NextResponse.json({ bankDetails, payments });
    }

    if (actor.role === "plumber") {
      const { data: reqs } = await supabase
        .from("service_requests")
        .select("ticket_number, category_slug, status")
        .eq("assigned_plumber_id", actor.id);
      const tickets = (reqs || []).map((r) => String(r.ticket_number));
      let payments: Record<string, unknown>[] = [];
      if (tickets.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("*")
          .in("ticket_number", tickets)
          .order("created_at", { ascending: false });
        payments = (payRows as Record<string, unknown>[]) || [];
      }
      return NextResponse.json({ bankDetails, payments });
    }

    return NextResponse.json({ bankDetails, payments: [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load payments" },
      { status: 500 }
    );
  }
}

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
    const plumberPayable =
      Number(quote?.plumber_payable) || Math.max(0, total - commission);

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
        typeof body?.transactionRef === "string"
          ? body.transactionRef
          : undefined,
      proofStoragePath:
        typeof body?.proofUrl === "string" ? body.proofUrl : undefined,
      notes:
        typeof body?.notes === "string"
          ? body.notes
          : "Uploaded via FlowGuard Mobile App",
    });

    await supabase
      .from("payments")
      .update({ customer_id: actor.id })
      .eq("id", payment.id);

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
