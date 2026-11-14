"use client";

import { useMemo, useState, useTransition } from "react";
import {
  DollarSign,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  User,
  Wrench,
} from "lucide-react";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
import { ProfileManager } from "@/components/portal/ProfileManager";
import {
  postCommunicationMessageAction,
  submitQuotationAction,
  togglePlumberAvailabilityAction,
  updateRequestStatusByTicketAction,
} from "@/app/actions/marketplace-actions";
import { logoutPlumberAction } from "@/app/actions/portal-auth";
import { PlumberAuthView } from "@/components/plumber/PlumberAuthView";
import { PlumberJobDrawer } from "@/components/plumber/PlumberJobDrawer";
import { PortalShell, type PortalNavGroup } from "@/components/portal/PortalShell";
import { usePortalRealtimeChat } from "@/hooks/usePortalRealtimeChat";
import { formatDateTime, formatNGN } from "@/lib/currency";
import { broadcastRealtimeEvent } from "@/lib/realtime-hub";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  JobMessage,
  PaymentRecord,
  PlumberProfile,
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
  const [authenticatedPlumberId] = useState<string | null>(initialPlumberId);

  const [activeTab, setActiveTab] = useState<PlumberTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState<ServiceRequestRecord[]>(initialRequests);
  const [quotations] = useState<StructuredQuotation[]>(initialQuotations);
  const [messages, setMessages] = useState<JobMessage[]>(initialMessages);

  const [selectedJob, setSelectedJob] = useState<ServiceRequestRecord | null>(null);
  const [activeTicketForChat, setActiveTicketForChat] = useState<string>("");

  // Quotation form state inside Job Detail
  const [labourAmt, setLabourAmt] = useState("");
  const [materialsAmt, setMaterialsAmt] = useState("");
  const [transportAmt, setTransportAmt] = useState("");
  const [otherAmt, setOtherAmt] = useState("");
  const [scopeSummary, setScopeSummary] = useState("");
  const [nextJobStatus, setNextJobStatus] = useState<RequestStatus>("in_progress");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentPlumber = useMemo(
    () => plumbers.find((p) => p.id === authenticatedPlumberId) || null,
    [plumbers, authenticatedPlumberId]
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

  const myTicketSet = useMemo(
    () => new Set(myJobs.map((j) => j.ticket_number)),
    [myJobs]
  );

  const myMessages = useMemo(
    () => messages.filter((m) => myTicketSet.has(m.ticket_number)),
    [messages, myTicketSet]
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
          badge: myJobs.filter((j) => j.status !== "completed" && j.status !== "cancelled").length,
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
    setSelectedJob(job);
    setNextJobStatus(job.status);
    setActionFeedback(null);
    setLabourAmt("");
    setMaterialsAmt("");
    setTransportAmt("");
    setOtherAmt("");
    setScopeSummary("");
  };

  const handleSubmitQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJob) return;
    const labour = Number(labourAmt) || 0;
    const materials = Number(materialsAmt) || 0;
    const transport = Number(transportAmt) || 0;
    const other = Number(otherAmt) || 0;
    if (labour <= 0) {
      setActionFeedback("Please enter a valid labour amount.");
      return;
    }
    startTransition(async () => {
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
      });
      if (res.success && res.quotation) {
        setActionFeedback(
          "Quotation sent to the customer for approval. It will appear on your dashboard once approved by the customer."
        );
        setLabourAmt("");
        setMaterialsAmt("");
        setTransportAmt("");
        setOtherAmt("");
        setScopeSummary("");
      } else {
        setActionFeedback(res.error || "Could not submit quotation.");
      }
    });
  };

  const handleStatusUpdate = () => {
    if (!selectedJob) return;
    startTransition(async () => {
      const res = await updateRequestStatusByTicketAction(
        selectedJob.ticket_number,
        nextJobStatus
      );
      if (res.success) {
        const updated = { ...selectedJob, status: nextJobStatus };
        setRequests((prev) =>
          prev.map((r) => (r.ticket_number === selectedJob.ticket_number ? updated : r))
        );
        setSelectedJob(updated);
        setActionFeedback("Job status updated.");
      } else {
        setActionFeedback(res.error || "Could not update status.");
      }
    });
  };

  const handleToggleAvailability = () => {
    const next = !isAvailable;
    setIsAvailable(next);
    broadcastRealtimeEvent("plumber_availability", {
      plumberId: currentPlumber.id,
      isAvailable: next,
    });
    startTransition(async () => {
      await togglePlumberAvailabilityAction(currentPlumber.id, next);
    });
  };

  const pageTitleMap: Record<PlumberTab, string> = {
    home: "Overview",
    jobs: "Assigned Jobs",
    messages: "Job Messages",
    earnings: "Earnings & Payouts",
    profile: "Technician Profile",
  };

  const activeChatTicket = activeTicketForChat || myJobs[0]?.ticket_number || "";

  return (
    <PortalShell
      portalTitle="Technician Portal"
      pageTitle={pageTitleMap[activeTab]}
      navGroups={navGroups}
      activeItemId={activeTab}
      bottomNavItems={bottomNavItems}
      userName={currentPlumber.full_name}
      userRoleLabel={currentPlumber.application_ref || "Approved Plumber"}
      portalRole="plumber"
      onNotificationNavigate={(dest) => {
        if (dest.includes("tab=messages")) setActiveTab("messages");
        else if (dest.includes("tab=earnings")) setActiveTab("earnings");
        else setActiveTab("jobs");
      }}
      onSignOut={async () => {
        await logoutPlumberAction();
      }}
      unreadCount={myJobs.filter((j) => j.status === "contacted" || j.status === "scheduled").length}
      globalSearch={searchQuery}
      onGlobalSearchChange={setSearchQuery}
      searchPlaceholder="Search assigned jobs..."
      storageKey="bin_plumber_sidebar_collapsed"
    >
      {activeTab === "home" && (
        <div className="space-y-6">
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
                  return (
                    <button
                      key={job.id}
                      type="button"
                      onClick={() => openJobDetail(job)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-[#F5B301]"
                    >
                      <div>
                        <p className="font-mono text-xs font-bold text-[#0B1F3A]">
                          {job.ticket_number}
                        </p>
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
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => openJobDetail(job)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[#F5B301]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {job.ticket_number}
                      </span>
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
          initialTicket={activeChatTicket || myJobs[0]?.ticket_number || null}
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
        quotations={quotations}
        actionFeedback={actionFeedback}
        isPending={isPending}
        onClose={() => setSelectedJob(null)}
        onStatusUpdate={handleStatusUpdate}
        onSubmitQuote={handleSubmitQuote}
        onOpenChat={(ticketNumber) => {
          setSelectedJob(null);
          setActiveTicketForChat(ticketNumber);
          setActiveTab("messages");
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
