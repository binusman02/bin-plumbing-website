"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Search, Trash2, Users, X } from "lucide-react";
import { deleteCustomerAction } from "@/app/actions/marketplace-actions";
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
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A]">Customers Directory</h2>
          <p className="text-sm text-slate-500">
            View customer profiles, area, request history, assigned plumbers, payments, and complaints.
          </p>
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

      {feedback && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-[#0B1F3A]">
          {feedback}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No customers found</p>
          <p className="mt-1 text-sm text-slate-500">
            Customers who register, submit a request, or send an enquiry appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Area</th>
                  <th className="px-4 py-3">Requests</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr
                    key={`${c.id}-${c.phone}`}
                    onClick={() => {
                      setSelected(c);
                      setConfirmDelete(false);
                    }}
                    className="cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-[#0B1F3A]">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.phone}</p>
                    </td>
                    <td className="px-4 py-3.5 text-slate-700">{c.area}</td>
                    <td className="px-4 py-3.5 font-semibold text-[#0B1F3A]">
                      {c.requests.length}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{c.source}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">
                      {formatDateTime(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((c) => (
              <button
                key={`${c.id}-${c.phone}`}
                type="button"
                onClick={() => {
                  setSelected(c);
                  setConfirmDelete(false);
                }}
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
