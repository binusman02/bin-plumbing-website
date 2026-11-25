"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock,
  Pencil,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
} from "lucide-react";
import { TeamMeetingPanel } from "@/components/admin/TeamMeetingPanel";

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
  ticket_number: string | null;
  note: string;
  created_at: string;
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
  const [showFeed, setShowFeed] = useState(false);
  const [feedbackNotes, setFeedbackNotes] = useState<Record<string, string>>({});
  const [pbAgentId, setPbAgentId] = useState("sadiq");
  const [pbRuleText, setPbRuleText] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleContent, setEditingRuleContent] = useState("");
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

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
    if (next && (data?.unreadReportCount ?? 0) > 0) {
      try {
        await fetch("/api/admin/workforce/ack", { method: "POST" });
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

  async function handleApprovalDecision(
    approval: ApprovalItem,
    decision: "approve" | "reject"
  ) {
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/workforce/approvals/${approval.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          expectedPayloadHash: approval.payloadHash,
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
      await loadOverview();
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Decision failed.",
      });
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
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {(data?.aiReports || []).length > 0 ? (
                  (data?.aiReports || []).map((r) => (
                    <div
                      key={r.id}
                      className={`rounded-xl border p-2.5 text-xs ${
                        r.urgency === "urgent"
                          ? "border-red-200 bg-red-50/70"
                          : r.urgency === "high"
                            ? "border-amber-200 bg-amber-50/60"
                            : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-[#0B1F3A]">
                          [{r.agentId.toUpperCase()}] {r.message}
                        </p>
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
                        <p className="mt-1 rounded bg-white px-2 py-1 text-[11px] text-emerald-800">
                          Playbook note: {r.feedbackNote}
                        </p>
                      )}
                      <div className="mt-1.5 flex gap-1.5">
                        <input
                          type="text"
                          value={feedbackNotes[r.id] || ""}
                          onChange={(e) =>
                            setFeedbackNotes((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          placeholder="Teach rule for next time..."
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
                  ))
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
                      <p className="font-bold text-[#0B1F3A]">{r.title}</p>
                      {r.body && <p className="mt-0.5 text-slate-600">{r.body}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-xs font-extrabold uppercase tracking-wide text-[#0B1F3A]">
                Shared Team Board Notes
              </h2>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {(data?.teamNotes || []).length === 0 ? (
                  <p className="text-xs text-slate-500">No team notes yet.</p>
                ) : (
                  (data?.teamNotes || []).map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 text-xs"
                    >
                      <p className="font-bold text-[#0B1F3A]">
                        {n.from_agent}
                        {n.to_agent ? ` → ${n.to_agent}` : " → Team"}
                        {n.ticket_number ? ` (${n.ticket_number})` : ""}
                      </p>
                      <p className="mt-0.5 text-slate-600">{n.note}</p>
                    </div>
                  ))
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
            <form onSubmit={handleAddPlaybookRule} className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                value={pbAgentId}
                onChange={(e) => setPbAgentId(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#0B1F3A]"
              >
                {(data?.agents || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName}
                  </option>
                ))}
              </select>
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
                          <span className="mr-2 rounded bg-[#0B1F3A]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#0B1F3A]">
                            {rule.agentId}
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
          <select
            value={targetAgent}
            onChange={(e) => setTargetAgent(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#0B1F3A]"
          >
            <option value="">Auto-route via Operations Manager</option>
            {(data?.agents || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
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
                  <span className="font-semibold text-slate-700">Namespace:</span>{" "}
                  <span className="font-mono">{agent.memoryNamespace}</span>
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Tools Allowed:</span>{" "}
                  {agent.allowedTools.length} scoped tools
                </p>
                <p>
                  <span className="font-semibold text-slate-700">Daily Cap:</span>{" "}
                  {agent.dailyRunLimit} runs/day ({agent.modelRoute})
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
                      {task.status}
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
                  <p className="mt-2.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
                    {task.outputSummary}
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
                        {agentMap[item.requestedByAgent]?.displayName || item.requestedByAgent} • Target:{" "}
                        <span className="font-semibold">{item.targetResource}</span>
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                    <Clock className="h-3 w-3" />
                    {item.status}
                  </span>
                </div>
                <pre className="mt-2.5 overflow-x-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
                <p className="mt-2 font-mono text-[10px] text-slate-400">
                  Payload Hash: {item.payloadHash}
                </p>
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
                    <span className="font-bold text-[#0B1F3A]">{String(log.event_type)}</span>{" "}
                    <span className="text-slate-500">
                      by {String(log.actor_type)}:{String(log.actor_id)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
