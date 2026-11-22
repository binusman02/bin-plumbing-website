"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, CheckCircle2, Copy, Crosshair, Landmark, Loader2, MapPin, Printer, RefreshCw, Star, Upload, X } from "lucide-react";
import { uploadChatFile } from "@/components/chat/ChatAttachment";
import { LiveMap, type LiveMapMarker } from "@/components/map/LiveMap";
import { QuotationPreviewModal, type QuotationPreviewData } from "@/components/portal/QuotationPreviewModal";
import { Badge, Stepper, Avatar } from "@/components/ui";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import { useRoadRoute } from "@/hooks/useLiveTracking";
import { formatNGN } from "@/lib/currency";
import { calculateDistanceKm, formatDistance } from "@/lib/geo";
import type {
  PaymentRecord,
  RequestStatus,
  ServiceCategorySetting,
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
  assignedPlumberAvatar?: string;
  assignedPlumberLocation?: { lat: number; lng: number; updatedAt?: string };
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
  assignedPlumberAvatar,
  assignedPlumberLocation,
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
  const [previewQuote, setPreviewQuote] = useState<QuotationPreviewData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      setTimeout(() => {
        setCopiedField((prev) => (prev === key ? null : prev));
      }, 1800);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const isTrackable =
    selectedRequest != null &&
    !["completed", "cancelled"].includes(selectedRequest.status);

  const { route: drawerRoadRoute } = useRoadRoute({
    as: "customer",
    ticket: selectedRequest?.ticket_number ?? undefined,
    plumber: assignedPlumberLocation
      ? { lat: assignedPlumberLocation.lat, lng: assignedPlumberLocation.lng }
      : null,
    destination:
      selectedRequest?.customer_lat != null && selectedRequest?.customer_lng != null
        ? { lat: selectedRequest.customer_lat, lng: selectedRequest.customer_lng }
        : null,
    enabled: Boolean(
      isTrackable &&
        assignedPlumberLocation &&
        selectedRequest?.customer_lat != null &&
        selectedRequest?.customer_lng != null
    ),
  });

  if (!selectedRequest) return null;

  const reqQuotes = quotations.filter((q) => q.ticket_number === selectedRequest.ticket_number);
  const reqPayments = payments.filter((p) => p.ticket_number === selectedRequest.ticket_number);
  const hasConfirmedPayment = reqPayments.some((p) => p.verification_status === "verified");
  const hasApprovedQuote = reqQuotes.some((q) => q.customer_approval_status === "approved");
  const isWorkCompleted = ["work_completed", "awaiting_final_payment"].includes(
    selectedRequest.status
  );

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
            <div className="flex items-center gap-2.5">
              {selectedRequest.assigned_technician && (
                <Avatar
                  name={selectedRequest.assigned_technician}
                  src={assignedPlumberAvatar}
                  size="sm"
                />
              )}
              <p className="font-semibold text-[#0B1F3A]">
                Assigned Plumber: {selectedRequest.assigned_technician || "Pending assignment"}
              </p>
            </div>
            <p className="mt-1 text-slate-700">{selectedRequest.address_in_kano}</p>
            <p className="mt-2 whitespace-pre-wrap text-slate-700">
              {selectedRequest.issue_description}
            </p>
          </div>

          {!["completed", "cancelled"].includes(selectedRequest.status) &&
            (assignedPlumberLocation ||
              (selectedRequest.customer_lat != null && selectedRequest.customer_lng != null)) && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                    <MapPin className="h-3.5 w-3.5 text-[#F5B301]" />
                    Live Location Tracking
                  </p>
                  {assignedPlumberLocation &&
                    selectedRequest.customer_lat != null &&
                    selectedRequest.customer_lng != null && (() => {
                      if (
                        drawerRoadRoute?.ok &&
                        drawerRoadRoute.distanceM != null &&
                        drawerRoadRoute.durationS != null
                      ) {
                        const mins = Math.max(
                          1,
                          Math.round(drawerRoadRoute.durationS / 60)
                        );
                        return (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                            {formatDistance(drawerRoadRoute.distanceM / 1000)} by road (~{mins} min)
                          </span>
                        );
                      }
                      const km = calculateDistanceKm(
                        assignedPlumberLocation.lat,
                        assignedPlumberLocation.lng,
                        selectedRequest.customer_lat,
                        selectedRequest.customer_lng
                      );
                      return (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {formatDistance(km)} direct distance
                        </span>
                      );
                    })()}
                </div>
                <LiveMap
                  markers={(() => {
                    const list: LiveMapMarker[] = [];
                    if (
                      selectedRequest.customer_lat != null &&
                      selectedRequest.customer_lng != null
                    ) {
                      list.push({
                        id: "customer-loc",
                        lat: selectedRequest.customer_lat,
                        lng: selectedRequest.customer_lng,
                        label: "Your Property",
                        subtitle: selectedRequest.address_in_kano,
                        kind: "customer",
                      });
                    }
                    if (assignedPlumberLocation) {
                      list.push({
                        id: "plumber-loc",
                        lat: assignedPlumberLocation.lat,
                        lng: assignedPlumberLocation.lng,
                        label: selectedRequest.assigned_technician || "Plumber",
                        subtitle: "Live technician GPS",
                        kind: "plumber_online",
                      });
                    }
                    return list;
                  })()}
                  roadRoutePoints={
                    drawerRoadRoute?.ok &&
                    drawerRoadRoute.points &&
                    drawerRoadRoute.points.length >= 2
                      ? drawerRoadRoute.points
                      : undefined
                  }
                  straightLine={
                    !(
                      drawerRoadRoute?.ok &&
                      drawerRoadRoute.points &&
                      drawerRoadRoute.points.length >= 2
                    ) &&
                    assignedPlumberLocation &&
                    selectedRequest.customer_lat != null &&
                    selectedRequest.customer_lng != null
                      ? [
                          [assignedPlumberLocation.lat, assignedPlumberLocation.lng],
                          [selectedRequest.customer_lat, selectedRequest.customer_lng],
                        ]
                      : undefined
                  }
                  heightClassName="h-44"
                />
              </div>
            )}

          {reqQuotes.map((q) => (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#0B1F3A]">
                  Quotation: {formatNGN(q.total_amount)}
                </span>
                <Badge
                  status={q.customer_approval_status}
                  label={
                    q.customer_approval_status === "approved"
                      ? "Approved"
                      : q.customer_approval_status === "rejected"
                        ? "Declined"
                        : "Pending"
                  }
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-slate-600">
                <span>Labour: {formatNGN(q.labour_charge)}</span>
                <span>Materials: {formatNGN(q.materials_cost)}</span>
                <span>Transport: {formatNGN(q.transport_charge || 0)}</span>
                <span>Other: {formatNGN(q.other_charges || 0)}</span>
              </div>
              {q.items && q.items.length > 0 && (
                <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                  <p className="mb-1 font-semibold text-[#0B1F3A]">Itemised Materials:</p>
                  <ul className="space-y-0.5 text-slate-600">
                    {q.items.map((item, idx) => (
                      <li key={idx} className="flex justify-between gap-2">
                        <span>
                          {item.name}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                        </span>
                        <span className="font-medium text-slate-800">
                          {formatNGN(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {q.notes && <p className="mt-2 text-xs text-slate-600">{q.notes}</p>}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewQuote({
                      id: q.id,
                      ticketNumber: q.ticket_number,
                      revisionNumber: q.revision_number,
                      createdAt: q.created_at,
                      status: q.customer_approval_status,
                      plumberName: q.plumber_name,
                      customerName: selectedRequest.customer_name,
                      customerPhone: selectedRequest.customer_phone,
                      customerAddress: selectedRequest.address_in_kano,
                      serviceCategory: selectedRequest.problem_category,
                      labourCharge: q.labour_charge,
                      materialsCost: q.materials_cost,
                      transportCharge: q.transport_charge || 0,
                      otherCharges: q.other_charges || 0,
                      totalAmount: q.total_amount,
                      items: q.items,
                      notes: q.notes,
                    })
                  }
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                >
                  <Printer className="h-3.5 w-3.5 shrink-0" /> Print
                </button>
              </div>
              {q.customer_approval_status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onQuoteDecision(q, "approved")}
                    className="h-11 flex-1 whitespace-nowrap rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white"
                  >
                    Approve Quote
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onQuoteDecision(q, "rejected")}
                    className="h-11 flex-1 whitespace-nowrap rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ))}

          {(isWorkCompleted || hasApprovedQuote || reqPayments.length > 0) && (
            <div
              className={`rounded-xl border p-4 text-sm space-y-3 ${
                isWorkCompleted && !hasConfirmedPayment
                  ? "border-amber-300 bg-amber-50/70"
                  : "border-slate-200 bg-[#F4F6F9]"
              }`}
            >
              {isWorkCompleted && !hasConfirmedPayment && (
                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-900">
                  <p className="font-bold text-[#0B1F3A]">
                    Work Marked Complete — Upload Payment Receipt
                  </p>
                  <p className="mt-0.5 text-slate-600">
                    Your technician has marked this job complete. Please make your transfer below and upload your payment receipt so Admin can verify and close the job.
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold text-[#0B1F3A]">
                  <Landmark className="h-4 w-4 text-[#F5B301]" />
                  Bank Transfer Details
                </span>
                {hasConfirmedPayment && <Badge status="confirmed" label="Paid" />}
              </div>

              {bankDetails?.bankAccountNumber ? (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-500">Bank</span>
                    <span className="font-semibold text-[#0B1F3A]">
                      {bankDetails.bankName || "Configured Bank"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-2.5">
                    <span className="text-slate-500">Account Name</span>
                    <span className="text-right font-semibold text-[#0B1F3A]">
                      {bankDetails.bankAccountName || "FlowGuard Plumbing Enterprises"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-slate-500">Account Number</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-[#0B1F3A]">
                        {bankDetails.bankAccountNumber}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy("acct", bankDetails.bankAccountNumber || "")}
                        className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                      >
                        {copiedField === "acct" ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedField === "acct" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                  {(() => {
                    const activeQuote =
                      reqQuotes.find((q) => q.customer_approval_status === "approved") ||
                      reqQuotes[0];
                    if (!activeQuote || activeQuote.total_amount <= 0) return null;
                    return (
                      <div className="flex items-center justify-between gap-2 py-2">
                        <span className="text-slate-500">Amount</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0B1F3A]">
                            {formatNGN(activeQuote.total_amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy("amount", String(Math.round(activeQuote.total_amount)))
                            }
                            className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                          >
                            {copiedField === "amount" ? (
                              <Check className="h-3 w-3 text-emerald-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            {copiedField === "amount" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-slate-500">Reference</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-[#0B1F3A]">
                        {selectedRequest.ticket_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy("ref", selectedRequest.ticket_number)}
                        className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                      >
                        {copiedField === "ref" ? (
                          <Check className="h-3 w-3 text-emerald-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                        {copiedField === "ref" ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
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
                Thank you for choosing FlowGuard Plumbing Enterprises. Share your review or book another service anytime.
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
      <QuotationPreviewModal
        quote={previewQuote}
        onClose={() => setPreviewQuote(null)}
      />
    </div>
  );
}

interface CustomerNewRequestModalProps {
  open: boolean;
  serviceCategories?: ServiceCategorySetting[];
  newCategory: string;
  setNewCategory: (v: string) => void;
  newPriority: "standard" | "urgent";
  setNewPriority: (v: "standard" | "urgent") => void;
  newAddress: string;
  setNewAddress: (v: string) => void;
  newDescription: string;
  setNewDescription: (v: string) => void;
  coords: { lat: number; lng: number } | null;
  setCoords: (coords: { lat: number; lng: number } | null) => void;
  locationSource: "gps" | "map_pin" | "address_only";
  setLocationSource: (source: "gps" | "map_pin" | "address_only") => void;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function CustomerNewRequestModal({
  open,
  serviceCategories = [],
  newCategory,
  setNewCategory,
  newPriority,
  setNewPriority,
  newAddress,
  setNewAddress,
  newDescription,
  setNewDescription,
  coords,
  setCoords,
  locationSource,
  setLocationSource,
  isPending,
  onClose,
  onSubmit,
}: CustomerNewRequestModalProps) {
  const [locating, setLocating] = useState(false);
  const [showPinMap, setShowPinMap] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  if (!open) return null;

  const handleUseGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("GPS is not available on this device. You can pin your property on the map instead.");
      return;
    }
    setLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationSource("gps");
        setShowPinMap(true);
        setLocating(false);
      },
      () => {
        setLocating(false);
        setGpsError("Location permission denied or unavailable. You can still submit by address or pin on the map.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-3 sm:items-center sm:p-4">
      <div className="my-2 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:my-4 sm:p-6">
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
              <ClassicSelect
                value={newCategory}
                onChange={setNewCategory}
                options={(() => {
                  const baseOptions =
                    serviceCategories.length > 0
                      ? serviceCategories.map((cat) => {
                          const label = cat.title || cat.name || cat.slug;
                          return { value: label, label };
                        })
                      : [
                          { value: "Pipework & Leaks", label: "Pipework & Leaks" },
                          { value: "Water Tanks & Pumps", label: "Water Tanks & Pumps" },
                          { value: "Bathroom & Kitchen", label: "Bathroom & Kitchen" },
                          { value: "Drainage & Blockages", label: "Drainage & Blockages" },
                        ];
                  if (newCategory && !baseOptions.some((opt) => opt.value === newCategory)) {
                    return [{ value: newCategory, label: newCategory }, ...baseOptions];
                  }
                  return baseOptions;
                })()}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Priority
              </label>
              <ClassicSelect
                value={newPriority}
                onChange={(val) => setNewPriority(val as "standard" | "urgent")}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "urgent", label: "Urgent" },
                ]}
              />
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
              Property Location Pin (Optional)
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleUseGps}
                disabled={locating}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                  locationSource === "gps" && coords
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50"
                }`}
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Crosshair className="h-3.5 w-3.5 text-[#F5B301]" />
                )}
                Use My Current GPS
              </button>
              <button
                type="button"
                onClick={() => setShowPinMap((v) => !v)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                  locationSource === "map_pin" && coords
                    ? "border-[#F5B301] bg-amber-50 text-[#0B1F3A]"
                    : "border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50"
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                {showPinMap ? "Hide Map" : "Pin Property on Map"}
              </button>
              {coords && (
                <button
                  type="button"
                  onClick={() => {
                    setCoords(null);
                    setLocationSource("address_only");
                  }}
                  className="inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100"
                >
                  Address Only
                </button>
              )}
            </div>
            {gpsError && (
              <p className="mt-1.5 text-[11px] text-amber-700">{gpsError}</p>
            )}
            {coords && (
              <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
                Property pinned ({locationSource === "gps" ? "from GPS" : "on map"}). Click map to adjust if needed.
              </p>
            )}
            {showPinMap && (
              <div className="mt-2">
                <LiveMap
                  heightClassName="h-44"
                  interactivePicker
                  onPickLocation={(lat, lng) => {
                    setCoords({ lat, lng });
                    setLocationSource("map_pin");
                  }}
                  markers={
                    coords
                      ? [
                          {
                            id: "new-req-pin",
                            lat: coords.lat,
                            lng: coords.lng,
                            label: "Your Property",
                            kind: "customer",
                          },
                        ]
                      : []
                  }
                />
              </div>
            )}
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
