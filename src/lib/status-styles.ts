/**
 * Unified status badge system across Admin, Plumber, and Customer dashboards.
 * New = navy, In progress = gold, Awaiting customer = amber outline,
 * Completed/Approved/Confirmed = green, Cancelled/Rejected/Suspended = red,
 * Draft/Closed = grey.
 */

export type StatusTone =
  | "navy"
  | "gold"
  | "amber_outline"
  | "green"
  | "red"
  | "grey";

const TONE_CLASSES: Record<StatusTone, string> = {
  navy: "bg-[#0B1F3A] text-white border border-[#0B1F3A]",
  gold: "bg-[#F5B301] text-[#0B1F3A] border border-[#F5B301]",
  amber_outline: "bg-amber-50 text-amber-800 border border-amber-500",
  green: "bg-emerald-50 text-emerald-800 border border-emerald-300",
  red: "bg-red-50 text-red-800 border border-red-300",
  grey: "bg-slate-100 text-slate-700 border border-slate-300",
};

const STATUS_LABELS: Record<string, { label: string; tone: StatusTone }> = {
  // Requests & Jobs
  new: { label: "New", tone: "navy" },
  submitted: { label: "Submitted", tone: "navy" },
  contacted: { label: "Contacted", tone: "gold" },
  scheduled: { label: "Scheduled", tone: "gold" },
  inspection_required: { label: "Inspection Required", tone: "gold" },
  in_progress: { label: "In Progress", tone: "gold" },
  under_review: { label: "Under Review", tone: "gold" },
  quotation_submitted: { label: "Awaiting Customer", tone: "amber_outline" },
  documents_required: { label: "Documents Required", tone: "amber_outline" },
  awaiting_final_payment: { label: "Awaiting Payment", tone: "amber_outline" },
  pending: { label: "Pending", tone: "amber_outline" },
  unverified: { label: "Unverified", tone: "amber_outline" },
  approved: { label: "Approved", tone: "green" },
  completed: { label: "Completed", tone: "green" },
  work_completed: { label: "Work Completed", tone: "green" },
  confirmed: { label: "Confirmed", tone: "green" },
  verified: { label: "Verified", tone: "green" },
  resolved: { label: "Resolved", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
  rejected: { label: "Rejected", tone: "red" },
  suspended: { label: "Suspended", tone: "red" },
  failed: { label: "Failed", tone: "red" },
  draft: { label: "Draft", tone: "grey" },
  closed: { label: "Closed", tone: "grey" },
  unread: { label: "New", tone: "navy" },
  read: { label: "Closed", tone: "grey" },
};

export function getStatusMeta(status: string | null | undefined): {
  label: string;
  className: string;
} {
  const key = (status || "draft").toLowerCase().trim();
  const match = STATUS_LABELS[key] || {
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: "grey" as StatusTone,
  };
  return {
    label: match.label,
    className: `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${TONE_CLASSES[match.tone]}`,
  };
}
