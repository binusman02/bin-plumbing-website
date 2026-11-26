"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { TeamMeetingPanel } from "@/components/admin/TeamMeetingPanel";
import { ClassicSelect } from "@/components/ui/ClassicSelect";

const AGENT_SHORT_NAMES: Record<string, string> = {
  operations_manager: "Sadiq",
  sales_ai: "Amina",
  customer_support_ai: "Zainab",
  research_ai: "Faruk",
  engineering_ai: "Bashir",
};

function getAgentFirstName(agentId: string | null | undefined): string {
  if (!agentId) return "Team";
  return AGENT_SHORT_NAMES[agentId] || agentId;
}

function cleanHumanProse(raw: string, agentName?: string): string {
  let text = raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\s*[•—-]\s*Evidence:\s*tool:[^\s•—]+(?:\s*,\s*tool:[^\s•—]+)*/gi, "")
    .replace(/\btool:([a-z0-9_]+)/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (agentName) {
    const prefixRx = new RegExp(`^(?:\\[[A-Z_]+\\]\\s*)?(?:${agentName}\\s*:\\s*)+`, "i");
    text = text.replace(prefixRx, "");
  }
  return text.trim();
}

function formatShortTime(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const TOOL_LABELS: Record<string, string> = {
  assign_plumber_to_ticket: "Assign Plumber to Job",
  verify_payment: "Confirm Customer Payment",
  sales_send_email: "Send Follow-Up Email",
  support_send_reply: "Send Support Reply",
  support_draft_reply: "Prepare Support Reply Draft",
  update_ticket_status: "Update Job Status",
  send_ticket_message: "Send Ticket Message",
  update_plumber_status: "Update Plumber Approval Status",
  resolve_complaint: "Resolve Customer Complaint",
  update_commission_settings: "Update Commission Rates",
  find_best_plumbers_for_area: "Matched Available Plumbers",
  get_live_operations_feed: "Checked Live Operations Board",
  inspect_ticket: "Reviewed Job Ticket",
  inspect_financial_summary: "Reviewed Payments & Earnings",
  sales_read_enquiries: "Checked Customer Enquiries",
  sales_draft_followup: "Drafted Lead Follow-Up",
  support_read_verified_ticket: "Checked Customer Ticket",
  support_triage_intake: "Assessed Urgency",
  support_escalate_case: "Escalated Urgent Issue",
  research_web_search: "Researched Local Market",
  research_save_report: "Saved Research Brief",
  eng_read_repo: "Checked System Files",
  eng_run_checks: "Ran System Health Checks",
  eng_prepare_pr: "Prepared Code Fix Draft PR",
  eng_repair_system_state: "Run Safe System Repair",
  workforce_create_task: "Assigned Follow-Up Work",
  workforce_read_tasks: "Checked Team Task Board",
  workforce_read_agent_status: "Checked Team Workload",
  workforce_request_specialist_run: "Asked Teammate to Handle Step",
};

function humanToolLabel(raw: string): string {
  if (!raw) return "Team Action";
  if (TOOL_LABELS[raw]) return TOOL_LABELS[raw];
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting for Your Okay",
  waiting_approval: "Waiting for Your Okay",
  approved: "Approved",
  executed: "Approved & Done",
  rejected: "Declined",
  expired: "Expired",
  failed: "Could Not Finish",
  closed: "Completed",
  completed: "Completed",
  reported: "Reported",
  running: "Working on It",
  in_progress: "Working on It",
  queued: "Queued",
  new: "New Request",
  contacted: "Contacted",
  scheduled: "Scheduled",
  inspection_required: "Needs Inspection",
  work_completed: "Work Done",
  awaiting_final_payment: "Awaiting Final Payment",
  cancelled: "Cancelled",
};

function humanStatusLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const EVENT_LABELS: Record<string, string> = {
  created: "Created",
  routed: "Assigned",
  started: "Started",
  progress: "Update",
  approval_requested: "Sent for Your Okay",
  approved: "Approved by You",
  rejected: "Declined by You",
  completed: "Finished",
  failed: "Stopped",
  cancelled: "Cancelled",
  status_changed: "Updated",
  qa_review: "Quality Check",
  rework: "Sent Back for Polish",
  chased: "Followed Up",
  reported: "Reported to You",
  handoff: "Passed to Teammate",
  closed: "Completed",
};

function humanEventLabel(raw: string): string {
  return EVENT_LABELS[raw] || humanStatusLabel(raw);
}

const REPAIR_TYPE_LABELS: Record<string, string> = {
  reconcile_workforce: "Sync Stuck Tasks & Approvals",
  relink_guest_bookings: "Link Guest Bookings to Customer Accounts",
  clear_noise_incidents: "Clear Harmless Redirect Alerts",
  sync_stale_plumber_locations: "Refresh Live Plumber Location Sharing",
};

const FIELD_LABELS: Record<string, string> = {
  ticketNumber: "Ticket Number",
  plumberNameOrId: "Plumber Selected",
  decision: "Decision",
  replyBody: "Reply Message",
  body: "Message Content",
  message: "Message",
  to: "Recipient",
  subject: "Email Subject",
  status: "New Status",
  internalNote: "Internal Note",
  amount: "Amount",
  complaintIdOrTicket: "Complaint / Ticket",
  repairType: "Repair Action",
  summary: "What This Fixes",
  branchName: "Fix Branch",
  draftPrUrl: "Draft Review Link",
  committedFiles: "Files Updated",
  fileChanges: "Proposed Code Files",
};

function humanPayloadRows(payload: Record<string, unknown>): Array<{ label: string; value: string }> {
  return Object.entries(payload || {})
    .filter(([, val]) => val !== undefined && val !== null && String(val).trim() !== "")
    .map(([key, val]) => {
      const label =
        FIELD_LABELS[key] ||
        key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      let value: string;
      if (key === "repairType") {
        value = REPAIR_TYPE_LABELS[String(val)] || humanStatusLabel(String(val));
      } else if (key === "fileChanges" && Array.isArray(val)) {
        value = `${val.length} file(s): ${val
          .map((f) =>
            f && typeof f === "object" && "path" in f ? String((f as Record<string, unknown>).path) : ""
          )
          .filter(Boolean)
          .join(", ")}`;
      } else if (Array.isArray(val)) {
        value = val.map(String).join(", ");
      } else if (typeof val === "object") {
        value = JSON.stringify(val);
      } else if (key === "decision") {
        value = humanStatusLabel(String(val));
      } else {
        value = String(val);
      }
      return { label, value };
    });
}

function cleanEventSummary(raw: string): string {
  return cleanHumanProse(raw)
    .replace(/\s*\|\s*Trace:[\s\S]*$/i, "")
    .replace(/\s*\|\s*Path:\s*[^\s|]+/gi, "")
    .replace(/\[Area:\s*[A-Z_-]+\]\s*Source:\s*[^\s|]+\s*\|\s*/gi, "")
    .replace(/\bTransitioned\s+([a-z_]+)\s*->\s*([a-z_]+)/gi, (_, a, b) => {
      return `Changed from ${humanStatusLabel(a)} to ${humanStatusLabel(b)}`;
    })
    .replace(/\((?:[0-9a-f-]{36}|Approval ID:\s*[0-9a-f-]{36})\)/gi, "")
    .replace(/\bby\s+[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface AgentItem {
  id: string;
  displayName: string;
  roleTitle: string;
  avatarUrl: string;
  description: string;
  memoryNamespace: string;
  modelRoute: string;
  allowedTools: string[];
  dailyRunLimit: number;
  enabled: boolean;
}

interface TaskItem {
  id: string;
  title: string;
  description: string;
  assignedAgentId: string;
  priority: string;
  status: string;
  outputSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface ApprovalItem {
  id: string;
  requestedByAgent: string;
  toolName: string;
  targetResource: string;
  actionSummary: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  reason: string;
  status: string;
  approverEmail?: string | null;
  decisionNote?: string | null;
  decidedAt?: string | null;
  executedAt?: string | null;
  expiresAt: string;
  createdAt: string;
}

interface OwnerReportItem {
  id: string;
  type: string;
  title: string;
  body: string;
  destination: string;
  read_at: string | null;
  created_at: string;
}

interface TeamNoteItem {
  id: string;
  from_agent: string;
  to_agent: string | null;
  task_id?: string | null;
  ticket_number: string | null;
  note: string;
  created_at: string;
  pendingApprovalCount?: number;
  primaryApprovalId?: string | null;
  latestApprovalStatus?: string | null;
  taskStatus?: string | null;
}

interface StoredReportItem {
  id: string;
  taskId: string | null;
  agentId: string;
  message: string;
  urgency: "low" | "normal" | "high" | "urgent";
  feedback?: "up" | "down" | null;
  feedbackNote?: string | null;
  deliveredAt: string;
  ticketNumber?: string | null;
  taskStatus?: string | null;
  pendingApprovalCount?: number;
  latestApprovalStatus?: string | null;
  linkedNoteId?: string | null;
}

interface TeamNoteDetailPayload {
  note: TeamNoteItem;
  ticketNumber: string | null;
  task: {
    id: string;
    title: string;
    description: string;
    assignedAgentId: string;
    priority: string;
    status: string;
    deliverable: string | null;
    outputSummary: string | null;
    evidence: unknown[];
    lessons: string[];
    qaStatus: string | null;
    qaNotes: string | null;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  } | null;
  relatedTasks: Array<{
    id: string;
    title: string;
    assignedAgentId: string;
    status: string;
    priority: string;
    outputSummary: string | null;
    createdAt: string;
  }>;
  taskEvents: Array<{
    id: string;
    task_id: string;
    agent_id: string;
    event_type: string;
    message: string;
    created_at: string;
  }>;
  toolExecutions: Array<{
    id: string;
    task_id: string | null;
    approval_id: string | null;
    agent_id: string;
    tool_name: string;
    tier: string;
    validated_scope: string;
    redacted_args: Record<string, unknown>;
    status: string;
    result_summary: string | null;
    created_at: string;
  }>;
  approvals: ApprovalItem[];
  relatedNotes: TeamNoteItem[];
  relatedReports: Array<{
    id: string;
    agent_id: string;
    message: string;
    urgency: string;
    delivered_at: string;
  }>;
  ticket: {
    ticket_number: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    problem_category?: string | null;
    problem_type?: string | null;
    issue_description?: string | null;
    city_lga?: string | null;
    address?: string | null;
    urgency?: string | null;
    status: string;
    assigned_plumber_id?: string | null;
    assigned_technician?: string | null;
    quoted_amount?: number | null;
    payment_status?: string | null;
    customer_lat?: number | null;
    customer_lng?: number | null;
  } | null;
  quotations: Array<{
    id: string;
    plumber_name: string;
    total_customer_cost: number;
    status: string;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    payment_method?: string | null;
    created_at: string;
  }>;
}

interface PlaybookRuleItem {
  id: string;
  agentId: string;
  namespace: string;
  memoryKey: string;
  content: string;
  source: string;
  createdAt: string;
}

interface ScorecardItem {
  agentId: string;
  displayName: string;
  tasksDone: number;
  onTimePct: number;
  qaReworkRatePct: number;
  thumbsUp: number;
  thumbsDown: number;
  openCount: number;
  overdueCount: number;
}

interface OverviewPayload {
  agents: AgentItem[];
  tasks: TaskItem[];
  approvals: ApprovalItem[];
  ownerReports?: OwnerReportItem[];
  aiReports?: StoredReportItem[];
  playbookRules?: PlaybookRuleItem[];
  scorecards?: ScorecardItem[];
  unreadReportCount?: number;
  teamNotes?: TeamNoteItem[];
  usage: {
    globalPaidSpendCapUsd: number;
    routes: Array<{
      routeId: string;
      provider: string;
      modelId: string;
      billingTier: string;
      dataTermsVerified: boolean;
      configured: boolean;
      notes: string;
    }>;
    recentRuns: Array<Record<string, unknown>>;
  };
  auditLogs: Array<Record<string, unknown>>;
}

export function WorkforceConsoleClient() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<
    "overview" | "meeting" | "tasks" | "approvals" | "performance" | "usage"
  >("overview");
  const [instruction, setInstruction] = useState("");
  const [targetAgent, setTargetAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showFeed, setShowFeed] = useState(true);
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [pbAgentId, setPbAgentId] = useState("operations_manager");
  const [pbRuleText, setPbRuleText] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleContent, setEditingRuleContent] = useState("");
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteDetail, setNoteDetail] = useState<TeamNoteDetailPayload | null>(null);
  const [noteDetailLoading, setNoteDetailLoading] = useState(false);
  const [noteDetailError, setNoteDetailError] = useState<string | null>(null);
  const [approvalDecisionNote, setApprovalDecisionNote] = useState("");
  const [decidingApprovalId, setDecidingApprovalId] = useState<string | null>(null);
  const [requestingFix, setRequestingFix] = useState(false);

  const loadOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/workforce/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load AI Workforce console.");
      const json = (await res.json()) as OverviewPayload;
      setData(json);
    } catch (err) {
      if (!silent) {
        setBanner({
          type: "err",
          text: err instanceof Error ? err.message : "Could not load workforce data.",
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get("tab");
    if (
      initialTab === "overview" ||
      initialTab === "meeting" ||
      initialTab === "tasks" ||
      initialTab === "approvals" ||
      initialTab === "performance" ||
      initialTab === "usage"
    ) {
      setTab(initialTab);
    }
    void loadOverview();
    const timer = window.setInterval(() => {
      void loadOverview(true);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [loadOverview]);

  async function toggleReportsBell() {
    const next = !showFeed;
    setShowFeed(next);
    if ((data?.unreadReportCount ?? 0) > 0) {
      try {
        await fetch("/api/admin/workforce/ack", { method: "POST" });
        window.dispatchEvent(new Event("notifications-refresh"));
        window.dispatchEvent(new Event("admin-signals-refresh"));
        await loadOverview(true);
      } catch {
        // Non-fatal
      }
    }
  }

  async function readJsonSafe(res: Response): Promise<Record<string, unknown>> {
    const raw = await res.text();
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {
        error: `Server returned non-JSON response (HTTP ${res.status}). Check Tasks tab & Reports bell — background work may have already saved.`,
      };
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/workforce/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim(),
          ...(targetAgent ? { targetAgentId: targetAgent } : {}),
        }),
      });
      const json = (await readJsonSafe(res)) as {
        error?: string;
        task?: { status?: string; assignedAgentId?: string; errorMessage?: string };
      };
      if (!res.ok) throw new Error(json?.error || "Dispatch failed.");
      setInstruction("");
      const taskFailed = json.task?.status === "failed";
      setBanner({
        type: taskFailed ? "err" : "ok",
        text: taskFailed
          ? `Task failed (${json.task?.assignedAgentId || "workforce"}): ${json.task?.errorMessage || "Check Tasks tab"}`
          : `Task routed to ${json.task?.assignedAgentId || "workforce"} (${json.task?.status}).`,
      });
      await loadOverview();
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Dispatch failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const openTeamNoteDetail = useCallback(async (noteId: string) => {
    setSelectedNoteId(noteId);
    setNoteDetailLoading(true);
    setNoteDetailError(null);
    setApprovalDecisionNote("");
    try {
      const res = await fetch(`/api/admin/workforce/notes/${encodeURIComponent(noteId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Could not load team note details.");
      }
      setNoteDetail(json as TeamNoteDetailPayload);
    } catch (err) {
      setNoteDetailError(
        err instanceof Error ? err.message : "Could not load team note details."
      );
    } finally {
      setNoteDetailLoading(false);
    }
  }, []);

  async function handleApprovalDecision(
    approval: Pick<ApprovalItem, "id" | "actionSummary" | "payloadHash">,
    decision: "approve" | "reject",
    decisionNote?: string
  ) {
    setBanner(null);
    setDecidingApprovalId(approval.id);
    try {
      const res = await fetch(`/api/admin/workforce/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          expectedPayloadHash: approval.payloadHash,
          ...(decisionNote?.trim() ? { decisionNote: decisionNote.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Decision failed.");
      setBanner({
        type: "ok",
        text:
          decision === "approve"
            ? `Approved and executed "${approval.actionSummary}".`
            : `Rejected "${approval.actionSummary}".`,
      });
      setApprovalDecisionNote("");
      window.dispatchEvent(new Event("notifications-refresh"));
      window.dispatchEvent(new Event("admin-signals-refresh"));
      await loadOverview();
      if (selectedNoteId) {
        await openTeamNoteDetail(selectedNoteId);
      }
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Decision failed.",
      });
    } finally {
      setDecidingApprovalId(null);
    }
  }

  async function askBashirToPrepareFix(detail: TeamNoteDetailPayload) {
    setRequestingFix(true);
    setBanner(null);
    try {
      const issueText = cleanEventSummary(detail.task?.deliverable || detail.note.note || "");
      const res = await fetch("/api/admin/workforce/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetAgentId: "engineering_ai",
          title: `Prepare Fix: ${(detail.task?.title || "System Issue").slice(0, 55)}`,
          priority: "high",
          instruction: `Inspect this reported issue and help fix it cleanly in plain English: "${issueText}". If a safe operational repair applies (reconcile_workforce, relink_guest_bookings, clear_noise_incidents, sync_stale_plumber_locations), queue eng_repair_system_state for my approval. If code needs updating, read the relevant file with eng_read_repo and prepare a Draft PR on a fix/... branch with eng_prepare_pr (or explain the exact fix clearly in plain English).`,
        }),
      });
      const json = (await readJsonSafe(res)) as { error?: string };
      if (!res.ok) throw new Error(json?.error || "Could not ask Bashir right now.");
      setBanner({
        type: "ok",
        text: "Asked Bashir to inspect and prepare a fix. Check Approvals or Tasks for his update.",
      });
      await loadOverview(true);
      if (selectedNoteId) {
        await openTeamNoteDetail(selectedNoteId);
      }
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not dispatch fix request.",
      });
    } finally {
      setRequestingFix(false);
    }
  }

  async function handleCancelTask(taskId: string) {
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/workforce/tasks/${taskId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Could not cancel task.");
      await loadOverview();
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Cancel failed.",
      });
    }
  }

  async function handleKickoffAll() {
    const order = [
      { id: "operations_manager", name: "Sadiq" },
      { id: "sales_ai", name: "Amina" },
      { id: "customer_support_ai", name: "Zainab" },
      { id: "research_ai", name: "Faruk" },
      { id: "engineering_ai", name: "Bashir" },
    ];
    setSubmitting(true);
    setBanner({
      type: "ok",
      text: "Starting all 5 agents one by one so none time out...",
    });
    let completed = 0;
    const failures: string[] = [];
    try {
      for (let i = 0; i < order.length; i += 1) {
        const agent = order[i];
        setBanner({
          type: "ok",
          text: `Running ${i + 1}/5: ${agent.name}... (${completed} completed so far)`,
        });
        const res = await fetch("/api/admin/workforce/kickoff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: agent.id, skipSeed: i > 0 }),
        });
        const json = (await readJsonSafe(res)) as {
          error?: string;
          tasksCompleted?: number;
        };
        if (!res.ok) {
          failures.push(`${agent.name}: ${json?.error || `HTTP ${res.status}`}`);
        } else {
          completed += Number(json.tasksCompleted ?? 0);
        }
        await loadOverview(true);
      }
      setBanner(
        failures.length === 0
          ? {
              type: "ok",
              text: `All 5 agents started work (${completed}/5 completed). Check the Tasks tab and Reports bell.`,
            }
          : {
              type: "err",
              text: `${completed}/5 completed. Issues: ${failures.join(" | ")}`,
            }
      );
      setTab("tasks");
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Kickoff failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReportFeedback(
    reportId: string,
    feedback?: "up" | "down"
  ) {
    const note = (feedbackNotes[reportId] || "").trim();
    if (!feedback && !note) return;
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/workforce/reports/${reportId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(feedback ? { feedback } : {}), ...(note ? { note } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not save feedback.");
      if (note) {
        setFeedbackNotes((prev) => ({ ...prev, [reportId]: "" }));
      }
      setBanner({
        type: "ok",
        text: note
          ? "Saved feedback and added a Playbook rule for the agent."
          : "Report rating saved.",
      });
      await loadOverview(true);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not save feedback.",
      });
    }
  }

  async function handleAddPlaybookRule(e: React.FormEvent) {
    e.preventDefault();
    if (!pbRuleText.trim()) return;
    setBanner(null);
    try {
      const res = await fetch("/api/admin/workforce/playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: pbAgentId, rule: pbRuleText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not add rule.");
      setPbRuleText("");
      setBanner({ type: "ok", text: `Added Playbook rule for ${pbAgentId}.` });
      await loadOverview(true);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not add rule.",
      });
    }
  }

  async function handleSavePlaybookEdit(id: string) {
    if (!editingRuleContent.trim()) return;
    setBanner(null);
    try {
      const res = await fetch("/api/admin/workforce/playbook", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editingRuleContent.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not update rule.");
      setEditingRuleId(null);
      setEditingRuleContent("");
      await loadOverview(true);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not update rule.",
      });
    }
  }

  async function handleDeletePlaybookRule(id: string) {
    setBanner(null);
    try {
      const res = await fetch(
        `/api/admin/workforce/playbook?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Could not delete rule.");
      await loadOverview(true);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not delete rule.",
      });
    }
  }

  async function handleRunRoutine(
    kind: "chase_overdue" | "morning_standup" | "eod_report" | "weekly_review"
  ) {
    setSubmitting(true);
    setBanner(null);
    try {
      const res = await fetch("/api/admin/workforce/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Routine failed.");
      setBanner({
        type: "ok",
        text:
          kind === "chase_overdue"
            ? `Overdue check ran: ${json.result?.chasedTasks ?? 0} chased, ${json.result?.escalatedToOwner ?? 0} escalated.`
            : `${kind.replace("_", " ")} report sent to Owner.`,
      });
      await loadOverview(true);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Routine failed.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const pendingApprovals = (data?.approvals || []).filter((a) => a.status === "pending");
  const agentMap = Object.fromEntries((data?.agents || []).map((a) => [a.id, a]));

  return (
    <div className="space-y-5">
      {/* Header & Spend-Cap Guardrail */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-[#0B1F3A]" />
            <h1 className="text-lg font-extrabold text-[#0B1F3A]">
              FlowGuard AI Workforce Console
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Private Owner Console • 1 Operations Manager + 4 Specialist Agents • Paid Spend Cap: $
            {(data?.usage.globalPaidSpendCapUsd ?? 0).toFixed(2)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void toggleReportsBell()}
            className="relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
            aria-label="Live AI Owner Reports"
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Reports</span>
            {(data?.unreadReportCount ?? 0) > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                {data?.unreadReportCount}
              </span>
            )}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleKickoffAll()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#132f57] disabled:opacity-50"
          >
            <Bot className="h-3.5 w-3.5 text-[#F5B301]" />
            {submitting ? "Running All 5..." : "Run All 5 Agents Now"}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleRunRoutine("chase_overdue")}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100 disabled:opacity-50"
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            Check Overdue
          </button>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {showFeed && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                Live Owner Reports &amp; Feedback
              </h2>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {(data?.aiReports || []).length > 0 ? (
                  (data?.aiReports || []).map((r) => {
                    const senderName = getAgentFirstName(r.agentId);
                    const avatar = agentMap[r.agentId]?.avatarUrl || "/images/ai/sadiq.jpg";
                    const isPendingApproval = (r.pendingApprovalCount ?? 0) > 0;
                    const isResolved =
                      !isPendingApproval &&
                      (r.latestApprovalStatus === "executed" ||
                        r.latestApprovalStatus === "approved" ||
                        r.latestApprovalStatus === "rejected" ||
                        r.taskStatus === "closed");
                    const displayMessage = isResolved
                      ? cleanHumanProse(r.message, senderName).replace(
                          /(?:\s*[—-]\s*)?Waiting for your okay\.?/gi,
                          ""
                        ).trim()
                      : cleanHumanProse(r.message, senderName);
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border p-3 text-xs ${
                          isPendingApproval
                            ? "border-amber-200 bg-amber-50/70"
                            : r.urgency === "urgent" && !isResolved
                              ? "border-red-200 bg-red-50/70"
                              : r.urgency === "high" && !isResolved
                                ? "border-amber-200 bg-amber-50/60"
                                : "border-slate-200/80 bg-slate-50/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={avatar}
                              alt={senderName}
                              className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-[#F5B301] object-cover"
                            />
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-extrabold text-[#0B1F3A]">{senderName}</span>
                                <span className="text-[11px] font-medium text-slate-400">
                                  {formatShortTime(r.deliveredAt)}
                                </span>
                                {r.urgency === "urgent" && !isResolved && (
                                  <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                                    Urgent
                                  </span>
                                )}
                                {isPendingApproval && (
                                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                                    Needs Approval
                                  </span>
                                )}
                                {isResolved && (
                                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                    {r.latestApprovalStatus === "rejected"
                                      ? "Rejected"
                                      : r.latestApprovalStatus === "executed" ||
                                          r.latestApprovalStatus === "approved"
                                        ? "Approved & Executed"
                                        : "Resolved"}
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 leading-relaxed text-slate-700">
                                {displayMessage}
                              </p>
                              {r.linkedNoteId && (
                                <button
                                  type="button"
                                  onClick={() => void openTeamNoteDetail(r.linkedNoteId!)}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#0B1F3A] hover:underline"
                                >
                                  <span>
                                    {isPendingApproval
                                      ? "Inspect AI work & approve"
                                      : "View full AI activity"}
                                  </span>
                                  <ChevronRight className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleReportFeedback(r.id, "up")}
                              title="Thumbs up"
                              className={`rounded-lg p-1 ${
                                r.feedback === "up"
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white text-slate-500 hover:text-emerald-700"
                              }`}
                            >
                              <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleReportFeedback(r.id, "down")}
                              title="Thumbs down"
                              className={`rounded-lg p-1 ${
                                r.feedback === "down"
                                  ? "bg-red-600 text-white"
                                  : "bg-white text-slate-500 hover:text-red-700"
                              }`}
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        {r.feedbackNote && (
                          <p className="mt-1.5 rounded bg-white px-2 py-1 text-[11px] text-emerald-800">
                            Playbook note: {r.feedbackNote}
                          </p>
                        )}
                        <div className="mt-2 flex gap-1.5">
                          <input
                            type="text"
                            value={feedbackNotes[r.id] || ""}
                            onChange={(e) =>
                              setFeedbackNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            placeholder="Add a rule for next time..."
                            className="h-7 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] text-[#0B1F3A]"
                          />
                          <button
                            type="button"
                            onClick={() => void handleReportFeedback(r.id)}
                            className="h-7 rounded-lg bg-[#0B1F3A] px-2.5 text-[10px] font-bold text-white"
                          >
                            Teach
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (data?.ownerReports || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No reports yet.</p>
                ) : (
                  (data?.ownerReports || []).map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-2.5 text-xs ${
                        r.type === "ai_urgent_alert"
                          ? "border-red-200 bg-red-50/70"
                          : !r.read_at
                            ? "border-amber-200 bg-amber-50/60"
                            : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <p className="font-bold text-[#0B1F3A]">{cleanHumanProse(r.title)}</p>
                      {r.body && (
                        <p className="mt-0.5 text-slate-600">{cleanHumanProse(r.body)}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                  Shared Team Board Notes
                </h2>
                <span className="text-[11px] font-medium text-slate-500">
                  Click any note to inspect &amp; approve
                </span>
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {(data?.teamNotes || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No team notes yet.</p>
                ) : (
                  (data?.teamNotes || []).map((n) => {
                    const fromName = getAgentFirstName(n.from_agent);
                    const toName = n.to_agent ? getAgentFirstName(n.to_agent) : "Team";
                    const avatar = agentMap[n.from_agent]?.avatarUrl || "/images/ai/sadiq.jpg";
                    const hasPending = (n.pendingApprovalCount ?? 0) > 0;
                    const statusBadge = hasPending
                      ? { label: "Needs Approval", cls: "bg-amber-100 text-amber-800" }
                      : n.latestApprovalStatus === "executed" || n.latestApprovalStatus === "approved"
                        ? { label: "Approved & Executed", cls: "bg-emerald-100 text-emerald-800" }
                        : n.latestApprovalStatus === "rejected"
                          ? { label: "Rejected", cls: "bg-red-100 text-red-700" }
                          : n.latestApprovalStatus === "expired"
                            ? { label: "Expired", cls: "bg-slate-200 text-slate-700" }
                            : n.taskStatus === "closed" || n.taskStatus === "completed"
                              ? { label: "Completed", cls: "bg-emerald-50 text-emerald-700" }
                              : null;

                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => void openTeamNoteDetail(n.id)}
                        className={`w-full cursor-pointer rounded-xl border p-3 text-left text-xs transition hover:border-[#0B1F3A] hover:bg-white ${
                          hasPending
                            ? "border-amber-300 bg-amber-50/50"
                            : "border-slate-200/80 bg-slate-50/70"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={avatar}
                            alt={fromName}
                            className="mt-0.5 h-7 w-7 shrink-0 rounded-full border border-[#F5B301] object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-extrabold text-[#0B1F3A]">
                                  {fromName} to {toName}
                                </span>
                                {n.ticket_number && (
                                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                                    {n.ticket_number}
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-400">
                                  {formatShortTime(n.created_at)}
                                </span>
                              </div>
                              {statusBadge && (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.cls}`}
                                >
                                  {statusBadge.label}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 leading-relaxed text-slate-700">
                              {cleanHumanProse(n.note, fromName)}
                            </p>
                            <div className="mt-1.5 flex items-center justify-end gap-1 text-[11px] font-bold text-[#0B1F3A]">
                              <span>
                                {hasPending ? "Review details & approve" : "View full AI details"}
                              </span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Owner Playbook Rules Editor */}
          <div className="border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#0B1F3A]" />
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                Company Playbook Rules (Enforced Before Next Run)
              </h3>
            </div>
            <form onSubmit={handleAddPlaybookRule} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="w-full sm:w-64">
                <ClassicSelect
                  size="sm"
                  value={pbAgentId}
                  onChange={setPbAgentId}
                  ariaLabel="Select AI member for playbook rule"
                  options={(data?.agents || []).map((a) => ({
                    value: a.id,
                    label: a.displayName,
                  }))}
                />
              </div>
              <input
                type="text"
                value={pbRuleText}
                onChange={(e) => setPbRuleText(e.target.value)}
                placeholder="Add a permanent rule (e.g. Never quote emergency callout fees without checking admin rates)"
                className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs text-[#0B1F3A]"
              />
              <button
                type="submit"
                className="h-9 rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-bold text-white"
              >
                Add Rule
              </button>
            </form>
            <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
              {(data?.playbookRules || []).length === 0 ? (
                <p className="text-xs text-slate-500">
                  No custom playbook rules saved yet. Rate a report or add one above.
                </p>
              ) : (
                (data?.playbookRules || []).map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-col justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs sm:flex-row sm:items-center"
                  >
                    {editingRuleId === rule.id ? (
                      <div className="flex flex-1 gap-2">
                        <input
                          type="text"
                          value={editingRuleContent}
                          onChange={(e) => setEditingRuleContent(e.target.value)}
                          className="h-7 flex-1 rounded border border-slate-300 bg-white px-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSavePlaybookEdit(rule.id)}
                          className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRuleId(null)}
                          className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <span className="mr-2 rounded bg-[#0B1F3A]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#0B1F3A]">
                            {getAgentFirstName(rule.agentId)}
                          </span>
                          <span className="text-slate-700">{rule.content}</span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRuleId(rule.id);
                              setEditingRuleContent(rule.content);
                            }}
                            className="rounded p-1 text-slate-500 hover:bg-white hover:text-[#0B1F3A]"
                            title="Edit rule"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeletePlaybookRule(rule.id)}
                            className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-600"
                            title="Delete rule"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold ${
            banner.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {banner.text}
        </div>
      )}

      {/* Responsive Navigation Tabs */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {[
          { id: "overview" as const, label: "Overview & Agents" },
          { id: "meeting" as const, label: "Team Meeting" },
          { id: "tasks" as const, label: `Tasks (${data?.tasks.length || 0})` },
          {
            id: "approvals" as const,
            label: `Approvals (${pendingApprovals.length} pending)`,
          },
          { id: "performance" as const, label: "Team Performance" },
          { id: "usage" as const, label: "Models & Audit" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-xl px-3.5 py-2.5 text-xs font-bold transition ${
              tab === item.id
                ? "bg-[#0B1F3A] text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Operations Manager Dispatch Form */}
      <form
        onSubmit={handleDispatch}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-xs font-extrabold uppercase tracking-wider text-[#0B1F3A]">
            Instruct AI Operations Manager
          </label>
          <div className="w-full sm:w-72">
            <ClassicSelect
              size="sm"
              value={targetAgent}
              onChange={setTargetAgent}
              ariaLabel="Target AI agent"
              options={[
                { value: "", label: "Auto-route via Operations Manager" },
                ...(data?.agents || []).map((a) => ({
                  value: a.id,
                  label: a.displayName,
                })),
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Research competitor plumbing pricing in Kano or triage today's enquiries..."
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3.5 text-sm text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting || !instruction.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-5 text-xs font-extrabold text-white disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5 text-[#F5B301]" />
            {submitting ? "Dispatching..." : "Send Instruction"}
          </button>
        </div>
      </form>

      {/* Tab Content */}
      {tab === "meeting" && (
        <TeamMeetingPanel
          agents={data?.agents || []}
          onMeetingWrappedUp={() => void loadOverview()}
        />
      )}

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(data?.agents || []).map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={agent.avatarUrl || "/images/ai/sadiq.jpg"}
                      alt={agent.displayName}
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
                    />
                    <div>
                      <h2 className="text-sm font-extrabold text-[#0B1F3A]">
                        {agent.displayName}
                      </h2>
                      <p className="text-[11px] font-semibold text-slate-500">
                        {agent.roleTitle}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      agent.enabled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {agent.enabled ? "Active" : "Paused"}
                  </span>
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
                  {agent.description}
                </p>
              </div>
              <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <p>
                  <span className="font-semibold text-slate-700">Focus:</span>{" "}
                  {agent.roleTitle}
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Daily Limit:</span>{" "}
                  Up to {agent.dailyRunLimit} tasks per day (Free model)
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "tasks" && (
        <div className="space-y-3">
          {(data?.tasks || []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              No workforce tasks yet. Send an instruction above to create and route a durable task.
            </div>
          ) : (
            (data?.tasks || []).map((task) => (
              <div
                key={task.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={agentMap[task.assignedAgentId]?.avatarUrl || "/images/ai/sadiq.jpg"}
                      alt={agentMap[task.assignedAgentId]?.displayName || task.assignedAgentId}
                      className="h-10 w-10 shrink-0 rounded-full border-2 border-[#F5B301]/80 object-cover"
                    />
                    <div>
                      <h3 className="text-sm font-bold text-[#0B1F3A]">{task.title}</h3>
                      <p className="text-[11px] text-slate-500">
                        {agentMap[task.assignedAgentId]?.displayName || task.assignedAgentId} • Priority: {task.priority}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-[#0B1F3A]">
                      {humanStatusLabel(task.status)}
                    </span>
                    {(task.status === "queued" || task.status === "running") && (
                      <button
                        type="button"
                        onClick={() => void handleCancelTask(task.id)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-[11px] font-bold text-red-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                {task.outputSummary && (
                  <p className="mt-2.5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                    {cleanEventSummary(
                      cleanHumanProse(task.outputSummary, getAgentFirstName(task.assignedAgentId))
                    )}
                  </p>
                )}
                {task.errorMessage && (
                  <p className="mt-2.5 rounded-xl bg-red-50 p-3 text-xs text-red-800">
                    {task.errorMessage}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "approvals" && (
        <div className="space-y-3">
          {(data?.approvals || []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
              No approval requests recorded yet.
            </div>
          ) : (
            (data?.approvals || []).map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={agentMap[item.requestedByAgent]?.avatarUrl || "/images/ai/sadiq.jpg"}
                      alt={agentMap[item.requestedByAgent]?.displayName || item.requestedByAgent}
                      className="h-11 w-11 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                        <h3 className="text-sm font-extrabold text-[#0B1F3A]">
                          {item.actionSummary}
                        </h3>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        From {getAgentFirstName(item.requestedByAgent)} • {humanToolLabel(item.toolName)} • For{" "}
                        <span className="font-semibold text-[#0B1F3A]">{item.targetResource}</span>
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                      item.status === "pending"
                        ? "bg-amber-100 text-amber-900"
                        : item.status === "executed" || item.status === "approved"
                          ? "bg-emerald-100 text-emerald-900"
                          : item.status === "rejected"
                            ? "bg-red-100 text-red-900"
                            : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    <Clock className="h-3 w-3" />
                    {humanStatusLabel(item.status)}
                  </span>
                </div>
                {item.reason && (
                  <p className="mt-2 text-xs text-slate-700">
                    <span className="font-semibold text-[#0B1F3A]">Why:</span> {item.reason}
                  </p>
                )}
                <div className="mt-2.5 grid gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
                  {humanPayloadRows(item.payload).map((row) => (
                    <div key={row.label}>
                      <span className="text-slate-500">{row.label}:</span>{" "}
                      <span className="font-semibold text-[#0B1F3A]">{row.value}</span>
                    </div>
                  ))}
                </div>
                {item.status === "pending" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprovalDecision(item, "approve")}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve & Execute
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleApprovalDecision(item, "reject")}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-xs font-bold text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[#0B1F3A]" />
                <h2 className="text-sm font-extrabold text-[#0B1F3A]">
                  Team Performance Scorecard
                </h2>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleRunRoutine("morning_standup")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-[#0B1F3A] hover:bg-slate-100"
                >
                  Run Standup
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleRunRoutine("eod_report")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-[#0B1F3A] hover:bg-slate-100"
                >
                  Run EOD
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleRunRoutine("weekly_review")}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-[#0B1F3A] hover:bg-slate-100"
                >
                  Run Weekly Review
                </button>
              </div>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500">
                    <th className="py-2 pr-3">AI Member</th>
                    <th className="px-2 py-2">Tasks Done</th>
                    <th className="px-2 py-2">On Time %</th>
                    <th className="px-2 py-2">QA Rework %</th>
                    <th className="px-2 py-2">Owner 👍 / 👎</th>
                    <th className="px-2 py-2">Open</th>
                    <th className="pl-2 py-2">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.scorecards || []).map((row) => (
                    <tr key={row.agentId} className="text-slate-700">
                      <td className="py-2.5 pr-3 font-bold text-[#0B1F3A]">{row.displayName}</td>
                      <td className="px-2 py-2.5 font-semibold">{row.tasksDone}</td>
                      <td className="px-2 py-2.5">{row.onTimePct}%</td>
                      <td className="px-2 py-2.5">{row.qaReworkRatePct}%</td>
                      <td className="px-2 py-2.5">
                        <span className="font-semibold text-emerald-700">{row.thumbsUp}</span>
                        {" / "}
                        <span className="font-semibold text-red-600">{row.thumbsDown}</span>
                      </td>
                      <td className="px-2 py-2.5">{row.openCount}</td>
                      <td className="pl-2 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            row.overdueCount > 0
                              ? "bg-red-100 text-red-700"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {row.overdueCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "usage" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <h2 className="text-sm font-extrabold text-[#0B1F3A]">
                Free-First Model Routes (Hard Paid Spend Cap: $0.00)
              </h2>
            </div>
            <div className="mt-3 space-y-2">
              {(data?.usage.routes || []).map((route) => (
                <div
                  key={route.routeId}
                  className="flex flex-col justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="font-bold text-[#0B1F3A]">
                      {route.modelId}{" "}
                      <span className="font-mono text-[11px] font-normal text-slate-500">
                        ({route.provider})
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-600">{route.notes}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      {route.billingTier.toUpperCase()}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        route.configured
                          ? "bg-blue-100 text-blue-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {route.configured ? "Key Configured" : "Key Missing"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-extrabold text-[#0B1F3A]">Recent Audit Events</h2>
            <div className="mt-3 space-y-2">
              {(data?.auditLogs || []).length === 0 ? (
                <p className="text-xs text-slate-500">No audit records available yet.</p>
              ) : (
                (data?.auditLogs || []).slice(0, 15).map((log, i) => (
                  <div
                    key={String(log.id || i)}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs"
                  >
                    <span className="font-bold text-[#0B1F3A]">
                      {humanEventLabel(String(log.event_type))}
                    </span>{" "}
                    <span className="text-slate-600">
                      by {getAgentFirstName(String(log.actor_id || log.actor_type || "Team"))}
                      {log.target_resource ? ` on ${String(log.target_resource)}` : ""}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Clickable Shared Team Note Detail & Approval Modal */}
      {selectedNoteId && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
          onClick={() => {
            setSelectedNoteId(null);
            setNoteDetail(null);
            setNoteDetailError(null);
          }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#0B1F3A] px-5 py-4 text-white">
              <div className="flex min-w-0 items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    (noteDetail &&
                      agentMap[noteDetail.note.from_agent]?.avatarUrl) ||
                    "/images/ai/sadiq.jpg"
                  }
                  alt="AI Agent"
                  className="h-10 w-10 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-extrabold">
                      {noteDetail
                        ? `${getAgentFirstName(noteDetail.note.from_agent)} to ${
                            noteDetail.note.to_agent
                              ? getAgentFirstName(noteDetail.note.to_agent)
                              : "Team"
                          }`
                        : "AI Activity & Approval Details"}
                    </h3>
                    {noteDetail?.ticketNumber && (
                      <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#F5B301]">
                        {noteDetail.ticketNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Complete summary of what the AI did, live ticket status, and approval controls
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedNoteId(null);
                  setNoteDetail(null);
                  setNoteDetailError(null);
                }}
                aria-label="Close AI details"
                className="rounded-lg bg-white/10 p-1.5 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-xs">
              {noteDetailLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0B1F3A]" />
                  <span>Loading full AI activity, ticket context, and approvals...</span>
                </div>
              ) : noteDetailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
                  {noteDetailError}
                </div>
              ) : noteDetail ? (
                <>
                  {/* 1. Primary Note & Work Order Deliverable */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                        Shared Note Summary
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(noteDetail.note.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold leading-relaxed text-[#0B1F3A]">
                      {cleanHumanProse(
                        noteDetail.note.note,
                        getAgentFirstName(noteDetail.note.from_agent)
                      )}
                    </p>
                    {noteDetail.task && (
                      <div className="mt-3 space-y-2 border-t border-slate-200/80 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-[#0B1F3A]">
                            Task: {noteDetail.task.title}
                          </span>
                          <span className="rounded-full bg-[#0B1F3A]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0B1F3A]">
                            {humanStatusLabel(noteDetail.task.status)}
                          </span>
                        </div>
                        {noteDetail.task.description && (
                          <p className="text-slate-600">{noteDetail.task.description}</p>
                        )}
                        {(noteDetail.task.deliverable || noteDetail.task.outputSummary) && (
                          <div className="rounded-lg bg-white p-3 text-slate-700 ring-1 ring-slate-200">
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-slate-400">
                              What Was Done
                            </p>
                            <p className="leading-relaxed">
                              {cleanEventSummary(
                                cleanHumanProse(
                                  noteDetail.task.deliverable ||
                                    noteDetail.task.outputSummary ||
                                    "",
                                  getAgentFirstName(noteDetail.task.assignedAgentId)
                                )
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {noteDetail.note.from_agent === "engineering_ai" && (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
                        <span className="text-[11px] text-slate-600">
                          Want Bashir to fix this or prepare a Draft PR?
                        </span>
                        <button
                          type="button"
                          disabled={requestingFix}
                          onClick={() => void askBashirToPrepareFix(noteDetail)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 text-[11px] font-bold text-white hover:bg-[#132f57] disabled:opacity-50"
                        >
                          {requestingFix ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wrench className="h-3.5 w-3.5 text-[#F5B301]" />
                          )}
                          <span>{requestingFix ? "Asking Bashir..." : "Ask Bashir to Prepare Fix"}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 2. Approvals Right Inside Modal */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-4 w-4 text-amber-600" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                          Decisions Waiting for Your Approval
                        </h4>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {noteDetail.approvals.filter((a) => a.status === "pending").length} waiting
                      </span>
                    </div>

                    {noteDetail.approvals.length === 0 ? (
                      <p className="text-slate-500">
                        This update did not need your sign-off — your team handled it automatically.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {noteDetail.approvals.map((ap) => {
                          const isPending = ap.status === "pending";
                          const isBusy = decidingApprovalId === ap.id;
                          const payloadRows = humanPayloadRows(ap.payload);
                          return (
                            <div
                              key={ap.id}
                              className={`rounded-xl border p-3.5 ${
                                isPending
                                  ? "border-amber-300 bg-amber-50/60"
                                  : ap.status === "executed" || ap.status === "approved"
                                    ? "border-emerald-200 bg-emerald-50/50"
                                    : "border-slate-200 bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-extrabold text-[#0B1F3A]">
                                    {ap.actionSummary}
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-slate-600">
                                    Suggested by{" "}
                                    <span className="font-semibold">
                                      {getAgentFirstName(ap.requestedByAgent)}
                                    </span>{" "}
                                    • Action: {humanToolLabel(ap.toolName)} • For{" "}
                                    <span className="font-semibold">{ap.targetResource}</span>
                                  </p>
                                </div>
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${
                                    isPending
                                      ? "bg-amber-200 text-amber-900"
                                      : ap.status === "executed" || ap.status === "approved"
                                        ? "bg-emerald-200 text-emerald-900"
                                        : ap.status === "rejected"
                                          ? "bg-red-200 text-red-900"
                                          : "bg-slate-200 text-slate-700"
                                  }`}
                                >
                                  {humanStatusLabel(ap.status)}
                                </span>
                              </div>
                              <p className="mt-2 text-slate-700">
                                <span className="font-semibold">Why:</span> {ap.reason}
                              </p>
                              {payloadRows.length > 0 && (
                                <div className="mt-2 grid gap-1.5 rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs sm:grid-cols-2">
                                  {payloadRows.map((row) => (
                                    <div key={row.label}>
                                      <span className="text-slate-500">{row.label}:</span>{" "}
                                      <span className="font-semibold text-[#0B1F3A]">
                                        {row.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {isPending ? (
                                <div className="mt-3 space-y-2">
                                  <input
                                    type="text"
                                    value={approvalDecisionNote}
                                    onChange={(e) => setApprovalDecisionNote(e.target.value)}
                                    placeholder="Optional decision note (saved to audit log)..."
                                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-[#0B1F3A]"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() =>
                                        void handleApprovalDecision(
                                          ap,
                                          "approve",
                                          approvalDecisionNote
                                        )
                                      }
                                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      {isBusy ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-4 w-4" />
                                      )}
                                      {ap.toolName === "eng_repair_system_state"
                                        ? "Approve & Apply Fix"
                                        : "Approve & Execute"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() =>
                                        void handleApprovalDecision(
                                          ap,
                                          "reject",
                                          approvalDecisionNote
                                        )
                                      }
                                      className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-4 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                                    >
                                      <XCircle className="h-4 w-4" />
                                      Reject
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="mt-2 text-[11px] text-slate-600">
                                  {ap.decisionNote || humanStatusLabel(ap.status)}
                                  {ap.decidedAt
                                    ? ` • ${new Date(ap.decidedAt).toLocaleString()}`
                                    : ""}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 3. Live Ticket Context */}
                  {noteDetail.ticket && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-4 w-4 text-[#0B1F3A]" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                            Live Ticket Snapshot ({noteDetail.ticket.ticket_number})
                          </h4>
                        </div>
                        <Link
                          href={`/admin/requests?ticket=${encodeURIComponent(
                            noteDetail.ticket.ticket_number
                          )}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#0B1F3A] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#132f57]"
                        >
                          <span>Open in Requests</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                      <div className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                        <div>
                          <span className="text-slate-400">Customer:</span>{" "}
                          <span className="font-bold text-[#0B1F3A]">
                            {noteDetail.ticket.customer_name} ({noteDetail.ticket.customer_phone})
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Status:</span>{" "}
                          <span className="font-bold text-[#0B1F3A]">
                            {humanStatusLabel(noteDetail.ticket.status)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Issue &amp; Area:</span>{" "}
                          <span className="font-semibold text-slate-700">
                            {noteDetail.ticket.problem_type ||
                              noteDetail.ticket.problem_category ||
                              "Plumbing"}{" "}
                            • {noteDetail.ticket.city_lga || "Kano"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400">Assigned Plumber:</span>{" "}
                          <span className="font-bold text-[#0B1F3A]">
                            {noteDetail.ticket.assigned_technician || "Unassigned"}
                          </span>
                        </div>
                        {noteDetail.ticket.customer_lat != null &&
                          noteDetail.ticket.customer_lng != null && (
                            <div className="flex items-center gap-1 text-emerald-700 sm:col-span-2">
                              <MapPin className="h-3.5 w-3.5" />
                              <span className="font-semibold">
                                Customer map location is saved for live plumber navigation
                              </span>
                            </div>
                          )}
                      </div>
                      {noteDetail.quotations.length > 0 && (
                        <div className="mt-2.5 space-y-1">
                          <p className="text-[11px] font-bold text-slate-500">Latest Quotations:</p>
                          {noteDetail.quotations.map((q) => (
                            <div
                              key={q.id}
                              className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1.5 text-[11px]"
                            >
                              <span>
                                {q.plumber_name} — ₦{Number(q.total_customer_cost || 0).toLocaleString()}
                              </span>
                              <span className="font-bold text-[#0B1F3A]">
                                {humanStatusLabel(q.status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 4. Related Team Notes & Handoffs */}
                  {noteDetail.relatedNotes.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-1.5">
                        <FileText className="h-4 w-4 text-[#0B1F3A]" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                          Full Team Handoff Timeline ({noteDetail.relatedNotes.length})
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {noteDetail.relatedNotes.map((rn) => (
                          <div
                            key={rn.id}
                            className={`rounded-lg border px-3 py-2 ${
                              rn.id === noteDetail.note.id
                                ? "border-[#0B1F3A] bg-[#0B1F3A]/5"
                                : "border-slate-100 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-[#0B1F3A]">
                                {getAgentFirstName(rn.from_agent)} to{" "}
                                {rn.to_agent ? getAgentFirstName(rn.to_agent) : "Team"}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {new Date(rn.created_at).toLocaleString()}
                              </span>
                            </div>
                            <p className="mt-0.5 text-slate-700">
                              {cleanHumanProse(rn.note, getAgentFirstName(rn.from_agent))}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 5. What the AI Did Step by Step */}
                  {(noteDetail.toolExecutions.length > 0 || noteDetail.taskEvents.length > 0) && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-[#0B1F3A]" />
                        <h4 className="text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                          What the AI Did Step by Step
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {noteDetail.toolExecutions.map((ex) => (
                          <div
                            key={ex.id}
                            className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-[#0B1F3A]">
                                  {getAgentFirstName(ex.agent_id)}: {humanToolLabel(ex.tool_name)}
                                </span>
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">
                                  {humanStatusLabel(ex.status)}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400">
                                {new Date(ex.created_at).toLocaleString()}
                              </span>
                            </div>
                            {ex.result_summary && (
                              <p className="mt-1 text-slate-600">
                                {cleanEventSummary(ex.result_summary)}
                              </p>
                            )}
                          </div>
                        ))}
                        {noteDetail.taskEvents.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px]"
                          >
                            <div>
                              <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-[#0B1F3A]">
                                {humanEventLabel(ev.event_type)}
                              </span>
                              <span className="text-slate-700">
                                {cleanEventSummary(ev.message)}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {new Date(ev.created_at).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
