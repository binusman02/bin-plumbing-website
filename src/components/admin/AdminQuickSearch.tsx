"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HardHat, Loader2, Search, User, Wrench, X } from "lucide-react";

interface SearchResults {
  requests: Array<{
    id: string;
    ticket_number: string;
    customer_name: string;
    customer_phone: string;
    status: string;
  }>;
  customers: Array<{
    id: string;
    full_name: string;
    phone: string;
    email: string | null;
  }>;
  plumbers: Array<{
    id: string;
    full_name: string;
    phone: string;
    application_ref: string;
    verification_status: string;
  }>;
}

export function AdminQuickSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({
    requests: [],
    customers: [],
    plumbers: [],
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults({ requests: [], customers: [], plumbers: [] });
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(trimmed)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const totalCount =
    results.requests.length + results.customers.length + results.plumbers.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100 sm:px-3"
        aria-label="Quick search"
      >
        <Search className="h-3.5 w-3.5 text-slate-500" />
        <span className="hidden md:inline">Search...</span>
        <kbd className="hidden rounded border border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 lg:inline">
          Ctrl+K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 pt-16 backdrop-blur-[1px]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search request ref (BP-...), customer, or plumber..."
                className="flex-1 bg-transparent text-sm text-[#0B1F3A] placeholder:text-slate-400 focus:outline-none"
              />
              {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {query.trim().length < 2 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  Type at least 2 characters to search requests, customers, or plumbers.
                </p>
              ) : !loading && totalCount === 0 ? (
                <p className="py-8 text-center text-xs text-slate-500">
                  No matching requests, customers, or plumbers found.
                </p>
              ) : (
                <div className="space-y-4">
                  {results.requests.length > 0 && (
                    <div>
                      <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Service Requests
                      </p>
                      <div className="space-y-1">
                        {results.requests.map((r) => (
                          <Link
                            key={r.id}
                            href={`/admin/requests?q=${encodeURIComponent(r.ticket_number)}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2.5">
                              <Wrench className="h-4 w-4 text-[#0B1F3A]" />
                              <div>
                                <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                                  {r.ticket_number}
                                </span>
                                <span className="ml-2 text-slate-700">{r.customer_name}</span>
                              </div>
                            </div>
                            <span className="text-xs text-slate-400">{r.customer_phone}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.customers.length > 0 && (
                    <div>
                      <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Customers
                      </p>
                      <div className="space-y-1">
                        {results.customers.map((c) => (
                          <Link
                            key={c.id}
                            href="/admin/customers"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2.5">
                              <User className="h-4 w-4 text-[#0B1F3A]" />
                              <span className="font-medium text-[#0B1F3A]">{c.full_name}</span>
                            </div>
                            <span className="text-xs text-slate-400">{c.phone}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}

                  {results.plumbers.length > 0 && (
                    <div>
                      <p className="mb-1.5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Plumbers
                      </p>
                      <div className="space-y-1">
                        {results.plumbers.map((p) => (
                          <Link
                            key={p.id}
                            href="/admin/plumbers"
                            onClick={() => setOpen(false)}
                            className="flex items-center justify-between rounded-xl px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            <div className="flex items-center gap-2.5">
                              <HardHat className="h-4 w-4 text-[#F5B301]" />
                              <span className="font-medium text-[#0B1F3A]">{p.full_name}</span>
                            </div>
                            <span className="text-xs text-slate-400">{p.phone}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
