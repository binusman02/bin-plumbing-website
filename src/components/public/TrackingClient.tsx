"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  Send,
  Loader2,
  FileText,
  MessageSquare,
  ThumbsUp,
  XCircle,
  ArrowRight,
} from "lucide-react";
import {
  getTrackingDataAction,
  customerQuotationDecisionAction,
  postCommunicationMessageAction,
} from "@/app/actions/marketplace-actions";
import { formatNGN, formatDateTime } from "@/lib/currency";
import type {
  ServiceRequestRecord,
  StructuredQuotation,
  JobMessage,
} from "@/lib/marketplace";

export default function TrackingClient() {
  const searchParams = useSearchParams();
  const initialTicket = searchParams.get("ticket") || "";
  const initialPhone = searchParams.get("phone") || "";

  const [ticketInput, setTicketInput] = useState(initialTicket);
  const [phoneInput, setPhoneInput] = useState(initialPhone);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [request, setRequest] = useState<ServiceRequestRecord | null>(null);
  const [quotations, setQuotations] = useState<StructuredQuotation[]>([]);
  const [messages, setMessages] = useState<JobMessage[]>([]);

  // Messaging state
  const [newMessage, setNewMessage] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [approvingQuoteId, setApprovingQuoteId] = useState<string | null>(null);

  const fetchTracking = async (tNum: string, pNum?: string) => {
    if (!tNum.trim() || !pNum?.trim()) {
      setError("Please enter both your Reference Number and Phone Number.");
      setRequest(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getTrackingDataAction(tNum.trim(), pNum.trim());
      if (res.success && res.request) {
        setRequest(res.request);
        setQuotations(res.quotations || []);
        setMessages(res.messages || []);
      } else {
        setError(res.error || "No matching service request found.");
        setRequest(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to query tracking data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTicket && initialPhone) {
      fetchTracking(initialTicket, initialPhone);
    }
  }, [initialTicket, initialPhone]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTracking(ticketInput, phoneInput);
  };

  const handleQuoteDecision = async (quoteId: string, decision: "approved" | "rejected") => {
    if (!request) return;
    setApprovingQuoteId(quoteId);
    try {
      const res = await customerQuotationDecisionAction(quoteId, request.ticket_number, decision);
      if (res.success) {
        // Refresh tracking data
        await fetchTracking(request.ticket_number, phoneInput);
      } else {
        alert(res.error || "Failed to update quotation decision.");
      }
    } catch (err: any) {
      alert(err.message || "Error submitting decision.");
    } finally {
      setApprovingQuoteId(null);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !request) return;

    setSendingMsg(true);
    try {
      const res = await postCommunicationMessageAction({
        requestId: request.ticket_number,
        ticketNumber: request.ticket_number,
        senderRole: "customer",
        senderName: request.customer_name || "Client",
        recipientRole: "plumber",
        message: newMessage.trim(),
      });
      if (res.success) {
        setNewMessage("");
        await fetchTracking(request.ticket_number, phoneInput);
      } else {
        alert(res.error || "Failed to post message.");
      }
    } catch (err: any) {
      alert(err.message || "Error sending message.");
    } finally {
      setSendingMsg(false);
    }
  };

  const getStatusStepIndex = (status: string) => {
    switch (status) {
      case "new":
        return 0;
      case "contacted":
      case "scheduled":
      case "inspection_required":
        return 1;
      case "quotation_submitted":
        return 2;
      case "approved":
      case "in_progress":
        return 3;
      case "work_completed":
      case "awaiting_final_payment":
      case "completed":
        return 4;
      default:
        return 0;
    }
  };

  const statusSteps = [
    "Request Received",
    "Admin Review & Assigned",
    "Quotation Submitted",
    "Approved & In Progress",
    "Work Completed",
  ];

  return (
    <div className="space-y-8">
      {/* 1. SEARCH BAR */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-[#E3E8EF] bg-white p-6 shadow-[0_8px_24px_rgba(11,31,58,0.06)] flex flex-col sm:flex-row gap-4 items-stretch sm:items-end"
      >
        <div className="flex-1 w-full">
          <label htmlFor="track-ref" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Reference Number <span className="text-red-600">*</span>
          </label>
          <input
            id="track-ref"
            type="text"
            required
            placeholder="e.g. BP-202611-1234"
            value={ticketInput}
            onChange={(e) => setTicketInput(e.target.value)}
            className="h-12 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-base font-mono text-[#1B2430] placeholder:text-[#5B6675]/70 focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
          />
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="track-phone" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Phone Number <span className="text-red-600">*</span>
          </label>
          <input
            id="track-phone"
            type="tel"
            required
            placeholder="Phone used on request"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            className="h-12 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-base text-[#1B2430] placeholder:text-[#5B6675]/70 focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-12 w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#F5B301] hover:bg-[#E0A200] text-[#0B1F3A] font-semibold px-7 text-base transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          <span>Track</span>
        </button>
      </form>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Notice</p>
            <p className="mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* EMPTY STATE EXPLANATION */}
      {!request && !loading && (
        <div className="rounded-xl border border-[#E3E8EF] bg-white p-6 sm:p-8">
          <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
            What You Can See Here
          </h2>
          <p className="mt-2 text-base text-[#5B6675]">
            Once verified with your Reference Number and Phone Number, your tracking page displays:
          </p>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="rounded-xl bg-[#F4F6F9] p-5">
              <p className="font-heading text-base font-bold text-[#0B1F3A]">1. Request Status</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5B6675]">
                See whether your request is under review, scheduled for inspection, in progress, or completed.
              </p>
            </div>
            <div className="rounded-xl bg-[#F4F6F9] p-5">
              <p className="font-heading text-base font-bold text-[#0B1F3A]">2. Itemized Quotations</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5B6675]">
                Review labour and materials costs submitted after inspection and approve or decline before work starts.
              </p>
            </div>
            <div className="rounded-xl bg-[#F4F6F9] p-5">
              <p className="font-heading text-base font-bold text-[#0B1F3A]">3. Plumber & Messages</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[#5B6675]">
                View your assigned technician details and exchange updates directly on your ticket.
              </p>
            </div>
          </div>
          <div className="mt-6 flex flex-col items-start justify-between gap-4 border-t border-[#E3E8EF] pt-5 sm:flex-row sm:items-center">
            <p className="text-sm text-[#5B6675]">
              Do not have a reference number yet?
            </p>
            <Link
              href="/request"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
            >
              Request a Plumber
              <ArrowRight className="h-4 w-4 text-[#F5B301]" />
            </Link>
          </div>
        </div>
      )}

      {/* 2. TRACKING DETAILS */}
      {request && (() => {
        const pendingQuote = quotations.find((q) => q.customer_approval_status === "pending");
        const latestApprovedQuote = quotations.find((q) => q.customer_approval_status === "approved");

        // Effective display status: if quotation is pending approval, ensure step 2 is active even if status field lagged
        const effectiveStatus = (pendingQuote && (request.status === "new" || request.status === "contacted" || request.status === "inspection_required"))
          ? "quotation_submitted"
          : request.status;

        return (
          <div className="space-y-6 animate-in fade-in-50 duration-300">
            {/* -------------------------------------------------------------- */}
            {/* ACTION REQUIRED BANNER: QUOTATION SUBMITTED FOR APPROVAL       */}
            {/* -------------------------------------------------------------- */}
            {pendingQuote && (
              <div className="bg-gradient-to-r from-amber-500/15 via-[#F5B301]/25 to-amber-500/10 border-2 border-[#F5B301] rounded-2xl p-5 sm:p-7 shadow-lg space-y-4 ring-2 ring-[#F5B301]/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-[#F5B301] text-[#0B1F3A] flex items-center justify-center shrink-0 shadow-sm">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#F5B301] text-[#0B1F3A] text-[10px] font-black uppercase tracking-wider">
                          Action Required
                        </span>
                        <span className="text-xs text-slate-500 font-semibold">
                          Revision #{pendingQuote.revision_number}
                        </span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-[#0B1F3A] mt-1">
                        Quotation Submitted for Your Approval
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Submitted by technician <strong>{pendingQuote.plumber_name}</strong>. Please review and approve to authorise work.
                      </p>
                    </div>
                  </div>

                  <div className="text-left sm:text-right bg-white/90 sm:bg-transparent p-3 sm:p-0 rounded-xl border border-amber-200 sm:border-0 shadow-2xs sm:shadow-none">
                    <span className="text-xs text-slate-500 font-bold block uppercase tracking-wider">
                      Total Estimated Amount
                    </span>
                    <span className="text-2xl sm:text-3xl font-black text-[#0B1F3A]">
                      {formatNGN(pendingQuote.total_amount)}
                    </span>
                  </div>
                </div>

                {/* Breakdown Preview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-white/95 rounded-xl p-3.5 border border-amber-200 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Labour / Service:</span>
                    <span className="font-bold text-slate-900">{formatNGN(pendingQuote.labour_charge)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Materials Cost:</span>
                    <span className="font-bold text-slate-900">{formatNGN(pendingQuote.materials_cost)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Transportation:</span>
                    <span className="font-bold text-slate-900">{formatNGN(pendingQuote.transport_charge)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Other Charges:</span>
                    <span className="font-bold text-slate-900">{formatNGN(pendingQuote.other_charges)}</span>
                  </div>
                </div>

                {pendingQuote.notes && (
                  <p className="text-xs text-slate-700 italic bg-white/70 p-2.5 rounded-lg border border-amber-200/80">
                    <strong>Technician Scope Note:</strong> {pendingQuote.notes}
                  </p>
                )}

                {/* Direct Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                  <button
                    type="button"
                    disabled={approvingQuoteId === pendingQuote.id}
                    onClick={() => handleQuoteDecision(pendingQuote.id, "approved")}
                    className="bg-[#F5B301] hover:bg-[#E0A200] text-[#0B1F3A] font-black text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-xs transition-transform active:scale-95 flex items-center gap-2"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>
                      {approvingQuoteId === pendingQuote.id
                        ? "Approving..."
                        : `Approve Quotation (${formatNGN(pendingQuote.total_amount)})`}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={approvingQuoteId === pendingQuote.id}
                    onClick={() => handleQuoteDecision(pendingQuote.id, "rejected")}
                    className="border border-slate-300 hover:bg-white text-slate-700 font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span>Request Revision</span>
                  </button>
                </div>
              </div>
            )}

            {/* APPROVED QUOTATION CONFIRMATION BANNER */}
            {!pendingQuote && latestApprovedQuote && (
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 text-emerald-900 shadow-xs">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div>
                    <h4 className="font-bold text-sm">
                      Quotation Approved ({formatNGN(latestApprovedQuote.total_amount)})
                    </h4>
                    <p className="text-xs text-emerald-700">
                      Approved on {formatDateTime(latestApprovedQuote.customer_approved_at)}. Work is officially authorised.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Top Status Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                    Ticket Reference
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-mono font-extrabold text-[#0B1F3A]">
                    {request.ticket_number}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Priority:</span>
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase ${
                      request.priority === "urgent"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {request.priority}
                  </span>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 uppercase">
                    {effectiveStatus.replace(/_/g, " ")}
                  </span>
                </div>
              </div>

              {/* Visual Step Timeline */}
              <div className="py-2">
                <div className="grid grid-cols-5 gap-2 text-center">
                  {statusSteps.map((step, idx) => {
                    const currentIdx = getStatusStepIndex(effectiveStatus);
                    const isDone = idx <= currentIdx;
                    const isCurrent = idx === currentIdx;

                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            isDone
                              ? "bg-[#0B1F3A] text-[#F5B301]"
                              : "bg-slate-200 text-slate-500"
                          } ${isCurrent ? "ring-4 ring-[#F5B301]/30" : ""}`}
                        >
                          {isDone ? "✓" : idx + 1}
                        </div>
                        <span
                          className={`text-[10px] sm:text-xs mt-2 font-medium leading-tight ${
                            isDone ? "text-[#0B1F3A] font-bold" : "text-slate-400"
                          }`}
                        >
                          {step}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Job Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs sm:text-sm">
              <div>
                <span className="text-slate-400 block">Service Category</span>
                <span className="font-semibold text-slate-800">{request.property_type || "Plumbing Service"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Location / Address</span>
                <span className="font-semibold text-slate-800">{request.address_in_kano}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Preferred Timing</span>
                <span className="font-semibold text-slate-800">{request.preferred_timing}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Assigned Technician</span>
                <span className="font-semibold text-[#0B1F3A]">
                  {request.assigned_technician ? request.assigned_technician : "Awaiting Assignment"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Request Date</span>
                <span className="font-semibold text-slate-800">{formatDateTime(request.created_at)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Coordination Status</span>
                <span className="font-semibold text-emerald-600">Active in System</span>
              </div>
            </div>
          </div>

          {/* 3. STRUCTURED QUOTATIONS SECTION */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-[#0B1F3A] flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#F5B301]" />
                  <span>Itemised Quotations</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Labour charges and materials costs are strictly itemised for complete transparency.
                </p>
              </div>
            </div>

            {quotations.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500 text-xs sm:text-sm">
                <Clock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No quotation submitted yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Once your assigned technician completes the site inspection, an itemised quotation will appear here for your review and approval.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {quotations.map((q) => (
                  <div
                    key={q.id}
                    className="border-2 border-slate-200 rounded-xl p-5 sm:p-6 bg-slate-50/50 space-y-4 hover:border-[#F5B301] transition-all"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-xs text-slate-500">Submitted by:</span>
                        <p className="font-bold text-sm text-[#0B1F3A]">{q.plumber_name}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-slate-500">Revision #{q.revision_number} • Date:</span>
                        <p className="text-xs font-medium text-slate-700">{formatDateTime(q.created_at)}</p>
                      </div>
                    </div>

                    {/* Breakdown Table */}
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">Labour / Service Charge:</span>
                        <span className="font-bold text-slate-900">{formatNGN(q.labour_charge)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">Estimated Materials Cost:</span>
                        <span className="font-bold text-slate-900">{formatNGN(q.materials_cost)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200/60">
                        <span className="text-slate-600">Transportation / Call-Out:</span>
                        <span className="font-bold text-slate-900">{formatNGN(q.transport_charge)}</span>
                      </div>
                      {q.other_charges > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-600">Other Approved Charges:</span>
                          <span className="font-bold text-slate-900">{formatNGN(q.other_charges)}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2 text-sm sm:text-base font-extrabold text-[#0B1F3A] bg-white p-3 rounded-lg border border-slate-200">
                        <span>Total Customer Estimated Cost:</span>
                        <span>{formatNGN(q.total_amount)}</span>
                      </div>
                    </div>

                    {q.notes && (
                      <div className="bg-amber-50/60 p-3 rounded text-xs text-amber-900 border border-amber-200">
                        <strong>Technician Note:</strong> {q.notes}
                      </div>
                    )}

                    {/* Approval Actions */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                      <div>
                        {q.customer_approval_status === "approved" ? (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-3 py-1.5 rounded-full">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Quotation Approved by You on {formatDateTime(q.customer_approved_at)}</span>
                          </div>
                        ) : q.customer_approval_status === "rejected" ? (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 px-3 py-1.5 rounded-full">
                            <XCircle className="w-4 h-4" />
                            <span>Quotation Declined / Revision Requested</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 px-3 py-1.5 rounded-full">
                            <Clock className="w-4 h-4" />
                            <span>Pending Your Approval</span>
                          </div>
                        )}
                      </div>

                      {q.customer_approval_status === "pending" && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={approvingQuoteId === q.id}
                            onClick={() => handleQuoteDecision(q.id, "approved")}
                            className="inline-flex items-center gap-1.5 bg-[#F5B301] hover:bg-[#E0A200] text-[#0B1F3A] font-bold text-xs sm:text-sm px-5 py-2.5 rounded-lg shadow-xs transition-colors disabled:opacity-50"
                          >
                            <ThumbsUp className="w-4 h-4" />
                            <span>Approve Quotation</span>
                          </button>
                          <button
                            type="button"
                            disabled={approvingQuoteId === q.id}
                            onClick={() => handleQuoteDecision(q.id, "rejected")}
                            className="inline-flex items-center gap-1.5 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4 text-red-500" />
                            <span>Request Revision</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. IN-PLATFORM MESSAGING & AUDIT LOG */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-4">
            <h3 className="text-lg font-bold text-[#0B1F3A] flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#0B1F3A]" />
              <span>Job Communication & Audit Record</span>
            </h3>
            <p className="text-xs text-slate-500">
              Messages exchanged here are logged in the project audit record for accountability.
            </p>

            {/* Messages Stream (Filtered: Client NEVER sees internal admin ↔ plumber notes) */}
            {(() => {
              const customerVisibleMessages = messages.filter((m) => {
                if (m.is_internal) return false;
                if (m.sender_role === "admin" && m.recipient_role === "plumber") return false;
                if (m.sender_role === "plumber" && m.recipient_role === "admin") return false;
                return m.sender_role === "customer" || m.recipient_role === "customer";
              });

              return (
                <div className="max-h-80 overflow-y-auto space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  {customerVisibleMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">
                      No conversation logs yet. You can send questions or details to your technician below.
                    </p>
                  ) : (
                    customerVisibleMessages.map((m) => {
                      const isCustomer = m.sender_role === "customer";
                      return (
                        <div
                          key={m.id}
                          className={`p-3 rounded-xl text-xs sm:text-sm max-w-[85%] ${
                            isCustomer
                              ? "ml-auto bg-[#0B1F3A] text-white"
                              : "mr-auto bg-white border border-slate-200 text-slate-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 mb-1 text-[11px] opacity-80">
                            <span className="font-bold">
                              {m.sender_name} ({m.sender_role.toUpperCase()})
                            </span>
                            <span>{formatDateTime(m.created_at)}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })()}

            {/* New Message Input */}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                required
                placeholder="Type a message or instruction regarding this job..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                className="flex-1 text-sm px-4 py-2.5 rounded-lg border border-slate-300 focus:border-[#F5B301] focus:ring-1 focus:ring-[#F5B301]"
              />
              <button
                type="submit"
                disabled={sendingMsg}
                className="bg-[#0B1F3A] hover:bg-[#07152B] text-white px-5 py-2.5 rounded-lg text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
