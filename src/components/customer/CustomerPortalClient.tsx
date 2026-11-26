"use client";

import { startTransition as startBackgroundTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Crosshair,
  Eye,
  Landmark,
  LayoutDashboard,
  Loader2,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Navigation,
  Plus,
  Printer,
  Star,
  ThumbsDown,
  ThumbsUp,
  Upload,
  User,
  Wrench,
  X,
} from "lucide-react";
import { LiveMap, type LiveMapMarker } from "@/components/map/LiveMap";
import { pushUrlIfChanged } from "@/lib/history";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
import { uploadChatFile } from "@/components/chat/ChatAttachment";
import { ProfileManager } from "@/components/portal/ProfileManager";
import {
  customerQuotationDecisionAction,
  submitComplaintAction,
  submitCustomerRequestAction,
  submitCustomerReviewAction,
  submitPaymentReceiptAction,
  updateCustomerRequestLocationAction,
} from "@/app/actions/marketplace-actions";
import { logoutCustomerAction } from "@/app/actions/portal-auth";
import { CustomerAuthView } from "@/components/customer/CustomerAuthView";
import { ZainabConciergeWidget } from "@/components/customer/ZainabConciergeWidget";
import {
  type BankDetailsInfo,
  CustomerNewRequestModal,
  CustomerRequestDrawer,
} from "@/components/customer/CustomerRequestModals";
import { CustomerServiceDiscovery } from "@/components/customer/CustomerServiceDiscovery";
import { PortalShell, type PortalNavGroup } from "@/components/portal/PortalShell";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import { QuotationPreviewModal, type QuotationPreviewData } from "@/components/portal/QuotationPreviewModal";
import {
  useLiveTracking,
  useNowTick,
  useRoadRoute,
  projectTrackedStatus,
} from "@/hooks/useLiveTracking";
import { usePortalRealtimeChat } from "@/hooks/usePortalRealtimeChat";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { calculateDistanceKm, formatDistance } from "@/lib/geo";
import {
  CUSTOMER_TRACKING_COPY,
  deriveCustomerTrackingState,
  formatAgo,
} from "@/lib/live-location";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  CustomerProfile,
  JobMessage,
  PaymentRecord,
  ServiceCategorySetting,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

interface CustomerPortalClientProps {
  initialCustomerId?: string | null;
  customers: CustomerProfile[];
  requests: ServiceRequestRecord[];
  quotations: StructuredQuotation[];
  payments: PaymentRecord[];
  messages: JobMessage[];
  plumberAvatars?: Record<string, string>;
  plumberLocations?: Record<string, { lat: number; lng: number; updatedAt?: string }>;
  activeLocations?: string[];
  serviceCategories?: ServiceCategorySetting[];
  bankDetails?: BankDetailsInfo;
  initialAuthMode?: "signin" | "register" | "forgot";
}

type CustomerTab = "home" | "requests" | "messages" | "payments" | "profile";

export default function CustomerPortalClient({
  initialCustomerId = null,
  customers,
  requests: initialRequests,
  quotations: initialQuotations,
  payments,
  messages: initialMessages,
  plumberAvatars,
  plumberLocations,
  activeLocations = [],
  serviceCategories = [],
  bankDetails,
  initialAuthMode = "signin",
}: CustomerPortalClientProps) {
  const router = useRouter();
  const lastSyncRef = useRef(0);
  const myTicketSetRef = useRef<Set<string>>(new Set());
  const authenticatedCustomerId = initialCustomerId;

  // Dashboard states
  const [activeTab, setActiveTabState] = useState<CustomerTab>("home");
  const [activeChatTicket, setActiveChatTicket] = useState<string>("");
  const [activeChatMessageId, setActiveChatMessageId] = useState<string | null>(null);
  const [chatNavKey, setChatNavKey] = useState<string>("");

  const setActiveTab = useCallback((tab: CustomerTab) => {
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
      pushUrlIfChanged(url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const param = sp.get("tab") as CustomerTab | null;
      const ticketParam = sp.get("ticket");
      const messageParam = sp.get("message");

      setActiveChatTicket(ticketParam ?? "");
      setActiveChatMessageId(messageParam ?? null);
      if (ticketParam || messageParam) {
        setChatNavKey(`url-${ticketParam || ""}-${messageParam || ""}`);
      }

      if (
        param === "home" ||
        param === "requests" ||
        param === "messages" ||
        param === "payments" ||
        param === "profile"
      ) {
        setActiveTabState(param);
      } else if (messageParam) {
        setActiveTabState("messages");
      } else {
        setActiveTabState("home");
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
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequestRecord | null>(null);
  const [seenRequestStatuses, setSeenRequestStatuses] = useState<Record<string, string>>({});
  const [previewQuote, setPreviewQuote] = useState<QuotationPreviewData | null>(null);
  const homeReceiptInputRef = useRef<HTMLInputElement | null>(null);
  const [homeReceiptTarget, setHomeReceiptTarget] = useState<ServiceRequestRecord | null>(null);
  const [homeReceiptUploading, setHomeReceiptUploading] = useState<string | null>(null);
  const [copiedAccount, setCopiedAccount] = useState(false);

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    setQuotations(initialQuotations);
  }, [initialQuotations]);

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const liveTrackingRefreshRef = useRef<() => void>(() => {});

  const triggerPortalRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastSyncRef.current < 1500) return;
    lastSyncRef.current = now;
    liveTrackingRefreshRef.current();
    startBackgroundTransition(() => {
      router.refresh();
    });
  }, [router]);

  useRealtimeHub({
    role: "customer",
    userId: authenticatedCustomerId || undefined,
    enabled: Boolean(authenticatedCustomerId),
    onDataSync: (data) => {
      if (data?.ticketNumber && !myTicketSetRef.current.has(data.ticketNumber)) return;
      triggerPortalRefresh();
    },
  });

  useEffect(() => {
    if (!authenticatedCustomerId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeTab !== "messages") {
        triggerPortalRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [authenticatedCustomerId, activeTab, triggerPortalRefresh]);

  // Overview Live Map state
  const [overviewMapRequestId, setOverviewMapRequestId] = useState<string>("");
  const [zainabOpen, setZainabOpen] = useState(false);
  const [focusMarkerId, setFocusMarkerId] = useState<string | null>(null);
  const [focusSeq, setFocusSeq] = useState(0);
  const [locatingProperty, setLocatingProperty] = useState(false);
  const [pickingPropertyOnMap, setPickingPropertyOnMap] = useState(false);

  // New Request Modal
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [newCategory, setNewCategory] = useState("Pipework & Leaks");
  const [newPropertyType] = useState("Residential Home");
  const [newAddress, setNewAddress] = useState("");
  const [newTiming] = useState("Earliest Available");
  const [newPriority, setNewPriority] = useState<"standard" | "urgent">("standard");
  const [newDescription, setNewDescription] = useState("");
  const [newCoords, setNewCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [newLocationSource, setNewLocationSource] = useState<
    "gps" | "map_pin" | "address_only"
  >("address_only");

  // Complaint / Feedback state
  const [feedbackTicket, setFeedbackTicket] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"feedback" | "complaint">("feedback");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [reviewTarget, setReviewTarget] = useState<(typeof requests)[number] | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [busyCustomerAction, setBusyCustomerAction] = useState<"feedback" | "review" | null>(null);
  const [feedbackSubmitMsg, setFeedbackSubmitMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentCustomer = useMemo(
    () => customers.find((c) => c.id === authenticatedCustomerId) || null,
    [customers, authenticatedCustomerId]
  );

  const seenStorageKey = currentCustomer
    ? `bin_customer_seen_requests_${currentCustomer.id}`
    : null;

  useEffect(() => {
    if (!seenStorageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(seenStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setSeenRequestStatuses(parsed as Record<string, string>);
        }
      }
    } catch {
      // Ignore invalid storage
    }
  }, [seenStorageKey]);

  const markRequestSeen = useCallback(
    (requestId: string, status: string) => {
      setSeenRequestStatuses((prev) => {
        if (prev[requestId] === status) return prev;
        const next = { ...prev, [requestId]: status };
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

  const myRequests = useMemo(() => {
    if (!currentCustomer) return [];
    // Server already scopes `requests` to this customer (including linked auth_user_id rows)
    // when a single authenticated customer profile is passed in.
    if (customers.length <= 1) return requests;
    const norm = (s?: string | null) => (s || "").replace(/\D/g, "").slice(-10);
    const cPhone = norm(currentCustomer.phone);
    return requests.filter((r) => {
      if (r.customer_id && r.customer_id === currentCustomer.id) return true;
      if (cPhone && r.customer_phone && norm(r.customer_phone) === cPhone) return true;
      if (
        currentCustomer.phone &&
        r.issue_description &&
        r.issue_description.includes(currentCustomer.phone)
      ) {
        return true;
      }
      return false;
    });
  }, [requests, customers.length, currentCustomer]);

  const myTicketSet = useMemo(
    () => new Set(myRequests.map((r) => r.ticket_number)),
    [myRequests]
  );

  useEffect(() => {
    myTicketSetRef.current = myTicketSet;
  }, [myTicketSet]);

  const activeTrackingRequests = useMemo(
    () => myRequests.filter((r) => !["completed", "cancelled"].includes(r.status)),
    [myRequests]
  );

  const activeMapRequest = useMemo(
    () =>
      activeTrackingRequests.find((r) => r.id === overviewMapRequestId) ||
      activeTrackingRequests[0] ||
      null,
    [activeTrackingRequests, overviewMapRequestId]
  );

  const canTrackPlumberOnOverview = Boolean(
    activeMapRequest &&
      !["completed", "cancelled"].includes(activeMapRequest.status) &&
      (activeMapRequest.assigned_plumber_id || activeMapRequest.assigned_technician)
  );

  const activeMapPlumberLoc = useMemo(() => {
    if (!activeMapRequest || !canTrackPlumberOnOverview || !plumberLocations) return null;
    if (activeMapRequest.assigned_plumber_id && plumberLocations[activeMapRequest.assigned_plumber_id]) {
      return plumberLocations[activeMapRequest.assigned_plumber_id];
    }
    if (activeMapRequest.assigned_technician) {
      return plumberLocations[activeMapRequest.assigned_technician.trim().toLowerCase()] || null;
    }
    return null;
  }, [activeMapRequest, canTrackPlumberOnOverview, plumberLocations]);

  const activeWatchTickets = useMemo(
    () => activeTrackingRequests.map((r) => r.ticket_number),
    [activeTrackingRequests]
  );

  const liveTracking = useLiveTracking({
    as: "customer",
    ticket: activeMapRequest?.ticket_number ?? undefined,
    enabled: Boolean(authenticatedCustomerId && activeTab === "home" && activeMapRequest),
    watchTickets: activeWatchTickets,
  });

  useEffect(() => {
    liveTrackingRefreshRef.current = liveTracking.refresh;
  }, [liveTracking.refresh]);

  const nowMs = useNowTick(
    10_000,
    Boolean(authenticatedCustomerId && activeTab === "home" && canTrackPlumberOnOverview)
  );

  const trackedJob = useMemo(
    () =>
      liveTracking.snapshot?.jobs.find(
        (j) => j.ticketNumber === activeMapRequest?.ticket_number
      ) ?? null,
    [liveTracking.snapshot, activeMapRequest?.ticket_number]
  );

  const trackedPlumber = useMemo(() => {
    if (!canTrackPlumberOnOverview) return null;
    if (trackedJob?.plumber) return trackedJob.plumber;
    if (activeMapPlumberLoc) {
      return {
        plumberId: activeMapRequest?.assigned_plumber_id || "legacy",
        name: activeMapRequest?.assigned_technician || "Assigned Plumber",
        isAvailable: true,
        ticketNumbers: activeMapRequest ? [activeMapRequest.ticket_number] : [],
        lat: activeMapPlumberLoc.lat,
        lng: activeMapPlumberLoc.lng,
        accuracyM: null,
        accuracyClass: "unknown" as const,
        heading: null,
        speed: null,
        sharingEnabled: true,
        status: "live" as const,
        statusLabel: "LIVE",
        ageSeconds: null,
        coordinatesAt: activeMapPlumberLoc.updatedAt ?? null,
        lastConfirmedAt: activeMapPlumberLoc.updatedAt ?? null,
      };
    }
    return null;
  }, [
    canTrackPlumberOnOverview,
    trackedJob,
    activeMapPlumberLoc,
    activeMapRequest,
  ]);

  const plumberStatus = useMemo(
    () =>
      trackedPlumber
        ? projectTrackedStatus(trackedPlumber, nowMs, liveTracking.serverOffsetMs)
        : null,
    [trackedPlumber, nowMs, liveTracking.serverOffsetMs]
  );

  const directDistanceMeters = useMemo(() => {
    if (
      trackedPlumber?.lat == null ||
      trackedPlumber?.lng == null ||
      activeMapRequest?.customer_lat == null ||
      activeMapRequest?.customer_lng == null
    ) {
      return null;
    }
    return (
      calculateDistanceKm(
        trackedPlumber.lat,
        trackedPlumber.lng,
        activeMapRequest.customer_lat,
        activeMapRequest.customer_lng
      ) * 1000
    );
  }, [trackedPlumber, activeMapRequest]);

  const customerTrackingState = useMemo(
    () =>
      deriveCustomerTrackingState({
        requestStatus: activeMapRequest?.status || "new",
        hasAssignedPlumber: Boolean(
          activeMapRequest?.assigned_plumber_id || activeMapRequest?.assigned_technician
        ),
        locationStatus: plumberStatus?.status ?? null,
        distanceMeters: directDistanceMeters,
      }),
    [
      activeMapRequest?.status,
      activeMapRequest?.assigned_plumber_id,
      activeMapRequest?.assigned_technician,
      plumberStatus?.status,
      directDistanceMeters,
    ]
  );

  const { route: overviewRoadRoute } = useRoadRoute({
    as: "customer",
    ticket: activeMapRequest?.ticket_number ?? undefined,
    plumber:
      trackedPlumber?.lat != null && trackedPlumber?.lng != null
        ? { lat: trackedPlumber.lat, lng: trackedPlumber.lng }
        : null,
    destination:
      activeMapRequest?.customer_lat != null && activeMapRequest?.customer_lng != null
        ? { lat: activeMapRequest.customer_lat, lng: activeMapRequest.customer_lng }
        : null,
    enabled: Boolean(
      activeTab === "home" &&
        canTrackPlumberOnOverview &&
        trackedPlumber?.lat != null &&
        trackedPlumber?.lng != null &&
        activeMapRequest?.customer_lat != null &&
        activeMapRequest?.customer_lng != null
    ),
  });

  const saveCustomerPropertyLocation = useCallback(
    async (
      requestId: string,
      lat: number,
      lng: number,
      source: "gps" | "map_pin" = "map_pin"
    ) => {
      // Optimistically show the house pin immediately on click
      let prevCoords = null as { lat: number | undefined; lng: number | undefined } | null;
      setRequests((prev) =>
        prev.map((r) => {
          if (r.id !== requestId) return r;
          prevCoords = { lat: r.customer_lat, lng: r.customer_lng };
          return { ...r, customer_lat: lat, customer_lng: lng };
        })
      );
      setPickingPropertyOnMap(false);
      setFocusMarkerId("customer-loc");
      setFocusSeq((n) => n + 1);

      const res = await updateCustomerRequestLocationAction(
        requestId,
        lat,
        lng,
        source
      );
      if (res.success) {
        setActionFeedback("Your property location has been updated on the live map.");
        broadcastRealtimeEvent("data_sync", { entity: "service_requests" });
        liveTrackingRefreshRef.current();
      } else {
        if (prevCoords) {
          const rollback = prevCoords;
          setRequests((prev) =>
            prev.map((r) =>
              r.id === requestId
                ? { ...r, customer_lat: rollback.lat, customer_lng: rollback.lng }
                : r
            )
          );
        }
        setActionFeedback(res.error || "Could not update property location.");
      }
    },
    []
  );

  const myMessages = useMemo(
    () => messages.filter((m) => myTicketSet.has(m.ticket_number)),
    [messages, myTicketSet]
  );

  const unreadMessagesCount = useMemo(
    () =>
      myMessages.filter(
        (m) =>
          !m.is_internal &&
          m.sender_role !== "customer" &&
          !(Array.isArray(m.read_by) && m.read_by.includes("customer"))
      ).length,
    [myMessages]
  );

  const filterIncomingCustomerMessage = useCallback(
    (msg: JobMessage) =>
      !msg.is_internal &&
      !(msg.sender_role === "admin" && msg.recipient_role === "plumber") &&
      !(msg.sender_role === "plumber" && msg.recipient_role === "admin"),
    []
  );

  usePortalRealtimeChat({
    role: "customer",
    userId: currentCustomer?.id,
    ticketSet: myTicketSet,
    activeTicket: activeChatTicket || myRequests[0]?.ticket_number || "",
    isMessagesTabActive: activeTab === "messages",
    filterIncomingMessage: filterIncomingCustomerMessage,
    setMessages,
  });

  const myPayments = useMemo(
    () => payments.filter((p) => myTicketSet.has(p.ticket_number)),
    [payments, myTicketSet]
  );

  const pendingQuotations = useMemo(
    () =>
      quotations.filter(
        (q) => myTicketSet.has(q.ticket_number) && q.customer_approval_status === "pending"
      ),
    [quotations, myTicketSet]
  );

  const unreadMessageTickets = useMemo(() => {
    const set = new Set<string>();
    for (const m of myMessages) {
      if (
        !m.is_internal &&
        m.sender_role !== "customer" &&
        !(Array.isArray(m.read_by) && m.read_by.includes("customer"))
      ) {
        set.add(m.ticket_number);
      }
    }
    return set;
  }, [myMessages]);

  const hasRequestSignal = useCallback(
    (req: ServiceRequestRecord) => {
      if (unreadMessageTickets.has(req.ticket_number)) {
        return true;
      }
      const seenStatus = seenRequestStatuses[req.id];
      if (seenStatus === undefined) {
        return req.status !== "completed" && req.status !== "cancelled";
      }
      return seenStatus !== req.status;
    },
    [seenRequestStatuses, unreadMessageTickets]
  );

  const unseenRequestsCount = useMemo(
    () => myRequests.filter((r) => hasRequestSignal(r)).length,
    [myRequests, hasRequestSignal]
  );

  const awaitingPaymentRequests = useMemo(
    () =>
      myRequests.filter((r) => {
        if (!["work_completed", "awaiting_final_payment"].includes(r.status)) return false;
        const hasVerified = myPayments.some(
          (p) => p.ticket_number === r.ticket_number && p.verification_status === "verified"
        );
        return !hasVerified;
      }),
    [myRequests, myPayments]
  );

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return myRequests;
    return myRequests.filter(
      (r) =>
        r.ticket_number.toLowerCase().includes(q) ||
        (r.problem_category || r.property_type).toLowerCase().includes(q) ||
        r.address_in_kano.toLowerCase().includes(q)
    );
  }, [myRequests, searchQuery]);

  // Unauthenticated View -> Shared AuthLayout
  if (!authenticatedCustomerId || !currentCustomer) {
    return (
      <CustomerAuthView
        activeLocations={activeLocations}
        initialMode={initialAuthMode}
      />
    );
  }

  // Authenticated Dashboard -> PortalShell
  const navGroups: PortalNavGroup[] = [
    {
      label: "My Portal",
      items: [
        { id: "home", label: "Home", icon: LayoutDashboard, onClick: () => setActiveTab("home") },
        {
          id: "requests",
          label: "My Requests",
          icon: Wrench,
          badge: unseenRequestsCount || undefined,
          onClick: () => setActiveTab("requests"),
        },
        {
          id: "messages",
          label: "Messages",
          icon: MessageSquare,
          badge: unreadMessagesCount || undefined,
          onClick: () => setActiveTab("messages"),
        },
        { id: "payments", label: "Payments", icon: CreditCard, onClick: () => setActiveTab("payments") },
      ],
    },
    {
      label: "Account",
      items: [{ id: "profile", label: "Profile & Feedback", icon: User, onClick: () => setActiveTab("profile") }],
    },
  ];

  const bottomNavItems = [
    { id: "home", label: "Home", icon: LayoutDashboard, onClick: () => setActiveTab("home") },
    { id: "requests", label: "Requests", icon: Wrench, onClick: () => setActiveTab("requests") },
    { id: "messages", label: "Messages", icon: MessageSquare, onClick: () => setActiveTab("messages") },
    { id: "payments", label: "Payments", icon: CreditCard, onClick: () => setActiveTab("payments") },
    { id: "profile", label: "Profile", icon: User, onClick: () => setActiveTab("profile") },
  ];

  const openRequestDetail = (req: ServiceRequestRecord) => {
    markRequestSeen(req.id, req.status);
    if (unreadMessageTickets.has(req.ticket_number)) {
      setMessages((prev) =>
        prev.map((m) =>
          m.ticket_number === req.ticket_number && m.sender_role !== "customer"
            ? { ...m, read_by: Array.from(new Set([...(m.read_by || []), "customer"])) }
            : m
        )
      );
    }
    void fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketNumber: req.ticket_number, viewerRole: "customer" }),
    }).then((res) => {
      if (!res.ok) return;
      broadcastRealtimeEvent("messages_read", {
        ticketNumber: req.ticket_number,
        viewerRole: "customer",
      });
      broadcastRealtimeEvent("notification_sync", { recipientRole: "customer" });
      window.dispatchEvent(new Event("notifications-refresh"));
    });
    setSelectedRequest(req);
  };

  const handleQuoteDecision = (quote: StructuredQuotation, decision: "approved" | "rejected") => {
    startTransition(async () => {
      const res = await customerQuotationDecisionAction(
        quote.id,
        quote.ticket_number,
        decision
      );
      if (res.success) {
        setQuotations((prev) =>
          prev.map((q) =>
            q.id === quote.id
              ? {
                  ...q,
                  customer_approval_status: decision,
                  admin_approved: decision === "approved",
                }
              : q
          )
        );
        setActionFeedback(`Quotation ${decision}.`);
        broadcastRealtimeEvent("data_sync", { entity: "quotations", ticketNumber: quote.ticket_number });
        broadcastRealtimeEvent("notification_sync", {});
        router.refresh();
      }
    });
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await submitCustomerRequestAction({
        customerId: currentCustomer.id,
        customerName: currentCustomer.full_name,
        customerPhone: currentCustomer.phone,
        problemCategory: newCategory,
        propertyType: newPropertyType,
        addressInKano: newAddress || currentCustomer.city_lga || currentCustomer.address_in_kano || "On file",
        preferredTiming: newTiming,
        priority: newPriority,
        issueDescription: newDescription.trim(),
        customerLat: newCoords?.lat ?? undefined,
        customerLng: newCoords?.lng ?? undefined,
        customerLocationSource: newCoords ? newLocationSource : "address_only",
      });
      if (res.success && res.request) {
        setRequests((prev) => [res.request!, ...prev]);
        setShowNewRequestModal(false);
        setNewDescription("");
        setNewCoords(null);
        setNewLocationSource("address_only");
        setActionFeedback(`Request ${res.request.ticket_number} submitted.`);
        broadcastRealtimeEvent("data_sync", {
          entity: "service_requests",
          ticketNumber: res.request.ticket_number,
        });
        broadcastRealtimeEvent("admin_signal", {});
        broadcastRealtimeEvent("notification_sync", { recipientRole: "admin" });
        router.refresh();
      }
    });
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim() || busyCustomerAction === "feedback") return;
    setFeedbackSubmitMsg(null);
    setBusyCustomerAction("feedback");
    try {
      const res = await submitComplaintAction({
        ticketNumber: feedbackTicket || undefined,
        customerName: currentCustomer.full_name,
        customerPhone: currentCustomer.phone,
        category: feedbackCategory,
        message: feedbackMessage.trim(),
      });
      if (res.success) {
        setFeedbackMessage("");
        setFeedbackSubmitMsg("Your feedback / complaint has been sent to our coordination team.");
      }
    } finally {
      setBusyCustomerAction((cur) => (cur === "feedback" ? null : cur));
    }
  };

  const pageTitleMap: Record<CustomerTab, string> = {
    home: "Overview",
    requests: "My Requests",
    messages: "Messages",
    payments: "Payments & Invoices",
    profile: "Profile & Feedback",
  };

  return (
    <PortalShell
      portalTitle="Customer Portal"
      pageTitle={pageTitleMap[activeTab]}
      navGroups={navGroups}
      activeItemId={activeTab}
      bottomNavItems={bottomNavItems}
      userName={currentCustomer.full_name}
      userRoleLabel={currentCustomer.phone}
      userAvatarUrl={currentCustomer.avatar_url || null}
      portalRole="customer"
      onNotificationNavigate={(dest, navReq) => {
        if (
          navReq?.tab === "messages" ||
          dest.includes("tab=messages") ||
          Boolean(navReq?.messageId)
        ) {
          setActiveTabState("messages");
          setActiveChatTicket(navReq?.ticket || "");
          setActiveChatMessageId(navReq?.messageId || null);
          setChatNavKey(
            navReq?.navKey || `nav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          );
          if (typeof window !== "undefined") {
            pushUrlIfChanged(navReq?.destination || dest);
          }
        } else if (dest.includes("tab=payments")) {
          setActiveTab("payments");
        } else if (dest.includes("tab=requests")) {
          setActiveTab("requests");
        } else {
          setActiveTab("requests");
        }
      }}
      onSignOut={async () => {
        await logoutCustomerAction();
      }}
      unreadCount={pendingQuotations.length}
      globalSearch={searchQuery}
      onGlobalSearchChange={setSearchQuery}
      searchPlaceholder="Search my requests..."
      storageKey="bin_customer_sidebar_collapsed"
    >
      {actionFeedback && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionFeedback}</span>
        </div>
      )}

      {activeTab === "home" && (
        <div className="space-y-5 sm:space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#F5B301]">
                FlowGuard
              </p>
              <h2 className="text-lg font-bold text-[#0B1F3A] sm:text-xl">
                Welcome, {currentCustomer.full_name}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                if (
                  serviceCategories.length > 0 &&
                  !serviceCategories.some((c) => (c.title || c.name || c.slug) === newCategory)
                ) {
                  setNewCategory(
                    serviceCategories[0].title || serviceCategories[0].name || serviceCategories[0].slug
                  );
                }
                setShowNewRequestModal(true);
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] transition hover:bg-[#e5a700] active:opacity-90 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New Plumbing Request
            </button>
          </div>

          {(pendingQuotations.length > 0 ||
            myRequests.some((r) => r.status === "awaiting_final_payment")) && (
            <div className="flex flex-col gap-2.5 rounded-2xl border border-[#F5B301]/70 bg-amber-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Action Needed
                </p>
                <p className="text-xs text-slate-700">
                  {pendingQuotations.length > 0
                    ? `You have ${pendingQuotations.length} quotation${pendingQuotations.length > 1 ? "s" : ""} waiting for approval.`
                    : "Your work is complete and awaiting final payment confirmation."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("requests")}
                className="h-9 shrink-0 rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white transition hover:bg-[#132f57]"
              >
                Review in My Requests
              </button>
            </div>
          )}

          {/* Mobile-First Summary Cards & Recent Activity First */}
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#F5B301] sm:rounded-xl sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                Active Jobs
              </p>
              <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:mt-2 sm:text-2xl">
                {activeTrackingRequests.length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#F5B301] sm:rounded-xl sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                Quotes Waiting
              </p>
              <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:mt-2 sm:text-2xl">
                {pendingQuotations.length}
              </p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className="rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-[#F5B301] sm:rounded-xl sm:p-4"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 sm:text-xs">
                Completed
              </p>
              <p className="mt-1 text-lg font-bold text-[#0B1F3A] sm:mt-2 sm:text-2xl">
                {myRequests.filter((r) => r.status === "completed").length}
              </p>
            </button>
          </div>

          {myRequests.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#0B1F3A] sm:text-base">
                    Recent Activity &amp; Requests
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tap any request to view quotes, live status, and updates
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setZainabOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#F5B301] bg-amber-50 px-2.5 text-xs font-bold text-[#0B1F3A] hover:bg-amber-100"
                  >
                    Ask Zainab
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("requests")}
                    className="text-xs font-bold text-[#0B1F3A] hover:underline"
                  >
                    View All ({myRequests.length})
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {myRequests.slice(0, 3).map((req) => {
                  const statusMeta = getStatusMeta(req.status);
                  const latestHistory = req.history[req.history.length - 1];
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => openRequestDetail(req)}
                      className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-[#F5B301] active:scale-[0.99]"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {req.ticket_number}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusMeta.className}`}
                        >
                          {statusMeta.label}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <p className="line-clamp-1 text-xs font-bold text-[#0B1F3A]">
                          {req.problem_category || req.property_type}
                        </p>
                        <p className="line-clamp-1 text-[11px] text-slate-500">
                          {latestHistory ? `${latestHistory.action}: ${latestHistory.details}` : req.address_in_kano}
                        </p>
                      </div>
                      <p className="text-[11px] font-medium text-slate-500">
                        {req.assigned_technician
                          ? `Plumber: ${req.assigned_technician}`
                          : "Technician assignment pending"}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeMapRequest && (
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-xl sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A] sm:text-base">
                    <MapPin className="h-4 w-4 text-[#F5B301]" />
                    Active Service Request
                  </h3>
                  <p className="text-xs text-slate-500">
                    {activeMapRequest.ticket_number} • {activeMapRequest.address_in_kano}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRequest(activeMapRequest)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 text-xs font-bold text-white transition hover:bg-[#132f57]"
                  >
                    <Eye className="h-3.5 w-3.5 text-[#F5B301]" />
                    Track & View
                  </button>
                  {activeTrackingRequests.length > 1 && (
                    <ClassicSelect
                      value={activeMapRequest?.id || ""}
                      onChange={(val) => {
                        setOverviewMapRequestId(val);
                        setFocusMarkerId(null);
                      }}
                      options={activeTrackingRequests.map((r) => ({
                        value: r.id,
                        label: `${r.ticket_number} (${r.problem_category || r.property_type})`,
                      }))}
                      ariaLabel="Select active request to track"
                  />
                )}

                {canTrackPlumberOnOverview && (
                  <button
                    type="button"
                    onClick={() => {
                      void liveTracking.refresh();
                      triggerPortalRefresh();
                      const hasPlumberCoords =
                        trackedPlumber?.lat != null && trackedPlumber?.lng != null;
                      setFocusMarkerId(hasPlumberCoords ? "plumber-loc" : null);
                      setFocusSeq((n) => n + 1);
                      if (!hasPlumberCoords) {
                        setActionFeedback(
                          `${activeMapRequest?.assigned_technician || "Your assigned plumber"} has not shared live GPS yet. Refreshing...`
                        );
                      }
                    }}
                    className="relative z-10 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#132f57]"
                  >
                    <Navigation className="h-3.5 w-3.5 text-[#F5B301]" />
                    Track Plumber
                  </button>
                )}

                {activeMapRequest && (
                  <>
                    <button
                      type="button"
                      disabled={locatingProperty}
                      onClick={() => {
                        if (typeof navigator === "undefined" || !navigator.geolocation) {
                          setActionFeedback("Browser GPS is not available on this device.");
                          return;
                        }
                        setLocatingProperty(true);
                        navigator.geolocation.getCurrentPosition(
                          async (pos) => {
                            await saveCustomerPropertyLocation(
                              activeMapRequest.id,
                              pos.coords.latitude,
                              pos.coords.longitude,
                              "gps"
                            );
                            setLocatingProperty(false);
                          },
                          () => {
                            setLocatingProperty(false);
                            setActionFeedback(
                              "Could not access GPS. Allow location permission or tap Pin on Map."
                            );
                          },
                          { enableHighAccuracy: true, timeout: 10000 }
                        );
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-60"
                    >
                      {locatingProperty ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Crosshair className="h-3.5 w-3.5 text-[#F5B301]" />
                      )}
                      {activeMapRequest.customer_lat != null ? "Update My GPS" : "Share My GPS"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickingPropertyOnMap((v) => !v)}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                        pickingPropertyOnMap
                          ? "border-[#F5B301] bg-amber-50 text-[#0B1F3A]"
                          : "border-slate-300 bg-white text-[#0B1F3A] hover:bg-slate-50"
                      }`}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {pickingPropertyOnMap ? "Click Map to Set Pin..." : "Pin on Map"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {activeMapRequest && (() => {
              const copy = CUSTOMER_TRACKING_COPY[customerTrackingState];
              const isLive =
                customerTrackingState === "live" ||
                customerTrackingState === "approaching" ||
                customerTrackingState === "arrived";
              const isWarn =
                customerTrackingState === "temporarily_unavailable" ||
                customerTrackingState === "waiting_first_location";
              return (
                <div
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                    isLive
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-900"
                      : isWarn
                      ? "border-amber-200 bg-amber-50/70 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isLive
                            ? "bg-emerald-600 text-white"
                            : isWarn
                            ? "bg-amber-500 text-white"
                            : "bg-slate-600 text-white"
                        }`}
                      >
                        {copy.title}
                      </span>
                      {canTrackPlumberOnOverview &&
                        trackedPlumber?.lat != null &&
                        trackedPlumber?.lng != null &&
                        activeMapRequest.customer_lat != null &&
                        activeMapRequest.customer_lng != null &&
                        (() => {
                          if (
                            overviewRoadRoute?.ok &&
                            overviewRoadRoute.distanceM != null &&
                            overviewRoadRoute.durationS != null
                          ) {
                            const mins = Math.max(
                              1,
                              Math.round(overviewRoadRoute.durationS / 60)
                            );
                            return (
                              <span className="font-semibold">
                                {formatDistance(overviewRoadRoute.distanceM / 1000)} by road (~{mins} min)
                              </span>
                            );
                          }
                          const km = calculateDistanceKm(
                            trackedPlumber.lat,
                            trackedPlumber.lng,
                            activeMapRequest.customer_lat,
                            activeMapRequest.customer_lng
                          );
                          return (
                            <span className="font-semibold">
                              {formatDistance(km)} direct distance
                            </span>
                          );
                        })()}
                    </div>
                    <p className="text-[11px] opacity-90">
                      {trackedJob?.tripState === "on_the_way"
                        ? "Your plumber is on the way to your property."
                        : copy.body}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {trackedJob?.tripState === "on_the_way" && (
                      <span className="rounded bg-emerald-600 px-2 py-0.5 font-bold text-white">
                        On the way
                      </span>
                    )}
                    {canTrackPlumberOnOverview &&
                      trackedPlumber?.speed != null &&
                      trackedPlumber.speed >= 0.8 && (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                          Moving ({Math.round(trackedPlumber.speed * 3.6)} km/h)
                        </span>
                      )}
                    {plumberStatus?.accuracyLabel && (
                      <span className="rounded bg-white/80 px-2 py-0.5 font-medium text-slate-600">
                        {plumberStatus.accuracyLabel}
                      </span>
                    )}
                    {plumberStatus?.ageSeconds != null && (
                      <span className="font-medium opacity-80">
                        Updated {formatAgo(plumberStatus.ageSeconds)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
              <div className="lg:col-span-6">
                <LiveMap
                  heightClassName="h-[50vh] min-h-[340px] md:h-auto md:aspect-square"
                  interactivePicker={Boolean(activeMapRequest && pickingPropertyOnMap)}
                  onPickLocation={(lat, lng) => {
                    if (!activeMapRequest || !pickingPropertyOnMap) return;
                    void saveCustomerPropertyLocation(activeMapRequest.id, lat, lng, "map_pin");
                  }}
                  focusMarkerId={focusMarkerId}
                  focusSeq={focusSeq}
                  remotePlumber={
                    canTrackPlumberOnOverview &&
                    trackedPlumber?.lat != null &&
                    trackedPlumber?.lng != null
                      ? {
                          lat: trackedPlumber.lat,
                          lng: trackedPlumber.lng,
                          heading: trackedPlumber.heading,
                          speed: trackedPlumber.speed,
                          accuracyM: trackedPlumber.accuracyM,
                          status: plumberStatus?.status || trackedPlumber.status,
                          statusLabel: plumberStatus?.label || trackedPlumber.statusLabel,
                          coordinatesAtMs: trackedPlumber.coordinatesAt
                            ? Date.parse(trackedPlumber.coordinatesAt)
                            : null,
                          label:
                            trackedPlumber.name ||
                            activeMapRequest?.assigned_technician ||
                            "Assigned Plumber",
                        }
                      : null
                  }
                  accuracyCircle={
                    canTrackPlumberOnOverview &&
                    trackedPlumber?.lat != null &&
                    trackedPlumber?.lng != null &&
                    trackedPlumber.accuracyM != null
                      ? {
                          lat: trackedPlumber.lat,
                          lng: trackedPlumber.lng,
                          radiusM: trackedPlumber.accuracyM,
                        }
                      : null
                  }
                  markers={(() => {
                    const list: LiveMapMarker[] = [];
                    if (
                      activeMapRequest &&
                      activeMapRequest.customer_lat != null &&
                      activeMapRequest.customer_lng != null
                    ) {
                      list.push({
                        id: "customer-loc",
                        lat: activeMapRequest.customer_lat,
                        lng: activeMapRequest.customer_lng,
                        label: "Your Property",
                        subtitle: activeMapRequest.address_in_kano,
                        kind: "customer",
                      });
                    }
                    return list;
                  })()}
                  roadRoutePoints={
                    canTrackPlumberOnOverview &&
                    overviewRoadRoute?.ok &&
                    overviewRoadRoute.points &&
                    overviewRoadRoute.points.length >= 2
                      ? overviewRoadRoute.points
                      : undefined
                  }
                  straightLine={
                    canTrackPlumberOnOverview &&
                    !(
                      overviewRoadRoute?.ok &&
                      overviewRoadRoute.points &&
                      overviewRoadRoute.points.length >= 2
                    ) &&
                    trackedPlumber?.lat != null &&
                    trackedPlumber?.lng != null &&
                    activeMapRequest?.customer_lat != null &&
                    activeMapRequest?.customer_lng != null
                      ? [
                          [trackedPlumber.lat, trackedPlumber.lng],
                          [activeMapRequest.customer_lat, activeMapRequest.customer_lng],
                        ]
                      : undefined
                  }
                />
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-6">
                {activeMapRequest ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Active Request
                        </p>
                        <p className="font-mono text-sm font-bold text-[#0B1F3A]">
                          {activeMapRequest.ticket_number}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          getStatusMeta(activeMapRequest.status).className
                        }`}
                      >
                        {getStatusMeta(activeMapRequest.status).label}
                      </span>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs space-y-1.5">
                      <p className="font-semibold text-[#0B1F3A]">
                        {activeMapRequest.problem_category || activeMapRequest.property_type}
                      </p>
                      <p className="text-slate-600">{activeMapRequest.address_in_kano}</p>
                      <p className="text-[11px] text-slate-500">
                        Property GPS:{" "}
                        {activeMapRequest.customer_lat != null && activeMapRequest.customer_lng != null
                          ? "Pinned on map"
                          : "Not pinned yet — tap Share My GPS or Pin on Map"}
                      </p>
                    </div>

                    {canTrackPlumberOnOverview ? (
                      <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                          Assigned Technician
                        </p>
                        <p className="text-sm font-bold text-[#0B1F3A]">
                          {activeMapRequest.assigned_technician || "Assigned Plumber"}
                        </p>
                        <p className="text-slate-600">
                          {activeMapPlumberLoc
                            ? "Live GPS is active. It will stop automatically once your job is confirmed completed."
                            : "Waiting for live GPS signal from your assigned technician."}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        A technician has not been assigned yet. Once assigned, the{" "}
                        <span className="font-semibold text-[#0B1F3A]">Track Plumber</span> button will appear at the top of the map.
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => openRequestDetail(activeMapRequest)}
                        className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
                      >
                        Open Job Details
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveChatTicket(activeMapRequest.ticket_number);
                          setActiveTab("messages");
                        }}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#132f57]"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-[#F5B301]" />
                        Message Technician
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </section>
          )}

          <CustomerServiceDiscovery
            categories={serviceCategories}
            onSelectCategory={(categoryTitle) => {
              setNewCategory(categoryTitle);
              setShowNewRequestModal(true);
            }}
          />

          {awaitingPaymentRequests.length > 0 && (
            <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-5">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-[#0B1F3A]" />
                <h3 className="text-base font-bold text-[#0B1F3A]">
                  Work Completed — Upload Payment Receipt
                </h3>
              </div>
              <p className="text-xs text-slate-700">
                Your job has been marked complete. Please transfer to the company bank account and upload your payment receipt so Admin can verify and close your ticket.
              </p>
              {bankDetails?.bankAccountNumber && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3 text-xs text-slate-700">
                  <div>
                    <span className="font-semibold">Bank:</span> {bankDetails.bankName || "Configured Bank"} •{" "}
                    <span className="font-semibold">Account:</span> {bankDetails.bankAccountName || "FlowGuard Plumbing Enterprises"} •{" "}
                    <span className="font-mono font-bold text-[#0B1F3A]">{bankDetails.bankAccountNumber}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(bankDetails.bankAccountNumber || "");
                        setCopiedAccount(true);
                        setTimeout(() => setCopiedAccount(false), 1800);
                      } catch {}
                    }}
                    className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-semibold text-[#0B1F3A] hover:bg-slate-100"
                  >
                    {copiedAccount ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    {copiedAccount ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
              <input
                ref={homeReceiptInputRef}
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  const target = homeReceiptTarget;
                  if (!file || !target) return;
                  setHomeReceiptUploading(target.ticket_number);
                  try {
                    const attachment = await uploadChatFile(file);
                    const res = await submitPaymentReceiptAction({
                      requestId: target.id,
                      ticketNumber: target.ticket_number,
                      fileName: file.name,
                      url: attachment.url,
                      mimeType: attachment.mimeType,
                      size: attachment.size,
                    });
                    if (res.success) {
                      if (res.message) setMessages((prev) => [...prev, res.message!]);
                      setActionFeedback(
                        `Payment receipt uploaded for ${target.ticket_number}. Admin has been notified for verification.`
                      );
                      broadcastRealtimeEvent("data_sync", {
                        entity: "payments",
                        ticketNumber: target.ticket_number,
                      });
                    } else {
                      setActionFeedback(res.error || "Could not upload payment receipt.");
                    }
                  } catch (err) {
                    setActionFeedback(
                      err instanceof Error ? err.message : "Failed to upload payment receipt."
                    );
                  } finally {
                    setHomeReceiptUploading(null);
                  }
                }}
              />
              {awaitingPaymentRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                      {req.ticket_number}
                    </span>
                    <p className="text-sm font-bold text-[#0B1F3A]">
                      {req.problem_category || req.property_type}
                    </p>
                    <p className="text-xs text-slate-500">
                      Technician: {req.assigned_technician || "Assigned Plumber"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={homeReceiptUploading === req.ticket_number}
                      onClick={() => {
                        setHomeReceiptTarget(req);
                        homeReceiptInputRef.current?.click();
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5B301] px-4 text-xs font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-60"
                    >
                      {homeReceiptUploading === req.ticket_number ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload Payment Receipt
                    </button>
                    <button
                      type="button"
                      onClick={() => openRequestDetail(req)}
                      className="inline-flex h-10 items-center rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {pendingQuotations.length > 0 && (
            <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
              <h3 className="text-base font-bold text-[#0B1F3A]">
                Quotations Awaiting Your Approval
              </h3>
              {pendingQuotations.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {q.ticket_number}
                      </span>
                      <p className="text-base font-bold text-[#0B1F3A]">
                        Total: {formatNGN(q.total_amount)}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">By {q.plumber_name}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Labour: {formatNGN(q.labour_charge)} • Materials:{" "}
                    {formatNGN(q.materials_cost)}
                    {q.transport_charge > 0 ? ` • Transport: ${formatNGN(q.transport_charge)}` : ""}
                    {q.other_charges > 0 ? ` • Other: ${formatNGN(q.other_charges)}` : ""}
                  </p>
                  {q.items && q.items.length > 0 && (
                    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                      <p className="mb-1 font-semibold text-[#0B1F3A]">Itemised Materials:</p>
                      <ul className="space-y-0.5 text-slate-600">
                        {q.items.map((item, idx) => (
                          <li key={idx} className="flex justify-between gap-2">
                            <span>
                              {item.name}
                              {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                            </span>
                            <span className="font-medium text-slate-800">
                              {formatNGN(item.unitPrice * item.quantity)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {q.notes && (
                    <p className="mt-2 text-sm text-slate-700">{q.notes}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        const req = myRequests.find((r) => r.ticket_number === q.ticket_number);
                        setPreviewQuote({
                          id: q.id,
                          ticketNumber: q.ticket_number,
                          revisionNumber: q.revision_number,
                          createdAt: q.created_at,
                          status: q.customer_approval_status,
                          plumberName: q.plumber_name,
                          customerName: currentCustomer.full_name,
                          customerPhone: currentCustomer.phone,
                          customerAddress: req?.address_in_kano,
                          serviceCategory: req?.problem_category,
                          labourCharge: q.labour_charge,
                          materialsCost: q.materials_cost,
                          transportCharge: q.transport_charge || 0,
                          otherCharges: q.other_charges || 0,
                          totalAmount: q.total_amount,
                          items: q.items,
                          notes: q.notes,
                        });
                      }}
                      className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
                    >
                      <Printer className="h-4 w-4 shrink-0" /> Print
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleQuoteDecision(q, "approved")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      <ThumbsUp className="h-4 w-4 shrink-0" /> Approve Quote
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleQuoteDecision(q, "rejected")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 hover:bg-red-50"
                    >
                      <ThumbsDown className="h-4 w-4 shrink-0" /> Decline
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowNewRequestModal(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B]"
            >
              <Plus className="h-4 w-4" /> New Request
            </button>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              You have not submitted any service requests yet.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => {
                const badge = getStatusMeta(req.status);
                const hasSignal = hasRequestSignal(req);
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => openRequestDetail(req)}
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
                              title="New update or unread message"
                            />
                          )}
                          <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                            {req.ticket_number}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-bold text-[#0B1F3A]">
                          {req.problem_category || req.property_type}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {req.address_in_kano}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(req.created_at)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "messages" && (
        <WhatsAppChatWorkspace
          actorRole="customer"
          actorId={currentCustomer.id}
          actorName={currentCustomer.full_name}
          requests={myRequests}
          initialMessages={myMessages}
          plumberAvatars={plumberAvatars}
          initialTicket={activeChatTicket || null}
          initialMessageId={activeChatMessageId}
          navigationKey={chatNavKey}
          onTargetChange={(ticket, messageId) => {
            setActiveChatTicket(ticket || "");
            setActiveChatMessageId(messageId || null);
            if (typeof window !== "undefined") {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "messages");
              if (ticket) url.searchParams.set("ticket", ticket);
              else url.searchParams.delete("ticket");
              if (messageId) url.searchParams.set("message", messageId);
              else url.searchParams.delete("message");
              pushUrlIfChanged(url.pathname + url.search + url.hash);
            }
          }}
          emptyTitle="No service conversations yet"
          emptyDescription="Messages with FlowGuard Plumbing dispatch and your assigned plumber appear here."
          onTicketRead={(ticket) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.ticket_number === ticket && m.sender_role !== "customer"
                  ? { ...m, read_by: Array.from(new Set([...(m.read_by || []), "customer"])) }
                  : m
              )
            );
          }}
        />
      )}

      {activeTab === "payments" && (
        <div className="space-y-3">
          {myPayments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              No payment records yet.
            </div>
          ) : (
            myPayments.map((p) => {
              const isPaid =
                p.verification_status === "verified" ||
                (p.verification_status as string) === "confirmed";
              const badge = isPaid
                ? { label: "Paid", className: "bg-emerald-100 text-emerald-800" }
                : getStatusMeta(p.verification_status);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPayment(p)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#F5B301] active:opacity-90"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                      {p.ticket_number}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-base font-bold text-[#0B1F3A]">
                      {formatNGN(p.total_payment)}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3A]">
                      <Eye className="h-3.5 w-3.5 text-[#F5B301]" /> View Receipt
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Labour: {formatNGN(p.labour_portion)} • Materials:{" "}
                    {formatNGN(p.materials_portion)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(p.payment_date || p.created_at)}
                  </p>
                </button>
              );
            })
          )}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="space-y-6">
          <ProfileManager
            role="customer"
            initialData={{
              id: currentCustomer.id,
              fullName: currentCustomer.full_name,
              phone: currentCustomer.phone,
              email: currentCustomer.email || "",
              avatarUrl: currentCustomer.avatar_url || null,
              cityLga: currentCustomer.city_lga || currentCustomer.address_in_kano || "",
              address: currentCustomer.address_in_kano || "",
              state: currentCustomer.state || "Kano",
              roleLabel: "Customer Account",
            }}
          />

          <form
            onSubmit={handleSubmitComplaint}
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-[#F5B301]" />
              <h3 className="text-base font-bold text-[#0B1F3A]">
                Submit Feedback or Complaint
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ClassicSelect
                value={feedbackCategory}
                onChange={(val) =>
                  setFeedbackCategory(val as "feedback" | "complaint")
                }
                options={[
                  { value: "feedback", label: "Service Feedback" },
                  { value: "complaint", label: "Report a Complaint" },
                ]}
              />
              <ClassicSelect
                value={feedbackTicket}
                onChange={setFeedbackTicket}
                options={[
                  { value: "", label: "General (no specific ticket)" },
                  ...myRequests.map((r) => ({
                    value: r.ticket_number,
                    label: r.ticket_number,
                  })),
                ]}
              />
            </div>
            <textarea
              rows={3}
              required
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              placeholder="Share your experience or tell us what needs attention..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
            <button
              type="submit"
              disabled={busyCustomerAction === "feedback"}
              className="h-11 w-full rounded-xl bg-[#0B1F3A] px-5 text-sm font-bold text-white transition hover:bg-[#132f57] disabled:opacity-60 sm:w-auto"
            >
              {busyCustomerAction === "feedback" ? "Sending..." : "Submit to Support Team"}
            </button>
            {feedbackSubmitMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{feedbackSubmitMsg}</span>
              </div>
            )}
          </form>
        </div>
      )}

      <CustomerRequestDrawer
        selectedRequest={selectedRequest}
        assignedPlumberAvatar={
          selectedRequest && plumberAvatars
            ? (selectedRequest.assigned_plumber_id &&
                plumberAvatars[selectedRequest.assigned_plumber_id]) ||
              (selectedRequest.assigned_technician &&
                plumberAvatars[selectedRequest.assigned_technician.trim().toLowerCase()]) ||
              undefined
            : undefined
        }
        assignedPlumberLocation={
          selectedRequest && plumberLocations
            ? (selectedRequest.assigned_plumber_id &&
                plumberLocations[selectedRequest.assigned_plumber_id]) ||
              (selectedRequest.assigned_technician &&
                plumberLocations[selectedRequest.assigned_technician.trim().toLowerCase()]) ||
              undefined
            : undefined
        }
        quotations={quotations}
        payments={payments}
        bankDetails={bankDetails}
        isPending={isPending}
        onClose={() => setSelectedRequest(null)}
        onQuoteDecision={handleQuoteDecision}
        onRequestAgain={(req) => {
          setSelectedRequest(null);
          setNewCategory(req.problem_category || "Pipework & Leaks");
          setNewAddress(req.address_in_kano || "");
          setNewDescription("");
          setShowNewRequestModal(true);
        }}
        onLeaveReview={(req) => {
          setSelectedRequest(null);
          setReviewTarget(req);
          setReviewRating(5);
          setReviewComment("");
        }}
        onUploadPaymentProof={async (ticketNumber, fileName, url) => {
          const reqObj = requests.find((r) => r.ticket_number === ticketNumber);
          const res = await submitPaymentReceiptAction({
            requestId: reqObj?.id || selectedRequest?.id || "",
            ticketNumber,
            fileName,
            url,
          });
          if (res.success) {
            if (res.message) setMessages((prev) => [...prev, res.message!]);
            setActionFeedback(
              `Payment receipt uploaded for ${ticketNumber}. Admin has been notified.`
            );
            broadcastRealtimeEvent("data_sync", {
              entity: "payments",
              ticketNumber,
            });
          } else {
            throw new Error(res.error || "Failed to submit payment receipt.");
          }
        }}
      />

      <CustomerNewRequestModal
        open={showNewRequestModal}
        serviceCategories={serviceCategories}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        newPriority={newPriority}
        setNewPriority={setNewPriority}
        newAddress={newAddress}
        setNewAddress={setNewAddress}
        newDescription={newDescription}
        setNewDescription={setNewDescription}
        coords={newCoords}
        setCoords={setNewCoords}
        locationSource={newLocationSource}
        setLocationSource={setNewLocationSource}
        isPending={isPending}
        onClose={() => setShowNewRequestModal(false)}
        onSubmit={handleCreateRequest}
      />

      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-[#0B1F3A]">
              Leave a Review — {reviewTarget.ticket_number}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Your review will appear on our site once verified by our team.
            </p>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Rating
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setReviewRating(star)}
                    className={`rounded-lg border px-2.5 py-2 transition-colors ${
                      star <= reviewRating
                        ? "border-[#F5B301] bg-amber-50 text-[#F5B301]"
                        : "border-slate-200 text-slate-300"
                    }`}
                  >
                    <Star className="h-5 w-5 fill-current" />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Your Experience
              </label>
              <textarea
                rows={4}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Share how the inspection, quotation, and repair went..."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReviewTarget(null)}
                className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyCustomerAction === "review" || !reviewComment.trim()}
                onClick={async () => {
                  const target = reviewTarget;
                  if (!target || busyCustomerAction === "review") return;
                  setBusyCustomerAction("review");
                  try {
                    const res = await submitCustomerReviewAction({
                      ticketNumber: target.ticket_number,
                      customerName: currentCustomer.full_name,
                      area: target.address_in_kano || undefined,
                      serviceCategory: target.problem_category || undefined,
                      rating: reviewRating,
                      comment: reviewComment,
                    });
                    if (res.success) {
                      setReviewTarget(null);
                      setActionFeedback("Thank you! Your review has been submitted for moderation.");
                    } else {
                      setActionFeedback(res.error || "Could not submit review.");
                    }
                  } finally {
                    setBusyCustomerAction((cur) => (cur === "review" ? null : cur));
                  }
                }}
                className="h-10 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] disabled:opacity-50"
              >
                {busyCustomerAction === "review" ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
      <QuotationPreviewModal
        quote={previewQuote}
        onClose={() => setPreviewQuote(null)}
      />

      {selectedPayment && (() => {
        const isConfirmed =
          selectedPayment.verification_status === "verified" ||
          (selectedPayment.verification_status as string) === "confirmed";
        const badge = isConfirmed
          ? { label: "Paid", className: "bg-emerald-100 text-emerald-800" }
          : getStatusMeta(selectedPayment.verification_status);
        const linkedReq = myRequests.find(
          (r) => r.ticket_number === selectedPayment.ticket_number
        );
        const handlePrintReceipt = () => {
          if (!isConfirmed || typeof window === "undefined") return;
          const iframe = document.createElement("iframe");
          iframe.style.position = "fixed";
          iframe.style.right = "0";
          iframe.style.bottom = "0";
          iframe.style.width = "0";
          iframe.style.height = "0";
          iframe.style.border = "0";
          document.body.appendChild(iframe);
          const doc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!doc) {
            document.body.removeChild(iframe);
            window.print();
            return;
          }
          const esc = (v: string) =>
            String(v || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;");
          const origin = window.location.origin;
          const dt = formatDateTime(
            selectedPayment.payment_date || selectedPayment.created_at
          );
          doc.open();
          doc.write(`<!doctype html>
<html><head><meta charset="utf-8" />
<title>Receipt ${esc(selectedPayment.ticket_number)} - FlowGuard</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0B1F3A; background: #fff; font-size: 12px; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0B1F3A; padding-bottom: 12px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .logo { width: 44px; height: 44px; border-radius: 999px; border: 2px solid #F5B301; object-fit: cover; }
  .brand h1 { margin: 0; font-size: 16px; font-weight: 800; }
  .meta { text-align: right; }
  .lbl { margin: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; color: #94a3b8; }
  .tkt { margin: 2px 0; font-family: monospace; font-size: 13px; font-weight: 700; }
  .paid { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #D1FAE5; color: #065F46; }
  .box { margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; background: #f8fafc; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; border: 1px solid #e2e8f0; }
  th { background: #0B1F3A; color: #fff; padding: 9px 12px; text-align: left; font-size: 11px; }
  td { padding: 9px 12px; border-top: 1px solid #f1f5f9; }
  .r { text-align: right; }
  tfoot tr { background: #FFFBEB; border-top: 2px solid #0B1F3A; }
  tfoot td { font-weight: 800; font-size: 14px; }
  .foot { margin-top: 20px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style></head><body>
<div class="header">
  <div class="brand"><img class="logo" src="${origin}/images/logo/flowguard-icon.jpg" alt="FlowGuard" /><h1>FlowGuard Plumbing</h1></div>
  <div class="meta"><p class="lbl">OFFICIAL RECEIPT</p><p class="tkt">#${esc(selectedPayment.ticket_number)}</p><span class="paid">Paid</span></div>
</div>
<div class="box">
  <div><p class="lbl">PAID BY</p><p style="margin:4px 0 0;font-weight:700;">${esc(linkedReq?.customer_name || "Customer")}</p><p style="margin:2px 0 0;color:#475569;">${esc(dt)}</p></div>
  <div style="text-align:right;"><p class="lbl">SERVICE</p><p style="margin:4px 0 0;font-weight:700;">${esc(linkedReq?.problem_category || linkedReq?.property_type || "Plumbing Service")}</p><p style="margin:2px 0 0;color:#475569;">Method: ${esc((selectedPayment.payment_method || "Bank Transfer").replace(/_/g, " "))}</p></div>
</div>
<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
<tbody>
  <tr><td>Materials Portion</td><td class="r">${esc(formatNGN(selectedPayment.materials_portion))}</td></tr>
  <tr><td>Labour Portion</td><td class="r">${esc(formatNGN(selectedPayment.labour_portion))}</td></tr>
</tbody>
<tfoot><tr><td class="r">Total Paid</td><td class="r">${esc(formatNGN(selectedPayment.total_payment))}</td></tr></tfoot>
</table>
<div class="foot">Confirmed by FlowGuard Plumbing • Ticket ${esc(selectedPayment.ticket_number)}</div>
</body></html>`);
          doc.close();
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } finally {
              setTimeout(() => {
                if (iframe.parentNode) document.body.removeChild(iframe);
              }, 1500);
            }
          }, 250);
        };
        return (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4">
            <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <p className="font-mono text-xs font-bold text-[#0B1F3A]">
                    {selectedPayment.ticket_number}
                  </p>
                  <h3 className="text-base font-bold text-[#0B1F3A]">Payment Receipt</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPayment(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                  aria-label="Close payment receipt"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Total Paid
                    </p>
                    <p className="mt-0.5 text-xl font-extrabold text-[#0B1F3A]">
                      {formatNGN(selectedPayment.total_payment)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3.5 text-xs">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-500">Labour Portion</span>
                    <span className="font-semibold text-[#0B1F3A]">
                      {formatNGN(selectedPayment.labour_portion)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-500">Materials Portion</span>
                    <span className="font-semibold text-[#0B1F3A]">
                      {formatNGN(selectedPayment.materials_portion)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-slate-500">Date</span>
                    <span className="font-medium text-slate-700">
                      {formatDateTime(selectedPayment.payment_date || selectedPayment.created_at)}
                    </span>
                  </div>
                  {selectedPayment.payment_method && (
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-slate-500">Method</span>
                      <span className="font-medium capitalize text-slate-700">
                        {selectedPayment.payment_method.replace(/_/g, " ")}
                      </span>
                    </div>
                  )}
                  {linkedReq && (
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-slate-500">Service</span>
                      <span className="truncate font-medium text-slate-700">
                        {linkedReq.problem_category || linkedReq.property_type}
                      </span>
                    </div>
                  )}
                </div>

                {selectedPayment.notes && (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {selectedPayment.notes}
                  </p>
                )}
              </div>

              <div className="mt-5 flex gap-2">
                {linkedReq && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPayment(null);
                      setSelectedRequest(linkedReq);
                      setActiveTab("requests");
                    }}
                    className="h-11 flex-1 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    Open Request
                  </button>
                )}
                {isConfirmed && (
                  <button
                    type="button"
                    onClick={handlePrintReceipt}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-[#0B1F3A] px-3 text-xs font-bold text-white hover:bg-[#132f57]"
                  >
                    <Printer className="h-4 w-4 shrink-0 text-[#F5B301]" />
                    Print Receipt
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
      <ZainabConciergeWidget
        customerId={currentCustomer.id}
        customerName={currentCustomer.full_name}
        open={zainabOpen}
        onOpenChange={setZainabOpen}
      />
    </PortalShell>
  );
}
