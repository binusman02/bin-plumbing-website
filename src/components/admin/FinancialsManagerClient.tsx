"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CreditCard, Eye, ExternalLink, Loader2, Pencil, Plus, Save, Search, ShieldCheck, X, XCircle } from "lucide-react";
import {
  recordPaymentReconciliationAction,
  updatePaymentRecordAction,
  verifyPaymentAction,
} from "@/app/actions/marketplace-actions";
import { Avatar } from "@/components/ui/Avatar";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
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
  useEffect(() => {
    setPayments(initialPayments);
  }, [initialPayments]);
  const [showModal, setShowModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "verified" | "rejected">("all");
  const [search, setSearch] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);

  // Edit state inside Payment Detail Drawer
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editLabour, setEditLabour] = useState("");
  const [editMaterials, setEditMaterials] = useState("");
  const [editMethod, setEditMethod] = useState<"bank_transfer" | "cash" | "pos">("bank_transfer");
  const [editRef, setEditRef] = useState("");
  const [editStatus, setEditStatus] = useState<"pending" | "verified" | "rejected">("pending");
  const [editNotes, setEditNotes] = useState("");

  const openPaymentDetail = (pay: PaymentRecord) => {
    setSelectedPayment(pay);
    setEditCustomerName(pay.customer_name || "Customer");
    setEditLabour(String(pay.labour_portion || 0));
    setEditMaterials(String(pay.materials_portion || 0));
    setEditMethod(pay.payment_method || "bank_transfer");
    setEditRef(pay.transaction_ref || "");
    setEditStatus((pay.verification_status as "pending" | "verified" | "rejected") || "pending");
    setEditNotes(pay.notes || "");
    setFeedback(null);
  };

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

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      const vStatus = p.verification_status || "pending";
      if (statusFilter !== "all" && vStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        p.ticket_number.toLowerCase().includes(q) ||
        (p.customer_name || "").toLowerCase().includes(q) ||
        (p.transaction_ref || "").toLowerCase().includes(q) ||
        (p.payment_method || "").toLowerCase().includes(q)
      );
    });
  }, [payments, statusFilter, search]);

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
        const nowIso = new Date().toISOString();
        setPayments((prev) =>
          prev.map((p) =>
            p.id === paymentId
              ? {
                  ...p,
                  verification_status: decision,
                  payment_status: decision === "verified" ? "confirmed" : "failed",
                  verified_at: nowIso,
                }
              : p
          )
        );
        setSelectedPayment((prev) =>
          prev && prev.id === paymentId
            ? {
                ...prev,
                verification_status: decision,
                payment_status: decision === "verified" ? "confirmed" : "failed",
                verified_at: nowIso,
              }
            : prev
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
    <div className="space-y-3 pb-20 lg:pb-4">
      {/* Compact KPI Strip */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#0B1F3A] bg-white px-4 py-3 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Verified Revenue
          </p>
          <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:text-xl">
            {formatNGN(stats.revenueCollected)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#F5B301] bg-white px-4 py-3 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Company Commission ({commissionRate}%)
          </p>
          <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:text-xl">
            {formatNGN(stats.companyCommission)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#0B1F3A] bg-white px-4 py-3 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Plumber Payouts
          </p>
          <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:text-xl">
            {formatNGN(stats.plumberPayouts)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#F5B301] bg-white px-4 py-3 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pending Verification
          </p>
          <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:text-xl">
            {stats.pendingCount}
          </p>
        </div>
      </div>

      {/* Bigin-Style Single-Line Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Payments", count: payments.length },
            {
              id: "pending",
              label: "Pending Verification",
              count: payments.filter((p) => (p.verification_status || "pending") === "pending").length,
            },
            {
              id: "verified",
              label: "Verified",
              count: payments.filter((p) => p.verification_status === "verified").length,
            },
            {
              id: "rejected",
              label: "Rejected",
              count: payments.filter((p) => p.verification_status === "rejected").length,
            },
          ].map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                  active
                    ? "bg-[#0B1F3A] text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-[#F5B301] text-[#0B1F3A]" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket, customer, ref..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0B1F3A] px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#132c52]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5] text-[#F5B301]" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium ${
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
      {filteredPayments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-xs">
          <CreditCard className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No payments match this view</p>
          <p className="mt-1 text-xs text-slate-500">
            Commission policy: {commissionRate}% on labour only — materials excluded.
          </p>
        </div>
      ) : (
        <>
          {/* Bigin-Style Single-Line Table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                  <tr>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Ticket</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Contact Name</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Total Amount</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Labour</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Materials</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Commission ({commissionRate}%)</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Plumber Payout</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Method & Ref</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Status</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5">Date</th>
                    <th className="whitespace-nowrap px-3.5 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((pay) => {
                    const vStatus = pay.verification_status || "pending";
                    const badge = getStatusMeta(vStatus);
                    return (
                      <tr
                        key={pay.id}
                        onClick={() => openPaymentDetail(pay)}
                        className="group cursor-pointer transition-colors hover:bg-slate-50/90"
                      >
                        <td className="whitespace-nowrap px-3.5 py-2.5">
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-[#0B1F3A] group-hover:underline">
                            <span>{pay.ticket_number}</span>
                            <Eye className="h-3.5 w-3.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5">
                          <div className="inline-flex items-center gap-2">
                            <Avatar name={pay.customer_name || "Customer"} size="xs" />
                            <span className="font-medium text-slate-800">{pay.customer_name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 font-bold text-[#0B1F3A]">
                          {formatNGN(pay.total_payment)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                          {formatNGN(pay.labour_portion)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                          {formatNGN(pay.materials_portion)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-[#0B1F3A]">
                          {formatNGN(pay.company_commission)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-emerald-700">
                          {formatNGN(pay.plumber_payable)}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                          <span className="capitalize font-medium text-slate-800">
                            {pay.payment_method.replace(/_/g, " ")}
                          </span>
                          {pay.transaction_ref ? (
                            <span className="ml-1.5 text-slate-400">• {pay.transaction_ref}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-500">
                          {new Date(pay.payment_date || pay.created_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td
                          className="whitespace-nowrap px-3.5 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {vStatus === "pending" && (
                              <>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleVerify(pay.id, "verified")}
                                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#0B1F3A] px-2.5 text-[11px] font-semibold text-white hover:bg-[#132c52]"
                                >
                                  <ShieldCheck className="h-3 w-3 text-[#F5B301]" /> Verify
                                </button>
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => handleVerify(pay.id, "rejected")}
                                  className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                                >
                                  <XCircle className="h-3 w-3" /> Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => openPaymentDetail(pay)}
                              title="Edit payment record"
                              aria-label="Edit payment record"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-[#0B1F3A] transition-colors hover:border-[#0B1F3A]/40 hover:bg-slate-50"
                            >
                              <Pencil className="h-3.5 w-3.5 text-[#0B1F3A]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Summary Footer Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Total Records • <strong className="text-slate-900">{filteredPayments.length}</strong>
                </span>
                <span>
                  Commission Policy • <strong className="text-[#0B1F3A]">{commissionRate}% on labour only</strong>
                </span>
                <span>
                  Verified Revenue • <strong className="text-[#0B1F3A]">{formatNGN(stats.revenueCollected)}</strong>
                </span>
              </div>
              <span className="font-semibold text-slate-700">1 to {filteredPayments.length}</span>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {filteredPayments.map((pay) => {
              const vStatus = pay.verification_status || "pending";
              const badge = getStatusMeta(vStatus);
              return (
                <div
                  key={pay.id}
                  onClick={() => openPaymentDetail(pay)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#0B1F3A]/40"
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
                    <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleVerify(pay.id, "verified")}
                        className="flex-1 rounded-xl bg-[#0B1F3A] py-2.5 text-xs font-bold text-white"
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

      {/* Payment & Commission View / Edit Drawer (Opens when clicking any payment row/card) */}
      {selectedPayment && (() => {
        const badge = getStatusMeta(editStatus);
        const linkedRequest = requests.find((r) => r.ticket_number === selectedPayment.ticket_number);
        const linkedQuote = quotations.find((q) => q.ticket_number === selectedPayment.ticket_number);
        const editLabourNum = Math.max(0, Number(editLabour) || 0);
        const editMaterialsNum = Math.max(0, Number(editMaterials) || 0);
        const editCommissionNum = Math.round((editLabourNum * commissionRate) / 100);
        const editTotalNum = editLabourNum + editMaterialsNum;
        const editPlumberPayableNum = Math.max(0, editTotalNum - editCommissionNum);

        const handleSavePaymentChanges = (e: React.FormEvent) => {
          e.preventDefault();
          setFeedback(null);
          startTransition(async () => {
            const res = await updatePaymentRecordAction({
              paymentId: selectedPayment.id,
              customerName: editCustomerName,
              labourPortion: editLabourNum,
              materialsPortion: editMaterialsNum,
              companyCommission: editCommissionNum,
              plumberPayable: editPlumberPayableNum,
              totalPayment: editTotalNum,
              paymentMethod: editMethod,
              transactionRef: editRef,
              verificationStatus: editStatus,
              notes: editNotes,
            });
            if (res.success && res.payment) {
              setPayments((prev) =>
                prev.map((p) => (p.id === selectedPayment.id ? res.payment! : p))
              );
              setSelectedPayment(res.payment);
              setFeedback({ type: "success", text: "Payment record updated and saved." });
            } else {
              setFeedback({ type: "error", text: res.error || "Could not update payment." });
            }
          });
        };

        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
            <form
              onSubmit={handleSavePaymentChanges}
              className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B1F3A] px-4 py-3.5 text-white sm:px-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPayment(null)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 md:hidden"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#F5B301]">
                        {selectedPayment.ticket_number}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      View & Edit Payment / Commission Reconciliation
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPayment(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
                  aria-label="Close payment details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto p-5">
                {/* Live Computed Summary Hero Box */}
                <div className="rounded-xl border border-slate-200 border-t-[3px] border-t-[#F5B301] bg-slate-50/70 p-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Total Payment
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-[#0B1F3A] sm:text-xl">
                        {formatNGN(editTotalNum)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Commission ({commissionRate}%)
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-[#0B1F3A] sm:text-xl">
                        {formatNGN(editCommissionNum)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                        Plumber Payout
                      </p>
                      <p className="mt-1 text-lg font-extrabold text-emerald-700 sm:text-xl">
                        {formatNGN(editPlumberPayableNum)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Editable Payment & Commission Fields */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                    Edit Payment & Commission Details
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        required
                        value={editCustomerName}
                        onChange={(e) => setEditCustomerName(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Verification Status
                      </label>
                      <ClassicSelect
                        size="sm"
                        value={editStatus}
                        onChange={(val) =>
                          setEditStatus(val as "pending" | "verified" | "rejected")
                        }
                        options={[
                          { value: "pending", label: "Pending Verification" },
                          { value: "verified", label: "Verified & Confirmed" },
                          { value: "rejected", label: "Rejected" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Labour Portion (₦)
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={editLabour}
                        onChange={(e) => setEditLabour(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Materials Portion (₦ — 0% Commission)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={editMaterials}
                        onChange={(e) => setEditMaterials(e.target.value)}
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Payment Method
                      </label>
                      <ClassicSelect
                        size="sm"
                        value={editMethod}
                        onChange={(val) =>
                          setEditMethod(val as "bank_transfer" | "cash" | "pos")
                        }
                        options={[
                          { value: "bank_transfer", label: "Bank Transfer" },
                          { value: "pos", label: "POS" },
                          { value: "cash", label: "Cash" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Transaction Reference
                      </label>
                      <input
                        type="text"
                        value={editRef}
                        onChange={(e) => setEditRef(e.target.value)}
                        placeholder="Transfer / POS ref"
                        className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Reconciliation / Payment Notes
                    </label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add verification or reconciliation notes..."
                      className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Linked Service Request Context */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                      Linked Service Request
                    </h4>
                    <Link
                      href={`/admin/requests?ticket=${selectedPayment.ticket_number}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] hover:underline"
                    >
                      <span>Open Request</span>
                      <ExternalLink className="h-3 w-3 text-[#F5B301]" />
                    </Link>
                  </div>
                  <div className="space-y-2 text-xs text-slate-700">
                    {linkedRequest && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Service Category</span>
                          <span className="font-medium text-slate-800">
                            {linkedRequest.problem_category}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Location</span>
                          <span className="font-medium text-slate-800">
                            {linkedRequest.city_lga || linkedRequest.address_in_kano}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Assigned Technician</span>
                          <span className="font-medium text-slate-800">
                            {linkedRequest.assigned_technician || "Unassigned"}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Recorded Date</span>
                      <span className="font-medium text-slate-800">
                        {formatDateTime(selectedPayment.payment_date || selectedPayment.created_at)}
                      </span>
                    </div>
                    {selectedPayment.verified_at && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Verified At</span>
                        <span className="font-medium text-slate-800">
                          {formatDateTime(selectedPayment.verified_at)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {linkedQuote && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-700">
                    <p className="font-bold uppercase tracking-wider text-[#0B1F3A]">
                      Linked Quotation
                    </p>
                    <p className="mt-1">
                      Quoted Total: <strong>{formatNGN(linkedQuote.total_amount)}</strong> (Labour{" "}
                      {formatNGN(linkedQuote.labour_charge)} • Materials{" "}
                      {formatNGN(linkedQuote.materials_cost)})
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3.5">
                <button
                  type="button"
                  onClick={() => setSelectedPayment(null)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <div className="flex items-center gap-2">
                  {selectedPayment.verification_status === "pending" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleVerify(selectedPayment.id, "verified")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0B1F3A] bg-white px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-[#F5B301]" />
                      <span>Quick Verify</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 text-xs font-bold text-white hover:bg-[#132c52] disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5B301]" />
                    ) : (
                      <Save className="h-3.5 w-3.5 text-[#F5B301]" />
                    )}
                    <span>{isPending ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        );
      })()}

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
                <ClassicSelect
                  value={selectedTicket}
                  onChange={handleTicketSelect}
                  required
                  options={[
                    { value: "", label: "-- Select ticket --" },
                    ...requests.map((r) => ({
                      value: r.ticket_number,
                      label: `${r.ticket_number} — ${r.customer_name || r.property_type}`,
                    })),
                  ]}
                />
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
                  <ClassicSelect
                    value={paymentMethod}
                    onChange={(val) =>
                      setPaymentMethod(val as "bank_transfer" | "cash" | "pos")
                    }
                    options={[
                      { value: "bank_transfer", label: "Bank Transfer" },
                      { value: "pos", label: "POS" },
                      { value: "cash", label: "Cash" },
                    ]}
                  />
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
