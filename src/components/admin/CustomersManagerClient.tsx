"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Eye, Loader2, MapPin, MessageCircle, Pencil, Phone, Save, Search, Trash2, Users, X } from "lucide-react";
import { adminUpdateCustomerRecordAction, deleteCustomerAction } from "@/app/actions/marketplace-actions";
import { Avatar } from "@/components/ui";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  ComplaintRecord,
  PaymentRecord,
  ServiceRequestRecord,
} from "@/lib/marketplace";

export interface CustomerDirectoryEntry {
  id: string;
  name: string;
  phone: string;
  area: string;
  source: string;
  createdAt: string;
  requests: ServiceRequestRecord[];
  payments: PaymentRecord[];
  complaints: ComplaintRecord[];
  messagesCount: number;
}

interface CustomersManagerClientProps {
  initialCustomers: CustomerDirectoryEntry[];
}

export function CustomersManagerClient({ initialCustomers }: CustomersManagerClientProps) {
  const [customers, setCustomers] = useState<CustomerDirectoryEntry[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerDirectoryEntry | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editArea, setEditArea] = useState("");

  const openCustomerDetail = (c: CustomerDirectoryEntry) => {
    setSelected(c);
    setEditName(c.name || "");
    setEditPhone(c.phone || "");
    setEditArea(c.area || "");
    setConfirmDelete(false);
    setFeedback(null);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    startTransition(async () => {
      const res = await adminUpdateCustomerRecordAction({
        customerId: selected.id,
        oldPhone: selected.phone,
        name: editName,
        phone: editPhone,
        area: editArea,
      });
      if (res.success) {
        const updated: CustomerDirectoryEntry = {
          ...selected,
          name: editName.trim(),
          phone: editPhone.trim(),
          area: editArea.trim() || "Kano",
        };
        setCustomers((prev) =>
          prev.map((x) => (x.id === selected.id && x.phone === selected.phone ? updated : x))
        );
        setSelected(updated);
        setFeedback(`Saved changes for ${updated.name}.`);
      } else {
        setFeedback(res.error || "Could not update customer contact.");
      }
    });
  };

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.area.toLowerCase().includes(q)
    );
  });

  const handleDelete = (customer: CustomerDirectoryEntry) => {
    startTransition(async () => {
      const res = await deleteCustomerAction(customer.id);
      if (res.success) {
        setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
        setSelected(null);
        setConfirmDelete(false);
        setFeedback(`Deleted customer record for ${customer.name}.`);
      } else {
        setFeedback(res.error || "Could not delete customer record.");
      }
    });
  };

  return (
    <div className="space-y-3 pb-20 lg:pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0B1F3A]">
            <span>All Contacts</span>
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              {filtered.length}
            </span>
          </span>
          <span className="hidden text-xs text-slate-500 sm:inline">
            Customer profiles, service history, assigned plumbers, and lifetime value.
          </span>
        </div>
        <div className="relative w-56 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contact name, phone, area..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-[#0B1F3A]">
          {feedback}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-xs">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No customers found</p>
          <p className="mt-1 text-sm text-slate-500">
            Customers who register, submit a request, or send an enquiry appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Contact Name</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Phone</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Location / Area</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Deals / Requests</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Total Paid</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Source</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Added Date</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const totalPaid = c.payments.reduce((acc, p) => acc + (p.total_payment || 0), 0);
                  return (
                    <tr
                      key={`${c.id}-${c.phone}`}
                      onClick={() => openCustomerDetail(c)}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/90"
                    >
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <div className="inline-flex items-center gap-2">
                          <Avatar name={c.name} size="xs" />
                          <span className="font-semibold text-[#0B1F3A] group-hover:underline">
                            {c.name}
                          </span>
                          <Eye className="h-3.5 w-3.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                        {c.phone || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {c.area}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#0B1F3A]">
                          {c.requests.length}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-slate-800">
                        {totalPaid > 0 ? formatNGN(totalPaid) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                        {c.source}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-500">
                        {new Date(c.createdAt).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td
                        className="whitespace-nowrap px-3.5 py-2.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {c.phone && (
                            <>
                              <a
                                href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}
                                title="Call Customer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-[#0B1F3A]"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                              <a
                                href={`https://wa.me/${c.phone.replace(/[^0-9]/g, "").replace(/^0/, "234")}`}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp Customer"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openCustomerDetail(c)}
                            title="Edit customer contact"
                            aria-label="Edit customer contact"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-[#0B1F3A] transition-colors hover:border-[#0B1F3A]/40 hover:bg-slate-50"
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#0B1F3A]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span>
                  Total Contacts <strong className="ml-1 font-bold text-slate-900">{customers.length}</strong>
                </span>
                <span>
                  Active With Requests{" "}
                  <strong className="ml-1 font-bold text-slate-900">
                    {customers.filter((c) => c.requests.length > 0).length}
                  </strong>
                </span>
              </div>
              <span className="font-semibold text-slate-700">
                1 to {filtered.length}
              </span>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((c) => (
              <button
                key={`${c.id}-${c.phone}`}
                type="button"
                onClick={() => openCustomerDetail(c)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#0B1F3A]">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.phone}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                    {c.requests.length} req
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-slate-600">{c.area}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50">
          <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 md:hidden"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <h3 className="text-lg font-bold text-[#0B1F3A]">{selected.name}</h3>
                  <p className="text-xs text-slate-500">
                    {selected.phone} • Area: {selected.area}
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

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Editable Contact Profile Card */}
              <form
                onSubmit={handleSaveCustomer}
                className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                    Edit Contact Details
                  </h4>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 text-xs font-bold text-white hover:bg-[#132c52] disabled:opacity-60"
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5B301]" />
                    ) : (
                      <Save className="h-3.5 w-3.5 text-[#F5B301]" />
                    )}
                    <span>{isPending ? "Saving..." : "Save Contact"}</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Contact Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      Area / Location
                    </label>
                    <input
                      type="text"
                      value={editArea}
                      onChange={(e) => setEditArea(e.target.value)}
                      className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                </div>
              </form>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Requests</p>
                  <p className="text-lg font-bold text-[#0B1F3A]">{selected.requests.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Messages</p>
                  <p className="text-lg font-bold text-[#0B1F3A]">{selected.messagesCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Complaints</p>
                  <p className="text-lg font-bold text-[#0B1F3A]">{selected.complaints.length}</p>
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-bold text-[#0B1F3A]">Request History</h4>
                {selected.requests.length === 0 ? (
                  <p className="text-sm text-slate-500">No service requests linked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.requests.map((r) => {
                      const badge = getStatusMeta(r.status);
                      return (
                        <div
                          key={r.id}
                          className="rounded-xl border border-slate-200 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                              {r.ticket_number}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700">
                            {r.problem_category || r.property_type}
                          </p>
                          <p className="text-xs text-slate-500">
                            Plumber: {r.assigned_technician || "Unassigned"} •{" "}
                            {formatDateTime(r.created_at)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <h4 className="mb-2 text-sm font-bold text-[#0B1F3A]">Payments</h4>
                {selected.payments.length === 0 ? (
                  <p className="text-sm text-slate-500">No payments recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {selected.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm"
                      >
                        <div>
                          <p className="font-mono text-xs font-bold">{p.ticket_number}</p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(p.payment_date || p.created_at)}
                          </p>
                        </div>
                        <span className="font-bold text-[#0B1F3A]">
                          {formatNGN(p.total_payment)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 bg-white p-4">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:bg-red-100"
                >
                  <Trash2 className="h-4 w-4" /> Delete Customer Record
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-xs font-semibold text-red-700">
                    Confirm permanent deletion of this customer record? (Logged in Audit Log)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleDelete(selected)}
                      className="h-11 flex-1 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700"
                    >
                      {isPending ? "Deleting..." : "Confirm Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
