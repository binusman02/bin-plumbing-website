"use client";

import { startTransition as startBackgroundTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Crosshair,
  DollarSign,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  RefreshCw,
  User,
  Wrench,
} from "lucide-react";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
import { LiveMap, type LiveMapMarker } from "@/components/map/LiveMap";
import { ProfileManager } from "@/components/portal/ProfileManager";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import {
  markPlumberArrivedAction,
  postCommunicationMessageAction,
  startPlumberTripAction,
  stopLocationSharingAction,
  submitQuotationAction,
  togglePlumberAvailabilityAction,
  updateRequestStatusByTicketAction,
} from "@/app/actions/marketplace-actions";
import { logoutPlumberAction } from "@/app/actions/portal-auth";
import { PlumberAuthView } from "@/components/plumber/PlumberAuthView";
import { PlumberJobDrawer } from "@/components/plumber/PlumberJobDrawer";
import { PortalShell, type PortalNavGroup } from "@/components/portal/PortalShell";
import { useNowTick, useRoadRoute } from "@/hooks/useLiveTracking";
import { usePlumberLocationSharing } from "@/hooks/usePlumberLocationSharing";
import { usePortalRealtimeChat } from "@/hooks/usePortalRealtimeChat";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { calculateDistanceKm, formatDistance } from "@/lib/geo";
import { deriveJobTripState, describeAccuracy, formatAgo } from "@/lib/live-location";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  JobMessage,
  PaymentRecord,
  PlumberProfile,
  QuotationLineItem,
  RequestStatus,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

interface PlumberPortalClientProps {
  initialPlumberId?: string | null;
  authenticatedAccount?: {
    fullName: string;
    phone: string;
    email: string;
  } | null;
  plumbers: PlumberProfile[];
  requests: ServiceRequestRecord[];
  quotations: StructuredQuotation[];
  payments: PaymentRecord[];
  messages: JobMessage[];
}

type PlumberTab = "home" | "jobs" | "messages" | "earnings" | "profile";

export default function PlumberPortalClient({
  initialPlumberId = null,
  authenticatedAccount = null,
  plumbers,
  requests: initialRequests,
  quotations: initialQuotations,
  payments,
  messages: initialMessages,
}: PlumberPortalClientProps) {
  const router = useRouter();
  const lastSyncRef = useRef(0);
  const myTicketSetRef = useRef<Set<string>>(new Set());
  const authenticatedPlumberId = initialPlumberId;

  const [activeTab, setActiveTabState] = useState<PlumberTab>("home");
  const [activeTicketForChat, setActiveTicketForChat] = useState<string>("");
  const [activeChatMessageId, setActiveChatMessageId] = useState<string | null>(null);
  const [chatNavKey, setChatNavKey] = useState<string>("");

  const quoteSeqRef = useRef(0);
  const setActiveTab = useCallback((tab: PlumberTab) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "home") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      if (tab !== "messages") {
        url.searchParams.delete("ticket");
        url.searchParams.delete("message");
      }
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const param = sp.get("tab") as PlumberTab | null;
      const ticketParam = sp.get("ticket");
      const messageParam = sp.get("message");

      if (ticketParam !== null) {
        setActiveTicketForChat(ticketParam);
      }
      if (messageParam !== null) {
        setActiveChatMessageId(messageParam);
      }
      if (ticketParam || messageParam) {
        setChatNavKey(`url-${ticketParam || ""}-${messageParam || ""}`);
      }

      if (
        param === "home" ||
        param === "jobs" ||
        param === "messages" ||
        param === "earnings" ||
        param === "profile"
      ) {
        setActiveTabState(param);
      } else if (messageParam) {
        setActiveTabState("messages");
      }
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState<ServiceRequestRecord[]>(initialRequests);
  const [quotations, setQuotations] = useState<StructuredQuotation[]>(initialQuotations);
  const [messages, setMessages] = useState<JobMessage[]>(initialMessages);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    setQuotations(initialQuotations);
  }, [initialQuotations]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const triggerPortalRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastSyncRef.current < 1500) return;
    lastSyncRef.current = now;
    startBackgroundTransition(() => {
      router.refresh();
    });
  }, [router]);

  useRealtimeHub({
    role: "plumber",
    userId: authenticatedPlumberId || undefined,
    enabled: Boolean(authenticatedPlumberId),
    onDataSync: (data) => {
      if (
        data?.ticketNumber &&
        data.entity !== "service_requests" &&
        !myTicketSetRef.current.has(data.ticketNumber)
      ) {
        return;
      }
      triggerPortalRefresh();
    },
  });

  useEffect(() => {
    if (!authenticatedPlumberId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeTab !== "messages") {
        triggerPortalRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authenticatedPlumberId, activeTab, triggerPortalRefresh]);

  const [selectedJob, setSelectedJob] = useState<ServiceRequestRecord | null>(null);
  const [seenJobStatuses, setSeenJobStatuses] = useState<Record<string, string>>({});

  // Quotation form state inside Job Detail
  const [labourAmt, setLabourAmt] = useState("");
  const [materialsAmt, setMaterialsAmt] = useState("");
  const [transportAmt, setTransportAmt] = useState("");
  const [otherAmt, setOtherAmt] = useState("");
  const [scopeSummary, setScopeSummary] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuotationLineItem[]>([
    { id: "item-1", name: "", quantity: 1, unitPrice: 0 },
  ]);
  const [nextJobStatus, setNextJobStatus] = useState<RequestStatus>("in_progress");
  const [busyAction, setBusyAction] = useState<
    "status" | "quote" | "trip" | "arrived" | "quick_status" | "availability" | null
  >(null);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [quoteFeedback, setQuoteFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [tripFeedback, setTripFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const currentPlumber = useMemo(
    () => plumbers.find((p) => p.id === authenticatedPlumberId) || null,
    [plumbers, authenticatedPlumberId]
  );

  const seenStorageKey = currentPlumber ? `bin_plumber_seen_jobs_${currentPlumber.id}` : null;

  useEffect(() => {
    if (!seenStorageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(seenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setSeenJobStatuses(parsed as Record<string, string>);
        }
      }
    } catch {
      // Ignore invalid storage
    }
  }, [seenStorageKey]);

  const markJobSeen = useCallback(
    (jobId: string, status: string) => {
      setSeenJobStatuses((prev) => {
        if (prev[jobId] === status) return prev;
        const next = { ...prev, [jobId]: status };
        if (seenStorageKey && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(seenStorageKey, JSON.stringify(next));
          } catch {
            // Ignore storage quota errors
          }
        }
        return next;
      });
    },
    [seenStorageKey]
  );

  const [isAvailable, setIsAvailable] = useState(
    currentPlumber?.is_available ?? true
  );

  const myJobs = useMemo(() => {
    if (!currentPlumber) return [];
    return requests.filter(
      (r) =>
        r.assigned_plumber_id === currentPlumber.id ||
        r.assigned_technician === currentPlumber.full_name
    );
  }, [requests, currentPlumber]);

  const activeFieldJobs = useMemo(
    () => myJobs.filter((j) => !["completed", "cancelled"].includes(j.status)),
    [myJobs]
  );

  const activeFieldTickets = useMemo(
    () => activeFieldJobs.map((j) => j.ticket_number),
    [activeFieldJobs]
  );

  const [overviewMapJobId, setOverviewMapJobId] = useState<string>("");
  const [focusMarkerId, setFocusMarkerId] = useState<string | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);

  const activeOverviewJob = useMemo(
    () =>
      activeFieldJobs.find((j) => j.id === overviewMapJobId) ||
      activeFieldJobs.find((j) => j.customer_lat != null && j.customer_lng != null) ||
      activeFieldJobs[0] ||
      null,
    [activeFieldJobs, overviewMapJobId]
  );

  const hasActiveFieldJob = activeFieldTickets.length > 0;
  const activeTripJobs = useMemo(
    () => activeFieldJobs.filter((j) => deriveJobTripState(j.history) === "on_the_way"),
    [activeFieldJobs]
  );
  const activeTripTickets = useMemo(
    () => activeTripJobs.map((j) => j.ticket_number),
    [activeTripJobs]
  );
  // Sharing runs only between Start trip and Arrived (or trip cancelled/completed).
  const shouldShareGps = Boolean(authenticatedPlumberId && activeTripTickets.length > 0);

  const locationSharing = usePlumberLocationSharing({
    enabled: Boolean(authenticatedPlumberId),
    shareToServer: shouldShareGps,
    activeTickets: activeTripTickets,
  });
  const wakeLock = useScreenWakeLock(shouldShareGps);
  const nowMs = useNowTick(
    10_000,
    shouldShareGps || Boolean(locationSharing.lastConfirmedAtMs)
  );

  const plumberCoords = locationSharing.deviceCoords
    ? locationSharing.deviceCoords
    : currentPlumber?.current_lat != null && currentPlumber?.current_lng != null
    ? { lat: currentPlumber.current_lat, lng: currentPlumber.current_lng }
    : null;

  const {
    route: overviewRoadRoute,
    status: overviewRouteStatus,
    retry: retryOverviewRoute,
  } = useRoadRoute({
    as: "plumber",
    ticket: activeOverviewJob?.ticket_number ?? undefined,
    plumber: plumberCoords,
    destination:
      activeOverviewJob?.customer_lat != null && activeOverviewJob?.customer_lng != null
        ? { lat: activeOverviewJob.customer_lat, lng: activeOverviewJob.customer_lng }
        : null,
    enabled: Boolean(
      activeTab === "home" &&
        activeOverviewJob &&
        plumberCoords &&
        activeOverviewJob.customer_lat != null &&
        activeOverviewJob.customer_lng != null
    ),
  });

  const myTicketSet = useMemo(
    () => new Set(myJobs.map((j) => j.ticket_number)),
    [myJobs]
  );

  useEffect(() => {
    myTicketSetRef.current = myTicketSet;
  }, [myTicketSet]);

  const myMessages = useMemo(
    () => messages.filter((m) => myTicketSet.has(m.ticket_number)),
    [messages, myTicketSet]
  );

  const unreadMessageTickets = useMemo(() => {
    const set = new Set<string>();
    for (const m of myMessages) {
      if (
        m.sender_role !== "plumber" &&
        !(Array.isArray(m.read_by) && m.read_by.includes("plumber"))
      ) {
        set.add(m.ticket_number);
      }
    }
    return set;
  }, [myMessages]);

  const hasJobSignal = useCallback(
    (job: ServiceRequestRecord) => {
      if (unreadMessageTickets.has(job.ticket_number)) {
        return true;
      }
      const seenStatus = seenJobStatuses[job.id];
      if (seenStatus === undefined) {
        return job.status !== "completed" && job.status !== "cancelled";
      }
      return seenStatus !== job.status;
    },
    [seenJobStatuses, unreadMessageTickets]
  );

  const unseenJobsCount = useMemo(
    () => myJobs.filter((j) => hasJobSignal(j)).length,
    [myJobs, hasJobSignal]
  );

  const unreadMessagesCount = useMemo(
    () =>
      myMessages.filter(
        (m) =>
          m.sender_role !== "plumber" &&
          !(Array.isArray(m.read_by) && m.read_by.includes("plumber"))
      ).length,
    [myMessages]
  );

  usePortalRealtimeChat({
    role: "plumber",
    userId: currentPlumber?.id,
    isAvailable,
    ticketSet: myTicketSet,
    activeTicket: activeTicketForChat || myJobs[0]?.ticket_number || "",
    isMessagesTabActive: activeTab === "messages",
    setMessages,
  });

  const myPayments = useMemo(
    () => payments.filter((p) => myTicketSet.has(p.ticket_number)),
    [payments, myTicketSet]
  );

  const verifiedEarnings = useMemo(
    () =>
      myPayments
        .filter((p) => p.verification_status === "verified")
        .reduce((acc, p) => acc + (Number(p.plumber_payable) || 0), 0),
    [myPayments]
  );

  const filteredJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return myJobs;
    return myJobs.filter(
      (j) =>
        j.ticket_number.toLowerCase().includes(q) ||
        j.address_in_kano.toLowerCase().includes(q) ||
        (j.problem_category || j.property_type).toLowerCase().includes(q)
    );
  }, [myJobs, searchQuery]);

  // Unauthenticated or unapproved Plumber -> Auth & Application Gate
  if (
    !authenticatedPlumberId ||
    !currentPlumber ||
    currentPlumber.verification_status !== "approved"
  ) {
    return (
      <PlumberAuthView
        authenticatedAccount={authenticatedAccount}
        currentPlumber={currentPlumber}
      />
    );
  }

  // Authenticated Dashboard -> Shared PortalShell
  const navGroups: PortalNavGroup[] = [
    {
      label: "Workspace",
      items: [
        { id: "home", label: "Home", icon: LayoutDashboard, onClick: () => setActiveTab("home") },
        {
          id: "jobs",
          label: "Assigned Jobs",
          icon: Wrench,
          badge: unseenJobsCount || undefined,
          onClick: () => setActiveTab("jobs"),
        },
        {
          id: "messages",
          label: "Messages",
          icon: MessageSquare,
          badge: unreadMessagesCount || undefined,
          onClick: () => setActiveTab("messages"),
        },
        { id: "earnings", label: "Earnings", icon: DollarSign, onClick: () => setActiveTab("earnings") },
      ],
    },
    {
      label: "Account",
      items: [{ id: "profile", label: "Profile", icon: User, onClick: () => setActiveTab("profile") }],
    },
  ];

  const bottomNavItems = [
    { id: "home", label: "Home", icon: LayoutDashboard, onClick: () => setActiveTab("home") },
    { id: "jobs", label: "Jobs", icon: Wrench, onClick: () => setActiveTab("jobs") },
    { id: "messages", label: "Messages", icon: MessageSquare, onClick: () => setActiveTab("messages") },
    { id: "earnings", label: "Earnings", icon: DollarSign, onClick: () => setActiveTab("earnings") },
    { id: "profile", label: "Profile", icon: User, onClick: () => setActiveTab("profile") },
  ];

  const openJobDetail = (job: ServiceRequestRecord) => {
    markJobSeen(job.id, job.status);
    if (unreadMessageTickets.has(job.ticket_number)) {
      setMessages((prev) =>
        prev.map((m) =>
          m.ticket_number === job.ticket_number && m.sender_role !== "plumber"
            ? { ...m, read_by: Array.from(new Set([...(m.read_by || []), "plumber"])) }
            : m
        )
      );
    }
    void fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketNumber: job.ticket_number, viewerRole: "plumber" }),
    }).then((res) => {
      if (!res.ok) return;
      broadcastRealtimeEvent("messages_read", {
        ticketNumber: job.ticket_number,
        viewerRole: "plumber",
      });
      broadcastRealtimeEvent("notification_sync", { recipientRole: "plumber" });
      window.dispatchEvent(new Event("notifications-refresh"));
    });
    setSelectedJob(job);
    setNextJobStatus(job.status);
    setStatusFeedback(null);
    setQuoteFeedback(null);
    setTripFeedback(null);
    setLabourAmt("");
    setMaterialsAmt("");
    setTransportAmt("");
    setOtherAmt("");
    setScopeSummary("");
    quoteSeqRef.current += 1;
    setQuoteItems([{ id: `item-${quoteSeqRef.current}`, name: "", quantity: 1, unitPrice: 0 }]);
  };

  const handleSubmitQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob || busyAction === "quote") return;
    const labour = Number(labourAmt) || 0;
    const validItems = quoteItems.filter((it) => it.name.trim().length > 0);
    const itemsTotal = validItems.reduce(
      (sum, it) => sum + Math.max(1, Number(it.quantity) || 1) * Math.max(0, Number(it.unitPrice) || 0),
      0
    );
    const materials = validItems.length > 0 ? itemsTotal : Number(materialsAmt) || 0;
    const transport = Number(transportAmt) || 0;
    const other = Number(otherAmt) || 0;
    if (labour <= 0) {
      setQuoteFeedback({ type: "error", message: "Please enter a valid labour amount." });
      return;
    }
    setQuoteFeedback(null);
    setBusyAction("quote");
    try {
      const res = await submitQuotationAction({
        requestId: selectedJob.id,
        ticketNumber: selectedJob.ticket_number,
        plumberId: currentPlumber.id,
        plumberName: currentPlumber.full_name,
        labourCharge: labour,
        materialsCost: materials,
        transportCharge: transport,
        otherCharges: other,
        notes: scopeSummary.trim() || undefined,
        items: validItems,
      });
      if (res.success && res.quotation) {
        setQuotations((prev) => [res.quotation!, ...prev]);
        setQuoteFeedback({
          type: "success",
          message:
            "Quotation sent to the customer for approval. It will appear on your dashboard once approved.",
        });
        setLabourAmt("");
        setMaterialsAmt("");
        setTransportAmt("");
        setOtherAmt("");
        setScopeSummary("");
        setQuoteItems([{ id: `item-${Date.now()}`, name: "", quantity: 1, unitPrice: 0 }]);
        broadcastRealtimeEvent("data_sync", {
          entity: "quotations",
          ticketNumber: selectedJob.ticket_number,
        });
        broadcastRealtimeEvent("notification_sync", {});
        router.refresh();
      } else {
        setQuoteFeedback({
          type: "error",
          message: res.error || "Could not submit quotation.",
        });
      }
    } finally {
      setBusyAction((cur) => (cur === "quote" ? null : cur));
    }
  };

  const handleStatusUpdate = async (overrideStatus?: RequestStatus) => {
    if (!selectedJob) return;
    const actionKey = overrideStatus ? "quick_status" : "status";
    if (busyAction === actionKey) return;
    const statusToApply = overrideStatus || nextJobStatus;
    if (overrideStatus) {
      setTripFeedback(null);
    } else {
      setStatusFeedback(null);
    }
    setBusyAction(actionKey);
    try {
      const res = await updateRequestStatusByTicketAction(
        selectedJob.ticket_number,
        statusToApply
      );
      if (res.success) {
        const updated = { ...selectedJob, status: statusToApply };
        markJobSeen(selectedJob.id, statusToApply);
        setNextJobStatus(statusToApply);
        setRequests((prev) =>
          prev.map((r) => (r.ticket_number === selectedJob.ticket_number ? updated : r))
        );
        setSelectedJob(updated);
        if (overrideStatus) {
          setTripFeedback({
            type: "success",
            message: `Job status updated to ${getStatusMeta(statusToApply).label}.`,
          });
        } else {
          setStatusFeedback({
            type: "success",
            message: `Job status updated to ${getStatusMeta(statusToApply).label}.`,
          });
        }
        broadcastRealtimeEvent("data_sync", {
          entity: "service_requests",
          ticketNumber: selectedJob.ticket_number,
        });
        broadcastRealtimeEvent("notification_sync", {});
        router.refresh();
      } else {
        const errMsg = res.error || "Could not update status.";
        if (overrideStatus) {
          setTripFeedback({ type: "error", message: errMsg });
        } else {
          setStatusFeedback({ type: "error", message: errMsg });
        }
      }
    } finally {
      setBusyAction((cur) => (cur === actionKey ? null : cur));
    }
  };

  const handleStartTrip = async (ticketNumber: string) => {
    if (busyAction === "trip") return;
    setTripFeedback(null);
    setBusyAction("trip");
    try {
      const res = await startPlumberTripAction(
        ticketNumber,
        locationSharing.deviceFix
          ? {
              lat: locationSharing.deviceFix.lat,
              lng: locationSharing.deviceFix.lng,
              accuracyM: locationSharing.deviceFix.accuracyM,
            }
          : plumberCoords
      );
      if (res.success) {
        const entry = {
          id: `trip-start-${Date.now()}`,
          timestamp: res.startedAt || new Date().toISOString(),
          actor: currentPlumber.full_name,
          action: "trip_started",
          details: "Trip started",
        };
        setRequests((prev) =>
          prev.map((r) =>
            r.ticket_number === ticketNumber
              ? { ...r, history: [...(r.history || []), entry] }
              : r
          )
        );
        setSelectedJob((prev) =>
          prev && prev.ticket_number === ticketNumber
            ? { ...prev, history: [...(prev.history || []), entry] }
            : prev
        );
        setTripFeedback({
          type: "success",
          message: "Trip started. Live location sharing is now active.",
        });
        broadcastRealtimeEvent("data_sync", { entity: "service_requests", ticketNumber });
        broadcastRealtimeEvent("notification_sync", {});
        router.refresh();
      } else {
        setTripFeedback({ type: "error", message: res.error || "Could not start trip." });
      }
    } finally {
      setBusyAction((cur) => (cur === "trip" ? null : cur));
    }
  };

  const handleMarkArrived = async (ticketNumber: string) => {
    if (busyAction === "arrived") return;
    setTripFeedback(null);
    setBusyAction("arrived");
    try {
      const res = await markPlumberArrivedAction(
        ticketNumber,
        locationSharing.deviceFix
          ? {
              lat: locationSharing.deviceFix.lat,
              lng: locationSharing.deviceFix.lng,
              accuracyM: locationSharing.deviceFix.accuracyM,
            }
          : plumberCoords
      );
      if (res.success) {
        const entry = {
          id: `trip-arrived-${Date.now()}`,
          timestamp: res.arrivedAt || new Date().toISOString(),
          actor: currentPlumber.full_name,
          action: "arrived",
          details: "Plumber arrived at property",
        };
        setRequests((prev) =>
          prev.map((r) =>
            r.ticket_number === ticketNumber
              ? { ...r, history: [...(r.history || []), entry] }
              : r
          )
        );
        setSelectedJob((prev) =>
          prev && prev.ticket_number === ticketNumber
            ? { ...prev, history: [...(prev.history || []), entry] }
            : prev
        );
        setTripFeedback({
          type: "success",
          message: "Arrival recorded. Customer and admin have been notified.",
        });
        broadcastRealtimeEvent("data_sync", { entity: "service_requests", ticketNumber });
        broadcastRealtimeEvent("notification_sync", {});
        router.refresh();
      } else {
        setTripFeedback({ type: "error", message: res.error || "Could not record arrival." });
      }
    } finally {
      setBusyAction((cur) => (cur === "arrived" ? null : cur));
    }
  };

  const handleToggleAvailability = async () => {
    if (busyAction === "availability") return;
    const next = !isAvailable;
    setIsAvailable(next);
    broadcastRealtimeEvent("plumber_availability", {
      plumberId: currentPlumber.id,
      isAvailable: next,
    });
    setBusyAction("availability");
    try {
      await togglePlumberAvailabilityAction(currentPlumber.id, next);
      if (!next && !hasActiveFieldJob) {
        await stopLocationSharingAction();
      }
    } finally {
      setBusyAction((cur) => (cur === "availability" ? null : cur));
    }
  };

  const pageTitleMap: Record<PlumberTab, string> = {
    home: "Overview",
    jobs: "Assigned Jobs",
    messages: "Job Messages",
    earnings: "Earnings & Payouts",
    profile: "Technician Profile",
  };

  return (
    <PortalShell
      portalTitle="Technician Portal"
      pageTitle={pageTitleMap[activeTab]}
      navGroups={navGroups}
      activeItemId={activeTab}
      bottomNavItems={bottomNavItems}
      userName={currentPlumber.full_name}
      userRoleLabel={currentPlumber.application_ref || "Approved Plumber"}
      userAvatarUrl={currentPlumber.avatar_url || null}
      portalRole="plumber"
      onNotificationNavigate={(dest, navReq) => {
        if (
          navReq?.tab === "messages" ||
          dest.includes("tab=messages") ||
          Boolean(navReq?.messageId)
        ) {
          setActiveTabState("messages");
          setActiveTicketForChat(navReq?.ticket || "");
          setActiveChatMessageId(navReq?.messageId || null);
          setChatNavKey(
            navReq?.navKey || `nav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          );
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", navReq?.destination || dest);
          }
        } else if (dest.includes("tab=earnings")) {
          setActiveTab("earnings");
        } else {
          setActiveTab("jobs");
        }
      }}
      onSignOut={async () => {
        await logoutPlumberAction();
      }}
      unreadCount={unseenJobsCount}
      globalSearch={searchQuery}
      onGlobalSearchChange={setSearchQuery}
      searchPlaceholder="Search assigned jobs..."
      storageKey="bin_plumber_sidebar_collapsed"
    >
      {activeTab === "home" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                    locationSharing.phase === "active"
                      ? "bg-emerald-500 animate-pulse"
                      : locationSharing.phase === "starting" ||
                        locationSharing.phase === "weak_signal" ||
                        locationSharing.phase === "offline" ||
                        locationSharing.phase === "gps_timeout"
                      ? "bg-amber-500"
                      : locationSharing.phase === "permission_denied" ||
                        locationSharing.phase === "update_failed" ||
                        locationSharing.phase === "not_allowed"
                      ? "bg-red-500"
                      : "bg-slate-400"
                  }`}
                />
                <div className="space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold text-[#0B1F3A]">
                      {locationSharing.phase === "active"
                        ? "Location Sharing Active"
                        : locationSharing.phase === "starting"
                        ? "Starting GPS..."
                        : locationSharing.phase === "permission_denied"
                        ? "Location Permission Required"
                        : locationSharing.phase === "weak_signal"
                        ? "GPS Signal Weak"
                        : locationSharing.phase === "offline"
                        ? "Connection Lost"
                        : locationSharing.phase === "update_failed"
                        ? "Location Update Failed"
                        : locationSharing.phase === "gps_timeout"
                        ? "GPS Signal Timed Out"
                        : locationSharing.phase === "gps_unavailable"
                        ? "GPS Signal Unavailable"
                        : locationSharing.phase === "not_allowed"
                        ? "Approval Required to Share"
                        : "Live GPS Sharing Off"}
                    </p>
                    {locationSharing.accuracyM != null && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                        {describeAccuracy(locationSharing.accuracyM).label}
                      </span>
                    )}
                    {locationSharing.lastConfirmedAtMs != null && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Last Successful Update:{" "}
                        {formatAgo(
                          Math.max(
                            0,
                            Math.round((nowMs - locationSharing.lastConfirmedAtMs) / 1000)
                          )
                        )}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-600">
                    {locationSharing.message ||
                      (hasActiveFieldJob
                        ? "Location is being shared with the customer assigned to your active job and authorized administrators until completion."
                        : isAvailable
                        ? "Your live location is shared with authorized dispatch administrators while On Duty."
                        : "Turn on Go On Duty or have an active job to share your live location.")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {shouldShareGps && (
                  <button
                    type="button"
                    disabled={locationSharing.retrying}
                    onClick={locationSharing.retry}
                    className={`relative z-10 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition disabled:cursor-wait disabled:opacity-70 ${
                      locationSharing.phase === "active"
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-[#0B1F3A] text-white hover:bg-[#132f57]"
                    }`}
                  >
                    {locationSharing.retrying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MapPin className="h-3.5 w-3.5" />
                    )}
                    {locationSharing.retrying
                      ? "Checking GPS..."
                      : locationSharing.phase === "active"
                      ? "Sync GPS Now"
                      : "Retry GPS"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleAvailability}
                  disabled={busyAction === "availability"}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-bold transition ${
                    isAvailable
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {busyAction === "availability" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {isAvailable ? "Go Off Duty (On Duty)" : "Go On Duty"}
                </button>
              </div>
            </div>
            <p className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-relaxed text-slate-400">
              Privacy &amp; Device Notice: GPS coordinates are only collected while this portal is open in the foreground and you are On Duty or assigned an active job, and stop when Off Duty with no active job. Browser tracking pauses if the browser is closed or suspended by your phone.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Assigned Jobs
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">{myJobs.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Completed Jobs
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">
                {myJobs.filter((j) => j.status === "completed").length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Verified Earnings
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">
                {formatNGN(verifiedEarnings)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Rating
              </p>
              <p className="mt-2 text-lg font-bold text-[#0B1F3A]">
                {currentPlumber.total_jobs > 0 && currentPlumber.rating != null
                  ? `${currentPlumber.rating.toFixed(1)} / 5`
                  : "No ratings yet"}
              </p>
            </div>
          </div>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">
                  Live Navigation &amp; Job Map
                </h3>
                <p className="text-xs text-slate-500">
                  Keep this page open while travelling so your live GPS stays synced with your customer and dispatch.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activeFieldJobs.length > 1 && (
                  <ClassicSelect
                    value={activeOverviewJob?.id || ""}
                    onChange={(val) => {
                      setOverviewMapJobId(val);
                      setFocusMarkerId(null);
                      setFocusSeq((n) => n + 1);
                    }}
                    options={activeFieldJobs.map((j) => ({
                      value: j.id,
                      label: `${j.ticket_number} (${j.customer_name || j.problem_category})`,
                    }))}
                    ariaLabel="Select active job to navigate"
                  />
                )}
                {plumberCoords && (
                  <button
                    type="button"
                    onClick={() => {
                      setFocusMarkerId("plumber-self");
                      setFocusSeq((n) => n + 1);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    <Crosshair className="h-3.5 w-3.5 text-[#F5B301]" />
                    My Location
                  </button>
                )}
                {activeOverviewJob?.customer_lat != null &&
                  activeOverviewJob?.customer_lng != null && (
                    <button
                      type="button"
                      onClick={() => {
                        setFocusMarkerId("customer-job");
                        setFocusSeq((n) => n + 1);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#132f57]"
                    >
                      <Navigation className="h-3.5 w-3.5 text-[#F5B301]" />
                      Customer Pin
                    </button>
                  )}
              </div>
            </div>

            {activeOverviewJob &&
              activeOverviewJob.customer_lat != null &&
              activeOverviewJob.customer_lng != null &&
              plumberCoords && (() => {
                if (
                  overviewRoadRoute?.ok &&
                  overviewRoadRoute.distanceM != null &&
                  overviewRoadRoute.durationS != null
                ) {
                  const mins = Math.max(1, Math.round(overviewRoadRoute.durationS / 60));
                  const nextStep = overviewRoadRoute.steps?.[0]?.instruction;
                  return (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-900">
                      <div className="space-y-0.5">
                        <p className="font-semibold">
                          {formatDistance(overviewRoadRoute.distanceM / 1000)} by road (~{mins} min drive)
                        </p>
                        {nextStep && (
                          <p className="text-[11px] text-emerald-800">
                            Next: {nextStep}
                          </p>
                        )}
                      </div>
                      {locationSharing.accuracyM != null && (
                        <span className="rounded bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {describeAccuracy(locationSharing.accuracyM).label}
                        </span>
                      )}
                    </div>
                  );
                }
                const km = calculateDistanceKm(
                  plumberCoords.lat,
                  plumberCoords.lng,
                  activeOverviewJob.customer_lat,
                  activeOverviewJob.customer_lng
                );
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    <span className="font-semibold">
                      {formatDistance(km)} direct distance to property
                    </span>
                    {locationSharing.accuracyM != null && (
                      <span className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {describeAccuracy(locationSharing.accuracyM).label}
                      </span>
                    )}
                  </div>
                );
              })()}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-6">
                <LiveMap
                  heightClassName="h-72 md:h-auto md:aspect-square"
                  focusMarkerId={focusMarkerId}
                  focusSeq={focusSeq}
                  ownPosition={locationSharing.deviceFix}
                  destination={
                    activeOverviewJob?.customer_lat != null && activeOverviewJob?.customer_lng != null
                      ? {
                          lat: activeOverviewJob.customer_lat,
                          lng: activeOverviewJob.customer_lng,
                        }
                      : null
                  }
                  navigationMode={
                    activeOverviewJob != null &&
                    deriveJobTripState(activeOverviewJob.history) === "on_the_way"
                  }
                  onNeedReroute={retryOverviewRoute}
                  accuracyCircle={
                    !locationSharing.deviceFix && plumberCoords && locationSharing.accuracyM != null
                      ? {
                          lat: plumberCoords.lat,
                          lng: plumberCoords.lng,
                          radiusM: locationSharing.accuracyM,
                        }
                      : null
                  }
                  markers={(() => {
                    const list: LiveMapMarker[] = [];
                    if (
                      activeOverviewJob &&
                      activeOverviewJob.customer_lat != null &&
                      activeOverviewJob.customer_lng != null
                    ) {
                      list.push({
                        id: "customer-job",
                        lat: activeOverviewJob.customer_lat,
                        lng: activeOverviewJob.customer_lng,
                        label: activeOverviewJob.customer_name || "Customer Property",
                        subtitle: `${activeOverviewJob.ticket_number} • ${activeOverviewJob.address_in_kano}`,
                        kind: "customer",
                      });
                    }
                    if (!locationSharing.deviceFix && plumberCoords) {
                      list.push({
                        id: "plumber-self",
                        lat: plumberCoords.lat,
                        lng: plumberCoords.lng,
                        label: "You (Live GPS)",
                        subtitle:
                          locationSharing.phase === "active"
                            ? "Live location sharing active"
                            : "Current device position",
                        kind:
                          locationSharing.phase === "active"
                            ? "plumber_online"
                            : "plumber_offline",
                      });
                    }
                    return list;
                  })()}
                  roadRoutePoints={
                    overviewRoadRoute?.ok &&
                    overviewRoadRoute.points &&
                    overviewRoadRoute.points.length >= 2
                      ? overviewRoadRoute.points
                      : undefined
                  }
                  straightLine={
                    !(
                      overviewRoadRoute?.ok &&
                      overviewRoadRoute.points &&
                      overviewRoadRoute.points.length >= 2
                    ) &&
                    plumberCoords &&
                    activeOverviewJob?.customer_lat != null &&
                    activeOverviewJob?.customer_lng != null
                      ? [
                          [plumberCoords.lat, plumberCoords.lng],
                          [activeOverviewJob.customer_lat, activeOverviewJob.customer_lng],
                        ]
                      : undefined
                  }
                />
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-6">
                {activeOverviewJob ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Active Job
                        </p>
                        <p className="font-mono text-sm font-bold text-[#0B1F3A]">
                          {activeOverviewJob.ticket_number}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          getStatusMeta(activeOverviewJob.status).className
                        }`}
                      >
                        {getStatusMeta(activeOverviewJob.status).label}
                      </span>
                    </div>

                    <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <p className="font-semibold text-[#0B1F3A]">
                        {activeOverviewJob.problem_category || activeOverviewJob.property_type}
                      </p>
                      <p className="text-slate-700">
                        Customer: <span className="font-medium">{activeOverviewJob.customer_name}</span>
                      </p>
                      <p className="text-slate-600">{activeOverviewJob.address_in_kano}</p>
                      <p className="text-[11px] text-slate-500">
                        Property Pin:{" "}
                        {activeOverviewJob.customer_lat != null &&
                        activeOverviewJob.customer_lng != null
                          ? "Pinned on map with live route"
                          : "Address only (customer has not pinned map coordinates yet)"}
                      </p>
                    </div>

                    {activeOverviewJob.customer_lat != null &&
                    activeOverviewJob.customer_lng != null ? (
                      plumberCoords ? (
                        overviewRoadRoute?.ok &&
                        overviewRoadRoute.steps &&
                        overviewRoadRoute.steps.length > 0 ? (
                          <div className="rounded-lg border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                                Turn-by-Turn Directions
                              </p>
                              <button
                                type="button"
                                onClick={retryOverviewRoute}
                                className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#0B1F3A]"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Refresh
                              </button>
                            </div>
                            <ol className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-xs">
                              {overviewRoadRoute.steps.map((step, idx) => (
                                <li
                                  key={`${idx}-${step.instruction}`}
                                  className="flex items-start justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/70 px-2.5 py-1.5"
                                >
                                  <span className="text-slate-800">
                                    <span className="mr-1.5 font-bold text-[#0B1F3A]">
                                      {idx + 1}.
                                    </span>
                                    {step.instruction}
                                  </span>
                                  {step.distanceM > 0 && (
                                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                                      {step.distanceM < 1000
                                        ? `${Math.round(step.distanceM)} m`
                                        : `${(step.distanceM / 1000).toFixed(1)} km`}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : overviewRouteStatus === "loading" ? (
                          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B1F3A]" />
                            Calculating road directions to customer...
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 text-xs text-amber-900">
                            <span>
                              Road directions unavailable right now. Showing direct line on map.
                            </span>
                            <button
                              type="button"
                              onClick={retryOverviewRoute}
                              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Retry Route
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
                          Waiting for your live GPS fix to calculate road directions.
                        </div>
                      )
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
                        Customer did not drop a map pin for this job — navigate using the street address above.
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap">
                      <button
                        type="button"
                        onClick={() => openJobDetail(activeOverviewJob)}
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0B1F3A] transition hover:bg-slate-100 active:scale-[0.98]"
                      >
                        Open Job Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTicketForChat(activeOverviewJob.ticket_number);
                          setActiveChatMessageId(null);
                          setChatNavKey(`open-${activeOverviewJob.ticket_number}-${Date.now()}`);
                          setActiveTab("messages");
                        }}
                        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white transition hover:bg-[#132f57] active:scale-[0.98]"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-[#F5B301]" />
                        Message
                      </button>
                      {activeOverviewJob.customer_phone && (
                        <a
                          href={`tel:${activeOverviewJob.customer_phone}`}
                          className="col-span-2 inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98] sm:col-span-1"
                        >
                          <Phone className="h-3.5 w-3.5 text-emerald-600" />
                          Call Customer
                        </a>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 py-4 text-center">
                    <p className="text-sm font-bold text-[#0B1F3A]">No Active Job Assigned</p>
                    <p className="text-xs text-slate-500">
                      Your live GPS pin is shown on the map while you are On Duty. When a job is assigned, the customer&apos;s property pin and road route will appear right here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-[#0B1F3A]">Recent Assigned Jobs</h3>
              <button
                type="button"
                onClick={() => setActiveTab("jobs")}
                className="text-sm font-semibold text-[#0B1F3A] hover:underline"
              >
                View all
              </button>
            </div>
            {myJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No jobs assigned to you yet.
              </p>
            ) : (
              <div className="space-y-3">
                {myJobs.slice(0, 5).map((job) => {
                  const badge = getStatusMeta(job.status);
                  const hasSignal = hasJobSignal(job);
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => openJobDetail(job)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition hover:border-[#F5B301] ${
                        hasSignal
                          ? "border-[#F5B301]/70 bg-amber-50/30"
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          {hasSignal && (
                            <span
                              className="inline-block h-2 w-2 rounded-full bg-[#F5B301]"
                              title="Unviewed job or status update"
                            />
                          )}
                          <p className="font-mono text-xs font-bold text-[#0B1F3A]">
                            {job.ticket_number}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">
                          {job.problem_category || job.property_type}
                        </p>
                        <p className="text-xs text-slate-500">{job.address_in_kano}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <Wrench className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-base font-semibold text-slate-700">No assigned jobs yet</p>
            </div>
          ) : (
            filteredJobs.map((job) => {
              const badge = getStatusMeta(job.status);
              const hasSignal = hasJobSignal(job);
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => openJobDetail(job)}
                  className={`w-full rounded-xl border p-4 text-left shadow-sm transition hover:border-[#F5B301] ${
                    hasSignal
                      ? "border-[#F5B301]/70 bg-amber-50/30"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        {hasSignal && (
                          <span
                            className="inline-block h-2 w-2 rounded-full bg-[#F5B301]"
                            title="Unviewed job or status update"
                          />
                        )}
                        <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {job.ticket_number}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-[#0B1F3A]">
                        {job.problem_category || job.property_type}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-slate-600">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {job.address_in_kano}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">{formatDateTime(job.created_at)}</p>
                </button>
              );
            })
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <WhatsAppChatWorkspace
          actorRole="plumber"
          actorId={currentPlumber.id}
          actorName={currentPlumber.full_name}
          requests={myJobs}
          initialMessages={myMessages}
          initialTicket={
            activeTicketForChat ||
            (activeChatMessageId ? null : myJobs[0]?.ticket_number || null)
          }
          initialMessageId={activeChatMessageId}
          navigationKey={chatNavKey}
          onTargetChange={(ticket, messageId) => {
            setActiveTicketForChat(ticket || "");
            setActiveChatMessageId(messageId || null);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "messages");
              if (ticket) url.searchParams.set("ticket", ticket);
              else url.searchParams.delete("ticket");
              if (messageId) url.searchParams.set("message", messageId);
              else url.searchParams.delete("message");
              window.history.replaceState(
                null,
                "",
                url.pathname + url.search + url.hash
              );
            }
          }}
          emptyTitle="No job conversations yet"
          emptyDescription="Messages for your assigned jobs with Operations and customers appear here."
          onTicketRead={(ticket) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.ticket_number === ticket && m.sender_role !== "plumber"
                  ? { ...m, read_by: Array.from(new Set([...(m.read_by || []), "plumber"])) }
                  : m
              )
            );
          }}
        />
      )}

      {activeTab === "earnings" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Verified Net Payouts
            </p>
            <p className="mt-1 text-3xl font-bold text-[#0B1F3A]">
              {formatNGN(verifiedEarnings)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Commission applies to labour only; materials are separate.
            </p>
          </div>

          {myPayments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No payment records yet.
            </div>
          ) : (
            <div className="space-y-3">
              {myPayments.map((p) => {
                const badge = getStatusMeta(p.verification_status);
                return (
                  <div
                    key={p.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {p.ticket_number}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 text-base font-bold text-[#0B1F3A]">
                      Payout: {formatNGN(p.plumber_payable)}
                    </p>
                    <p className="text-xs text-slate-600">
                      Labour {formatNGN(p.labour_portion)} • Materials{" "}
                      {formatNGN(p.materials_portion)} • Commission{" "}
                      {formatNGN(p.company_commission)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(p.payment_date || p.created_at)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">Dispatch Availability</h3>
              <p className="text-xs text-slate-500">
                Toggle whether Operations Dispatch can assign new emergency or scheduled jobs to you.
              </p>
            </div>
            <button
              type="button"
              onClick={handleToggleAvailability}
              className={`rounded-xl px-4 py-2 text-sm font-bold ${
                isAvailable
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {isAvailable ? "Available for Jobs" : "Unavailable"}
            </button>
          </div>
          <ProfileManager
            role="plumber"
            initialData={{
              id: currentPlumber.id,
              fullName: currentPlumber.full_name,
              phone: currentPlumber.phone,
              email: currentPlumber.email || "",
              avatarUrl: currentPlumber.avatar_url || null,
              residentialLocation: currentPlumber.residential_location || "",
              preferredLocations: currentPlumber.preferred_locations || [],
              skills: currentPlumber.skills || [],
              availability: currentPlumber.availability || "",
              verificationStatus: currentPlumber.verification_status,
              rating: currentPlumber.rating,
              totalJobs: currentPlumber.total_jobs,
              roleLabel: "Verified Plumber",
            }}
          />
        </div>
      )}

      <PlumberJobDrawer
        selectedJob={selectedJob}
        plumberName={currentPlumber.full_name}
        plumberId={currentPlumber.id}
        plumberCoords={plumberCoords}
        nextJobStatus={nextJobStatus}
        setNextJobStatus={setNextJobStatus}
        labourAmt={labourAmt}
        setLabourAmt={setLabourAmt}
        materialsAmt={materialsAmt}
        setMaterialsAmt={setMaterialsAmt}
        transportAmt={transportAmt}
        setTransportAmt={setTransportAmt}
        otherAmt={otherAmt}
        setOtherAmt={setOtherAmt}
        scopeSummary={scopeSummary}
        setScopeSummary={setScopeSummary}
        quoteItems={quoteItems}
        setQuoteItems={setQuoteItems}
        quotations={quotations}
        busyAction={busyAction}
        statusFeedback={statusFeedback}
        quoteFeedback={quoteFeedback}
        tripFeedback={tripFeedback}
        deviceFix={locationSharing.deviceFix}
        wakeLockActive={wakeLock.active}
        onStartTrip={handleStartTrip}
        onMarkArrived={handleMarkArrived}
        onNeedReroute={retryOverviewRoute}
        onClose={() => setSelectedJob(null)}
        onStatusUpdate={() => handleStatusUpdate()}
        onQuickStatusChange={(st) => handleStatusUpdate(st)}
        onSubmitQuote={handleSubmitQuote}
        onOpenChat={(ticketNumber) => {
          setSelectedJob(null);
          setActiveTicketForChat(ticketNumber);
          setActiveChatMessageId(null);
          setChatNavKey(`open-${ticketNumber}-${Date.now()}`);
          setActiveTabState("messages");
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.set("tab", "messages");
            url.searchParams.set("ticket", ticketNumber);
            url.searchParams.delete("message");
            window.history.replaceState(
              null,
              "",
              url.pathname + url.search + url.hash
            );
          }
        }}
        onUploadJobPhoto={async (ticketNumber, photoName, url) => {
          const jobObj = requests.find((r) => r.ticket_number === ticketNumber);
          const res = await postCommunicationMessageAction({
            requestId: jobObj?.id || selectedJob?.id || "",
            ticketNumber,
            senderRole: "plumber",
            senderName: currentPlumber.full_name,
            recipientRole: "admin",
            message: `Job photo uploaded: ${photoName}`,
            attachment: {
              url,
              name: photoName,
              mimeType: "image/jpeg",
              size: 0,
            },
          });
          if (res.success && res.message) {
            setMessages((prev) => [...prev, res.message!]);
          }
        }}
      />
    </PortalShell>
  );
}
