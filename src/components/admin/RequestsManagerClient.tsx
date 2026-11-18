"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import {
  Archive,
  ArrowUpDown,
  Bookmark,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Eye,
  Filter,
  FilterX,
  List,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
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
import {
  createAdminServiceRequest,
  updateRequestDetails,
} from "@/app/actions/admin-management";
import { ActionMenu, Avatar, ConfirmDialog } from "@/components/ui";
import { LiveMap, type LiveMapMarker } from "@/components/map/LiveMap";
import {
  extractCustomerContact,
  REQUEST_STATUS_OPTIONS as STATUS_OPTIONS,
  RequestDetailDrawer,
} from "@/components/admin/requests/RequestDetailDrawer";
import {
  useLiveTracking,
  useNowTick,
  useRoadRoute,
  projectTrackedStatus,
} from "@/hooks/useLiveTracking";
import { formatNGN } from "@/lib/currency";
import { calculateDistanceKm, formatDistance } from "@/lib/geo";
import { formatAgo } from "@/lib/live-location";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";
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

const BOARD_COLUMNS: {
  id: string;
  title: string;
  targetStatus: RequestStatus;
  statuses: string[];
  description: string;
  accentClass: string;
}[] = [
  {
    id: "new",
    title: "New Request",
    targetStatus: "new",
    statuses: ["new"],
    description: "Incoming request awaiting qualification",
    accentClass: "border-t-[#0B1F3A]",
  },
  {
    id: "contacted",
    title: "Requests Contacted",
    targetStatus: "contacted",
    statuses: ["contacted"],
    description: "Customer contacted & scope discussed",
    accentClass: "border-t-[#0B1F3A]",
  },
  {
    id: "scheduled",
    title: "Inspection Scheduled",
    targetStatus: "scheduled",
    statuses: ["scheduled", "inspection_required"],
    description: "Technician dispatched for site visit",
    accentClass: "border-t-[#0B1F3A]",
  },
  {
    id: "quote",
    title: "Quote Submitted",
    targetStatus: "quotation_submitted",
    statuses: ["quotation_submitted"],
    description: "Itemised quotation prepared for review",
    accentClass: "border-t-[#F5B301]",
  },
  {
    id: "approval",
    title: "Awaiting Approval",
    targetStatus: "awaiting_approval",
    statuses: ["awaiting_approval", "approved"],
    description: "Pending customer decision & sign-off",
    accentClass: "border-t-[#F5B301]",
  },
  {
    id: "progress",
    title: "Work In Progress",
    targetStatus: "in_progress",
    statuses: ["in_progress"],
    description: "Plumber actively executing job on site",
    accentClass: "border-t-[#F5B301]",
  },
  {
    id: "done",
    title: "Handover & Completed",
    targetStatus: "completed",
    statuses: ["work_completed", "awaiting_final_payment", "completed"],
    description: "Work completed, verified & settled",
    accentClass: "border-t-[#0B1F3A]",
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

function getStageProgressMeta(status: RequestStatus): {
  step: number;
  total: number;
  barColor: string;
  outcome?: "won" | "lost";
} {
  switch (status) {
    case "new":
      return { step: 1, total: 5, barColor: "bg-[#0B1F3A]/60" };
    case "contacted":
      return { step: 2, total: 5, barColor: "bg-[#0B1F3A]" };
    case "scheduled":
    case "inspection_required":
      return { step: 2, total: 5, barColor: "bg-[#0B1F3A]" };
    case "quotation_submitted":
    case "awaiting_approval":
      return { step: 3, total: 5, barColor: "bg-[#F5B301]" };
    case "approved":
    case "in_progress":
      return { step: 4, total: 5, barColor: "bg-[#F5B301]" };
    case "work_completed":
    case "awaiting_final_payment":
      return { step: 4, total: 5, barColor: "bg-[#0B1F3A]" };
    case "completed":
      return { step: 5, total: 5, barColor: "bg-[#0B1F3A]", outcome: "won" };
    case "cancelled":
      return { step: 5, total: 5, barColor: "bg-rose-500", outcome: "lost" };
    default:
      return { step: 1, total: 5, barColor: "bg-slate-400" };
  }
}

export function RequestsManagerClient({
  initialRequests,
  vettedPlumbers = [],
  initialQuotations = [],
  initialMessages = [],
  initialPayments = [],
}: RequestsManagerClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plumberAvatarMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of vettedPlumbers) {
      if (p.avatar_url) {
        map.set(p.id, p.avatar_url);
        if (p.full_name) map.set(p.full_name.trim().toLowerCase(), p.avatar_url);
      }
    }
    return map;
  }, [vettedPlumbers]);
  const [requests, setRequests] = useState<ServiceRequestRecord[]>(initialRequests);
  const [quotations, setQuotations] = useState<StructuredQuotation[]>(initialQuotations);
  const [viewMode, setViewMode] = useState<"list" | "board" | "map">("list");
  const [selectedMapRequestId, setSelectedMapRequestId] = useState<string | null>(null);
  const [focusedMapMarkerId, setFocusedMapMarkerId] = useState<string | null>(null);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapFilter, setMapFilter] = useState<
    "all" | "available" | "busy" | "assigned" | "stale" | "no_access"
  >("all");
  const [activeSavedViewId, setActiveSavedViewId] = useState<string>("all");
  const [customViews, setCustomViews] = useState<CrmSavedView[]>([]);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [showViewDropdown, setShowViewDropdown] = useState(false);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);

  // Create Request Modal State (Bigin "+ Request" workflow)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newProblemCategory, setNewProblemCategory] = useState("General Plumbing");
  const [newPropertyType] = useState("Residential");
  const [newAddress, setNewAddress] = useState("");
  const [newPriority, setNewPriority] = useState<"standard" | "urgent">("standard");
  const [newPreferredDate, setNewPreferredDate] = useState("");
  const [newAssignedPlumberId, setNewAssignedPlumberId] = useState("");
  const [newQuotedAmount, setNewQuotedAmount] = useState("");
  const [newIssueDescription, setNewIssueDescription] = useState("");
  const [newStage, setNewStage] = useState<RequestStatus>("new");
  const [collapsedColIds, setCollapsedColIds] = useState<string[]>([]);

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
  const [pageSize, setPageSize] = useState(30);
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

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  const adminTracking = useLiveTracking({
    as: "admin",
    dispatch: true,
    enabled: viewMode === "map",
  });
  const mapNowMs = useNowTick(10_000, viewMode === "map");

  const adminSnapshot = adminTracking.snapshot;
  const livePlumberById = useMemo(() => {
    const map = new Map<
      string,
      NonNullable<NonNullable<typeof adminSnapshot>["plumbers"]>[number]
    >();
    for (const p of adminSnapshot?.plumbers ?? []) {
      map.set(p.plumberId, p);
    }
    return map;
  }, [adminSnapshot]);

  const focusedMapReqForRoute = useMemo(() => {
    if (viewMode !== "map") return null;
    const pinned = requests.filter(
      (r) =>
        !["completed", "cancelled"].includes(r.status) &&
        r.customer_lat != null &&
        r.customer_lng != null
    );
    return (
      pinned.find((r) => r.id === selectedMapRequestId) || pinned[0] || null
    );
  }, [viewMode, requests, selectedMapRequestId]);

  const assignedMapPlumberCoords = (() => {
    if (!focusedMapReqForRoute) return null;
    const assignedId = focusedMapReqForRoute.assigned_plumber_id;
    if (assignedId) {
      const live = livePlumberById.get(assignedId);
      if (live && live.lat != null && live.lng != null) {
        return { lat: live.lat, lng: live.lng };
      }
      const fallback = vettedPlumbers.find((p) => p.id === assignedId);
      if (fallback?.current_lat != null && fallback?.current_lng != null) {
        return { lat: fallback.current_lat, lng: fallback.current_lng };
      }
    }
    if (focusedMapReqForRoute.assigned_technician) {
      const techLower = focusedMapReqForRoute.assigned_technician.trim().toLowerCase();
      for (const live of livePlumberById.values()) {
        if (
          live.name.trim().toLowerCase() === techLower &&
          live.lat != null &&
          live.lng != null
        ) {
          return { lat: live.lat, lng: live.lng };
        }
      }
      const fallback = vettedPlumbers.find(
        (p) => p.full_name.trim().toLowerCase() === techLower
      );
      if (fallback?.current_lat != null && fallback?.current_lng != null) {
        return { lat: fallback.current_lat, lng: fallback.current_lng };
      }
    }
    return null;
  })();

  const { route: adminMapRoadRoute } = useRoadRoute({
    as: "admin",
    ticket: focusedMapReqForRoute?.ticket_number ?? undefined,
    plumber: assignedMapPlumberCoords,
    destination:
      focusedMapReqForRoute?.customer_lat != null &&
      focusedMapReqForRoute?.customer_lng != null
        ? {
            lat: focusedMapReqForRoute.customer_lat,
            lng: focusedMapReqForRoute.customer_lng,
          }
        : null,
    enabled: Boolean(
      viewMode === "map" &&
        focusedMapReqForRoute?.customer_lat != null &&
        focusedMapReqForRoute?.customer_lng != null &&
        assignedMapPlumberCoords
    ),
  });

  useRealtimeHub({
    role: "admin",
    onPresenceSync: (p) => {
      setOnlinePlumberIds((prev) => Array.from(new Set([...prev, ...p.onlinePlumberIds])));
    },
    onAvailability: (payload: { plumberId: string; isAvailable: boolean }) => {
      setAvailabilityMap((prev) => ({ ...prev, [payload.plumberId]: payload.isAvailable }));
    },
    onDataSync: () => {
      router.refresh();
      if (viewMode === "map") {
        adminTracking.refresh();
      }
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

  const [readLocallyTickets, setReadLocallyTickets] = useState<string[]>([]);

  const unreadTickets = useMemo(() => {
    const set = new Set<string>();
    for (const m of initialMessages) {
      if (
        m.sender_role !== "admin" &&
        !m.admin_read &&
        !readLocallyTickets.includes(m.ticket_number)
      ) {
        set.add(m.ticket_number);
      }
    }
    return set;
  }, [initialMessages, readLocallyTickets]);

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

    setReadLocallyTickets((prev) =>
      prev.includes(req.ticket_number) ? prev : [...prev, req.ticket_number]
    );
    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketNumber: req.ticket_number, viewerRole: "admin" }),
    })
      .then((res) => {
        if (!res.ok) return;
        broadcastRealtimeEvent("messages_read", {
          ticketNumber: req.ticket_number,
          viewerRole: "admin",
        });
        broadcastRealtimeEvent("notification_sync", { recipientRole: "admin" });
        window.dispatchEvent(new Event("admin-signals-refresh"));
        window.dispatchEvent(new Event("notifications-refresh"));
      })
      .catch(() => {});
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
    broadcastRealtimeEvent("data_sync", {
      entity: "service_requests",
      ticketNumber: selected.ticket_number,
    });
    broadcastRealtimeEvent("notification_sync", {});
    router.refresh();
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
    } else {
      broadcastRealtimeEvent("data_sync", {
        entity: "service_requests",
        ticketNumber: req.ticket_number,
      });
      broadcastRealtimeEvent("notification_sync", {});
      router.refresh();
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

  const activeRequestsAll = useMemo(
    () => requests.filter((r) => !r.archived_at && !r.deleted_at),
    [requests]
  );
  const summaryStats = useMemo(() => {
    const total = activeRequestsAll.length;
    const won = activeRequestsAll.filter((r) => r.status === "completed").length;
    const lost = activeRequestsAll.filter((r) => r.status === "cancelled").length;
    const open = Math.max(0, total - won - lost);
    const pipelineValue = activeRequestsAll.reduce((acc, r) => acc + (r.quoted_amount || 0), 0);
    return { total, open, won, lost, pipelineValue };
  }, [activeRequestsAll]);

  const activeFilterCount = useMemo(() => {
    let c = 0;
    if (statusFilter !== "all") c++;
    if (priorityFilter !== "all") c++;
    if (plumberFilter !== "all") c++;
    if (locationFilter !== "all") c++;
    if (dateRangeFilter !== "all") c++;
    if (unreadOnly) c++;
    return c;
  }, [statusFilter, priorityFilter, plumberFilter, locationFilter, dateRangeFilter, unreadOnly]);

  const currentViewLabel = useMemo(() => {
    const builtIn = BUILT_IN_VIEWS.find((v) => v.id === activeSavedViewId);
    if (builtIn) return builtIn.label;
    const custom = customViews.find((v) => v.id === activeSavedViewId);
    return custom?.name || "All Requests";
  }, [activeSavedViewId, customViews]);

  const handleCreateNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newCustomerPhone.trim() || !newAddress.trim()) {
      setFeedback({ type: "error", text: "Customer name, phone number, and location are required." });
      return;
    }
    setCreatingRequest(true);
    setFeedback(null);
    const chosenPlumber = approvedPlumbers.find((p) => p.id === newAssignedPlumberId);
    const res = await createAdminServiceRequest({
      customerName: newCustomerName.trim(),
      customerPhone: newCustomerPhone.trim(),
      priority: newPriority,
      propertyType: newPropertyType,
      problemCategory: newProblemCategory,
      addressInKano: newAddress.trim(),
      preferredTiming: "Flexible / Scheduled",
      preferredDate: newPreferredDate || undefined,
      issueDescription: newIssueDescription.trim() || `${newProblemCategory} service request`,
      assignedPlumberId: chosenPlumber?.id,
      assignedTechnician: chosenPlumber?.full_name,
      quotedAmount: newQuotedAmount ? parseFloat(newQuotedAmount) : undefined,
      status: newStage !== "new" ? newStage : chosenPlumber ? "scheduled" : "new",
    });
    setCreatingRequest(false);

    if (res.success && res.request) {
      setRequests((prev) => [res.request!, ...prev]);
      setShowCreateModal(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewAddress("");
      setNewPreferredDate("");
      setNewAssignedPlumberId("");
      setNewQuotedAmount("");
      setNewIssueDescription("");
      setNewStage("new");
      setFeedback({
        type: "success",
        text: `Created request ${res.ticketNumber} (${res.request.customer_name}).`,
      });
      broadcastRealtimeEvent("data_sync", {
        entity: "service_requests",
        ticketNumber: res.ticketNumber,
      });
      router.refresh();
    } else {
      setFeedback({ type: "error", text: res.error || "Could not create service request." });
    }
  };

  return (
    <div className="flex flex-col space-y-2.5 pb-16 lg:pb-2">
      {/* Bigin-Style Single-Line CRM Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
        {/* Left: Filter Drawer Toggle + View Selector Dropdown + Quick Stage Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFiltersPanel((v) => !v)}
            title="Toggle Filters"
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
              showFiltersPanel || activeFilterCount > 0
                ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A]">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Bigin-Style View Selector Dropdown ("All Requests v") */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowViewDropdown((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0B1F3A] shadow-2xs transition hover:border-[#0B1F3A]"
            >
              <span>{currentViewLabel}</span>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                {filteredRequests.length}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
            </button>

            {showViewDropdown && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowViewDropdown(false)}
                />
                <div className="absolute left-0 z-30 mt-1.5 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                  <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Standard Views
                  </p>
                  <div className="max-h-64 overflow-y-auto">
                    {BUILT_IN_VIEWS.map((v) => {
                      const count = requests.filter((r) => v.apply(r, unreadTickets)).length;
                      const active = activeSavedViewId === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            setActiveSavedViewId(v.id);
                            setShowViewDropdown(false);
                            setPage(1);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                            active
                              ? "bg-[#0B1F3A] font-semibold text-white"
                              : "text-slate-700 hover:bg-slate-50"
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
                  </div>

                  {customViews.length > 0 && (
                    <div className="mt-1 border-t border-slate-100 pt-1">
                      <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Custom Saved Views
                      </p>
                      {customViews.map((cv) => (
                        <div
                          key={cv.id}
                          className="flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs hover:bg-slate-50"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              applyCustomView(cv);
                              setShowViewDropdown(false);
                            }}
                            className="flex flex-1 items-center gap-1.5 text-left font-medium text-slate-700"
                          >
                            <Bookmark className="h-3 w-3 text-[#F5B301]" />
                            <span className="truncate">{cv.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              await deleteCrmViewAction(cv.id);
                              setCustomViews((prev) => prev.filter((x) => x.id !== cv.id));
                            }}
                            className="text-slate-400 hover:text-rose-600"
                            aria-label={`Delete view ${cv.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowViewDropdown(false);
                        setShowSaveViewModal(true);
                      }}
                      className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#F5B301]" /> Save Current View
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Quick Compact Filter Chips (No ugly horizontal scrollbar) */}
          <div className="hidden xl:flex items-center gap-1">
            {[
              { id: "all", label: "All" },
              { id: "new", label: "New" },
              { id: "unassigned", label: "Unassigned" },
              { id: "urgent", label: "Urgent" },
              { id: "in_progress", label: "In Progress" },
              { id: "completed", label: "Completed" },
            ].map((pill) => {
              const v = BUILT_IN_VIEWS.find((x) => x.id === pill.id);
              const count = v ? requests.filter((r) => v.apply(r, unreadTickets)).length : 0;
              const active = activeSavedViewId === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setActiveSavedViewId(pill.id);
                    setPage(1);
                  }}
                  className={`inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-semibold transition ${
                    active
                      ? "bg-[#0B1F3A] text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className={`text-[10px] ${active ? "text-[#F5B301]" : "text-slate-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Search + Unread Pill + View Mode Icons + "+ Request" Green CTA */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-48 sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search ticket, contact, phone..."
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
            />
          </div>

          {unreadTickets.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setUnreadOnly((v) => !v);
                setPage(1);
              }}
              className={`inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold ${
                unreadOnly
                  ? "border-[#F5B301] bg-[#F5B301]/20 text-[#0B1F3A]"
                  : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100"
              }`}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{unreadTickets.size} Unread</span>
            </button>
          )}

          {/* Bigin-Style "Sort By" Selector + Direction Toggle */}
          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500">Sort By</span>
            <ClassicSelect
              size="sm"
              ariaLabel="Sort requests by"
              value={sortKey}
              onChange={(val) => setSortKey(val as typeof sortKey)}
              className="min-w-[165px]"
              options={[
                { value: "created_at", label: "Target / Created Date" },
                { value: "updated_at", label: "Updated Date" },
                { value: "quote", label: "Amount (₦)" },
                { value: "priority", label: "Priority" },
                { value: "customer", label: "Contact Name" },
                { value: "status", label: "Stage" },
              ]}
            />
            <button
              type="button"
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending (click for Descending)" : "Descending (click for Ascending)"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Stage / List View Switcher (Brand Navy & Gold) */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("board")}
              title="Stage Pipeline View"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                viewMode === "board"
                  ? "bg-[#0B1F3A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0B1F3A]"
              }`}
            >
              <Columns3 className={`h-3.5 w-3.5 ${viewMode === "board" ? "text-[#F5B301]" : ""}`} />
              <span className="hidden sm:inline">Pipeline</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List Table View"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                viewMode === "list"
                  ? "bg-[#0B1F3A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0B1F3A]"
              }`}
            >
              <List className={`h-3.5 w-3.5 ${viewMode === "list" ? "text-[#F5B301]" : ""}`} />
              <span className="hidden sm:inline">List</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              title="Live Dispatch Map"
              className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition ${
                viewMode === "map"
                  ? "bg-[#0B1F3A] text-white shadow-2xs"
                  : "text-slate-600 hover:text-[#0B1F3A]"
              }`}
            >
              <MapPin className={`h-3.5 w-3.5 ${viewMode === "map" ? "text-[#F5B301]" : ""}`} />
              <span className="hidden sm:inline">Live Map</span>
            </button>
          </div>

          {/* "+ Request" Primary Action (Brand Navy & Gold) */}
          <button
            type="button"
            onClick={() => {
              setNewStage("new");
              setShowCreateModal(true);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0B1F3A] px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#132c52]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5] text-[#F5B301]" />
            <span>Request</span>
          </button>
        </div>
      </div>

      {/* Collapsible Filter Bar (Only shown when toggled or when filters are active) */}
      {(showFiltersPanel || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-2xs">
          <ClassicSelect
            size="sm"
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
            ariaLabel="Filter by status"
            className="min-w-[140px]"
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.value === "all" ? "Stage: All" : o.label,
            }))}
          />

          <ClassicSelect
            size="sm"
            value={priorityFilter}
            onChange={(val) => {
              setPriorityFilter(val);
              setPage(1);
            }}
            ariaLabel="Filter by priority"
            className="min-w-[130px]"
            options={[
              { value: "all", label: "Priority: All" },
              { value: "urgent", label: "Urgent Only" },
              { value: "standard", label: "Standard Only" },
            ]}
          />

          <ClassicSelect
            size="sm"
            value={plumberFilter}
            onChange={(val) => {
              setPlumberFilter(val);
              setPage(1);
            }}
            ariaLabel="Filter by plumber"
            className="min-w-[170px]"
            options={[
              { value: "all", label: "Owner: All Plumbers" },
              { value: "unassigned", label: "Unassigned" },
              ...approvedPlumbers.map((p) => ({
                value: p.id,
                label: p.full_name,
              })),
            ]}
          />

          <ClassicSelect
            size="sm"
            value={locationFilter}
            onChange={(val) => {
              setLocationFilter(val);
              setPage(1);
            }}
            ariaLabel="Filter by location"
            className="min-w-[160px]"
            options={[
              { value: "all", label: "Area: All Locations" },
              ...uniqueLocations.map((loc) => ({
                value: loc,
                label: loc,
              })),
            ]}
          />

          <ClassicSelect
            size="sm"
            value={dateRangeFilter}
            onChange={(val) => {
              setDateRangeFilter(val as "all" | "today" | "7d" | "30d");
              setPage(1);
            }}
            ariaLabel="Filter by date"
            className="min-w-[130px]"
            options={[
              { value: "all", label: "Date: Any" },
              { value: "today", label: "Last 24h" },
              { value: "7d", label: "Last 7 Days" },
              { value: "30d", label: "Last 30 Days" },
            ]}
          />

          <button
            type="button"
            onClick={() => {
              setUnreadOnly((v) => !v);
              setPage(1);
            }}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold ${
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
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <FilterX className="h-3.5 w-3.5" /> Reset
          </button>

          <button
            type="button"
            onClick={() => setShowSaveViewModal(true)}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2.5 text-xs font-semibold text-slate-600 hover:border-[#0B1F3A] hover:text-[#0B1F3A]"
          >
            <Bookmark className="h-3 w-3" /> Save Filter View
          </button>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-2 text-xs font-medium ${
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
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0B1F3A]/20 bg-[#0B1F3A] px-4 py-2 text-white">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold">
            <CheckSquare className="h-4 w-4 text-[#F5B301]" />
            {selectedIds.length} selected
          </span>
          <ClassicSelect
            size="sm"
            variant="dark"
            value=""
            placeholder="Set Stage..."
            onChange={(val) => {
              if (val) handleBulkAction("status", { status: val as RequestStatus });
            }}
            className="min-w-[140px]"
            options={[
              { value: "", label: "Set Stage..." },
              ...STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => ({
                value: s.value,
                label: s.label,
              })),
            ]}
          />
          <ClassicSelect
            size="sm"
            variant="dark"
            value=""
            placeholder="Assign Owner..."
            onChange={(val) => {
              if (val) handleBulkAction("assign", { plumberId: val });
            }}
            className="min-w-[160px]"
            options={[
              { value: "", label: "Assign Owner..." },
              ...approvedPlumbers.map((p) => ({
                value: p.id,
                label: p.full_name,
              })),
            ]}
          />
          <button
            type="button"
            onClick={() => handleBulkAction("priority", { priority: "urgent" })}
            className="h-7 rounded-lg bg-rose-500/90 px-2.5 text-xs font-semibold hover:bg-rose-500"
          >
            Mark Urgent
          </button>
          <button
            type="button"
            onClick={() =>
              handleBulkAction(activeSavedViewId === "archived" ? "restore" : "archive")
            }
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2.5 text-xs font-semibold hover:bg-white/20"
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

      {/* BIGIN-STYLE LIST VIEW */}
      {viewMode === "list" && (
        <>
          {/* Mobile Phone Card View (< 768px) */}
          <div className="space-y-2.5 md:hidden">
            {paginatedRequests.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 shadow-xs">
                No service requests match the current filters.
              </div>
            ) : (
              paginatedRequests.map((req) => {
                const contact = extractCustomerContact(req);
                const statusMeta = getStatusMeta(req.status);
                const hasUnread = unreadTickets.has(req.ticket_number);
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => openDetail(req)}
                    className={`w-full rounded-2xl border p-3.5 text-left shadow-xs transition active:opacity-90 ${
                      hasUnread
                        ? "border-[#F5B301] bg-amber-50/40"
                        : "border-slate-200 bg-white hover:border-[#0B1F3A]/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {hasUnread && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-[#F5B301]" />
                          )}
                          <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                            {req.ticket_number}
                          </span>
                          {req.priority === "urgent" && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm font-bold text-[#0B1F3A]">
                          {contact.name}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs font-medium text-slate-700">
                      {req.problem_category} • {req.address_in_kano}
                    </p>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                      <span className="truncate">
                        {req.assigned_technician ? `Plumber: ${req.assigned_technician}` : "Unassigned"}
                      </span>
                      <span className="shrink-0 font-bold text-[#0B1F3A]">
                        {req.quoted_amount != null ? formatNGN(req.quoted_amount) : "—"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="w-9 px-3 py-2.5">
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
                      className="rounded border-slate-300"
                      aria-label="Select all on page"
                    />
                  </th>
                  {visibleColumns.includes("ticket") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("ticket")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Request Deal <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("quote") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("quote")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Amount <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("status") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("status")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Stage <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("updated") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("updated_at")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Date <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("location") && (
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">Location</th>
                  )}
                  {visibleColumns.includes("customer") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("customer")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Contact Name <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("phone") && (
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">Phone</th>
                  )}
                  {visibleColumns.includes("service") && (
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">Service</th>
                  )}
                  {visibleColumns.includes("priority") && (
                    <th className="whitespace-nowrap px-3 py-2.5">
                      <button type="button" onClick={() => toggleSort("priority")} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-[#0B1F3A]">
                        Priority <ArrowUpDown className="h-3 w-3 text-slate-400" />
                      </button>
                    </th>
                  )}
                  {visibleColumns.includes("appointment") && (
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">Appointment</th>
                  )}
                  {visibleColumns.includes("plumber") && (
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-600">Assigned Owner</th>
                  )}
                  <th className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="relative inline-block">
                      <button
                        type="button"
                        onClick={() => setShowColumnMenu((s) => !s)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        title="Customize Columns"
                      >
                        <SlidersHorizontal className="h-3 w-3 text-[#F5B301]" /> Columns
                      </button>
                      {showColumnMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => setShowColumnMenu(false)}
                          />
                          <div className="absolute right-0 z-30 mt-1.5 w-48 rounded-xl border border-slate-200 bg-white p-2 text-left shadow-xl">
                            <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              Visible Columns
                            </p>
                            {ALL_COLUMNS.map((col) => (
                              <label
                                key={col.key}
                                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
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
                        </>
                      )}
                    </div>
                  </th>
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
                    const stageProg = getStageProgressMeta(req.status);
                    const hasUnread = unreadTickets.has(req.ticket_number);
                    const isChecked = selectedIds.includes(req.id);
                    return (
                      <tr
                        key={req.id}
                        onClick={() => openDetail(req)}
                        className={`group cursor-pointer transition-colors hover:bg-slate-50/90 ${
                          isChecked ? "bg-amber-50/50" : ""
                        }`}
                      >
                        <td
                          className="whitespace-nowrap px-3 py-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setSelectedIds((prev) =>
                                  e.target.checked ? [...prev, req.id] : prev.filter((id) => id !== req.id)
                                );
                              }}
                              className="rounded border-slate-300"
                              aria-label={`Select ${req.ticket_number}`}
                            />
                            {req.priority === "urgent" && (
                              <span
                                className="inline-block h-2 w-2 rounded-full bg-rose-500"
                                title="Urgent Priority"
                              />
                            )}
                          </div>
                        </td>

                        {/* Request Deal (Bigin Deal Name style with hover preview icon) */}
                        {visibleColumns.includes("ticket") && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDetail(req)}
                                className="font-semibold text-[#0B1F3A] hover:underline"
                              >
                                {req.ticket_number}
                              </button>
                              {hasUnread && (
                                <span
                                  className="inline-block h-2 w-2 rounded-full bg-[#F5B301]"
                                  title="Unread message"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => openDetail(req)}
                                title="Quick Preview"
                                className="opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-[#0B1F3A]"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}

                        {/* Amount */}
                        {visibleColumns.includes("quote") && (
                          <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-900">
                            {req.quoted_amount ? formatNGN(req.quoted_amount) : ""}
                          </td>
                        )}

                        {/* Stage (Bigin Segmented Progress Bar + Stage Label + Won/Lost Icon) */}
                        {visibleColumns.includes("status") && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => openDetail(req)}
                              className="inline-flex items-center gap-2 text-left"
                            >
                              <span className="inline-flex h-1.5 w-9 overflow-hidden rounded-full bg-slate-200">
                                <span
                                  className={`h-full rounded-full ${stageProg.barColor}`}
                                  style={{ width: `${Math.round((stageProg.step / stageProg.total) * 100)}%` }}
                                />
                              </span>
                              <span className="text-xs font-medium text-slate-800">
                                {statusMeta.label}
                              </span>
                              {stageProg.outcome === "won" && (
                                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                              )}
                              {stageProg.outcome === "lost" && (
                                <ThumbsDown className="h-3.5 w-3.5 text-rose-500" />
                              )}
                            </button>
                          </td>
                        )}

                        {/* Date */}
                        {visibleColumns.includes("updated") && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                            {new Date(req.updated_at || req.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                        )}

                        {/* Location */}
                        {visibleColumns.includes("location") && (
                          <td className="max-w-[160px] truncate whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                            {req.city_lga || req.address_in_kano}
                          </td>
                        )}

                        {/* Contact Name (Single-line clean contact like Bigin) */}
                        {visibleColumns.includes("customer") && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <button
                              type="button"
                              onClick={() => openDetail(req)}
                              className="inline-flex items-center gap-2 text-left font-medium text-slate-800 group-hover:text-[#0B1F3A]"
                            >
                              <span className="max-w-[165px] truncate">{contact.name}</span>
                              {contact.phone && !visibleColumns.includes("phone") && (
                                <span className="text-[11px] font-normal text-slate-400">
                                  {contact.phone}
                                </span>
                              )}
                            </button>
                          </td>
                        )}

                        {visibleColumns.includes("phone") && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                            {contact.phone || "—"}
                          </td>
                        )}

                        {/* Service */}
                        {visibleColumns.includes("service") && (
                          <td className="max-w-[160px] truncate whitespace-nowrap px-3 py-2.5 text-xs text-slate-700">
                            {req.problem_category}
                          </td>
                        )}

                        {/* Priority */}
                        {visibleColumns.includes("priority") && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <span
                              className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                req.priority === "urgent"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {req.priority}
                            </span>
                          </td>
                        )}

                        {visibleColumns.includes("appointment") && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                            {req.preferred_date || req.preferred_timing || "—"}
                          </td>
                        )}

                        {/* Assigned Owner (Bigin Deal Owner with Avatar + Name) */}
                        {visibleColumns.includes("plumber") && (
                          <td className="whitespace-nowrap px-3 py-2.5">
                            {req.assigned_technician ? (
                              <div className="inline-flex items-center gap-2">
                                <Avatar
                                  name={req.assigned_technician}
                                  src={
                                    (req.assigned_plumber_id &&
                                      plumberAvatarMap.get(req.assigned_plumber_id)) ||
                                    plumberAvatarMap.get(
                                      req.assigned_technician.trim().toLowerCase()
                                    )
                                  }
                                  size="xs"
                                />
                                <span className="max-w-[140px] truncate text-xs font-medium text-slate-800">
                                  {req.assigned_technician}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Unassigned</span>
                            )}
                          </td>
                        )}

                        {/* Hover Quick Actions + Kebab Menu */}
                        <td
                          className="whitespace-nowrap px-3 py-2.5 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openDetail(req)}
                              title="Edit Request"
                              className="hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-[#0B1F3A] group-hover:inline-flex"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/admin/communications?ticket=${req.ticket_number}`)}
                              title="Open Chat"
                              className="hidden h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-[#0B1F3A] group-hover:inline-flex"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </button>
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
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bigin-Style Summary & Pagination Footer Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Total Requests <strong className="ml-1 font-bold text-slate-900">{summaryStats.total}</strong>
              </span>
              <span>
                Open Requests <strong className="ml-1 font-bold text-slate-900">{summaryStats.open}</strong>
              </span>
              <span className="inline-flex items-center gap-1" title="Completed Requests">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />
                <strong className="font-bold text-slate-900">{summaryStats.won}</strong>
              </span>
              <span className="inline-flex items-center gap-1" title="Cancelled Requests">
                <ThumbsDown className="h-3.5 w-3.5 text-rose-500" />
                <strong className="font-bold text-slate-900">{summaryStats.lost}</strong>
              </span>
              {summaryStats.pipelineValue > 0 && (
                <span className="hidden sm:inline border-l border-slate-200 pl-3">
                  Pipeline Value <strong className="ml-1 font-bold text-[#0B1F3A]">{formatNGN(summaryStats.pipelineValue)}</strong>
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">Records per page</span>
                <ClassicSelect
                  size="sm"
                  value={String(pageSize)}
                  onChange={(val) => {
                    setPageSize(Number(val));
                    setPage(1);
                  }}
                  className="w-[72px]"
                  options={[
                    { value: "10", label: "10" },
                    { value: "25", label: "25" },
                    { value: "30", label: "30" },
                    { value: "50", label: "50" },
                  ]}
                />
              </div>
              <div className="flex items-center gap-1 font-semibold text-slate-800">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2">
                  {filteredRequests.length === 0 ? 0 : (safePage - 1) * pageSize + 1} to{" "}
                  {Math.min(safePage * pageSize, filteredRequests.length)}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

      {/* LIVE DISPATCH MAP VIEW (inDrive-style Admin Dispatch) */}
      {viewMode === "map" && (() => {
        const pinnedRequests = filteredRequests.filter(
          (r) =>
            !["completed", "cancelled"].includes(r.status) &&
            r.customer_lat != null &&
            r.customer_lng != null
        );
        const activeTicketsByPlumber = new Map<string, string[]>();
        for (const r of requests) {
          if (["completed", "cancelled"].includes(r.status)) continue;
          if (r.assigned_plumber_id) {
            const list = activeTicketsByPlumber.get(r.assigned_plumber_id) || [];
            list.push(r.ticket_number);
            activeTicketsByPlumber.set(r.assigned_plumber_id, list);
          }
        }

        const enrichedPlumbers = vettedPlumbers.map((p) => {
          const live = livePlumberById.get(p.id);
          const tickets = activeTicketsByPlumber.get(p.id) || [];
          const tracked = live ?? {
            plumberId: p.id,
            name: p.full_name,
            avatarUrl: p.avatar_url ?? undefined,
            isAvailable: p.is_available,
            ticketNumbers: tickets,
            lat: p.current_lat ?? null,
            lng: p.current_lng ?? null,
            accuracyM: null,
            accuracyClass: "unknown" as const,
            heading: null,
            speed: null,
            sharingEnabled: Boolean(p.is_available || tickets.length > 0),
            status: "unavailable" as const,
            statusLabel: "LOCATION UNAVAILABLE",
            ageSeconds: null,
            coordinatesAt: p.location_updated_at ?? null,
            lastConfirmedAt: p.location_updated_at ?? null,
          };
          const status = projectTrackedStatus(
            tracked,
            mapNowMs,
            adminTracking.serverOffsetMs
          );
          return { profile: p, tracked, status, tickets };
        });

        const filteredByRolePlumbers = enrichedPlumbers.filter((entry) => {
          if (mapFilter === "available") return entry.tracked.isAvailable;
          if (mapFilter === "busy") return !entry.tracked.isAvailable;
          if (mapFilter === "assigned") return entry.tickets.length > 0;
          if (mapFilter === "stale") {
            return (
              entry.status.status === "stale" ||
              entry.status.status === "last_seen"
            );
          }
          if (mapFilter === "no_access") {
            return (
              entry.status.status === "unavailable" ||
              entry.status.status === "not_sharing"
            );
          }
          return true;
        });

        const mapSearch = mapSearchQuery.trim().toLowerCase();
        const matchedRequestIds = new Set<string>();
        const matchedPlumberIds = new Set<string>();

        if (mapSearch) {
          for (const r of requests) {
            if (["completed", "cancelled"].includes(r.status)) continue;
            const matchesReq =
              r.ticket_number.toLowerCase().includes(mapSearch) ||
              (r.customer_name || "").toLowerCase().includes(mapSearch) ||
              (r.customer_phone || "").toLowerCase().includes(mapSearch) ||
              (r.assigned_technician || "").toLowerCase().includes(mapSearch);
            if (matchesReq) {
              matchedRequestIds.add(r.id);
              if (r.assigned_plumber_id) matchedPlumberIds.add(r.assigned_plumber_id);
              if (r.assigned_technician) {
                const techLower = r.assigned_technician.trim().toLowerCase();
                for (const p of vettedPlumbers) {
                  if (p.full_name.trim().toLowerCase() === techLower) {
                    matchedPlumberIds.add(p.id);
                  }
                }
              }
            }
          }
          for (const p of vettedPlumbers) {
            const matchesPlumber =
              p.full_name.toLowerCase().includes(mapSearch) ||
              (p.application_ref || "").toLowerCase().includes(mapSearch) ||
              p.id.toLowerCase().includes(mapSearch) ||
              (p.phone || "").toLowerCase().includes(mapSearch);
            if (matchesPlumber) {
              matchedPlumberIds.add(p.id);
              for (const r of requests) {
                if (["completed", "cancelled"].includes(r.status)) continue;
                if (
                  r.assigned_plumber_id === p.id ||
                  (r.assigned_technician &&
                    r.assigned_technician.trim().toLowerCase() === p.full_name.trim().toLowerCase())
                ) {
                  matchedRequestIds.add(r.id);
                }
              }
            }
          }
        }

        const visibleListPlumbers = mapSearch
          ? filteredByRolePlumbers.filter((entry) =>
              matchedPlumberIds.has(entry.profile.id)
            )
          : filteredByRolePlumbers;
        const visiblePinnedPlumbers = visibleListPlumbers.filter(
          (entry) => entry.tracked.lat != null && entry.tracked.lng != null
        );
        const visiblePinnedRequests = mapSearch
          ? pinnedRequests.filter((r) => matchedRequestIds.has(r.id))
          : pinnedRequests;

        const markers: LiveMapMarker[] = [
          ...visiblePinnedRequests.map((r) => ({
            id: `req:${r.id}`,
            lat: r.customer_lat!,
            lng: r.customer_lng!,
            label: `${r.ticket_number} (${r.customer_name || "Customer"})`,
            subtitle: `${r.problem_category} • ${r.address_in_kano}${
              r.assigned_technician ? ` • Plumber: ${r.assigned_technician}` : ""
            }`,
            kind: (r.assigned_plumber_id ? "customer" : "request") as LiveMapMarker["kind"],
          })),
          ...visiblePinnedPlumbers.map((entry) => {
            const { profile: p, tracked, status, tickets } = entry;
            const ticketBadge =
              tickets.length > 0
                ? `${tickets[0]}${tickets.length > 1 ? ` +${tickets.length - 1}` : ""}`
                : status.label;
            return {
              id: `plumber:${p.id}`,
              lat: tracked.lat!,
              lng: tracked.lng!,
              label: `${p.full_name} • ${ticketBadge}`,
              subtitle:
                tickets.length > 0
                  ? `Tracking: ${tickets.join(", ")} • ${status.label}${
                      status.ageSeconds != null
                        ? ` (${formatAgo(status.ageSeconds)})`
                        : ""
                    }`
                  : `${tracked.isAvailable ? "On Duty" : "Off Duty"} • ${status.label}${
                      status.ageSeconds != null
                        ? ` (${formatAgo(status.ageSeconds)})`
                        : ""
                    }`,
              kind: (status.status === "live" ? "plumber_online" : "plumber_offline") as LiveMapMarker["kind"],
            };
          }),
        ];
        const focusedReq =
          visiblePinnedRequests.find((r) => r.id === selectedMapRequestId) ||
          visiblePinnedRequests[0] ||
          null;
        const assignedLivePlumber = focusedReq
          ? visiblePinnedPlumbers.find(
              (entry) =>
                entry.profile.id === focusedReq.assigned_plumber_id ||
                (focusedReq.assigned_technician &&
                  entry.profile.full_name.trim().toLowerCase() ===
                    focusedReq.assigned_technician.trim().toLowerCase())
            ) || null
          : null;
        const mapPolyline: [number, number][] | undefined =
          focusedReq &&
          focusedReq.customer_lat != null &&
          focusedReq.customer_lng != null &&
          assignedLivePlumber
            ? [
                [assignedLivePlumber.tracked.lat!, assignedLivePlumber.tracked.lng!],
                [focusedReq.customer_lat, focusedReq.customer_lng],
              ]
            : undefined;
        const rankedPlumbers = focusedReq
          ? [...visibleListPlumbers].sort((a, b) => {
              const aHas = a.tracked.lat != null && a.tracked.lng != null;
              const bHas = b.tracked.lat != null && b.tracked.lng != null;
              if (aHas && !bHas) return -1;
              if (!aHas && bHas) return 1;
              if (!aHas && !bHas) return 0;
              const dA = calculateDistanceKm(
                a.tracked.lat!,
                a.tracked.lng!,
                focusedReq.customer_lat!,
                focusedReq.customer_lng!
              );
              const dB = calculateDistanceKm(
                b.tracked.lat!,
                b.tracked.lng!,
                focusedReq.customer_lat!,
                focusedReq.customer_lng!
              );
              return dA - dB;
            })
          : visibleListPlumbers;

        const handleMapTrackSubmit = (e: React.FormEvent) => {
          e.preventDefault();
          if (!mapSearch) {
            setFocusedMapMarkerId(null);
            return;
          }
          if (visiblePinnedRequests.length > 0 && visiblePinnedPlumbers.length > 0) {
            setSelectedMapRequestId(visiblePinnedRequests[0].id);
            setFocusedMapMarkerId(null);
          } else if (visiblePinnedPlumbers.length > 0) {
            setFocusedMapMarkerId(`plumber:${visiblePinnedPlumbers[0].profile.id}`);
          } else if (visiblePinnedRequests.length > 0) {
            setSelectedMapRequestId(visiblePinnedRequests[0].id);
            setFocusedMapMarkerId(`req:${visiblePinnedRequests[0].id}`);
          } else {
            setFocusedMapMarkerId(null);
          }
        };

        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3A]">
                    Live Dispatch Map
                  </h2>
                  <p className="text-xs text-slate-500">
                    {visiblePinnedRequests.length} pinned active requests • {visiblePinnedPlumbers.length} plumbers with GPS
                    {adminTracking.realtimeConnected ? " • Realtime Live" : " • Polling Sync"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { id: "all", label: "All" },
                      { id: "available", label: "Available" },
                      { id: "busy", label: "Off Duty" },
                      { id: "assigned", label: "Assigned" },
                      { id: "stale", label: "Stale" },
                      { id: "no_access", label: "No GPS" },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setMapFilter(f.id)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                        mapFilter === f.id
                          ? "bg-[#0B1F3A] text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <LiveMap
                markers={
                  assignedLivePlumber
                    ? markers.filter(
                        (m) => m.id !== `plumber:${assignedLivePlumber.profile.id}`
                      )
                    : markers
                }
                remotePlumber={
                  assignedLivePlumber &&
                  assignedLivePlumber.tracked.lat != null &&
                  assignedLivePlumber.tracked.lng != null
                    ? {
                        lat: assignedLivePlumber.tracked.lat,
                        lng: assignedLivePlumber.tracked.lng,
                        heading: assignedLivePlumber.tracked.heading,
                        speed: assignedLivePlumber.tracked.speed,
                        accuracyM: assignedLivePlumber.tracked.accuracyM,
                        status: assignedLivePlumber.status.status,
                        statusLabel: assignedLivePlumber.status.label,
                        coordinatesAtMs: assignedLivePlumber.tracked.coordinatesAt
                          ? Date.parse(assignedLivePlumber.tracked.coordinatesAt)
                          : null,
                        label: assignedLivePlumber.profile.full_name,
                      }
                    : null
                }
                roadRoutePoints={
                  adminMapRoadRoute?.ok &&
                  adminMapRoadRoute.points &&
                  adminMapRoadRoute.points.length >= 2
                    ? adminMapRoadRoute.points
                    : undefined
                }
                straightLine={
                  !(
                    adminMapRoadRoute?.ok &&
                    adminMapRoadRoute.points &&
                    adminMapRoadRoute.points.length >= 2
                  )
                    ? mapPolyline
                    : undefined
                }
                focusMarkerId={focusedMapMarkerId}
                selectedMarkerId={focusedMapMarkerId}
                heightClassName="h-[440px]"
                onMarkerClick={(markerId) => {
                  if (markerId.startsWith("req:")) {
                    const reqId = markerId.slice(4);
                    setSelectedMapRequestId(reqId);
                    setFocusedMapMarkerId(markerId);
                  } else if (markerId.startsWith("plumber:")) {
                    setFocusedMapMarkerId(markerId);
                  }
                }}
              />
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  {focusedReq ? `Plumbers & Tracking (${focusedReq.ticket_number})` : "Plumber Locations"}
                </h3>
                <form onSubmit={handleMapTrackSubmit} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={mapSearchQuery}
                    onChange={(e) => {
                      setMapSearchQuery(e.target.value);
                      setFocusedMapMarkerId(null);
                    }}
                    placeholder="Enter ticket # (BP-...) or plumber..."
                    className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs text-[#0B1F3A] placeholder:text-slate-400 focus:border-[#F5B301] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="inline-flex h-9 shrink-0 items-center rounded-lg bg-[#0B1F3A] px-3 text-xs font-bold text-white hover:bg-[#132f57]"
                  >
                    Track
                  </button>
                  {mapSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setMapSearchQuery("");
                        setFocusedMapMarkerId(null);
                      }}
                      className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Clear
                    </button>
                  )}
                </form>
                {mapSearch && matchedRequestIds.size === 0 && matchedPlumberIds.size === 0 && (
                  <p className="text-[11px] font-medium text-amber-700">
                    No active request or plumber matched &ldquo;{mapSearchQuery.trim()}&rdquo;.
                  </p>
                )}
                {mapSearch &&
                  (matchedRequestIds.size > 0 || matchedPlumberIds.size > 0) &&
                  visiblePinnedRequests.length === 0 &&
                  visiblePinnedPlumbers.length === 0 && (
                    <p className="text-[11px] font-medium text-amber-700">
                      Match found, but neither the customer nor plumber has shared GPS coordinates yet.
                    </p>
                  )}
              </div>
              {focusedReq && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                  <p className="font-bold text-[#0B1F3A]">
                    {focusedReq.customer_name || focusedReq.ticket_number}
                  </p>
                  <p className="text-slate-600">{focusedReq.address_in_kano}</p>
                  {adminMapRoadRoute?.ok &&
                    adminMapRoadRoute.distanceM != null &&
                    adminMapRoadRoute.durationS != null && (
                    <p className="mt-1 font-semibold text-emerald-700">
                      Road Route: {formatDistance(adminMapRoadRoute.distanceM / 1000)} (~{Math.max(1, Math.round(adminMapRoadRoute.durationS / 60))} min)
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => openDetail(focusedReq)}
                    className="mt-2 text-xs font-bold text-[#0B1F3A] underline decoration-[#F5B301]"
                  >
                    Open Request & Assign →
                  </button>
                </div>
              )}
              {rankedPlumbers.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                  No matching plumbers in this view. Plumbers appear with coordinates when they are On Duty or on an active job with GPS enabled.
                </p>
              ) : (
                <div className="max-h-[320px] space-y-2 overflow-y-auto">
                  {rankedPlumbers.map((entry) => {
                    const { profile: p, tracked, status, tickets } = entry;
                    const hasCoords = tracked.lat != null && tracked.lng != null;
                    const dist =
                      focusedReq && hasCoords
                        ? calculateDistanceKm(
                            tracked.lat!,
                            tracked.lng!,
                            focusedReq.customer_lat!,
                            focusedReq.customer_lng!
                          )
                        : null;
                    const isFocused = focusedMapMarkerId === `plumber:${p.id}`;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!hasCoords}
                        onClick={() => {
                          if (hasCoords) setFocusedMapMarkerId(`plumber:${p.id}`);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2.5 text-left text-xs transition ${
                          isFocused
                            ? "border-[#F5B301] bg-amber-50/50"
                            : "border-slate-200 bg-white hover:border-[#0B1F3A]/40"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-semibold text-[#0B1F3A]">{p.full_name}</p>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                  status.status === "live"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : status.status === "stale" || status.status === "last_seen"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {status.label}
                              </span>
                            </div>
                            <p className="truncate text-[11px] font-mono font-semibold text-[#0B1F3A]/80">
                              {tickets.length > 0
                                ? tickets.join(", ")
                                : tracked.isAvailable
                                ? "Available (No active job)"
                                : "Off Duty"}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {status.ageSeconds != null
                                ? `GPS ${formatAgo(status.ageSeconds)}`
                                : "No GPS fix"}
                              {tracked.speed != null && tracked.speed >= 0.8
                                ? ` • Moving (${Math.round(tracked.speed * 3.6)} km/h)`
                                : ""}
                              {status.accuracyLabel ? ` • ${status.accuracyLabel}` : ""}
                            </p>
                          </div>
                        </div>
                        {dist != null && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            {formatDistance(dist)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* BIGIN-STYLE KANBAN PIPELINE VIEW (Horizontal Stage Columns + Drag-and-Drop + Quick "+ Request" per Stage) */}
      {viewMode === "board" && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex gap-2.5 overflow-x-auto bg-slate-100/60 p-2.5">
            {BOARD_COLUMNS.map((col) => {
              const colItems = filteredRequests.filter((r) => col.statuses.includes(r.status));
              const totalQuoted = colItems.reduce((acc, r) => acc + (r.quoted_amount || 0), 0);
              const isOver = dragOverColId === col.id;
              const isCollapsed = collapsedColIds.includes(col.id);
              const colIds = colItems.map((r) => r.id);
              const allColSelected = colIds.length > 0 && colIds.every((id) => selectedIds.includes(id));

              if (isCollapsed) {
                return (
                  <div
                    key={col.id}
                    onClick={() =>
                      setCollapsedColIds((prev) => prev.filter((id) => id !== col.id))
                    }
                    title={`Expand ${col.title} (${colItems.length})`}
                    className={`flex min-h-[540px] w-11 shrink-0 cursor-pointer flex-col items-center justify-between rounded-lg border border-slate-200 border-t-[3px] ${col.accentClass} bg-white py-3 transition hover:bg-slate-50`}
                  >
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {colItems.length}
                    </span>
                    <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-bold tracking-wide text-slate-700">
                      {col.title}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                  </div>
                );
              }

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
                  className={`group/col flex h-[calc(100vh-240px)] min-h-[520px] w-[258px] shrink-0 flex-col rounded-lg border border-t-[3px] ${col.accentClass} transition ${
                    isOver
                      ? "border-[#F5B301] bg-amber-50/50 ring-2 ring-[#F5B301]/30"
                      : "border-slate-200/90 bg-[#F8FAFC]"
                  }`}
                >
                  {/* Stage Column Header */}
                  <div className="flex items-start justify-between border-b border-slate-200/80 bg-white px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-bold text-[#0B1F3A]">
                        {col.title}
                      </h3>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
                        <span className="font-bold text-[#0B1F3A]">{formatNGN(totalQuoted)}</span>
                        <span className="mx-1 text-slate-300">•</span>
                        <span className="font-normal text-slate-500">
                          {colItems.length} {colItems.length === 1 ? "Request" : "Requests"}
                        </span>
                      </p>
                    </div>
                    {colItems.length > 0 && (
                      <div className="ml-2 flex items-center gap-1 pt-0.5 opacity-80 transition group-hover/col:opacity-100">
                        <input
                          type="checkbox"
                          aria-label={`Select all in ${col.title}`}
                          checked={allColSelected}
                          onChange={() => {
                            if (allColSelected) {
                              setSelectedIds((prev) => prev.filter((id) => !colIds.includes(id)));
                            } else {
                              setSelectedIds((prev) => Array.from(new Set([...prev, ...colIds])));
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#0B1F3A] focus:ring-[#0B1F3A]"
                        />
                      </div>
                    )}
                  </div>

                  {/* Stage Scrollable Body */}
                  <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {colItems.length === 0 ? (
                      <>
                        {/* Bigin Stage Description Banner at Top When Empty */}
                        <div className="rounded-md border border-slate-200/80 bg-slate-100/90 px-2.5 py-1.5 text-[11px] text-slate-500">
                          {col.description}
                        </div>
                        <div className="flex flex-1 items-center justify-center py-12 text-center">
                          <p className="text-xs font-medium text-slate-400">This stage is empty</p>
                        </div>
                      </>
                    ) : (
                      <>
                        {colItems.map((req) => {
                          const contact = extractCustomerContact(req);
                          const hasUnread = unreadTickets.has(req.ticket_number);
                          const isChecked = selectedIds.includes(req.id);
                          const assignedPlumber = approvedPlumbers.find(
                            (p) => p.id === req.assigned_plumber_id
                          );
                          const ownerName =
                            assignedPlumber?.full_name || req.assigned_technician || "";
                          const dateStr = new Date(
                            req.preferred_date || req.created_at
                          ).toLocaleDateString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            year: "numeric",
                          });

                          return (
                            <div
                              key={req.id}
                              draggable
                              onClick={() => openDetail(req)}
                              onDragStart={() => setDraggedRequestId(req.id)}
                              onDragEnd={() => {
                                setDraggedRequestId(null);
                                setDragOverColId(null);
                              }}
                              className={`group/card relative cursor-pointer rounded-lg border bg-white p-2.5 shadow-2xs transition hover:border-[#0B1F3A]/40 hover:shadow-md active:cursor-grabbing ${
                                isChecked
                                  ? "border-[#F5B301] ring-1 ring-[#F5B301]/40"
                                  : "border-slate-200/90"
                              }`}
                            >
                              {/* Top Row: Request Title ("Request for {Name}") + Hover Checkbox & Ticket */}
                              <div className="flex items-start justify-between gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openDetail(req)}
                                  className="min-w-0 flex-1 text-left"
                                >
                                  <p className="truncate text-xs font-bold text-[#0B1F3A] group-hover/card:underline">
                                    Request for {contact.name}
                                  </p>
                                </button>
                                <div
                                  className="flex shrink-0 items-center gap-1"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="font-mono text-[10px] font-medium text-slate-400">
                                    {req.ticket_number}
                                  </span>
                                  <input
                                    type="checkbox"
                                    aria-label={`Select ${req.ticket_number}`}
                                    checked={isChecked}
                                    onChange={() =>
                                      setSelectedIds((prev) =>
                                        prev.includes(req.id)
                                          ? prev.filter((x) => x !== req.id)
                                          : [...prev, req.id]
                                      )
                                    }
                                    className={`h-3.5 w-3.5 rounded border-slate-300 text-[#0B1F3A] transition ${
                                      isChecked
                                        ? "opacity-100"
                                        : "opacity-0 group-hover/card:opacity-100"
                                    }`}
                                  />
                                </div>
                              </div>

                              {/* Second Row: Contact Name & Service Category */}
                              <button
                                type="button"
                                onClick={() => openDetail(req)}
                                className="mt-0.5 block w-full text-left"
                              >
                                <p className="truncate text-[11px] font-medium text-slate-700">
                                  {contact.name}
                                </p>
                                <p className="truncate text-[11px] text-slate-500">
                                  {req.problem_category}
                                  {req.city_lga || req.address_in_kano
                                    ? ` • ${req.city_lga || req.address_in_kano}`
                                    : ""}
                                </p>
                              </button>

                              {/* Third Row (Bigin Footer): "₦0.00 • MM/DD/YYYY" on left + Activity/Priority/Owner on right */}
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-1 text-[11px]">
                                  <span className="font-bold text-slate-900">
                                    {formatNGN(req.quoted_amount || 0)}
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="truncate text-slate-600">{dateStr}</span>
                                </div>

                                <div className="flex shrink-0 items-center gap-1">
                                  {hasUnread && (
                                    <span
                                      title="Unread customer message"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded border border-rose-200 bg-rose-50 text-rose-600"
                                    >
                                      <MessageCircle className="h-3 w-3" />
                                    </span>
                                  )}
                                  {req.priority === "urgent" ? (
                                    <span
                                      title="Urgent Priority"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded border border-rose-200 bg-rose-50 text-rose-600"
                                    >
                                      <CheckSquare className="h-3 w-3" />
                                    </span>
                                  ) : req.status === "completed" ? (
                                    <span
                                      title="Completed (Won)"
                                      className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-emerald-600"
                                    >
                                      <ThumbsUp className="h-3 w-3" />
                                    </span>
                                  ) : null}
                                  {ownerName && (
                                    <span title={`Assigned to ${ownerName}`}>
                                      <Avatar
                                        name={ownerName}
                                        src={
                                          (req.assigned_plumber_id &&
                                            plumberAvatarMap.get(req.assigned_plumber_id)) ||
                                          plumberAvatarMap.get(ownerName.trim().toLowerCase())
                                        }
                                        size="xs"
                                      />
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Subtle Quick Stage Mover on Card Hover (Accessible + Zero Visual Clutter) */}
                              <div
                                className="mt-1.5 hidden border-t border-slate-100 pt-1.5 group-hover/card:block"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ClassicSelect
                                  size="sm"
                                  ariaLabel={`Move ${req.ticket_number} to stage`}
                                  value={req.status}
                                  onChange={async (val) => {
                                    const next = val as RequestStatus;
                                    const prev = req.status;
                                    setRequests((list) =>
                                      list.map((x) => (x.id === req.id ? { ...x, status: next } : x))
                                    );
                                    const res = await updateRequestStatusByTicketAction(
                                      req.ticket_number,
                                      next
                                    );
                                    if (!res.success) {
                                      setRequests((list) =>
                                        list.map((x) => (x.id === req.id ? { ...x, status: prev } : x))
                                      );
                                    }
                                  }}
                                  options={STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => ({
                                    value: s.value,
                                    label: `Move to: ${s.label}`,
                                  }))}
                                />
                              </div>
                            </div>
                          );
                        })}

                        {/* Bigin Stage Description Box Below Cards */}
                        <div className="mt-1 rounded-md border border-slate-200/70 bg-slate-100/80 px-2.5 py-1.5 text-[11px] text-slate-500">
                          {col.description}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Sticky Bottom Column Footer: "+ Request" on left, Collapse icon on right */}
                  <div className="flex items-center justify-between border-t border-slate-200/80 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewStage(col.targetStatus);
                        setShowCreateModal(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-[#0B1F3A] transition hover:text-[#132c52]"
                    >
                      <Plus className="h-3.5 w-3.5 text-[#F5B301]" />
                      <span>Request</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedColIds((prev) =>
                          prev.includes(col.id) ? prev : [...prev, col.id]
                        )
                      }
                      title={`Collapse ${col.title} stage`}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-[#0B1F3A]"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Pipeline Tab Bar & Summary Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
            <div className="flex items-center gap-4">
              <div className="inline-flex items-center gap-1.5 border-b-2 border-[#F5B301] pb-0.5 font-bold text-[#0B1F3A]">
                <span>Service Pipeline</span>
              </div>
              <span className="text-slate-300">|</span>
              <span>
                Total Requests • <strong className="text-slate-900">{filteredRequests.length}</strong>
              </span>
              <span>
                Open •{" "}
                <strong className="text-slate-900">
                  {
                    filteredRequests.filter(
                      (r) => !["completed", "cancelled", "rejected"].includes(r.status)
                    ).length
                  }
                </strong>
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <ThumbsUp className="h-3.5 w-3.5" />
                <span>•</span>
                <strong>{filteredRequests.filter((r) => r.status === "completed").length}</strong>
              </span>
              <span className="inline-flex items-center gap-1 text-rose-600">
                <ThumbsDown className="h-3.5 w-3.5" />
                <span>•</span>
                <strong>
                  {
                    filteredRequests.filter((r) =>
                      ["cancelled", "rejected"].includes(r.status)
                    ).length
                  }
                </strong>
              </span>
            </div>

            {collapsedColIds.length > 0 && (
              <button
                type="button"
                onClick={() => setCollapsedColIds([])}
                className="text-xs font-semibold text-[#0B1F3A] hover:underline"
              >
                Expand all stages ({collapsedColIds.length} collapsed)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bigin-Style "+ Request" Quick Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">Create Service Request</h3>
                <p className="text-xs text-slate-500">
                  Log a phone, WhatsApp, or walk-in customer request directly into the pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateNewRequest} className="space-y-3.5 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="e.g. Ibrahim Abdullahi"
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
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="e.g. 08063298575"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Pipeline Stage
                  </label>
                  <ClassicSelect
                    size="sm"
                    value={newStage}
                    onChange={(val) => setNewStage(val as RequestStatus)}
                    options={STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => ({
                      value: s.value,
                      label: s.label,
                    }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Service Category
                  </label>
                  <input
                    type="text"
                    value={newProblemCategory}
                    onChange={(e) => setNewProblemCategory(e.target.value)}
                    placeholder="e.g. Pipework & Leaks"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Location / Area *
                  </label>
                  <input
                    type="text"
                    required
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="e.g. Hotoro, Kano"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Priority
                  </label>
                  <ClassicSelect
                    size="sm"
                    value={newPriority}
                    onChange={(val) => setNewPriority(val as "standard" | "urgent")}
                    options={[
                      { value: "standard", label: "Standard" },
                      { value: "urgent", label: "Urgent" },
                    ]}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Assign Plumber (Owner)
                  </label>
                  <ClassicSelect
                    size="sm"
                    value={newAssignedPlumberId}
                    onChange={setNewAssignedPlumberId}
                    options={[
                      { value: "", label: "Unassigned" },
                      ...approvedPlumbers.map((p) => ({
                        value: p.id,
                        label: p.full_name,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Quoted Amount (₦)
                  </label>
                  <input
                    type="number"
                    value={newQuotedAmount}
                    onChange={(e) => setNewQuotedAmount(e.target.value)}
                    placeholder="Optional"
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Target / Appointment Date
                  </label>
                  <input
                    type="date"
                    value={newPreferredDate}
                    onChange={(e) => setNewPreferredDate(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  Issue Description / Scope
                </label>
                <textarea
                  rows={2}
                  value={newIssueDescription}
                  onChange={(e) => setNewIssueDescription(e.target.value)}
                  placeholder="Describe the plumbing issue or customer request..."
                  className="w-full rounded-lg border border-slate-200 p-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-9 rounded-lg border border-slate-200 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingRequest}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 text-xs font-bold text-white hover:bg-[#132c52] disabled:opacity-60"
                >
                  {creatingRequest ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F5B301]" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 text-[#F5B301]" />
                  )}
                  <span>{creatingRequest ? "Creating..." : "Save Request"}</span>
                </button>
              </div>
            </form>
          </div>
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
