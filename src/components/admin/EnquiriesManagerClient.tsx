"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, ArrowLeft, CheckCircle2, Download, Eye, Mail, Search, Trash2, X } from "lucide-react";
import { deleteEnquiry } from "@/app/actions/admin-management";
import { saveEnquiryNoteAction } from "@/app/actions/marketplace-actions";
import { ActionMenu, ConfirmDialog } from "@/components/ui";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
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
    <div className="space-y-3 pb-20 lg:pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Enquiries" },
            { id: "new", label: "New" },
            { id: "contacted", label: "Contacted" },
            { id: "closed", label: "Closed" },
          ].map((tab) => {
            const count =
              tab.id === "all"
                ? enriched.length
                : enriched.filter((e) => e.resolvedStatus === tab.id).length;
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                  active
                    ? "bg-[#0B1F3A] text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
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
              placeholder="Search sender, phone, area..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-xs">
          <Mail className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No enquiries found</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Sender Name</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Phone</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Location / Area</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Message Summary</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Stage</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Date</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => {
                  const badge = getStatusMeta(item.resolvedStatus);
                  return (
                    <tr
                      key={item.id}
                      className="group transition-colors hover:bg-slate-50/90"
                    >
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 font-semibold text-[#0B1F3A] group-hover:underline">
                        {item.full_name}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                        {item.phone}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-700">
                        {item.area_in_kano || "Not specified"}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer max-w-xs truncate px-3.5 py-2.5 text-xs text-slate-700">
                        {item.message}
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td onClick={() => openDetail(item)} className="cursor-pointer whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
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
                <ClassicSelect
                  value={editStatus}
                  onChange={(val) =>
                    setEditStatus(val as "new" | "contacted" | "closed")
                  }
                  options={[
                    { value: "new", label: "New" },
                    { value: "contacted", label: "Contacted" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
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
