"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Phone,
  UserCheck,
  X,
} from "lucide-react";
import { Avatar, Badge, Tabs, Timeline } from "@/components/ui";
import { formatDateTime, formatNGN } from "@/lib/currency";
import type {
  JobMessage,
  PaymentRecord,
  PlumberProfile,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";
import { getStatusMeta } from "@/lib/status-styles";

export const REQUEST_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "scheduled", label: "Scheduled" },
  { value: "inspection_required", label: "Inspection Required" },
  { value: "quotation_submitted", label: "Quote Submitted" },
  { value: "awaiting_approval", label: "Awaiting Approval" },
  { value: "approved", label: "Approved" },
  { value: "in_progress", label: "In Progress" },
  { value: "work_completed", label: "Work Completed" },
  { value: "awaiting_final_payment", label: "Awaiting Final Payment" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export function extractCustomerContact(req: ServiceRequestRecord) {
  let name = req.customer_name || "";
  let phone = req.customer_phone || "";
  if ((!name || !phone) && req.issue_description) {
    const match = req.issue_description.match(/Customer:\s*(.*?)\s*\|\s*Tel:\s*(.*?)(?:\n|$)/);
    if (match) {
      if (!name) name = match[1]?.trim() || "";
      if (!phone) phone = match[2]?.trim() || "";
    }
  }
  return { name: name || "Customer", phone };
}

type DrawerTab = "details" | "quotations" | "messages" | "payments" | "history";

interface RequestDetailDrawerProps {
  selected: ServiceRequestRecord | null;
  selectedQuotes: StructuredQuotation[];
  selectedMessages?: JobMessage[];
  selectedPayments?: PaymentRecord[];
  approvedPlumbers: PlumberProfile[];
  onlinePlumberIds: string[];
  availabilityMap: Record<string, boolean>;
  editStatus: string;
  setEditStatus: (v: string) => void;
  editPriority: "standard" | "urgent";
  setEditPriority: (v: "standard" | "urgent") => void;
  editPlumberId: string;
  setEditPlumberId: (v: string) => void;
  editQuotedAmount: string;
  setEditQuotedAmount: (v: string) => void;
  editPreferredDate?: string;
  setEditPreferredDate?: (v: string) => void;
  editNotes: string;
  setEditNotes: (v: string) => void;
  saving: boolean;
  feedback: { type: "success" | "error"; text: string } | null;
  onClose: () => void;
  onSave: () => void;
  onQuotationDecision: (q: StructuredQuotation, decision: "approved" | "rejected") => void;
}

export function RequestDetailDrawer({
  selected,
  selectedQuotes,
  selectedMessages = [],
  selectedPayments = [],
  approvedPlumbers,
  onlinePlumberIds,
  availabilityMap,
  editStatus,
  setEditStatus,
  editPriority,
  setEditPriority,
  editPlumberId,
  setEditPlumberId,
  editQuotedAmount,
  setEditQuotedAmount,
  editPreferredDate = "",
  setEditPreferredDate,
  editNotes,
  setEditNotes,
  saving,
  feedback,
  onClose,
  onSave,
  onQuotationDecision,
}: RequestDetailDrawerProps) {
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("details");

  if (!selected) return null;

  const contact = extractCustomerContact(selected);
  const cleanPhone = contact.phone.replace(/[^0-9+]/g, "");
  const waPhone = cleanPhone.replace(/^0/, "234").replace(/^\+/, "");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[1px]">
      <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[72%] md:max-w-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                  {selected.ticket_number}
                </span>
                <Badge status={selected.status} />
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A] sm:text-lg">{contact.name}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 md:flex"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
          <Tabs
            activeTab={drawerTab}
            onChange={setDrawerTab}
            tabs={[
              { id: "details", label: "Details" },
              { id: "quotations", label: "Quotations", count: selectedQuotes.length },
              { id: "messages", label: "Messages", count: selectedMessages.length },
              { id: "payments", label: "Payments", count: selectedPayments.length },
              { id: "history", label: "History", count: selected.history?.length || 0 },
            ]}
          />
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-28 sm:p-6 md:pb-6">
          {drawerTab === "details" && (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 text-sm">
                    <Avatar name={contact.name} size="md" />
                    <div>
                      <p className="font-bold text-[#0B1F3A]">{contact.name}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600">
                        {contact.phone && <span>{contact.phone}</span>}
                        {selected.customer_email && <span>{selected.customer_email}</span>}
                      </div>
                      <p className="mt-1 text-slate-600">
                        {selected.property_type} • {selected.address_in_kano}
                        {selected.city_lga ? ` (${selected.city_lga}${selected.state ? `, ${selected.state}` : ""})` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Preferred timing: {selected.preferred_timing}
                        {selected.preferred_date ? ` • Appointment: ${selected.preferred_date}` : ""}
                        {selected.customer_id ? ` • Ref: ${selected.customer_id.slice(0, 8)}` : ""}
                      </p>
                    </div>
                  </div>
                  {cleanPhone && (
                    <div className="hidden gap-2 md:flex">
                      <a
                        href={`tel:${cleanPhone}`}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
                      >
                        <Phone className="h-4 w-4" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Issue Description
                </h4>
                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
                  {selected.issue_description}
                </div>
              </div>

              {selected.photos && selected.photos.length > 0 && (
                <div>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Customer Photos ({selected.photos.length})
                  </h4>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {selected.photos.map((url, idx) => (
                      <a
                        key={idx}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="overflow-hidden rounded-xl border border-slate-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Request photo ${idx + 1}`}
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                    Status
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  >
                    {REQUEST_STATUS_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                    Priority
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as "standard" | "urgent")}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  >
                    <option value="standard">Standard</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="block text-sm font-semibold text-[#0B1F3A]">
                      Assign Approved Plumber
                    </label>
                    {editPlumberId &&
                      (() => {
                        const isOnline = onlinePlumberIds.includes(editPlumberId);
                        const matched = approvedPlumbers.find((p) => p.id === editPlumberId);
                        const isAvail =
                          availabilityMap[editPlumberId] ?? Boolean(matched?.is_available);
                        const label = !isOnline
                          ? "Offline"
                          : isAvail
                            ? "Online • Available"
                            : "Online • Unavailable";
                        const cls = !isOnline
                          ? "bg-slate-100 text-slate-600"
                          : isAvail
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-800";
                        return (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
                            {label}
                          </span>
                        );
                      })()}
                  </div>
                  <select
                    value={editPlumberId}
                    onChange={(e) => setEditPlumberId(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  >
                    <option value="">-- Unassigned --</option>
                    {approvedPlumbers.map((p) => {
                      const isOnline = onlinePlumberIds.includes(p.id);
                      const isAvail = availabilityMap[p.id] ?? p.is_available;
                      const statusText = !isOnline
                        ? "Offline"
                        : isAvail
                          ? "Online • Available"
                          : "Online • Unavailable";
                      return (
                        <option key={p.id} value={p.id}>
                          {p.full_name} ({p.phone}) — {statusText}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                    Quoted Total (₦)
                  </label>
                  <input
                    type="number"
                    value={editQuotedAmount}
                    onChange={(e) => setEditQuotedAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>

                {setEditPreferredDate && (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                      Appointment Date
                    </label>
                    <input
                      type="date"
                      value={editPreferredDate}
                      onChange={(e) => setEditPreferredDate(e.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                    Qualification & Dispatch Notes
                  </label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Notes from qualification call, scope confirmation, or dispatch instructions..."
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          {drawerTab === "quotations" && (
            <div className="space-y-3">
              {selectedQuotes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No itemised quotation submitted yet.
                </p>
              ) : (
                selectedQuotes.map((q) => {
                  const qBadge = getStatusMeta(q.customer_approval_status);
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0B1F3A]">
                          {q.plumber_name} • {formatNGN(q.total_amount)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${qBadge.className}`}
                        >
                          {qBadge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Labour: {formatNGN(q.labour_charge)} • Materials:{" "}
                        {formatNGN(q.materials_cost)} • Commission:{" "}
                        {formatNGN(q.company_commission)}
                      </p>
                      {q.notes && <p className="mt-1.5 text-xs text-slate-700">{q.notes}</p>}
                      {q.customer_approval_status !== "approved" && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => onQuotationDecision(q, "approved")}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Record Customer Acceptance
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => onQuotationDecision(q, "rejected")}
                            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            Reject Quote
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {drawerTab === "messages" && (
            <div className="space-y-3">
              {selectedMessages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No messages recorded for {selected.ticket_number}.
                </div>
              ) : (
                selectedMessages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#0B1F3A]">
                        {m.sender_name}{" "}
                        <span className="text-xs font-normal text-slate-500">
                          ({m.sender_role} → {m.recipient_role})
                        </span>
                      </span>
                      <span className="text-xs text-slate-400">{formatDateTime(m.created_at)}</span>
                    </div>
                    {m.message && <p className="mt-1 text-slate-700">{m.message}</p>}
                  </div>
                ))
              )}
              <Link
                href="/admin/communications"
                className="inline-flex text-xs font-bold text-[#0B1F3A] underline"
              >
                Open full Communications Hub →
              </Link>
            </div>
          )}

          {drawerTab === "payments" && (
            <div className="space-y-3">
              {selectedPayments.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                  No payments logged for this request yet.
                </p>
              ) : (
                selectedPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm"
                  >
                    <div>
                      <p className="font-bold text-[#0B1F3A]">{formatNGN(p.total_payment)}</p>
                      <p className="text-xs text-slate-500">
                        {p.payment_method} • {formatDateTime(p.payment_date || p.created_at)}
                      </p>
                    </div>
                    <Badge status={p.verification_status} />
                  </div>
                ))
              )}
              <Link
                href="/admin/financials"
                className="inline-flex text-xs font-bold text-[#0B1F3A] underline"
              >
                Verify payments in Financials →
              </Link>
            </div>
          )}

          {drawerTab === "history" && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {!selected.history || selected.history.length === 0 ? (
                <p className="text-sm text-slate-500">No history events recorded yet.</p>
              ) : (
                <Timeline
                  items={selected.history.map((h, i) => ({
                    id: `${i}-${h.timestamp}`,
                    label: h.action,
                    description: `${h.details ? `${h.details} — ` : ""}By ${h.actor}`,
                    timestamp: formatDateTime(h.timestamp),
                  }))}
                />
              )}
            </div>
          )}

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
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            {cleanPhone && (
              <>
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0B1F3A] md:hidden"
                >
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white md:hidden"
                >
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </>
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-5 text-sm font-bold text-[#07152B] transition hover:bg-[#e5a700] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )}
              <span>{saving ? "Saving..." : "Save Request Update"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
