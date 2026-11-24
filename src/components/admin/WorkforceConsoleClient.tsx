"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";

interface AgentItem {
  id: string;
  displayName: string;
  roleTitle: string;
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

interface OverviewPayload {
  agents: AgentItem[];
  tasks: TaskItem[];
  approvals: ApprovalItem[];
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
  const [tab, setTab] = useState<"overview" | "tasks" | "approvals" | "usage">("overview");
  const [instruction, setInstruction] = useState("");
  const [targetAgent, setTargetAgent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/workforce/overview", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load AI Workforce console.");
      const json = (await res.json()) as OverviewPayload;
      setData(json);
    } catch (err) {
      setBanner({
        type: "err",
        text: err instanceof Error ? err.message : "Could not load workforce data.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get("tab");
    if (
      initialTab === "overview" ||
      initialTab === "tasks" ||
      initialTab === "approvals" ||
      initialTab === "usage"
    ) {
      setTab(initialTab);
    }
    void loadOverview();
  }, [loadOverview]);

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
      const json = await res.json();
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

  const pendingApprovals = (data?.approvals || []).filter((a) => a.status === "pending");

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
        <button
          type="button"
          onClick={() => void loadOverview()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

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
          { id: "tasks" as const, label: `Tasks (${data?.tasks.length || 0})` },
          {
            id: "approvals" as const,
            label: `Approvals (${pendingApprovals.length} pending)`,
          },
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
      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(data?.agents || []).map((agent) => (
            <div
              key={agent.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-extrabold text-[#0B1F3A]">
                      {agent.displayName}
                    </h2>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {agent.roleTitle}
                    </p>
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
                  <div>
                    <h3 className="text-sm font-bold text-[#0B1F3A]">{task.title}</h3>
                    <p className="text-[11px] text-slate-500">
                      Agent: <span className="font-mono font-semibold">{task.assignedAgentId}</span> • Priority: {task.priority}
                    </p>
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
                  <div>
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                      <h3 className="text-sm font-extrabold text-[#0B1F3A]">
                        {item.actionSummary}
                      </h3>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Agent: <span className="font-mono">{item.requestedByAgent}</span> • Tool:{" "}
                      <span className="font-mono">{item.toolName}</span> • Target:{" "}
                      <span className="font-semibold">{item.targetResource}</span>
                    </p>
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
