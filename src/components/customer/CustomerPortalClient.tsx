"use client";

import { startTransition as startBackgroundTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CreditCard,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  MessageSquareWarning,
  Plus,
  Star,
  ThumbsDown,
  ThumbsUp,
  User,
  Wrench,
} from "lucide-react";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
import { ProfileManager } from "@/components/portal/ProfileManager";
import {
  customerQuotationDecisionAction,
  postCommunicationMessageAction,
  submitComplaintAction,
  submitCustomerRequestAction,
  submitCustomerReviewAction,
} from "@/app/actions/marketplace-actions";
import { logoutCustomerAction } from "@/app/actions/portal-auth";
import { CustomerAuthView } from "@/components/customer/CustomerAuthView";
import {
  type BankDetailsInfo,
  CustomerNewRequestModal,
  CustomerRequestDrawer,
} from "@/components/customer/CustomerRequestModals";
import { PortalShell, type PortalNavGroup } from "@/components/portal/PortalShell";
import { usePortalRealtimeChat } from "@/hooks/usePortalRealtimeChat";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  CustomerProfile,
  JobMessage,
  PaymentRecord,
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
  activeLocations?: string[];
  bankDetails?: BankDetailsInfo;
}

type CustomerTab = "home" | "requests" | "messages" | "payments" | "profile";

export default function CustomerPortalClient({
  initialCustomerId = null,
  customers,
  requests: initialRequests,
  quotations: initialQuotations,
  payments,
  messages: initialMessages,
  activeLocations = [],
  bankDetails,
}: CustomerPortalClientProps) {
  const router = useRouter();
  const lastSyncRef = useRef(0);
  const authenticatedCustomerId = initialCustomerId;

  // Dashboard states
  const [activeTab, setActiveTabState] = useState<CustomerTab>("home");

  const setActiveTab = useCallback((tab: CustomerTab) => {
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "home") {
        url.searchParams.delete("tab");
      } else {
        url.searchParams.set("tab", tab);
      }
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const param = new URLSearchParams(window.location.search).get("tab") as CustomerTab | null;
      if (
        param === "home" ||
        param === "requests" ||
        param === "messages" ||
        param === "payments" ||
        param === "profile"
      ) {
        setActiveTabState(param);
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
    role: "customer",
    userId: authenticatedCustomerId || undefined,
    enabled: Boolean(authenticatedCustomerId),
    onDataSync: triggerPortalRefresh,
  });

  useEffect(() => {
    if (!authenticatedCustomerId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && activeTab !== "messages") {
        triggerPortalRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && activeTab !== "messages") {
        triggerPortalRefresh();
      }
    }, 20000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [authenticatedCustomerId, activeTab, triggerPortalRefresh]);

  // New Request Modal
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [newCategory, setNewCategory] = useState("Pipework & Leaks");
  const [newPropertyType] = useState("Residential Home");
  const [newAddress, setNewAddress] = useState("");
  const [newTiming] = useState("Earliest Available");
  const [newPriority, setNewPriority] = useState<"standard" | "urgent">("standard");
  const [newDescription, setNewDescription] = useState("");

  // Chat state
  const [activeChatTicket] = useState("");

  // Complaint / Feedback state
  const [feedbackTicket, setFeedbackTicket] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<"feedback" | "complaint">("feedback");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [reviewTarget, setReviewTarget] = useState<(typeof requests)[number] | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentCustomer = useMemo(
    () => customers.find((c) => c.id === authenticatedCustomerId) || null,
    [customers, authenticatedCustomerId]
  );

  const myRequests = useMemo(() => {
    if (!currentCustomer) return [];
    const norm = (s: string) => s.replace(/\D/g, "").slice(-10);
    const cPhone = norm(currentCustomer.phone);
    return requests.filter((r) => {
      if (r.customer_phone && norm(r.customer_phone) === cPhone) return true;
      if (r.issue_description && r.issue_description.includes(currentCustomer.phone)) return true;
      return false;
    });
  }, [requests, currentCustomer]);

  const myTicketSet = useMemo(
    () => new Set(myRequests.map((r) => r.ticket_number)),
    [myRequests]
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
    return <CustomerAuthView activeLocations={activeLocations} />;
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
          badge: myRequests.filter((r) => r.status !== "completed" && r.status !== "cancelled").length,
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
      });
      if (res.success && res.request) {
        setRequests((prev) => [res.request!, ...prev]);
        setShowNewRequestModal(false);
        setNewDescription("");
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

  const handleSubmitComplaint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;
    startTransition(async () => {
      const res = await submitComplaintAction({
        ticketNumber: feedbackTicket || undefined,
        customerName: currentCustomer.full_name,
        customerPhone: currentCustomer.phone,
        category: feedbackCategory,
        message: feedbackMessage.trim(),
      });
      if (res.success) {
        setFeedbackMessage("");
        setActionFeedback("Your feedback / complaint has been sent to our coordination team.");
      }
    });
  };

  const activeTicketForChat = activeChatTicket || myRequests[0]?.ticket_number || "";

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
      portalRole="customer"
      onNotificationNavigate={(dest) => {
        if (dest.includes("tab=messages")) setActiveTab("messages");
        else if (dest.includes("tab=payments")) setActiveTab("payments");
        else if (dest.includes("tab=requests")) setActiveTab("requests");
        else setActiveTab("requests");
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
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                Welcome, {currentCustomer.full_name}
              </h2>
              <p className="text-sm text-slate-500">
                Track active plumbing requests, review quotations, and message your assigned technician.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewRequestModal(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
            >
              <Plus className="h-4 w-4" />
              New Plumbing Request
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Requests
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">{myRequests.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Quotes Awaiting Approval
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">
                {pendingQuotations.length}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Completed Jobs
              </p>
              <p className="mt-2 text-2xl font-bold text-[#0B1F3A]">
                {myRequests.filter((r) => r.status === "completed").length}
              </p>
            </div>
          </div>

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
                  </p>
                  {q.notes && (
                    <p className="mt-2 text-sm text-slate-700">{q.notes}</p>
                  )}
                  <div className="mt-4 flex gap-3">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleQuoteDecision(q, "approved")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      <ThumbsUp className="h-4 w-4" /> Approve Quote
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleQuoteDecision(q, "rejected")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-sm font-bold text-red-700 hover:bg-red-50"
                    >
                      <ThumbsDown className="h-4 w-4" /> Reject
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
                return (
                  <button
                    key={req.id}
                    type="button"
                    onClick={() => setSelectedRequest(req)}
                    className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[#F5B301]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {req.ticket_number}
                        </span>
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
          initialTicket={activeTicketForChat || myRequests[0]?.ticket_number || null}
          emptyTitle="No service conversations yet"
          emptyDescription="Messages with Bin Plumbing dispatch and your assigned plumber appear here."
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
                    {formatNGN(p.total_payment)}
                  </p>
                  <p className="text-xs text-slate-600">
                    Labour: {formatNGN(p.labour_portion)} • Materials:{" "}
                    {formatNGN(p.materials_portion)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(p.payment_date || p.created_at)}
                  </p>
                </div>
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
              <select
                value={feedbackCategory}
                onChange={(e) =>
                  setFeedbackCategory(e.target.value as "feedback" | "complaint")
                }
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="feedback">Service Feedback</option>
                <option value="complaint">Report a Complaint</option>
              </select>
              <select
                value={feedbackTicket}
                onChange={(e) => setFeedbackTicket(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
              >
                <option value="">General (no specific ticket)</option>
                {myRequests.map((r) => (
                  <option key={r.id} value={r.ticket_number}>
                    {r.ticket_number}
                  </option>
                ))}
              </select>
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
              disabled={isPending}
              className="h-11 rounded-xl bg-[#0B1F3A] px-5 text-sm font-bold text-white hover:bg-[#132f57]"
            >
              Submit to Support Team
            </button>
          </form>
        </div>
      )}

      <CustomerRequestDrawer
        selectedRequest={selectedRequest}
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
          const res = await postCommunicationMessageAction({
            requestId: reqObj?.id || selectedRequest?.id || "",
            ticketNumber,
            senderRole: "customer",
            senderName: currentCustomer.full_name,
            recipientRole: "admin",
            message: `Payment proof uploaded: ${fileName}`,
            attachment: {
              url,
              name: fileName,
              mimeType: "application/octet-stream",
              size: 0,
            },
          });
          if (res.success && res.message) {
            setMessages((prev) => [...prev, res.message!]);
          }
        }}
      />

      <CustomerNewRequestModal
        open={showNewRequestModal}
        newCategory={newCategory}
        setNewCategory={setNewCategory}
        newPriority={newPriority}
        setNewPriority={setNewPriority}
        newAddress={newAddress}
        setNewAddress={setNewAddress}
        newDescription={newDescription}
        setNewDescription={setNewDescription}
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
                disabled={isPending || !reviewComment.trim()}
                onClick={() => {
                  const target = reviewTarget;
                  startTransition(async () => {
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
                  });
                }}
                className="h-10 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] disabled:opacity-50"
              >
                {isPending ? "Submitting..." : "Submit Review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}
