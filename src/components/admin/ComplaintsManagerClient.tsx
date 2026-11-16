"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, MessageSquareWarning, Search, Star, X } from "lucide-react";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import type { ComplaintRecord, ReviewRecord } from "@/lib/marketplace";
import { moderateReviewAction, updateComplaintStatusAction } from "@/app/actions/marketplace-actions";
import { getStatusMeta } from "@/lib/status-styles";
import { formatDateTime } from "@/lib/currency";

interface ComplaintsManagerClientProps {
  initialComplaints: ComplaintRecord[];
  initialReviews?: ReviewRecord[];
}

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "under_review", label: "Under Review" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
] as const;

export function ComplaintsManagerClient({ initialComplaints, initialReviews = [] }: ComplaintsManagerClientProps) {
  const [complaints, setComplaints] = useState<ComplaintRecord[]>(initialComplaints);
  const [reviews, setReviews] = useState<ReviewRecord[]>(initialReviews);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ComplaintRecord | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [nextStatus, setNextStatus] = useState<ComplaintRecord["status"]>("under_review");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = complaints.filter((c) => {
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.customer_name.toLowerCase().includes(q) ||
      (c.plumber_name || "").toLowerCase().includes(q) ||
      (c.ticket_number || "").toLowerCase().includes(q) ||
      c.message.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const openDetail = (item: ComplaintRecord) => {
    setSelected(item);
    setAdminNote(item.admin_note || "");
    setNextStatus(item.status);
    setFeedback(null);
  };

  const handleSave = () => {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await updateComplaintStatusAction(selected.id, nextStatus, adminNote);
      if (res.success) {
        const updated: ComplaintRecord = {
          ...selected,
          status: nextStatus,
          admin_note: adminNote,
          updated_at: new Date().toISOString(),
        };
        setComplaints((prev) => prev.map((c) => (c.id === selected.id ? updated : c)));
        setSelected(updated);
        setFeedback({ type: "success", text: "Complaint status updated." });
      } else {
        setFeedback({ type: "error", text: res.error || "Could not update complaint." });
      }
    });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A]">Complaints & Feedback</h2>
          <p className="text-sm text-slate-500">
            Review customer complaints and service feedback submitted from the Customer Portal.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer, ticket, message..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => {
          const count =
            f.id === "all"
              ? complaints.length
              : complaints.filter((c) => c.status === f.id).length;
          const active = statusFilter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-[#0B1F3A] text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <MessageSquareWarning className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No complaints or feedback yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Customer submissions will appear here with their ticket reference and status.
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Ticket / Type</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const badge = getStatusMeta(item.status);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openDetail(item)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-[#0B1F3A]">{item.customer_name}</p>
                        {item.customer_phone && (
                          <p className="text-xs text-slate-500">{item.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-800">
                          {item.ticket_number || "General"}
                        </p>
                        <p className="text-xs capitalize text-slate-500">{item.category}</p>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3.5 text-slate-700">
                        {item.message}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((item) => {
              const badge = getStatusMeta(item.status);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDetail(item)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold capitalize text-[#0B1F3A]">
                        {item.category} {item.ticket_number ? `• ${item.ticket_number}` : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">{item.customer_name}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.message}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatDateTime(item.created_at)}</p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Drawer (PC/Tablet) & Full-Screen View (Phone) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[1px]">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {selected.category === "complaint" ? "Complaint" : "Feedback"}{" "}
                  {selected.ticket_number ? `• ${selected.ticket_number}` : ""}
                </p>
                <h3 className="text-lg font-bold text-[#0B1F3A]">{selected.customer_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Close detail"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-[#0B1F3A]">{selected.customer_name}</p>
                {selected.customer_phone && (
                  <p className="text-slate-600">Phone: {selected.customer_phone}</p>
                )}
                {selected.plumber_name && (
                  <p className="text-slate-600">Plumber: {selected.plumber_name}</p>
                )}
                {typeof selected.rating === "number" && selected.rating > 0 && (
                  <p className="text-slate-600">Rating: {selected.rating} / 5</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Submitted {formatDateTime(selected.created_at)}
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Message
                </p>
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {selected.message}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Status
                </label>
                <ClassicSelect
                  value={nextStatus}
                  onChange={(val) => setNextStatus(val as ComplaintRecord["status"])}
                  options={[
                    { value: "new", label: "New" },
                    { value: "under_review", label: "Under Review" },
                    { value: "resolved", label: "Resolved" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Admin Resolution Notes
                </label>
                <textarea
                  rows={4}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Record actions taken, follow-up call summary, or resolution..."
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
                />
              </div>

              {feedback && (
                <div
                  className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                    feedback.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {feedback.type === "success" ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="h-12 w-full rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] transition hover:bg-[#e5a700] disabled:opacity-60"
              >
                {isPending ? "Saving..." : "Save Update"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Reviews Moderation */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-[#0B1F3A]">Verified Customer Reviews</h2>
            <p className="text-xs text-slate-500">
              Only approved reviews appear on the public homepage.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {reviews.filter((r) => r.status === "pending").length} pending
          </span>
        </div>

        {reviews.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No customer reviews submitted yet. Completed requests allow customers to leave a review in their portal.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {reviews.map((rev) => (
              <div key={rev.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#0B1F3A]">{rev.customer_name}</span>
                    <span className="text-xs font-mono text-slate-500">{rev.ticket_number}</span>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-[#F5B301]">
                      <Star className="h-3.5 w-3.5 fill-current" /> {rev.rating}/5
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${
                        rev.status === "approved"
                          ? "bg-emerald-50 text-emerald-700"
                          : rev.status === "rejected"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {rev.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700">{rev.comment}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {rev.status !== "approved" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await moderateReviewAction(rev.id, "approved");
                          if (res.success) {
                            setReviews((prev) =>
                              prev.map((r) => (r.id === rev.id ? { ...r, status: "approved" } : r))
                            );
                          }
                        });
                      }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  )}
                  {rev.status !== "rejected" && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        startTransition(async () => {
                          const res = await moderateReviewAction(rev.id, "rejected");
                          if (res.success) {
                            setReviews((prev) =>
                              prev.map((r) => (r.id === rev.id ? { ...r, status: "rejected" } : r))
                            );
                          }
                        });
                      }}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
