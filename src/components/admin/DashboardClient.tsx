"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRealtimeHub } from "@/lib/realtime-hub";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckCircle2,
  CreditCard,
  Eye,
  FileText,
  HardHat,
  Heart,
  Mail,
  MessageCircle,
  MessageSquareWarning,
  Wallet,
} from "lucide-react";
import type { GuideRecord, PlumberProfile, StructuredQuotation, ServiceRequestRecord } from "@/lib/marketplace";
import type { BlogEngagementMap } from "@/lib/blog-engagement";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";

interface DashboardMetrics {
  totalEnquiries: number;
  unreadEnquiries: number;
  totalRequests: number;
  newRequestsCount: number;
  awaitingQualificationCount: number;
  qualifiedCount: number;
  assignedJobsCount: number;
  activeJobsCount: number;
  completedJobsCount: number;
  cancelledJobsCount: number;
  registeredPlumbersCount: number;
  approvedPlumbersCount: number;
  revenueCollected: number;
  outstandingPayments: number;
  companyCommission: number;
  openComplaintsCount: number;
}

interface DashboardClientProps {
  metrics: DashboardMetrics;
  latestRequests: ServiceRequestRecord[];
  pendingPlumbers: PlumberProfile[];
  pendingQuotations: StructuredQuotation[];
  unverifiedPaymentsCount: number;
  categoryBreakdown: { name: string; count: number }[];
  approvedPlumbers?: PlumberProfile[];
  initialOnlinePlumberIds?: string[];
  recentGuides?: GuideRecord[];
  blogEngagementMap?: BlogEngagementMap;
}

export function DashboardClient({
  metrics,
  latestRequests,
  pendingPlumbers,
  pendingQuotations,
  unverifiedPaymentsCount,
  categoryBreakdown,
  approvedPlumbers = [],
  initialOnlinePlumberIds = [],
  recentGuides = [],
  blogEngagementMap = {},
}: DashboardClientProps) {
  const [onlinePlumberIds, setOnlinePlumberIds] = useState<string[]>(
    initialOnlinePlumberIds
  );
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of approvedPlumbers) {
      map[p.id] = Boolean(p.is_available);
    }
    return map;
  });

  useEffect(() => {
    setOnlinePlumberIds(initialOnlinePlumberIds);
  }, [initialOnlinePlumberIds]);

  useEffect(() => {
    const map: Record<string, boolean> = {};
    for (const p of approvedPlumbers) {
      map[p.id] = Boolean(p.is_available);
    }
    setAvailabilityMap(map);
  }, [approvedPlumbers]);

  useRealtimeHub({
    role: "admin",
    onPresenceSync: (p) => {
      if (p.onlinePlumberIds.length > 0) {
        setOnlinePlumberIds(p.onlinePlumberIds);
      }
      if (Object.keys(p.availabilityUpdates).length > 0) {
        setAvailabilityMap((prev) => ({ ...prev, ...p.availabilityUpdates }));
      }
    },
    onAvailability: ({ plumberId, isAvailable }) => {
      setAvailabilityMap((prev) => ({ ...prev, [plumberId]: isAvailable }));
    },
  });

  useEffect(() => {
    let active = true;
    const syncOnce = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/chat/presence", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (Array.isArray(data?.presence?.onlinePlumberIds)) {
          setOnlinePlumberIds(data.presence.onlinePlumberIds);
        }
        if (data?.plumberAvailability && typeof data.plumberAvailability === "object") {
          setAvailabilityMap(data.plumberAvailability);
        }
      } catch {}
    };
    const id = window.setInterval(syncOnce, 30000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  const sortedPlumbers = useMemo(() => {
    const onlineSet = new Set(onlinePlumberIds);
    return [...approvedPlumbers].sort((a, b) => {
      const aOnline = onlineSet.has(a.id) ? 1 : 0;
      const bOnline = onlineSet.has(b.id) ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      if (aOnline && bOnline) {
        const aAvail = (availabilityMap[a.id] ?? a.is_available) ? 1 : 0;
        const bAvail = (availabilityMap[b.id] ?? b.is_available) ? 1 : 0;
        if (aAvail !== bAvail) return bAvail - aAvail;
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [approvedPlumbers, onlinePlumberIds, availabilityMap]);

  const onlineCount = useMemo(() => {
    const onlineSet = new Set(onlinePlumberIds);
    return approvedPlumbers.filter((p) => onlineSet.has(p.id)).length;
  }, [approvedPlumbers, onlinePlumberIds]);
  const offlineCount = Math.max(0, approvedPlumbers.length - onlineCount);
  const primaryCards = [
    {
      label: "New Requests",
      value: String(metrics.newRequestsCount),
      sub: `${metrics.totalRequests} total requests`,
      href: "/admin/requests",
      icon: Briefcase,
    },
    {
      label: "Active Jobs",
      value: String(metrics.activeJobsCount),
      sub: `${metrics.assignedJobsCount} assigned • ${metrics.qualifiedCount} qualified`,
      href: "/admin/requests",
      icon: CheckCircle2,
    },
    {
      label: "Approved Plumbers",
      value: String(metrics.approvedPlumbersCount),
      sub: `${metrics.registeredPlumbersCount} total applications`,
      href: "/admin/plumbers",
      icon: HardHat,
    },
    {
      label: "Revenue Collected",
      value: formatNGN(metrics.revenueCollected),
      sub: `Commission: ${formatNGN(metrics.companyCommission)}`,
      href: "/admin/financials",
      icon: Wallet,
    },
    {
      label: "Outstanding Payments",
      value: formatNGN(metrics.outstandingPayments),
      sub: `${unverifiedPaymentsCount} awaiting verification`,
      href: "/admin/financials",
      icon: CreditCard,
    },
    {
      label: "Open Complaints",
      value: String(metrics.openComplaintsCount),
      sub: `${metrics.unreadEnquiries} unread enquiries`,
      href: "/admin/complaints",
      icon: MessageSquareWarning,
    },
  ];

  const secondaryMetrics = [
    { label: "Total Enquiries", value: metrics.totalEnquiries },
    { label: "Awaiting Qualification", value: metrics.awaitingQualificationCount },
    { label: "Completed Jobs", value: metrics.completedJobsCount },
    { label: "Cancelled Jobs", value: metrics.cancelledJobsCount },
  ];

  const totalCategoryCount = categoryBreakdown.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A] sm:text-2xl">Operations Overview</h2>
          <p className="text-sm text-slate-500">
            Live figures from service requests, plumber applications, quotations, and verified payments.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Link
            href="/admin/requests"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-semibold text-white transition hover:bg-[#132f57] sm:px-4 sm:text-sm"
          >
            Manage Requests
            <ArrowRight className="h-4 w-4 shrink-0" />
          </Link>
          <Link
            href="/admin/plumbers"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-[#0B1F3A] transition hover:bg-slate-50 sm:px-4 sm:text-sm"
          >
            Review Plumbers
          </Link>
        </div>
      </div>

      {/* Action-Needed Queue & Live Fleet Summary */}
      {(metrics.newRequestsCount > 0 ||
        pendingPlumbers.length > 0 ||
        unverifiedPaymentsCount > 0 ||
        metrics.openComplaintsCount > 0 ||
        approvedPlumbers.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {onlineCount} Online • {offlineCount} Offline
          </span>
          {metrics.newRequestsCount > 0 && (
            <Link
              href="/admin/requests"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#F5B301] bg-amber-50 px-3 py-1 text-xs font-bold text-[#0B1F3A] hover:bg-amber-100"
            >
              {metrics.newRequestsCount} New Request{metrics.newRequestsCount > 1 ? "s" : ""}
            </Link>
          )}
          {pendingPlumbers.length > 0 && (
            <Link
              href="/admin/plumbers"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
            >
              {pendingPlumbers.length} Pending Plumber{pendingPlumbers.length > 1 ? "s" : ""}
            </Link>
          )}
          {unverifiedPaymentsCount > 0 && (
            <Link
              href="/admin/financials"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
            >
              {unverifiedPaymentsCount} Unverified Payment{unverifiedPaymentsCount > 1 ? "s" : ""}
            </Link>
          )}
          {metrics.openComplaintsCount > 0 && (
            <Link
              href="/admin/complaints"
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-100"
            >
              {metrics.openComplaintsCount} Open Complaint{metrics.openComplaintsCount > 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}

      {/* Primary Stat Cards (max 6) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {primaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="group flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#F5B301]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider leading-snug text-slate-500">
                  {card.label}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A]/5 text-[#0B1F3A] transition group-hover:bg-[#F5B301]/15 group-hover:text-[#0B1F3A]">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="mt-3">
                <p className="truncate text-xl font-bold text-[#0B1F3A] sm:text-2xl">
                  {card.value}
                </p>
                <p className="mt-1 truncate text-xs text-slate-500">{card.sub}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Secondary Counts Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {secondaryMetrics.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <span className="text-sm text-slate-600">{item.label}</span>
            <span className="text-base font-bold text-[#0B1F3A]">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Two-column main content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Latest 5 requests + real category breakdown */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">Latest Service Requests</h3>
                <p className="text-xs text-slate-500">Most recent 5 bookings in the system</p>
              </div>
              <Link
                href="/admin/requests"
                className="text-sm font-semibold text-[#0B1F3A] hover:underline"
              >
                View all
              </Link>
            </div>

            {latestRequests.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No service requests yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {latestRequests.map((req) => {
                  const badge = getStatusMeta(req.status);
                  return (
                    <Link
                      key={req.id}
                      href="/admin/requests"
                      className="flex items-start justify-between gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                            {req.ticket_number}
                          </span>
                          <span className="text-sm font-semibold text-slate-800">
                            {req.customer_name || req.property_type}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {req.problem_category || req.property_type} • {req.address_in_kano}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatDateTime(req.created_at)}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {/* Real Service Category Breakdown (only when data exists) */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-base font-bold text-[#0B1F3A]">Requests by Service Type</h3>
            <p className="text-xs text-slate-500">Calculated directly from recorded requests</p>

            {totalCategoryCount === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">No data yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {categoryBreakdown.map((item) => {
                  const pct = Math.round((item.count / totalCategoryCount) * 100);
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-700">{item.name}</span>
                        <span className="font-semibold text-[#0B1F3A]">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#0B1F3A]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right: Needs Attention */}
        <div className="space-y-6 lg:col-span-5">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0B1F3A]">Needs Attention</h3>
              <Link
                href="/admin/notifications"
                className="text-xs font-semibold text-[#0B1F3A] hover:underline"
              >
                Open Queue
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {pendingPlumbers.length === 0 &&
              pendingQuotations.length === 0 &&
              unverifiedPaymentsCount === 0 &&
              metrics.unreadEnquiries === 0 &&
              metrics.openComplaintsCount === 0 ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center">
                  <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
                  <p className="text-sm font-semibold text-slate-700">No urgent items waiting</p>
                </div>
              ) : (
                <>
                  {pendingPlumbers.map((plumber) => {
                    const badge = getStatusMeta(plumber.verification_status);
                    return (
                      <Link
                        key={plumber.id}
                        href="/admin/plumbers"
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-[#F5B301]"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#0B1F3A]">
                            Plumber Review: {plumber.full_name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {plumber.application_ref || plumber.phone}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </Link>
                    );
                  })}

                  {pendingQuotations.map((quote) => (
                    <Link
                      key={quote.id}
                      href="/admin/requests"
                      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 transition hover:border-[#F5B301]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B1F3A]">
                          Quote Approval: {quote.ticket_number}
                        </p>
                        <p className="text-xs text-slate-600">
                          {quote.plumber_name} • {formatNGN(quote.total_amount)}
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                        <FileText className="h-5 w-5" />
                      </span>
                    </Link>
                  ))}

                  {unverifiedPaymentsCount > 0 && (
                    <Link
                      href="/admin/financials"
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-[#F5B301]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0B1F3A]">
                          Payments Pending Verification
                        </p>
                        <p className="text-xs text-slate-500">
                          {unverifiedPaymentsCount} payment(s) awaiting confirmation
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A]/5 text-[#0B1F3A]">
                        <CreditCard className="h-5 w-5" />
                      </span>
                    </Link>
                  )}

                  {metrics.unreadEnquiries > 0 && (
                    <Link
                      href="/admin/enquiries"
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-[#F5B301]"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#0B1F3A]">
                          Unread Direct Enquiries
                        </p>
                        <p className="text-xs text-slate-500">
                          {metrics.unreadEnquiries} enquiry message(s) unread
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F3A]/5 text-[#0B1F3A]">
                        <Mail className="h-5 w-5" />
                      </span>
                    </Link>
                  )}

                  {metrics.openComplaintsCount > 0 && (
                    <Link
                      href="/admin/complaints"
                      className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50/40 p-3.5 transition hover:border-red-300"
                    >
                      <div>
                        <p className="text-sm font-semibold text-red-800">
                          Open Customer Complaints
                        </p>
                        <p className="text-xs text-red-700">
                          {metrics.openComplaintsCount} complaint(s) need response
                        </p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600">
                        <AlertCircle className="h-5 w-5" />
                      </span>
                    </Link>
                  )}
                </>
              )}
            </div>
          </section>

          {/* Live Online & Offline Plumbers for Job Assignment */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">
                  Plumbers Status
                </h3>
                <p className="text-xs text-slate-500">
                  Live online &amp; offline technicians ready for job assignment
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Online ({onlineCount})
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Offline ({offlineCount})
                </span>
              </div>
            </div>

            {sortedPlumbers.length === 0 ? (
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
                No approved plumbers yet.
              </div>
            ) : (
              <div className="mt-4 max-h-80 space-y-2.5 overflow-y-auto pr-1">
                {sortedPlumbers.map((plumber) => {
                  const isOnline = onlinePlumberIds.includes(plumber.id);
                  const isAvail = availabilityMap[plumber.id] ?? plumber.is_available;
                  const statusLabel = !isOnline
                    ? "Offline"
                    : isAvail
                      ? "Online • Available"
                      : "Online • Unavailable";
                  const statusClass = !isOnline
                    ? "bg-slate-100 text-slate-600"
                    : isAvail
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-800";
                  const dotClass = !isOnline
                    ? "bg-slate-300"
                    : isAvail
                      ? "bg-emerald-500"
                      : "bg-amber-500";

                  return (
                    <div
                      key={plumber.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-[#F5B301]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-[#0B1F3A]">
                              {plumber.full_name}
                            </p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusClass}`}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-500">
                            {plumber.skills?.[0] || plumber.residential_location}
                          </p>
                        </div>
                      </div>

                      <Link
                        href="/admin/requests"
                        className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-[#0B1F3A] transition hover:border-[#F5B301] hover:bg-[#F5B301]/15"
                      >
                        Assign
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Recent Blog Posts & Engagement */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-[#0B1F3A]">
                <BookOpen className="h-5 w-5 text-[#F5B301]" />
                Recent Blog Posts &amp; Reader Engagement
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Latest English &amp; Hausa plumbing guides with live views, likes, and comments
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(() => {
                const entries = Object.values(blogEngagementMap);
                const totalViews = entries.reduce((acc, e) => acc + (e.views || 0), 0);
                const totalLikes = entries.reduce((acc, e) => acc + (e.likes || 0), 0);
                const totalComments = entries.reduce(
                  (acc, e) => acc + (e.comments?.length || 0),
                  0
                );
                return (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      <Eye className="h-3.5 w-3.5" />
                      {totalViews} Views
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                      <Heart className="h-3.5 w-3.5" />
                      {totalLikes} Likes
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {totalComments} Comments
                    </span>
                  </>
                );
              })()}
              <Link
                href="/admin/guides"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#132E54]"
              >
                Manage Blog
                <ArrowRight className="h-3.5 w-3.5 text-[#F5B301]" />
              </Link>
            </div>
          </div>

          {recentGuides.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No blog posts yet.{" "}
              <Link href="/admin/guides" className="font-semibold text-[#0B1F3A] underline">
                Open Blog &amp; Guides
              </Link>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {recentGuides.map((post) => {
                const eng = blogEngagementMap[post.id] || {
                  views: 0,
                  likes: 0,
                  comments: [],
                };
                const isPublished =
                  post.status === "published" ||
                  post.en_status === "published" ||
                  post.ha_status === "published";
                const enUrl = post.en_slug ? `/en/blog/${post.en_slug}` : null;
                const haUrl = post.ha_slug ? `/ha/blog/${post.ha_slug}` : null;

                return (
                  <div
                    key={post.id}
                    className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 transition hover:border-[#F5B301]"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
                          {post.category || "Plumbing Guide"}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            isPublished
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {isPublished ? "Published" : "Draft"}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-bold text-[#0B1F3A]">
                        {post.en_title || post.title}
                      </p>
                      {post.ha_title && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                          HA: {post.ha_title}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          {eng.views}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="h-3.5 w-3.5 text-rose-500" />
                          {eng.likes}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3.5 w-3.5" />
                          {eng.comments.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {enUrl && (
                          <Link
                            href={enUrl}
                            target="_blank"
                            className="font-semibold text-[#0B1F3A] hover:text-[#E0A200]"
                          >
                            EN
                          </Link>
                        )}
                        {haUrl && (
                          <Link
                            href={haUrl}
                            target="_blank"
                            className="font-semibold text-[#0B1F3A] hover:text-[#E0A200]"
                          >
                            HA
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
