"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, CreditCard, Loader2, Plus, ShieldCheck, X, XCircle } from "lucide-react";
import {
  recordPaymentReconciliationAction,
  verifyPaymentAction,
} from "@/app/actions/marketplace-actions";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  MarketplaceSettings,
  PaymentRecord,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

interface FinancialsManagerClientProps {
  quotations: StructuredQuotation[];
  payments: PaymentRecord[];
  requests: ServiceRequestRecord[];
  settings: MarketplaceSettings;
}

export default function FinancialsManagerClient({
  quotations,
  payments: initialPayments,
  requests,
  settings,
}: FinancialsManagerClientProps) {
  const [payments, setPayments] = useState<PaymentRecord[]>(initialPayments);
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [selectedTicket, setSelectedTicket] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [labourPortion, setLabourPortion] = useState("");
  const [materialsPortion, setMaterialsPortion] = useState("");
  const [otherCharges, setOtherCharges] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"bank_transfer" | "cash" | "pos">(
    "bank_transfer"
  );
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");

  const commissionRate = settings.commission_default_rate || 20;

  const labourNum = Number(labourPortion) || 0;
  const materialsNum = Number(materialsPortion) || 0;
  const otherNum = Number(otherCharges) || 0;
  const computedCommission = Math.round((labourNum * commissionRate) / 100);
  const totalNum = labourNum + materialsNum + otherNum;
  const plumberPayable = Math.max(0, totalNum - computedCommission);

  const stats = useMemo(() => {
    const verified = payments.filter((p) => p.verification_status === "verified");
    const pendingVerification = payments.filter((p) => p.verification_status === "pending");
    return {
      revenueCollected: verified.reduce((acc, p) => acc + (Number(p.total_payment) || 0), 0),
      companyCommission: verified.reduce(
        (acc, p) => acc + (Number(p.company_commission) || 0),
        0
      ),
      plumberPayouts: verified.reduce((acc, p) => acc + (Number(p.plumber_payable) || 0), 0),
      pendingCount: pendingVerification.length,
    };
  }, [payments]);

  const handleTicketSelect = (ticket: string) => {
    setSelectedTicket(ticket);
    const quote = quotations.find((q) => q.ticket_number === ticket);
    const req = requests.find((r) => r.ticket_number === ticket);
    if (req) {
      setCustomerName(req.customer_name || "Customer");
    }
    if (quote) {
      setLabourPortion(String(quote.labour_charge || 0));
      setMaterialsPortion(String(quote.materials_cost || 0));
    }
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || totalNum <= 0) {
      setFeedback({ type: "error", text: "Select a ticket and enter valid amounts." });
      return;
    }
    const req = requests.find((r) => r.ticket_number === selectedTicket);
    setFeedback(null);
    startTransition(async () => {
      const res = await recordPaymentReconciliationAction({
        requestId: req?.id || selectedTicket,
        ticketNumber: selectedTicket,
        customerName: customerName || "Customer",
        totalPayment: totalNum,
        labourPortion: labourNum,
        materialsPortion: materialsNum,
        companyCommission: computedCommission,
        plumberPayable,
        paymentMethod,
        transactionRef: transactionRef.trim() || undefined,
        notes: otherNum > 0 ? `Other charges: ${formatNGN(otherNum)}. ${notes}` : notes,
      });
      if (res.success && res.payment) {
        setPayments((prev) => [res.payment!, ...prev]);
        setShowModal(false);
        setSelectedTicket("");
        setCustomerName("");
        setLabourPortion("");
        setMaterialsPortion("");
        setOtherCharges("");
        setTransactionRef("");
        setNotes("");
        setFeedback({ type: "success", text: "Payment recorded and awaiting verification." });
      } else {
        setFeedback({ type: "error", text: res.error || "Could not record payment." });
      }
    });
  };

  const handleVerify = (paymentId: string, decision: "verified" | "rejected") => {
    setFeedback(null);
    startTransition(async () => {
      const res = await verifyPaymentAction(paymentId, decision);
      if (res.success) {
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId
              ? {
                  ...p,
                  verification_status: decision,
                  payment_status: decision === "verified" ? "confirmed" : "failed",
                  verified_at: new Date().toISOString(),
                }
              : p
          )
        );
        setFeedback({
          type: "success",
          text: decision === "verified" ? "Payment verified and confirmed." : "Payment rejected.",
        });
      } else {
        setFeedback({ type: "error", text: res.error || "Action failed." });
      }
    });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600">
          Commission Policy:{" "}
          <span className="font-bold text-[#0B1F3A]">{commissionRate}% on labour only</span> —
          materials excluded.
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] transition hover:bg-[#e5a700]"
        >
          <Plus className="h-4 w-4" />
          Record Payment
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Verified Revenue
          </p>
          <p className="mt-2 text-xl font-bold text-[#0B1F3A] sm:text-2xl">
            {formatNGN(stats.revenueCollected)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Company Commission
          </p>
          <p className="mt-2 text-xl font-bold text-[#0B1F3A] sm:text-2xl">
            {formatNGN(stats.companyCommission)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Plumber Payouts
          </p>
          <p className="mt-2 text-xl font-bold text-[#0B1F3A] sm:text-2xl">
            {formatNGN(stats.plumberPayouts)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pending Verification
          </p>
          <p className="mt-2 text-xl font-bold text-[#0B1F3A] sm:text-2xl">
            {stats.pendingCount}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Payments List */}
      {payments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No payments recorded yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Record a payment against a service ticket to track labour commission and payouts.
          </p>
        </div>
      ) : (
        <>
          {/* PC Table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ticket / Customer</th>
                  <th className="px-4 py-3">Commission Breakdown</th>
                  <th className="px-4 py-3">Method & Ref</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((pay) => {
                  const vStatus = pay.verification_status || "pending";
                  const badge = getStatusMeta(vStatus);
                  return (
                    <tr key={pay.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3.5">
                        <p className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {pay.ticket_number}
                        </p>
                        <p className="font-semibold text-slate-800">{pay.customer_name}</p>
                        <p className="text-xs font-bold text-[#0B1F3A]">
                          Total: {formatNGN(pay.total_payment)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <p>
                          Labour {formatNGN(pay.labour_portion)} × {commissionRate}% ={" "}
                          <span className="font-semibold text-[#0B1F3A]">
                            {formatNGN(pay.company_commission)}
                          </span>
                        </p>
                        <p>Materials {formatNGN(pay.materials_portion)} separate</p>
                        <p className="font-semibold text-emerald-700">
                          Plumber payout: {formatNGN(pay.plumber_payable)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        <p className="capitalize font-medium text-slate-800">
                          {pay.payment_method.replace(/_/g, " ")}
                        </p>
                        <p>{pay.transaction_ref || "No reference"}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                        {formatDateTime(pay.payment_date || pay.created_at)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {vStatus === "pending" ? (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleVerify(pay.id, "verified")}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              <ShieldCheck className="h-3.5 w-3.5" /> Verify
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleVerify(pay.id, "rejected")}
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {pay.verified_by ? `By ${pay.verified_by}` : "Recorded"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {payments.map((pay) => {
              const vStatus = pay.verification_status || "pending";
              const badge = getStatusMeta(vStatus);
              return (
                <div
                  key={pay.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {pay.ticket_number}
                      </span>
                      <p className="text-sm font-bold text-[#0B1F3A]">{pay.customer_name}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-bold text-[#0B1F3A]">
                    {formatNGN(pay.total_payment)}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Labour {formatNGN(pay.labour_portion)} × {commissionRate}% ={" "}
                    {formatNGN(pay.company_commission)} • Materials{" "}
                    {formatNGN(pay.materials_portion)} separate
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(pay.payment_date || pay.created_at)}
                  </p>
                  {vStatus === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVerify(pay.id, "verified")}
                        className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white"
                      >
                        Verify Payment
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVerify(pay.id, "rejected")}
                        className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Record Payment Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-[#0B1F3A]">Record Customer Payment</h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-[#0B1F3A]">
                  Service Ticket
                </label>
                <select
                  value={selectedTicket}
                  onChange={(e) => handleTicketSelect(e.target.value)}
                  required
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                >
                  <option value="">-- Select ticket --</option>
                  {requests.map((r) => (
                    <option key={r.id} value={r.ticket_number}>
                      {r.ticket_number} — {r.customer_name || r.property_type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Labour (₦)
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={labourPortion}
                    onChange={(e) => setLabourPortion(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Materials (₦)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={materialsPortion}
                    onChange={(e) => setMaterialsPortion(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Other Charges (₦)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={otherCharges}
                    onChange={(e) => setOtherCharges(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <p>
                  Labour {formatNGN(labourNum)} × {commissionRate}% ={" "}
                  <strong className="text-[#0B1F3A]">{formatNGN(computedCommission)}</strong>{" "}
                  commission; materials {formatNGN(materialsNum)} separate.
                </p>
                <p className="mt-1 font-bold text-[#0B1F3A]">
                  Total: {formatNGN(totalNum)} • Plumber payout: {formatNGN(plumberPayable)}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as "bank_transfer" | "cash" | "pos")
                    }
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="pos">POS</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Transaction Ref
                  </label>
                  <input
                    type="text"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    placeholder="Transfer / POS ref"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Save Payment Record</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
