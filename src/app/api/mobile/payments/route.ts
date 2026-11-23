import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { verifyTicketAccess } from "@/lib/chat-auth";
import {
  computeAuthorizedPaymentAmount,
  isValidInternalProofPath,
} from "@/lib/payment-integrity";
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
    const [{ data: quote }, { data: existingPays }] = await Promise.all([
      supabase
        .from("quotations")
        .select(
          "labour_charge, materials_cost, total_amount, company_commission, plumber_payable, customer_approval_status"
        )
        .eq("ticket_number", ctx.ticketNumber)
        .eq("customer_approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("id, total_payment, verification_status, transaction_ref")
        .eq("ticket_number", ctx.ticketNumber),
    ]);

    if (!quote) {
      return NextResponse.json(
        { error: "Quotation must be approved by the customer before submitting payment." },
        { status: 400 }
      );
    }

    const existingList = existingPays || [];
    if (existingList.some((p) => p.verification_status === "pending")) {
      return NextResponse.json(
        { error: "A payment submission is already pending verification for this ticket." },
        { status: 409 }
      );
    }

    const txRef =
      typeof body?.transactionRef === "string" ? body.transactionRef.trim() : "";
    if (txRef.length > 0) {
      if (txRef.length < 4 || txRef.length > 80) {
        return NextResponse.json(
          { error: "Transaction reference must be between 4 and 80 characters." },
          { status: 400 }
        );
      }
      const { data: dupRef } = await supabase
        .from("payments")
        .select("id")
        .eq("transaction_ref", txRef)
        .neq("verification_status", "rejected")
        .limit(1)
        .maybeSingle();
      if (dupRef) {
        return NextResponse.json(
          { error: "This transaction reference has already been submitted." },
          { status: 409 }
        );
      }
    }

    const rawProofUrl = typeof body?.proofUrl === "string" ? body.proofUrl.trim() : "";
    if (rawProofUrl && !isValidInternalProofPath(rawProofUrl)) {
      return NextResponse.json(
        { error: "Invalid payment proof path. Please upload the receipt through FlowGuard." },
        { status: 400 }
      );
    }

    const alreadyVerifiedTotal = existingList
      .filter((p) => p.verification_status === "verified")
      .reduce((acc, p) => acc + (Number(p.total_payment) || 0), 0);

    const quoteTotal = Number(quote.total_amount) || 0;
    const amountCheck = computeAuthorizedPaymentAmount({
      approvedQuoteTotal: quoteTotal,
      alreadyPaidTotal: alreadyVerifiedTotal,
      requestedAmount: body?.amount,
    });
    if (!amountCheck.ok) {
      return NextResponse.json({ error: amountCheck.error }, { status: 400 });
    }

    const total = amountCheck.amount;
    const ratio = quoteTotal > 0 ? total / quoteTotal : 1;
    const labour = Math.round((Number(quote.labour_charge) || 0) * ratio * 100) / 100;
    const materials = Math.round((Number(quote.materials_cost) || 0) * ratio * 100) / 100;
    const commission = Math.round((Number(quote.company_commission) || 0) * ratio * 100) / 100;
    const plumberPayable = Math.max(0, Math.round((total - commission) * 100) / 100);

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
      transactionRef: txRef || undefined,
      proofStoragePath: rawProofUrl || undefined,
      notes:
        typeof body?.notes === "string"
          ? body.notes.slice(0, 500)
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
