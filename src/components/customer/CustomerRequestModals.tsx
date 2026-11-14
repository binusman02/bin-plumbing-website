"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCircle2, Landmark, Loader2, RefreshCw, Star, Upload, X } from "lucide-react";
import { uploadChatFile } from "@/components/chat/ChatAttachment";
import { Badge, Stepper } from "@/components/ui";
import { formatNGN } from "@/lib/currency";
import type {
  PaymentRecord,
  RequestStatus,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

const REQUEST_STEPS = [
  { id: "new", label: "Submitted" },
  { id: "scheduled", label: "Assigned" },
  { id: "approved", label: "Approved" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

function getCustomerStepIndex(status: RequestStatus): number {
  if (status === "completed" || status === "work_completed" || status === "awaiting_final_payment") return 4;
  if (status === "in_progress") return 3;
  if (status === "approved") return 2;
  if (status === "contacted" || status === "scheduled" || status === "inspection_required" || status === "quotation_submitted" || status === "awaiting_approval") return 1;
  return 0;
}

export interface BankDetailsInfo {
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
}

interface CustomerRequestDrawerProps {
  selectedRequest: ServiceRequestRecord | null;
  quotations: StructuredQuotation[];
  payments?: PaymentRecord[];
  bankDetails?: BankDetailsInfo;
  isPending: boolean;
  onClose: () => void;
  onQuoteDecision: (quote: StructuredQuotation, decision: "approved" | "rejected") => void;
  onRequestAgain?: (req: ServiceRequestRecord) => void;
  onLeaveReview?: (req: ServiceRequestRecord) => void;
  onUploadPaymentProof?: (ticketNumber: string, fileName: string, url: string) => Promise<void>;
}

export function CustomerRequestDrawer({
  selectedRequest,
  quotations,
  payments = [],
  bankDetails,
  isPending,
  onClose,
  onQuoteDecision,
  onRequestAgain,
  onLeaveReview,
  onUploadPaymentProof,
}: CustomerRequestDrawerProps) {
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [proofMessage, setProofMessage] = useState<string | null>(null);

  if (!selectedRequest) return null;

  const reqQuotes = quotations.filter((q) => q.ticket_number === selectedRequest.ticket_number);
  const reqPayments = payments.filter((p) => p.ticket_number === selectedRequest.ticket_number);
  const hasConfirmedPayment = reqPayments.some((p) => p.verification_status === "verified");
  const hasApprovedQuote = reqQuotes.some((q) => q.customer_approval_status === "approved");

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProofUploading(true);
    setProofMessage(null);
    try {
      const attachment = await uploadChatFile(file);
      if (onUploadPaymentProof) {
        await onUploadPaymentProof(selectedRequest.ticket_number, file.name, attachment.url);
      }
      setProofMessage("Payment proof uploaded. Status will show Confirmed once verified by Admin.");
    } catch (err) {
      setProofMessage(err instanceof Error ? err.message : "Failed to upload payment proof.");
    } finally {
      setProofUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                {selectedRequest.ticket_number}
              </span>
              <h3 className="text-base font-bold text-[#0B1F3A]">
                {selectedRequest.problem_category || selectedRequest.property_type}
              </h3>
            </div>
          </div>
          <Badge status={selectedRequest.status} />
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <Stepper
              steps={REQUEST_STEPS}
              currentIndex={getCustomerStepIndex(selectedRequest.status)}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-[#0B1F3A]">
              Assigned Plumber: {selectedRequest.assigned_technician || "Pending assignment"}
            </p>
            <p className="mt-1 text-slate-700">{selectedRequest.address_in_kano}</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">
              {selectedRequest.issue_description}
            </p>
          </div>

          {reqQuotes.map((q) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0B1F3A]">
                  Quotation: {formatNGN(q.total_amount)}
                </span>
                <Badge status={q.customer_approval_status} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-slate-600">
                <span>Labour: {formatNGN(q.labour_charge)}</span>
                <span>Materials: {formatNGN(q.materials_cost)}</span>
                <span>Transport: {formatNGN(q.transport_charge || 0)}</span>
                <span>Other: {formatNGN(q.other_charges || 0)}</span>
              </div>
              {q.notes && <p className="mt-2 text-xs text-slate-600">{q.notes}</p>}
              {q.customer_approval_status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onQuoteDecision(q, "approved")}
                    className="h-11 flex-1 rounded-xl bg-emerald-600 text-xs font-bold text-white"
                  >
                    Approve Quote
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onQuoteDecision(q, "rejected")}
                    className="h-11 flex-1 rounded-xl border border-red-200 text-xs font-bold text-red-700"
                  >
                    Ask for Changes
                  </button>
                </div>
              )}
            </div>
          ))}

          {(hasApprovedQuote || reqPayments.length > 0) && (
            <div className="rounded-xl border border-slate-200 bg-[#F4F6F9] p-4 text-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-bold text-[#0B1F3A]">
                  <Landmark className="h-4 w-4 text-[#F5B301]" />
                  Payment Instructions
                </span>
                {hasConfirmedPayment ? (
                  <Badge status="confirmed" label="Confirmed" />
                ) : (
                  <Badge status="pending" label="Awaiting Verification" />
                )}
              </div>

              {bankDetails?.bankAccountNumber ? (
                <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1 text-slate-700">
                  <p>
                    <span className="font-semibold">Bank:</span> {bankDetails.bankName || "Configured Bank"}
                  </p>
                  <p>
                    <span className="font-semibold">Account Name:</span>{" "}
                    {bankDetails.bankAccountName || "Bin Plumbing Services Ltd"}
                  </p>
                  <p>
                    <span className="font-semibold">Account Number:</span>{" "}
                    <span className="font-mono font-bold text-[#0B1F3A]">
                      {bankDetails.bankAccountNumber}
                    </span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Use ticket <span className="font-mono font-semibold">{selectedRequest.ticket_number}</span> as transfer narration.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Request company bank details in chat before transferring, then upload your receipt below.
                </p>
              )}

              {!hasConfirmedPayment && (
                <div>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleProofUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={proofUploading}
                    onClick={() => proofInputRef.current?.click()}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    {proofUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload Payment Proof
                  </button>
                  {proofMessage && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      {proofMessage}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {selectedRequest.status === "completed" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <p className="text-sm font-bold text-emerald-900">Job Completed</p>
              <p className="text-xs text-emerald-800">
                Thank you for choosing Bin Plumbing Services Ltd. Share your review or book another service anytime.
              </p>
              <div className="flex flex-wrap gap-2">
                {onLeaveReview && (
                  <button
                    type="button"
                    onClick={() => onLeaveReview(selectedRequest)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#0B1F3A] px-3 text-xs font-bold text-white"
                  >
                    <Star className="h-3.5 w-3.5 text-[#F5B301]" /> Leave a Review
                  </button>
                )}
                {onRequestAgain && (
                  <button
                    type="button"
                    onClick={() => onRequestAgain(selectedRequest)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F5B301] px-3 text-xs font-bold text-[#07152B]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Request Again
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CustomerNewRequestModalProps {
  open: boolean;
  newCategory: string;
  setNewCategory: (v: string) => void;
  newPriority: "standard" | "urgent";
  setNewPriority: (v: "standard" | "urgent") => void;
  newAddress: string;
  setNewAddress: (v: string) => void;
  newDescription: string;
  setNewDescription: (v: string) => void;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function CustomerNewRequestModal({
  open,
  newCategory,
  setNewCategory,
  newPriority,
  setNewPriority,
  newAddress,
  setNewAddress,
  newDescription,
  setNewDescription,
  isPending,
  onClose,
  onSubmit,
}: CustomerNewRequestModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-lg font-bold text-[#0B1F3A]">New Plumbing Request</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Service Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="Pipework & Leaks">Pipework & Leaks</option>
                <option value="Water Tanks & Pumps">Water Tanks & Pumps</option>
                <option value="Bathroom & Kitchen">Bathroom & Kitchen</option>
                <option value="Drainage & Blockages">Drainage & Blockages</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Priority
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as "standard" | "urgent")}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="standard">Standard</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Property Address / Area *
            </label>
            <input
              type="text"
              required
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Enter address"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Issue Description *
            </label>
            <textarea
              rows={3}
              required
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe the plumbing issue..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="h-12 w-full rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
          >
            {isPending ? "Submitting..." : "Submit Request"}
          </button>
        </form>
      </div>
    </div>
  );
}
