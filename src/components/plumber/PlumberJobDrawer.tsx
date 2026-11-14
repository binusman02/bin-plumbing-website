"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Camera, CheckCircle2, FileText, Loader2, MessageSquare, Phone } from "lucide-react";
import { uploadChatFile } from "@/components/chat/ChatAttachment";
import { Stepper } from "@/components/ui";
import { formatNGN } from "@/lib/currency";
import type {
  RequestStatus,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";
import { getStatusMeta } from "@/lib/status-styles";

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
  quotations: StructuredQuotation[];
  actionFeedback: string | null;
  isPending: boolean;
  onClose: () => void;
  onStatusUpdate: () => void;
  onSubmitQuote: (e: FormEvent) => void;
  onOpenChat: (ticketNumber: string) => void;
  onUploadJobPhoto?: (ticketNumber: string, photoName: string, url: string) => Promise<void>;
}

export function PlumberJobDrawer({
  selectedJob,
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
  quotations,
  actionFeedback,
  isPending,
  onClose,
  onStatusUpdate,
  onSubmitQuote,
  onOpenChat,
  onUploadJobPhoto,
}: PlumberJobDrawerProps) {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);

  if (!selectedJob) return null;

  const labour = Math.max(0, Number(labourAmt) || 0);
  const materials = Math.max(0, Number(materialsAmt) || 0);
  const transport = Math.max(0, Number(transportAmt) || 0);
  const other = Math.max(0, Number(otherAmt) || 0);
  const totalQuote = labour + materials + transport + other;
  const companyCommission = Math.round(labour * 0.2);
  const plumberReceives = Math.max(0, totalQuote - companyCommission);

  const approvedQuotes = quotations.filter(
    (q) =>
      q.ticket_number === selectedJob.ticket_number &&
      q.customer_approval_status === "approved"
  );

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
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 pb-28 md:pb-6">
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
              <select
                value={nextJobStatus}
                onChange={(e) => setNextJobStatus(e.target.value as RequestStatus)}
                className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="inspection_required">Inspection Required</option>
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
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

          <form onSubmit={onSubmitQuote} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h4 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
              <FileText className="h-4 w-4 text-[#F5B301]" />
              Submit Itemised Quotation
            </h4>
            <div className="grid grid-cols-2 gap-3">
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
                  value={materialsAmt}
                  onChange={(e) => setMaterialsAmt(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
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
                  value={otherAmt}
                  onChange={(e) => setOtherAmt(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
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
              rows={3}
              value={scopeSummary}
              onChange={(e) => setScopeSummary(e.target.value)}
              placeholder="Describe work scope and materials breakdown..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <button
              type="submit"
              disabled={isPending}
              className="h-11 w-full rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
            >
              {isPending ? "Submitting..." : "Submit Quotation"}
            </button>
          </form>

          {approvedQuotes.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-[#0B1F3A]">Approved Quotations</h4>
              {approvedQuotes.map((q) => {
                const badge = getStatusMeta(q.customer_approval_status);
                return (
                  <div
                    key={q.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#0B1F3A]">{formatNGN(q.total_amount)}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Labour: {formatNGN(q.labour_charge)} • Materials:{" "}
                      {formatNGN(q.materials_cost)}
                    </p>
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
    </div>
  );
}
