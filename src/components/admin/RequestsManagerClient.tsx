"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowUpDown,
  Bookmark,
  CheckSquare,
  Columns3,
  Eye,
  FilterX,
  List,
  MapPin,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  archiveServiceRequestAction,
  assignPlumberToRequestAction,
  bulkUpdateRequestsAction,
  customerQuotationDecisionAction,
  deleteCrmViewAction,
  deleteServiceRequestSafelyAction,
  getSavedCrmViewsAction,
  saveCrmViewAction,
  updateRequestStatusByTicketAction,
  type CrmSavedView,
} from "@/app/actions/marketplace-actions";
import { updateRequestDetails } from "@/app/actions/admin-management";
import { ActionMenu, Avatar, ConfirmDialog } from "@/components/ui";
import {
  extractCustomerContact,
  REQUEST_STATUS_OPTIONS as STATUS_OPTIONS,
  RequestDetailDrawer,
} from "@/components/admin/requests/RequestDetailDrawer";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { useRealtimeHub } from "@/lib/realtime-hub";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  JobMessage,
  PaymentRecord,
  PlumberProfile,
  RequestStatus,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

interface RequestsManagerClientProps {
  initialRequests: ServiceRequestRecord[];
  vettedPlumbers?: PlumberProfile[];
  initialQuotations?: StructuredQuotation[];
  initialMessages?: JobMessage[];
  initialPayments?: PaymentRecord[];
}

const BOARD_COLUMNS: { id: string; title: string; targetStatus: RequestStatus; statuses: string[] }[] = [
  { id: "new", title: "New", targetStatus: "new", statuses: ["new"] },
  {
    id: "qualified",
    title: "Qualified & Scheduled",
    targetStatus: "scheduled",
    statuses: ["contacted", "scheduled", "inspection_required"],
  },
  {
    id: "quote",
    title: "Quote & Approval",
    targetStatus: "awaiting_approval",
    statuses: ["quotation_submitted", "awaiting_approval", "approved"],
  },
  { id: "progress", title: "In Progress", targetStatus: "in_progress", statuses: ["in_progress"] },
  {
    id: "done",
    title: "Payment & Done",
    targetStatus: "completed",
    statuses: ["work_completed", "awaiting_final_payment", "completed"],
  },
];

type ColumnKey =
  | "ticket"
  | "customer"
  | "phone"
  | "service"
  | "location"
  | "priority"
  | "plumber"
  | "quote"
  | "status"
  | "appointment"
  | "updated";

const ALL_COLUMNS: { key: ColumnKey; label: string; defaultVisible: boolean }[] = [
  { key: "ticket", label: "Ticket", defaultVisible: true },
  { key: "customer", label: "Customer", defaultVisible: true },
  { key: "phone", label: "Phone", defaultVisible: false },
  { key: "service", label: "Service", defaultVisible: true },
  { key: "location", label: "Location", defaultVisible: true },
  { key: "priority", label: "Priority", defaultVisible: true },
  { key: "plumber", label: "Assigned Plumber", defaultVisible: true },
  { key: "quote", label: "Quotation", defaultVisible: true },
  { key: "status", label: "Status", defaultVisible: true },
  { key: "appointment", label: "Appointment", defaultVisible: false },
  { key: "updated", label: "Last Updated", defaultVisible: true },
];

interface BuiltInView {
  id: string;
  label: string;
  apply: (r: ServiceRequestRecord, unreadTickets: Set<string>) => boolean;
}

const BUILT_IN_VIEWS: BuiltInView[] = [
  { id: "all", label: "All Requests", apply: (r) => !r.archived_at && !r.deleted_at },
  { id: "new", label: "New", apply: (r) => !r.archived_at && r.status === "new" },
  { id: "unassigned", label: "Unassigned", apply: (r) => !r.archived_at && !r.assigned_plumber_id && !r.assigned_technician },
  { id: "urgent", label: "Urgent", apply: (r) => !r.archived_at && r.priority === "urgent" },
  { id: "assigned", label: "Assigned", apply: (r) => !r.archived_at && Boolean(r.assigned_plumber_id || r.assigned_technician) },
  { id: "inspection", label: "Awaiting Inspection", apply: (r) => !r.archived_at && (r.status === "scheduled" || r.status === "inspection_required") },
  { id: "approval", label: "Awaiting Approval", apply: (r) => !r.archived_at && (r.status === "quotation_submitted" || r.status === "awaiting_approval") },
  { id: "in_progress", label: "In Progress", apply: (r) => !r.archived_at && r.status === "in_progress" },
  { id: "completed", label: "Completed", apply: (r) => !r.archived_at && r.status === "completed" },
  { id: "cancelled", label: "Cancelled", apply: (r) => !r.archived_at && r.status === "cancelled" },
  { id: "archived", label: "Archived", apply: (r) => Boolean(r.archived_at) || Boolean(r.deleted_at) },
];

export function RequestsManagerClient({
  initialRequests,
  vettedPlumbers = [],
  initialQuotations = [],
  initialMessages = [],
  initialPayments = [],
}: RequestsManagerClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [requests, setRequests] = useState<ServiceRequestRecord[]>(initialRequests);
  const [quotations, setQuotations] = useState<StructuredQuotation[]>(initialQuotations);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string>("all");
  const [customViews, setCustomViews] = useState<CrmSavedView[]>([]);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [plumberFilter, setPlumberFilter] = useState("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<"all" | "today" | "7d" | "30d">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Table state
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(
    ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key)
  );
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [sortKey, setSortKey] = useState<"created_at" | "updated_at" | "ticket" | "customer" | "priority" | "quote" | "status">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Detail drawer state
  const [selected, setSelected] = useState<ServiceRequestRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editStatus, setEditStatus] = useState<string>("new");
  const [editPriority, setEditPriority] = useState<"standard" | "urgent">("standard");
  const [editPlumberId, setEditPlumberId] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editQuotedAmount, setEditQuotedAmount] = useState<string>("");
  const [editPreferredDate, setEditPreferredDate] = useState<string>("");

  // Confirm delete dialog
  const [deleteTarget, setDeleteTarget] = useState<ServiceRequestRecord | null>(null);

  // Drag and drop state
  const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // Presence
  const [onlinePlumberIds, setOnlinePlumberIds] = useState<string[]>([]);
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of vettedPlumbers) {
      map[p.id] = Boolean(p.is_available);
    }
    return map;
  });

  useEffect(() => {
    let active = true;
    getSavedCrmViewsAction("service_requests").then((views) => {
      if (active && views.length > 0) setCustomViews(views);
    });
    fetch("/api/chat/presence", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data?.presence?.onlinePlumberIds)) {
          setOnlinePlumberIds(data.presence.onlinePlumberIds);
        }
        if (data?.plumberAvailability && typeof data.plumberAvailability === "object") {
          setAvailabilityMap(data.plumberAvailability);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Open ticket from ?ticket= query param
  useEffect(() => {
    const ticketParam = searchParams.get("ticket");
    if (ticketParam) {
      const found = requests.find((r) => r.ticket_number.toLowerCase() === ticketParam.toLowerCase());
      if (found) {
        setSelected(found);
        setEditStatus(found.status);
        setEditPriority(found.priority || "standard");
        setEditPlumberId(found.assigned_plumber_id || "");
        setEditNotes(found.internal_notes || "");
        setEditQuotedAmount(found.quoted_amount ? String(found.quoted_amount) : "");
        setEditPreferredDate(found.preferred_date || "");
        setFeedback(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useRealtimeHub({
    role: "admin",
    onPresenceSync: (p) => {
      setOnlinePlumberIds((prev) => Array.from(new Set([...prev, ...p.onlinePlumberIds])));
    },
    onAvailability: (payload: { plumberId: string; isAvailable: boolean }) => {
      setAvailabilityMap((prev) => ({ ...prev, [payload.plumberId]: payload.isAvailable }));
    },
  });

  const approvedPlumbers = useMemo(
    () => vettedPlumbers.filter((p) => p.verification_status === "approved"),
    [vettedPlumbers]
  );

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests) {
      const loc = r.state || r.city_lga || r.address_in_kano;
      if (loc?.trim()) set.add(loc.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [requests]);

  const unreadTickets = useMemo(() => {
    const set = new Set<string>();
    for (const m of initialMessages) {
      if (m.sender_role !== "admin" && !m.admin_read) {
        set.add(m.ticket_number);
      }
    }
    return set;
  }, [initialMessages]);

  const [mountNow] = useState(() => Date.now());

  const filteredRequests = useMemo(() => {
    const now = mountNow;
    const builtIn = BUILT_IN_VIEWS.find((v) => v.id === activeSavedViewId);

    const list = requests.filter((r) => {
      if (builtIn && !builtIn.apply(r, unreadTickets)) return false;

      const contact = extractCustomerContact(r);
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        r.ticket_number.toLowerCase().includes(q) ||
        contact.name.toLowerCase().includes(q) ||
        contact.phone.toLowerCase().includes(q) ||
        r.problem_category.toLowerCase().includes(q) ||
        r.address_in_kano.toLowerCase().includes(q) ||
        (r.city_lga || "").toLowerCase().includes(q) ||
        (r.state || "").toLowerCase().includes(q) ||
        r.issue_description.toLowerCase().includes(q);

      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || r.priority === priorityFilter;
      const locLabel = (r.state || r.city_lga || r.address_in_kano).trim();
      const matchesLocation = locationFilter === "all" || locLabel === locationFilter;
      const matchesPlumber =
        plumberFilter === "all" ||
        (plumberFilter === "unassigned"
          ? !r.assigned_plumber_id && !r.assigned_technician
          : r.assigned_plumber_id === plumberFilter);
      const matchesUnread = !unreadOnly || unreadTickets.has(r.ticket_number);

      let matchesDate = true;
      if (dateRangeFilter !== "all") {
        const createdMs = new Date(r.created_at).getTime();
        const days = dateRangeFilter === "today" ? 1 : dateRangeFilter === "7d" ? 7 : 30;
        matchesDate = now - createdMs <= days * 86400000;
      }

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesLocation &&
        matchesPlumber &&
        matchesUnread &&
        matchesDate
      );
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ticket") cmp = a.ticket_number.localeCompare(b.ticket_number);
      else if (sortKey === "customer") cmp = a.customer_name.localeCompare(b.customer_name);
      else if (sortKey === "priority") cmp = a.priority.localeCompare(b.priority);
      else if (sortKey === "quote") cmp = (a.quoted_amount || 0) - (b.quoted_amount || 0);
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else if (sortKey === "updated_at") cmp = (a.updated_at || a.created_at).localeCompare(b.updated_at || b.created_at);
      else cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [
    requests,
    activeSavedViewId,
    unreadTickets,
    searchQuery,
    statusFilter,
    priorityFilter,
    locationFilter,
    plumberFilter,
    unreadOnly,
    dateRangeFilter,
    sortKey,
    sortDir,
    mountNow,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRequests = useMemo(
    () => filteredRequests.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRequests, safePage, pageSize]
  );

  const openDetail = (req: ServiceRequestRecord) => {
    setSelected(req);
    setEditStatus(req.status);
    setEditPriority(req.priority || "standard");
    setEditPlumberId(req.assigned_plumber_id || "");
    setEditNotes(req.internal_notes || "");
    setEditQuotedAmount(req.quoted_amount ? String(req.quoted_amount) : "");
    setEditPreferredDate(req.preferred_date || "");
    setFeedback(null);
  };

  const handleSaveRequest = async () => {
    if (!selected) return;
    setSaving(true);
    setFeedback(null);

    const chosenPlumber = approvedPlumbers.find((p) => p.id === editPlumberId);
    const techName = chosenPlumber?.full_name || (editPlumberId ? selected.assigned_technician : null) || null;
    const plumberChanged = Boolean(chosenPlumber && chosenPlumber.id !== selected.assigned_plumber_id);

    if (plumberChanged && chosenPlumber) {
      const assignRes = await assignPlumberToRequestAction({
        ticketNumber: selected.ticket_number,
        plumberId: chosenPlumber.id,
        plumberName: chosenPlumber.full_name,
      });
      if (!assignRes.success) {
        setSaving(false);
        setFeedback({ type: "error", text: assignRes.error || "Could not assign plumber." });
        return;
      }
    }

    const statusChanged = editStatus !== selected.status;
    const res = await updateRequestDetails(selected.id, {
      assignedPlumberId: chosenPlumber?.id || (editPlumberId === "" ? null : selected.assigned_plumber_id),
      assignedTechnician: techName,
      quotedAmount: editQuotedAmount ? parseFloat(editQuotedAmount) : undefined,
      internalNotes: editNotes,
      priority: editPriority,
      preferredDate: editPreferredDate || null,
    });

    if (!res.success) {
      setSaving(false);
      setFeedback({ type: "error", text: res.error || "Could not update request details." });
      return;
    }

    if (statusChanged) {
      const statusRes = await updateRequestStatusByTicketAction(
        selected.ticket_number,
        editStatus as RequestStatus,
        editNotes || undefined
      );
      if (!statusRes.success) {
        setSaving(false);
        setFeedback({ type: "error", text: statusRes.error || "Details saved, but status update failed." });
        return;
      }
    }

    setSaving(false);

    const effectiveStatus = statusChanged
      ? (editStatus as RequestStatus)
      : plumberChanged && selected.status === "new"
        ? "contacted"
        : selected.status;

    const updated: ServiceRequestRecord = {
      ...(res.request || selected),
      status: effectiveStatus,
      priority: editPriority,
      assigned_plumber_id: chosenPlumber?.id || (editPlumberId === "" ? undefined : selected.assigned_plumber_id),
      assigned_technician: techName,
      quoted_amount: editQuotedAmount ? parseFloat(editQuotedAmount) : selected.quoted_amount,
      internal_notes: editNotes,
      preferred_date: editPreferredDate || undefined,
    };
    setRequests((prev) => prev.map((r) => (r.id === selected.id ? updated : r)));
    setSelected(updated);
    setEditStatus(effectiveStatus);
    setFeedback({ type: "success", text: "Service request saved to database." });
  };

  const handleBoardDrop = async (targetCol: (typeof BOARD_COLUMNS)[number]) => {
    setDragOverColId(null);
    if (!draggedRequestId) return;
    const req = requests.find((r) => r.id === draggedRequestId);
    setDraggedRequestId(null);
    if (!req || targetCol.statuses.includes(req.status)) return;

    const prevStatus = req.status;
    const nextStatus = targetCol.targetStatus;

    // Optimistic update
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: nextStatus } : r)));
    const res = await updateRequestStatusByTicketAction(req.ticket_number, nextStatus);
    if (!res.success) {
      // Rollback
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: prevStatus } : r)));
      setFeedback({ type: "error", text: res.error || "Could not move stage." });
    }
  };

  const handleBulkAction = async (
    action: "status" | "priority" | "assign" | "archive" | "restore",
    extra?: { status?: RequestStatus; priority?: "standard" | "urgent"; plumberId?: string }
  ) => {
    if (selectedIds.length === 0) return;
    const plumber = extra?.plumberId ? approvedPlumbers.find((p) => p.id === extra.plumberId) : undefined;
    const res = await bulkUpdateRequestsAction({
      requestIds: selectedIds,
      action,
      status: extra?.status,
      priority: extra?.priority,
      plumberId: plumber?.id,
      plumberName: plumber?.full_name,
    });
    if (res.success) {
      const nowIso = new Date().toISOString();
      setRequests((prev) =>
        prev.map((r) => {
          if (!selectedIds.includes(r.id)) return r;
          if (action === "status" && extra?.status) return { ...r, status: extra.status };
          if (action === "priority" && extra?.priority) return { ...r, priority: extra.priority };
          if (action === "assign" && plumber) {
            return { ...r, assigned_plumber_id: plumber.id, assigned_technician: plumber.full_name, status: "contacted" };
          }
          if (action === "archive") return { ...r, archived_at: nowIso };
          if (action === "restore") return { ...r, archived_at: null, deleted_at: null };
          return r;
        })
      );
      setSelectedIds([]);
      setFeedback({ type: "success", text: `Updated ${res.updatedCount} service request(s).` });
    } else {
      setFeedback({ type: "error", text: res.error || "Bulk update failed." });
    }
  };

  const handleQuotationDecision = async (quote: StructuredQuotation, decision: "approved" | "rejected") => {
    setSaving(true);
    const res = await customerQuotationDecisionAction(quote.id, quote.ticket_number, decision);
    setSaving(false);
    if (res.success) {
      setQuotations((prev) =>
        prev.map((q) =>
          q.id === quote.id ? { ...q, customer_approval_status: decision, admin_approved: decision === "approved" } : q
        )
      );
      setFeedback({ type: "success", text: `Quotation marked as ${decision}.` });
    } else {
      setFeedback({ type: "error", text: res.error || "Could not update quotation." });
    }
  };

  const handleSaveCustomView = async () => {
    if (!newViewName.trim()) return;
    const res = await saveCrmViewAction({
      name: newViewName.trim(),
      filters: {
        statusFilter,
        priorityFilter,
        locationFilter,
        plumberFilter,
        dateRangeFilter,
        unreadOnly: String(unreadOnly),
      },
      columns: visibleColumns,
      sortKey,
      sortDir,
    });
    if (res.success && res.view) {
      setCustomViews((prev) => [...prev, res.view!]);
      setShowSaveViewModal(false);
      setNewViewName("");
    } else {
      setFeedback({ type: "error", text: res.error || "Could not save view." });
    }
  };

  const applyCustomView = (view: CrmSavedView) => {
    setActiveSavedViewId(view.id);
    setStatusFilter(view.filters.statusFilter || "all");
    setPriorityFilter(view.filters.priorityFilter || "all");
    setLocationFilter(view.filters.locationFilter || "all");
    setPlumberFilter(view.filters.plumberFilter || "all");
    setDateRangeFilter((view.filters.dateRangeFilter as any) || "all");
    setUnreadOnly(view.filters.unreadOnly === "true");
    if (view.columns.length > 0) setVisibleColumns(view.columns as ColumnKey[]);
    setPage(1);
  };

  const clearAllFilters = () => {
    setActiveSavedViewId("all");
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setLocationFilter("all");
    setPlumberFilter("all");
    setDateRangeFilter("all");
    setUnreadOnly(false);
    setPage(1);
  };

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? (prev.length > 2 ? prev.filter((k) => k !== key) : prev) : [...prev, key]
    );
  };

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allOnPageSelected =
    paginatedRequests.length > 0 && paginatedRequests.every((r) => selectedIds.includes(r.id));

  const selectedQuotes = selected ? quotations.filter((q) => q.ticket_number === selected.ticket_number) : [];

  return (
    <div className="space-y-4 pb-20 lg:pb-6">
      {/* Header & View Switch */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#0B1F3A]">Service Requests CRM</h2>
          <p className="text-sm text-slate-500">
            {filteredRequests.length} matching records • Qualify, dispatch plumbers, and manage pipeline stages.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                viewMode === "list" ? "bg-[#0B1F3A] text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("board")}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
                viewMode === "board" ? "bg-[#0B1F3A] text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Columns3 className="h-3.5 w-3.5" /> Pipeline
            </button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search ticket, name, phone..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Saved Views Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {BUILT_IN_VIEWS.map((v) => {
          const count = requests.filter((r) => v.apply(r, unreadTickets)).length;
          const active = activeSavedViewId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                setActiveSavedViewId(v.id);
                setPage(1);
              }}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{v.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
        {customViews.map((cv) => (
          <div key={cv.id} className="inline-flex shrink-0 items-center rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => applyCustomView(cv)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold ${
                activeSavedViewId === cv.id ? "text-[#0B1F3A] underline" : "text-slate-700"
              }`}
            >
              <Bookmark className="h-3 w-3 text-[#F5B301]" />
              {cv.name}
            </button>
            <button
              type="button"
              onClick={async () => {
                await deleteCrmViewAction(cv.id);
                setCustomViews((prev) => prev.filter((x) => x.id !== cv.id));
              }}
              className="pr-2 text-slate-400 hover:text-rose-600"
              aria-label={`Delete view ${cv.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setShowSaveViewModal(true)}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#0B1F3A] hover:text-[#0B1F3A]"
        >
          <Plus className="h-3.5 w-3.5" /> Save View
        </button>
      </div>

      {/* Filters & Columns Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "all" ? "All Statuses" : o.label}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
          aria-label="Filter by priority"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent Only</option>
          <option value="standard">Standard Only</option>
        </select>

        <select
          value={plumberFilter}
          onChange={(e) => {
            setPlumberFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
          aria-label="Filter by plumber"
        >
          <option value="all">All Plumbers</option>
          <option value="unassigned">Unassigned</option>
          {approvedPlumbers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>

        <select
          value={locationFilter}
          onChange={(e) => {
            setLocationFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
          aria-label="Filter by location"
        >
          <option value="all">All Locations</option>
          {uniqueLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        <select
          value={dateRangeFilter}
          onChange={(e) => {
            setDateRangeFilter(e.target.value as any);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-800"
          aria-label="Filter by date"
        >
          <option value="all">Any Date</option>
          <option value="today">Last 24h</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setUnreadOnly((v) => !v);
            setPage(1);
          }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${
            unreadOnly
              ? "border-[#F5B301] bg-[#F5B301]/15 text-[#0B1F3A]"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <MessageCircle className="h-3.5 w-3.5" /> Unread ({unreadTickets.size})
        </button>

        <button
          type="button"
          onClick={clearAllFilters}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <FilterX className="h-3.5 w-3.5" /> Clear
        </button>

        {viewMode === "list" && (
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setShowColumnMenu((s) => !s)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Columns ({visibleColumns.length})
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 z-30 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                {ALL_COLUMNS.map((col) => (
                  <label
                    key={col.key}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      className="rounded border-slate-300"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm font-medium ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0B1F3A]/20 bg-[#0B1F3A] px-4 py-2.5 text-white">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
            <CheckSquare className="h-4 w-4 text-[#F5B301]" />
            {selectedIds.length} selected
          </span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkAction("status", { status: e.target.value as RequestStatus });
              e.target.value = "";
            }}
            className="h-8 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white [&>option]:text-slate-900"
          >
            <option value="">Set Status...</option>
            {STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) handleBulkAction("assign", { plumberId: e.target.value });
              e.target.value = "";
            }}
            className="h-8 rounded-lg bg-white/10 px-2.5 text-xs font-medium text-white [&>option]:text-slate-900"
          >
            <option value="">Assign Plumber...</option>
            {approvedPlumbers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => handleBulkAction("priority", { priority: "urgent" })}
            className="h-8 rounded-lg bg-rose-500/90 px-2.5 text-xs font-semibold hover:bg-rose-500"
          >
            Mark Urgent
          </button>
          <button
            type="button"
            onClick={() =>
              handleBulkAction(activeSavedViewId === "archived" ? "restore" : "archive")
            }
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold hover:bg-white/20"
          >
            {activeSavedViewId === "archived" ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" /> Archive
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-auto text-xs text-slate-300 hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === "list" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...paginatedRequests.map((r) => r.id)])));
                        } else {
                          const pageSet = new Set(paginatedRequests.map((r) => r.id));
                          setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
                        }
                      }}
                      aria-label="Select all on page"
                    />
                  </th>
                  {visibleColumns.includes("ticket") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("ticket")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Ticket <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("customer") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("customer")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Customer <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("phone") && <th className="px-3 py-3">Phone</th>}
                  {visibleColumns.includes("service") && <th className="px-3 py-3">Service</th>}
                  {visibleColumns.includes("location") && <th className="px-3 py-3">Location</th>}
                  {visibleColumns.includes("priority") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("priority")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Priority <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("plumber") && <th className="px-3 py-3">Assigned</th>}
                  {visibleColumns.includes("quote") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("quote")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Quote <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("status") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Status <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("appointment") && <th className="px-3 py-3">Appointment</th>}
                  {visibleColumns.includes("updated") && (
                    <th className="px-3 py-3">
                      <button type="button" onClick={() => toggleSort("updated_at")} className="inline-flex items-center gap-1 hover:text-[#0B1F3A]">
                        Updated <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </th>
                  )}
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRequests.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.length + 2} className="px-4 py-12 text-center text-sm text-slate-500">
                      No service requests match the current filters.
                    </td>
                  </tr>
                ) : (
                  paginatedRequests.map((req) => {
                    const contact = extractCustomerContact(req);
                    const statusMeta = getStatusMeta(req.status);
                    const hasUnread = unreadTickets.has(req.ticket_number);
                    const isChecked = selectedIds.includes(req.id);
                    return (
                      <tr
                        key={req.id}
                        className={`transition hover:bg-slate-50/80 ${isChecked ? "bg-amber-50/40" : ""}`}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedIds((prev) =>
                                e.target.checked ? [...prev, req.id] : prev.filter((id) => id !== req.id)
                              );
                            }}
                            aria-label={`Select ${req.ticket_number}`}
                          />
                        </td>
                        {visibleColumns.includes("ticket") && (
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openDetail(req)}
                              className="font-mono text-xs font-bold text-[#0B1F3A] hover:underline"
                            >
                              {req.ticket_number}
                            </button>
                            {hasUnread && (
                              <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-[#F5B301]" title="Unread message" />
                            )}
                          </td>
                        )}
                        {visibleColumns.includes("customer") && (
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => openDetail(req)}
                              className="flex items-center gap-2 text-left"
                            >
                              <Avatar name={contact.name} size="sm" />
                              <div>
                                <p className="font-semibold text-[#0B1F3A]">{contact.name}</p>
                                {!visibleColumns.includes("phone") && (
                                  <p className="text-xs text-slate-500">{contact.phone || "No phone"}</p>
                                )}
                              </div>
                            </button>
                          </td>
                        )}
                        {visibleColumns.includes("phone") && (
                          <td className="px-3 py-3 text-xs text-slate-600">{contact.phone || "—"}</td>
                        )}
                        {visibleColumns.includes("service") && (
                          <td className="px-3 py-3 text-xs font-medium text-slate-800">{req.problem_category}</td>
                        )}
                        {visibleColumns.includes("location") && (
                          <td className="px-3 py-3 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-slate-400" />
                              {req.city_lga || req.address_in_kano}
                            </span>
                          </td>
                        )}
                        {visibleColumns.includes("priority") && (
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                req.priority === "urgent"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {req.priority}
                            </span>
                          </td>
                        )}
                        {visibleColumns.includes("plumber") && (
                          <td className="px-3 py-3 text-xs text-slate-700">
                            {req.assigned_technician ? (
                              <span className="inline-flex items-center gap-1 font-medium text-[#0B1F3A]">
                                <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                {req.assigned_technician}
                              </span>
                            ) : (
                              <span className="text-slate-400">Unassigned</span>
                            )}
                          </td>
                        )}
                        {visibleColumns.includes("quote") && (
                          <td className="px-3 py-3 text-xs font-semibold text-[#0B1F3A]">
                            {req.quoted_amount ? formatNGN(req.quoted_amount) : "—"}
                          </td>
                        )}
                        {visibleColumns.includes("status") && (
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          </td>
                        )}
                        {visibleColumns.includes("appointment") && (
                          <td className="px-3 py-3 text-xs text-slate-600">
                            {req.preferred_date || req.preferred_timing || "—"}
                          </td>
                        )}
                        {visibleColumns.includes("updated") && (
                          <td className="px-3 py-3 text-xs text-slate-500">
                            {formatDateTime(req.updated_at || req.created_at)}
                          </td>
                        )}
                        <td className="px-3 py-3 text-right">
                          <ActionMenu
                            items={[
                              {
                                id: "view",
                                label: "View & Edit Details",
                                icon: Eye,
                                onClick: () => openDetail(req),
                              },
                              {
                                id: "chat",
                                label: "Open Conversation",
                                icon: MessageCircle,
                                onClick: () => router.push(`/admin/communications?ticket=${req.ticket_number}`),
                              },
                              {
                                id: "priority",
                                label: req.priority === "urgent" ? "Set Standard Priority" : "Mark Urgent",
                                onClick: async () => {
                                  const next = req.priority === "urgent" ? "standard" : "urgent";
                                  const r = await updateRequestDetails(req.id, { priority: next });
                                  if (r.success) {
                                    setRequests((prev) =>
                                      prev.map((x) => (x.id === req.id ? { ...x, priority: next } : x))
                                    );
                                  }
                                },
                              },
                              req.archived_at
                                ? {
                                    id: "restore",
                                    label: "Restore Request",
                                    icon: RotateCcw,
                                    onClick: async () => {
                                      const r = await archiveServiceRequestAction(req.id, true);
                                      if (r.success) {
                                        setRequests((prev) =>
                                          prev.map((x) =>
                                            x.id === req.id ? { ...x, archived_at: null, deleted_at: null } : x
                                          )
                                        );
                                      }
                                    },
                                  }
                                : {
                                    id: "archive",
                                    label: "Archive Request",
                                    icon: Archive,
                                    onClick: async () => {
                                      const r = await archiveServiceRequestAction(req.id, false);
                                      if (r.success) {
                                        setRequests((prev) =>
                                          prev.map((x) =>
                                            x.id === req.id ? { ...x, archived_at: new Date().toISOString() } : x
                                          )
                                        );
                                      }
                                    },
                                  },
                              {
                                id: "delete",
                                label: "Delete Request",
                                icon: Trash2,
                                danger: true,
                                dividerBefore: true,
                                onClick: () => setDeleteTarget(req),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>
                Showing {filteredRequests.length === 0 ? 0 : (safePage - 1) * pageSize + 1}–
                {Math.min(safePage * pageSize, filteredRequests.length)} of {filteredRequests.length}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 disabled:opacity-40"
              >
                Prev
              </button>
              <span className="px-2 font-semibold text-[#0B1F3A]">
                Page {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 font-semibold text-slate-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KANBAN PIPELINE VIEW (Real HTML5 Drag-and-Drop + Accessible Move) */}
      {viewMode === "board" && (
        <div className="grid grid-cols-1 gap-4 overflow-x-auto pb-4 lg:grid-cols-5">
          {BOARD_COLUMNS.map((col) => {
            const colItems = filteredRequests.filter((r) => col.statuses.includes(r.status));
            const totalQuoted = colItems.reduce((acc, r) => acc + (r.quoted_amount || 0), 0);
            const isOver = dragOverColId === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverColId !== col.id) setDragOverColId(col.id);
                }}
                onDragLeave={() => setDragOverColId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  handleBoardDrop(col);
                }}
                className={`flex min-h-[380px] flex-col rounded-xl border p-3 transition ${
                  isOver
                    ? "border-[#F5B301] bg-amber-50/60 ring-2 ring-[#F5B301]/30"
                    : "border-slate-200 bg-slate-50/80"
                }`}
              >
                <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">{col.title}</h3>
                    {totalQuoted > 0 && (
                      <p className="text-[11px] font-medium text-slate-500">{formatNGN(totalQuoted)}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-[#0B1F3A] px-2 py-0.5 text-xs font-bold text-white">
                    {colItems.length}
                  </span>
                </div>
                <div className="flex-1 space-y-2.5">
                  {colItems.map((req) => {
                    const contact = extractCustomerContact(req);
                    return (
                      <div
                        key={req.id}
                        draggable
                        onDragStart={() => setDraggedRequestId(req.id)}
                        onDragEnd={() => {
                          setDraggedRequestId(null);
                          setDragOverColId(null);
                        }}
                        className="cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-[#0B1F3A]/40 active:cursor-grabbing"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => openDetail(req)}
                            className="font-mono text-[11px] font-bold text-[#0B1F3A] hover:underline"
                          >
                            {req.ticket_number}
                          </button>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              req.priority === "urgent"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {req.priority}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => openDetail(req)}
                          className="mt-1.5 block w-full text-left"
                        >
                          <p className="text-sm font-semibold text-slate-900">{contact.name}</p>
                          <p className="truncate text-xs text-slate-500">{req.problem_category}</p>
                        </button>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="truncate">{req.city_lga || req.address_in_kano}</span>
                          {req.quoted_amount ? (
                            <span className="font-bold text-[#0B1F3A]">{formatNGN(req.quoted_amount)}</span>
                          ) : null}
                        </div>
                        <div className="mt-2 border-t border-slate-100 pt-2">
                          <select
                            aria-label={`Move ${req.ticket_number} to stage`}
                            value={req.status}
                            onChange={async (e) => {
                              const next = e.target.value as RequestStatus;
                              const prev = req.status;
                              setRequests((list) =>
                                list.map((x) => (x.id === req.id ? { ...x, status: next } : x))
                              );
                              const res = await updateRequestStatusByTicketAction(req.ticket_number, next);
                              if (!res.success) {
                                setRequests((list) =>
                                  list.map((x) => (x.id === req.id ? { ...x, status: prev } : x))
                                );
                              }
                            }}
                            className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-700"
                          >
                            {STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save Custom View Modal */}
      {showSaveViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-[#0B1F3A]">Save Current Filter View</h3>
            <p className="mt-1 text-xs text-slate-500">
              Saves your active filters, visible columns, and sort order for quick access.
            </p>
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="e.g. Kano Urgent Unassigned"
              className="mt-3 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveViewModal(false)}
                className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomView}
                className="h-9 rounded-lg bg-[#0B1F3A] px-4 text-xs font-semibold text-white"
              >
                Save View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Delete Confirm Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Service Request?"
        description={
          deleteTarget
            ? `Move ${deleteTarget.ticket_number} (${deleteTarget.customer_name}) to the Recycle Bin? Requests with linked quotations or payments are protected and must be archived instead.`
            : ""
        }
        confirmLabel="Delete Request"
        tone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const target = deleteTarget;
          setDeleteTarget(null);
          const res = await deleteServiceRequestSafelyAction(target.id);
          if (res.success) {
            setRequests((prev) =>
              prev.map((x) =>
                x.id === target.id
                  ? { ...x, deleted_at: new Date().toISOString(), archived_at: new Date().toISOString() }
                  : x
              )
            );
            setFeedback({ type: "success", text: `${target.ticket_number} moved to Recycle Bin.` });
          } else {
            setFeedback({ type: "error", text: res.error || "Could not delete request." });
          }
        }}
      />

      {/* Right-Side Detail Drawer */}
      <RequestDetailDrawer
        selected={selected}
        selectedQuotes={selectedQuotes}
        selectedMessages={
          selected ? initialMessages.filter((m) => m.ticket_number === selected.ticket_number) : []
        }
        selectedPayments={
          selected ? initialPayments.filter((p) => p.ticket_number === selected.ticket_number) : []
        }
        approvedPlumbers={approvedPlumbers}
        onlinePlumberIds={onlinePlumberIds}
        availabilityMap={availabilityMap}
        editStatus={editStatus}
        setEditStatus={setEditStatus}
        editPriority={editPriority}
        setEditPriority={setEditPriority}
        editPlumberId={editPlumberId}
        setEditPlumberId={setEditPlumberId}
        editQuotedAmount={editQuotedAmount}
        setEditQuotedAmount={setEditQuotedAmount}
        editPreferredDate={editPreferredDate}
        setEditPreferredDate={setEditPreferredDate}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        saving={saving}
        feedback={feedback}
        onClose={() => setSelected(null)}
        onSave={handleSaveRequest}
        onQuotationDecision={handleQuotationDecision}
      />
    </div>
  );
}
