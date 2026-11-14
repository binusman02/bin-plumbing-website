"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, ArrowLeft, CheckCircle2, Download, Eye, Mail, Search, Trash2, X } from "lucide-react";
import { deleteEnquiry } from "@/app/actions/admin-management";
import { saveEnquiryNoteAction } from "@/app/actions/marketplace-actions";
import { ActionMenu, ConfirmDialog } from "@/components/ui";
import { formatDateTime } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";

interface EnquiryRow {
  id: string;
  full_name: string;
  phone: string;
  area_in_kano?: string;
  service_category?: string;
  message: string;
  status?: string;
  created_at: string;
}

interface EnquiryNoteState {
  status: "new" | "contacted" | "closed";
  note: string;
  updated_at?: string;
}

interface EnquiriesManagerClientProps {
  initialEnquiries: EnquiryRow[];
  initialNotesMap?: Record<string, EnquiryNoteState>;
}

function mapStatus(raw?: string, override?: "new" | "contacted" | "closed") {
  if (override) return override;
  if (raw === "replied") return "contacted";
  if (raw === "archived") return "closed";
  if (raw === "contacted" || raw === "closed") return raw;
  return "new";
}

export function EnquiriesManagerClient({
  initialEnquiries,
  initialNotesMap = {},
}: EnquiriesManagerClientProps) {
  const [enquiries, setEnquiries] = useState<EnquiryRow[]>(initialEnquiries);
  const [notesMap, setNotesMap] = useState<Record<string, EnquiryNoteState>>(initialNotesMap);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<EnquiryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnquiryRow | null>(null);
  const [editStatus, setEditStatus] = useState<"new" | "contacted" | "closed">("new");
  const [editNote, setEditNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const enriched = useMemo(() => {
    return enquiries.map((e) => {
      const saved = notesMap[e.id];
      return {
        ...e,
        resolvedStatus: mapStatus(e.status, saved?.status),
        adminNote: saved?.note || "",
      };
    });
  }, [enquiries, notesMap]);

  const filtered = enriched.filter((e) => {
    const matchesStatus = statusFilter === "all" || e.resolvedStatus === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.full_name.toLowerCase().includes(q) ||
      e.phone.toLowerCase().includes(q) ||
      (e.area_in_kano || "").toLowerCase().includes(q) ||
      e.message.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  const openDetail = (item: (typeof enriched)[number]) => {
    setSelected(item);
    setEditStatus(item.resolvedStatus);
    setEditNote(item.adminNote);
    setFeedback(null);
  };

  const handleSave = () => {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await saveEnquiryNoteAction(selected.id, editStatus, editNote);
      if (res.success) {
        setNotesMap((prev) => ({
          ...prev,
          [selected.id]: {
            status: editStatus,
            note: editNote,
            updated_at: new Date().toISOString(),
          },
        }));
        setFeedback("Enquiry status and note saved.");
        window.dispatchEvent(new Event("admin-signals-refresh"));
      } else {
        setFeedback(res.error || "Could not save note.");
      }
    });
  };

  const exportCsv = () => {
    const headers = ["Date", "Name", "Phone", "Area", "Service", "Status", "Message", "Admin Note"];
    const escape = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
    const rows = filtered.map((e) =>
      [
        formatDateTime(e.created_at),
        e.full_name,
        e.phone,
        e.area_in_kano || "",
        e.service_category || "",
        e.resolvedStatus,
        e.message,
        e.adminNote,
      ]
        .map(escape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bin-plumbing-enquiries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A]">Direct Enquiries</h2>
          <p className="text-sm text-slate-500">
            Contact page submissions with status tracking, internal notes, and CSV export.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: "all", label: "All" },
            { id: "new", label: "New" },
            { id: "contacted", label: "Contacted" },
            { id: "closed", label: "Closed" },
          ].map((tab) => {
            const count =
              tab.id === "all"
                ? enriched.length
                : enriched.filter((e) => e.resolvedStatus === tab.id).length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
                  statusFilter === tab.id
                    ? "bg-[#0B1F3A] text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, area..."
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Mail className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No enquiries found</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Sender</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const badge = getStatusMeta(item.resolvedStatus);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50"
                    >
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                        {formatDateTime(item.created_at)}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer px-4 py-3.5">
                        <p className="font-bold text-[#0B1F3A]">{item.full_name}</p>
                        <p className="text-xs text-slate-500">{item.phone}</p>
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer px-4 py-3.5 text-slate-700">
                        {item.area_in_kano || "Not specified"}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer max-w-xs truncate px-4 py-3.5 text-slate-700">
                        {item.message}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer px-4 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <ActionMenu
                          items={[
                            {
                              id: "view",
                              label: "View & Edit Note",
                              icon: Eye,
                              onClick: () => openDetail(item),
                            },
                            {
                              id: "contacted",
                              label: "Mark Contacted",
                              icon: CheckCircle2,
                              onClick: async () => {
                                await saveEnquiryNoteAction(item.id, "contacted", item.adminNote);
                                setNotesMap((prev) => ({
                                  ...prev,
                                  [item.id]: { status: "contacted", note: item.adminNote },
                                }));
                              },
                            },
                            {
                              id: "close",
                              label: "Archive / Close",
                              icon: Archive,
                              onClick: async () => {
                                await saveEnquiryNoteAction(item.id, "closed", item.adminNote);
                                setNotesMap((prev) => ({
                                  ...prev,
                                  [item.id]: { status: "closed", note: item.adminNote },
                                }));
                              },
                            },
                            {
                              id: "delete",
                              label: "Delete Enquiry",
                              icon: Trash2,
                              danger: true,
                              dividerBefore: true,
                              onClick: () => setDeleteTarget(item),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((item) => {
              const badge = getStatusMeta(item.resolvedStatus);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDetail(item)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#0B1F3A]">{item.full_name}</p>
                      <p className="text-xs text-slate-500">{item.phone}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{item.message}</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    {formatDateTime(item.created_at)}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Enquiry?"
        description={
          deleteTarget
            ? `Permanently delete enquiry from ${deleteTarget.full_name} (${deleteTarget.phone})?`
            : ""
        }
        confirmLabel="Delete Enquiry"
        tone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          setDeleteTarget(null);
          const res = await deleteEnquiry(target.id);
          if (res.success) {
            setEnquiries((prev) => prev.filter((x) => x.id !== target.id));
            if (selected?.id === target.id) setSelected(null);
          }
        }}
      />

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 md:hidden"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-[#0B1F3A]">{selected.full_name}</h3>
                  <p className="text-xs text-slate-500">
                    {selected.phone} • {selected.area_in_kano || "Area not specified"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 md:flex"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 whitespace-pre-wrap">
                {selected.message}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#0B1F3A]">Status</label>
                <select
                  value={editStatus}
                  onChange={(e) =>
                    setEditStatus(e.target.value as "new" | "contacted" | "closed")
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-[#0B1F3A]">
                  Internal Note
                </label>
                <textarea
                  rows={4}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Record follow-up notes..."
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm"
                />
              </div>

              {feedback && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                  {feedback}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 p-4">
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className="h-12 w-full rounded-xl bg-[#F5B301] text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                {isPending ? "Saving..." : "Save Enquiry Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
