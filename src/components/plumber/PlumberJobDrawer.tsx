"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, Eye, FileText, Loader2, MapPin, MessageSquare, Navigation, Phone, Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { uploadChatFile } from "@/components/chat/ChatAttachment";
import { LiveMap, type LiveMapMarker, type OwnPositionFix } from "@/components/map/LiveMap";
import {
  QuotationPreviewModal,
  type QuotationPreviewData,
} from "@/components/portal/QuotationPreviewModal";
import { Stepper } from "@/components/ui";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import { useRoadRoute } from "@/hooks/useLiveTracking";
import { formatNGN } from "@/lib/currency";
import { calculateDistanceKm, formatDistance } from "@/lib/geo";
import { deriveJobTripState } from "@/lib/live-location";
import type {
  QuotationLineItem,
  RequestStatus,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";
import { getStatusMeta, PLUMBER_UPDATABLE_STATUSES } from "@/lib/status-styles";

const JOB_STEPS = [
  { id: "scheduled", label: "Assigned" },
  { id: "inspection_required", label: "Inspection" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
];

function getStepIndex(status: RequestStatus): number {
  if (status === "completed" || status === "work_completed" || status === "awaiting_final_payment") return 3;
  if (status === "in_progress" || status === "approved") return 2;
  if (status === "inspection_required" || status === "quotation_submitted" || status === "awaiting_approval") return 1;
  return 0;
}

interface PlumberJobDrawerProps {
  selectedJob: ServiceRequestRecord | null;
  plumberName: string;
  plumberId: string;
  plumberCoords?: { lat: number; lng: number } | null;
  nextJobStatus: RequestStatus;
  setNextJobStatus: (status: RequestStatus) => void;
  labourAmt: string;
  setLabourAmt: (v: string) => void;
  materialsAmt: string;
  setMaterialsAmt: (v: string) => void;
  transportAmt: string;
  setTransportAmt: (v: string) => void;
  otherAmt: string;
  setOtherAmt: (v: string) => void;
  scopeSummary: string;
  setScopeSummary: (v: string) => void;
  quoteItems: QuotationLineItem[];
  setQuoteItems: (items: QuotationLineItem[]) => void;
  quotations: StructuredQuotation[];
  actionFeedback: string | null;
  isPending: boolean;
  deviceFix?: OwnPositionFix | null;
  wakeLockActive?: boolean;
  onStartTrip?: (ticketNumber: string) => void;
  onMarkArrived?: (ticketNumber: string) => void;
  onNeedReroute?: () => void;
  onQuickStatusChange?: (status: RequestStatus) => void;
  onClose: () => void;
  onStatusUpdate: () => void;
  onSubmitQuote: (e: FormEvent) => void;
  onOpenChat: (ticketNumber: string) => void;
  onUploadJobPhoto?: (ticketNumber: string, photoName: string, url: string) => Promise<void>;
}

export function PlumberJobDrawer({
  selectedJob,
  plumberName,
  plumberCoords,
  nextJobStatus,
  setNextJobStatus,
  labourAmt,
  setLabourAmt,
  materialsAmt,
  setMaterialsAmt,
  transportAmt,
  setTransportAmt,
  otherAmt,
  setOtherAmt,
  scopeSummary,
  setScopeSummary,
  quoteItems,
  setQuoteItems,
  quotations,
  actionFeedback,
  isPending,
  deviceFix,
  wakeLockActive,
  onStartTrip,
  onMarkArrived,
  onNeedReroute,
  onQuickStatusChange,
  onClose,
  onStatusUpdate,
  onSubmitQuote,
  onOpenChat,
  onUploadJobPhoto,
}: PlumberJobDrawerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const quoteFormRef = useRef<HTMLFormElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [previewQuote, setPreviewQuote] = useState<QuotationPreviewData | null>(null);

  const destinationCoords =
    selectedJob?.customer_lat != null && selectedJob?.customer_lng != null
      ? { lat: selectedJob.customer_lat, lng: selectedJob.customer_lng }
      : null;

  const { route: roadRoute, status: roadRouteStatus, retry: retryRoadRoute } = useRoadRoute({
    as: "plumber",
    ticket: selectedJob?.ticket_number ?? undefined,
    plumber: plumberCoords ?? null,
    destination: destinationCoords,
    enabled: Boolean(selectedJob && destinationCoords && plumberCoords),
  });

  if (!selectedJob) return null;

  const validItems = quoteItems.filter((it) => it.name.trim().length > 0);
  const itemsTotal = validItems.reduce(
    (sum, it) => sum + Math.max(1, Number(it.quantity) || 1) * Math.max(0, Number(it.unitPrice) || 0),
    0
  );
  const labour = Math.max(0, Number(labourAmt) || 0);
  const materials = validItems.length > 0 ? itemsTotal : Math.max(0, Number(materialsAmt) || 0);
  const transport = Math.max(0, Number(transportAmt) || 0);
  const other = Math.max(0, Number(otherAmt) || 0);
  const totalQuote = labour + materials + transport + other;
  const companyCommission = Math.round(labour * 0.2);
  const plumberReceives = Math.max(0, totalQuote - companyCommission);

  const jobQuotes = quotations.filter((q) => q.ticket_number === selectedJob.ticket_number);

  const handleCameraPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoUploading(true);
    setPhotoStatus(null);
    try {
      const attachment = await uploadChatFile(file);
      if (onUploadJobPhoto) {
        await onUploadJobPhoto(selectedJob.ticket_number, file.name, attachment.url);
      }
      setPhotoStatus("Job photo uploaded to ticket.");
    } catch (err) {
      setPhotoStatus(err instanceof Error ? err.message : "Could not upload job photo.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const tripState = deriveJobTripState(selectedJob.history);
  const isJobActive = !["completed", "cancelled"].includes(selectedJob.status);
  const firstStep = roadRoute?.ok && roadRoute.steps && roadRoute.steps.length > 0 ? roadRoute.steps[0] : null;
  const estMins = roadRoute?.ok && roadRoute.durationS != null ? Math.max(1, Math.round(roadRoute.durationS / 60)) : null;

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
                {selectedJob.ticket_number}
              </span>
              <h3 className="text-base font-bold text-[#0B1F3A]">
                {selectedJob.problem_category || selectedJob.property_type}
              </h3>
            </div>
          </div>
          {tripState === "on_the_way" && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-600" />
              On the way
            </span>
          )}
          {tripState === "arrived" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-bold text-blue-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Arrived
            </span>
          )}
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 pb-32 md:pb-6">
          {tripState === "on_the_way" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">Keep this screen open during your trip</p>
                <p className="text-[11px] text-amber-800">
                  Live tracking pauses if your browser goes to the background or you switch apps.
                  {wakeLockActive ? " Screen wake lock is active." : ""}
                </p>
              </div>
            </div>
          )}

          {isJobActive && tripState === "idle" && onStartTrip && (
            <div className="rounded-xl border border-[#F5B301]/60 bg-[#FFFDF2] p-3.5">
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-bold text-[#0B1F3A]">Ready to head to this property?</p>
                  <p className="text-[11px] text-slate-600">
                    Tap Start Trip to turn on live tracking and notify the customer you are on the way.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => onStartTrip(selectedJob.ticket_number)}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-5 text-sm font-bold text-[#07152B] shadow-sm transition hover:bg-[#E0A200] disabled:opacity-60"
                >
                  <Navigation className="h-4 w-4" />
                  Start Trip
                </button>
              </div>
            </div>
          )}

          {isJobActive && tripState === "arrived" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
              <p className="text-xs font-bold text-emerald-900">
                Arrival recorded — choose your next step:
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {onQuickStatusChange &&
                  !["inspection_required", "in_progress", "work_completed", "completed"].includes(
                    selectedJob.status
                  ) && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onQuickStatusChange("inspection_required")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#132E54] disabled:opacity-60"
                    >
                      Start Inspection
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => quoteFormRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#0B1F3A] bg-white px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
                >
                  Submit Quotation
                </button>
                {onQuickStatusChange && selectedJob.status !== "in_progress" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onQuickStatusChange("in_progress")}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    Start Work
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white p-3.5">
            <Stepper steps={JOB_STEPS} currentIndex={getStepIndex(selectedJob.status)} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-[#0B1F3A]">
              Location: {selectedJob.address_in_kano}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">
              {selectedJob.issue_description}
            </p>
            {selectedJob.customer_lat != null &&
              selectedJob.customer_lng != null &&
              plumberCoords && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(() => {
                    if (roadRoute?.ok && roadRoute.distanceM != null && roadRoute.durationS != null) {
                      const mins = Math.max(1, Math.round(roadRoute.durationS / 60));
                      return (
                        <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">
                          <MapPin className="h-3.5 w-3.5" />
                          {formatDistance(roadRoute.distanceM / 1000)} by road (~{mins} min)
                        </span>
                      );
                    }
                    const km = calculateDistanceKm(
                      plumberCoords.lat,
                      plumberCoords.lng,
                      selectedJob.customer_lat,
                      selectedJob.customer_lng
                    );
                    return (
                      <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                        <MapPin className="h-3.5 w-3.5" />
                        {formatDistance(km)} direct distance
                      </span>
                    );
                  })()}
                </div>
              )}
            {selectedJob.photos && selectedJob.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {selectedJob.photos.map((url, idx) => (
                  <a key={idx} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Customer issue ${idx + 1}`}
                      className="aspect-[4/3] w-full rounded-lg border border-slate-200 object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {selectedJob.customer_lat != null && selectedJob.customer_lng != null && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                {tripState === "on_the_way" ? "Live Turn-by-Turn Navigation" : "Live Job Map"}
              </p>

              {tripState === "on_the_way" && (
                <div className="rounded-xl bg-[#0B1F3A] px-3.5 py-2.5 text-white shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold leading-snug">
                      {firstStep ? firstStep.instruction : "Follow the highlighted route"}
                    </p>
                    {firstStep && firstStep.distanceM > 0 && (
                      <span className="shrink-0 rounded-md bg-[#F5B301] px-2 py-0.5 font-mono text-xs font-extrabold text-[#07152B]">
                        {firstStep.distanceM < 1000
                          ? `${Math.round(firstStep.distanceM)} m`
                          : `${(firstStep.distanceM / 1000).toFixed(1)} km`}
                      </span>
                    )}
                  </div>
                  {roadRoute?.ok && roadRoute.distanceM != null && estMins != null && (
                    <p className="mt-1 text-[11px] text-slate-300">
                      Remaining: {formatDistance(roadRoute.distanceM / 1000)} •{" "}
                      <span className="font-semibold text-[#F5B301]">
                        Estimated {estMins} min
                      </span>
                    </p>
                  )}
                </div>
              )}

              <LiveMap
                ownPosition={deviceFix}
                destination={{
                  lat: selectedJob.customer_lat,
                  lng: selectedJob.customer_lng,
                }}
                navigationMode={tripState === "on_the_way"}
                onNeedReroute={retryRoadRoute || onNeedReroute}
                markers={(() => {
                  const list: LiveMapMarker[] = [
                    {
                      id: "customer-job",
                      lat: selectedJob.customer_lat!,
                      lng: selectedJob.customer_lng!,
                      label: selectedJob.customer_name || "Customer",
                      subtitle: selectedJob.address_in_kano,
                      kind: "customer",
                    },
                  ];
                  if (!deviceFix && plumberCoords) {
                    list.push({
                      id: "plumber-self",
                      lat: plumberCoords.lat,
                      lng: plumberCoords.lng,
                      label: "You",
                      subtitle: "Your live GPS location",
                      kind: "plumber_online",
                    });
                  }
                  return list;
                })()}
                roadRoutePoints={
                  roadRoute?.ok && roadRoute.points && roadRoute.points.length >= 2
                    ? roadRoute.points
                    : undefined
                }
                straightLine={
                  !(roadRoute?.ok && roadRoute.points && roadRoute.points.length >= 2) &&
                  plumberCoords
                    ? [
                        [plumberCoords.lat, plumberCoords.lng],
                        [selectedJob.customer_lat, selectedJob.customer_lng],
                      ]
                    : undefined
                }
                heightClassName={tripState === "on_the_way" ? "h-72 sm:h-80" : "h-48"}
              />
              {plumberCoords ? (
                roadRoute?.ok && roadRoute.steps && roadRoute.steps.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                        Turn-by-Turn Directions
                      </p>
                      <button
                        type="button"
                        onClick={retryRoadRoute}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:text-[#0B1F3A]"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh
                      </button>
                    </div>
                    <ol className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
                      {roadRoute.steps.map((step, idx) => (
                        <li
                          key={`${idx}-${step.instruction}`}
                          className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1"
                        >
                          <span className="text-slate-800">
                            <span className="mr-1 font-bold text-[#0B1F3A]">{idx + 1}.</span>
                            {step.instruction}
                          </span>
                          {step.distanceM > 0 && (
                            <span className="shrink-0 font-mono text-[11px] text-slate-500">
                              {step.distanceM < 1000
                                ? `${Math.round(step.distanceM)} m`
                                : `${(step.distanceM / 1000).toFixed(1)} km`}
                            </span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : roadRouteStatus === "loading" ? (
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Calculating road directions...
                  </p>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-xs text-amber-800">
                    <span>Road directions unavailable right now.</span>
                    <button
                      type="button"
                      onClick={retryRoadRoute}
                      className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold hover:bg-amber-100"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                )
              ) : (
                <p className="text-xs text-slate-500">
                  Waiting for your live GPS fix to calculate road directions.
                </p>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#0B1F3A]">Update Job Progress</h4>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraPhoto}
                className="hidden"
              />
              <button
                type="button"
                disabled={photoUploading}
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
              >
                {photoUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                Add Job Photo
              </button>
            </div>
            {photoStatus && <p className="text-xs font-medium text-emerald-700">{photoStatus}</p>}
            <div className="flex gap-2">
              <ClassicSelect
                value={nextJobStatus}
                onChange={(val) => setNextJobStatus(val as RequestStatus)}
                className="flex-1"
                options={[
                  ...(!(PLUMBER_UPDATABLE_STATUSES as readonly string[]).includes(selectedJob.status)
                    ? [
                        {
                          value: selectedJob.status,
                          label: `${getStatusMeta(selectedJob.status).label} (Current)`,
                          disabled: true,
                        },
                      ]
                    : []),
                  ...PLUMBER_UPDATABLE_STATUSES.map((st) => ({
                    value: st,
                    label: getStatusMeta(st).label,
                  })),
                ]}
              />
              <button
                type="button"
                disabled={isPending}
                onClick={onStatusUpdate}
                className="h-11 rounded-xl bg-[#0B1F3A] px-4 text-sm font-semibold text-white"
              >
                Update
              </button>
            </div>
          </div>

          <form ref={quoteFormRef} onSubmit={onSubmitQuote} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
                <FileText className="h-4 w-4 text-[#F5B301]" />
                Create Itemised Quotation
              </h4>
              <button
                type="button"
                onClick={() =>
                  setQuoteItems([
                    ...quoteItems,
                    { id: `item-${Date.now()}-${quoteItems.length}`, name: "", quantity: 1, unitPrice: 0 },
                  ])
                }
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-100"
              >
                <Plus className="h-3.5 w-3.5 text-[#F5B301]" /> Add Item
              </button>
            </div>

            {/* Dynamic Materials / Itemised Rows */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="grid grid-cols-12 gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span className="col-span-6">Item Name</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-3 text-right">Price (₦)</span>
                <span className="col-span-1" />
              </div>
              {quoteItems.map((item, idx) => (
                <div key={item.id} className="grid grid-cols-12 items-center gap-2">
                  <input
                    type="text"
                    placeholder="e.g. PVC Pipe, Elbow"
                    value={item.name}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx] = { ...item, name: e.target.value };
                      setQuoteItems(next);
                    }}
                    className="col-span-6 h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx] = { ...item, quantity: Math.max(1, Number(e.target.value) || 1) };
                      setQuoteItems(next);
                    }}
                    className="col-span-2 h-9 rounded-lg border border-slate-200 bg-white px-2 text-center text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={item.unitPrice || ""}
                    onChange={(e) => {
                      const next = [...quoteItems];
                      next[idx] = { ...item, unitPrice: Math.max(0, Number(e.target.value) || 0) };
                      setQuoteItems(next);
                    }}
                    className="col-span-3 h-9 rounded-lg border border-slate-200 bg-white px-2 text-right text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (quoteItems.length <= 1) {
                        setQuoteItems([{ id: `item-${Date.now()}`, name: "", quantity: 1, unitPrice: 0 }]);
                      } else {
                        setQuoteItems(quoteItems.filter((_, i) => i !== idx));
                      }
                    }}
                    aria-label="Remove item"
                    className="col-span-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-xs">
                <span className="font-semibold text-slate-600">Materials Subtotal</span>
                <span className="font-bold text-[#0B1F3A]">{formatNGN(materials)}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Labour (₦) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={labourAmt}
                  onChange={(e) => setLabourAmt(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Transport (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  value={transportAmt}
                  onChange={(e) => setTransportAmt(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Other (₦)
                </label>
                <input
                  type="number"
                  min="0"
                  value={otherAmt}
                  onChange={(e) => setOtherAmt(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm"
                />
              </div>
            </div>

            {totalQuote > 0 && (
              <div className="rounded-xl border border-slate-200 bg-[#F4F6F9] p-3 text-xs space-y-1">
                <div className="flex justify-between text-slate-600">
                  <span>Customer Total</span>
                  <span className="font-bold text-[#0B1F3A]">{formatNGN(totalQuote)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Company commission (20% on labour)</span>
                  <span className="font-semibold text-amber-800">
                    -{formatNGN(companyCommission)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-emerald-800">
                  <span className="font-bold">You receive</span>
                  <span className="font-bold">{formatNGN(plumberReceives)}</span>
                </div>
              </div>
            )}

            <textarea
              rows={2}
              value={scopeSummary}
              onChange={(e) => setScopeSummary(e.target.value)}
              placeholder="Work scope or additional notes..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={totalQuote <= 0}
                onClick={() =>
                  setPreviewQuote({
                    ticketNumber: selectedJob.ticket_number,
                    revisionNumber: jobQuotes.length + 1,
                    plumberName,
                    customerName: selectedJob.customer_name,
                    customerPhone: selectedJob.customer_phone,
                    customerAddress: selectedJob.address_in_kano,
                    serviceCategory: selectedJob.problem_category || selectedJob.property_type,
                    labourCharge: labour,
                    materialsCost: materials,
                    transportCharge: transport,
                    otherCharges: other,
                    totalAmount: totalQuote,
                    items: validItems,
                    notes: scopeSummary.trim() || undefined,
                    isDraftPreview: true,
                  })
                }
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#0B1F3A] bg-white px-4 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-40"
              >
                <Eye className="h-4 w-4" /> Preview
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="h-11 flex-1 rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                {isPending ? "Submitting..." : "Submit Quotation"}
              </button>
            </div>
          </form>

          {jobQuotes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[#0B1F3A]">Submitted Quotations</h4>
              {jobQuotes.map((q) => {
                const badge = getStatusMeta(q.customer_approval_status);
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-[#0B1F3A]">
                        Rev #{q.revision_number} • {formatNGN(q.total_amount)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
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
                              customerName: selectedJob.customer_name,
                              customerPhone: selectedJob.customer_phone,
                              customerAddress: selectedJob.address_in_kano,
                              serviceCategory: selectedJob.problem_category || selectedJob.property_type,
                              labourCharge: q.labour_charge,
                              materialsCost: q.materials_cost,
                              transportCharge: q.transport_charge,
                              otherCharges: q.other_charges,
                              totalAmount: q.total_amount,
                              items: q.items,
                              notes: q.notes,
                            })
                          }
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        >
                          <Eye className="h-3 w-3" /> Preview / Print
                        </button>
                      </div>
                    </div>
                    {q.items && q.items.length > 0 && (
                      <p className="mt-1 text-xs text-slate-600">
                        {q.items.map((it) => `${it.name} (×${it.quantity})`).join(", ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {actionFeedback && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{actionFeedback}</span>
            </div>
          )}
          {tripState === "on_the_way" && onMarkArrived && (
            <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 p-3 backdrop-blur-sm md:static md:border-0 md:bg-transparent md:p-0">
              <button
                type="button"
                disabled={isPending}
                onClick={() => onMarkArrived(selectedJob.ticket_number)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-base font-extrabold text-white shadow-lg transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <CheckCircle2 className="h-5 w-5" />
                Arrived at Property
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-slate-200 bg-white p-4">
          <button
            type="button"
            onClick={() => onOpenChat(selectedJob.ticket_number)}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-[#0B1F3A] hover:bg-slate-50"
          >
            <MessageSquare className="h-4 w-4" /> Chat
          </button>
          {selectedJob.customer_phone && (
            <a
              href={`tel:${selectedJob.customer_phone}`}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] text-sm font-bold text-white"
            >
              <Phone className="h-4 w-4" /> Call Customer
            </a>
          )}
        </div>
      </div>

      <QuotationPreviewModal quote={previewQuote} onClose={() => setPreviewQuote(null)} />
    </div>
  );
}
