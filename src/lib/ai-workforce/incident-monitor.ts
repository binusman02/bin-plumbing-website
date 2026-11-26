import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { reportToOwner } from "@/lib/ai-workforce/owner-report";
import { recordTeamNote } from "@/lib/ai-workforce/team-memory";
import { computeDueAtFromPriority } from "@/lib/ai-workforce/work-orders";
import { getServiceSupabase } from "@/lib/supabase/admin";

export type IncidentArea =
  | "admin"
  | "customer"
  | "plumber"
  | "public"
  | "mobile"
  | "tracking"
  | "payments"
  | "chat"
  | "ai-workforce"
  | "system";

export interface SystemIncidentInput {
  source: string;
  errorMessage: string;
  area?: IncidentArea;
  stack?: string;
  routePath?: string;
  actorRole?: string;
  context?: Record<string, unknown>;
}

const DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const recentIncidentTimestamps = new Map<string, number>();

const SECRET_VALUE_RX =
  /(sk_[a-z0-9_]{8,}|tvly-[a-z0-9_-]{8,}|re_[a-z0-9_]{8,}|github_pat_[a-z0-9_]+|eyJ[a-zA-Z0-9_-]{12,}|bearer\s+[a-z0-9._-]+|(?:password|secret|token|api[_-]?key)\s*[:=]\s*[^\s,;]+)/gi;

export function sanitizeIncidentText(raw: unknown, maxLen = 600): string {
  const str = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw || "");
  return str
    .replace(SECRET_VALUE_RX, "[REDACTED]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

export function inferIncidentArea(source: string, routePath?: string): IncidentArea {
  const combined = `${source} ${routePath || ""}`.toLowerCase();
  if (combined.includes("payment") || combined.includes("financial")) return "payments";
  if (combined.includes("/api/mobile") || combined.includes("mobile:")) return "mobile";
  if (combined.includes("/api/tracking") || combined.includes("/tracking")) return "tracking";
  if (combined.includes("workforce") || combined.includes("/api/ai")) return "ai-workforce";
  if (combined.includes("/admin") || combined.includes("admin:") || combined.includes("adminupdate")) {
    return "admin";
  }
  if (combined.includes("/api/customer") || combined.includes("/customer") || combined.includes(":customer")) {
    return "customer";
  }
  if (combined.includes("/api/plumber") || combined.includes("/plumber") || combined.includes(":plumber")) {
    return "plumber";
  }
  if (combined.includes("/api/chat") || combined.startsWith("chat:")) return "chat";
  if (combined.includes("/api/public") || combined.includes("public") || combined.includes("amina")) {
    return "public";
  }
  return "system";
}

export function diagnoseIncidentHint(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("schema cache") || (lower.includes("column") && lower.includes("does not exist"))) {
    return "Database schema mismatch: code referenced a column missing from Postgres/PostgREST cache. Add fallback/metadata persistence or apply the matching SQL migration.";
  }
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Database RLS or role authorization rejection; verify service-role vs user session query and policy permissions.";
  }
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("etimedout") || lower.includes("504")) {
    return "Upstream network or AI/STT provider timeout; check external API key/quota and fallback chain.";
  }
  if (lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("session")) {
    return "Authentication or expired session error; verify Supabase auth token or portal cookie verification.";
  }
  if (lower.includes("storage") || lower.includes("upload") || lower.includes("bucket")) {
    return "File upload or Supabase Storage bucket failure; verify MIME type, file size, and bucket permissions.";
  }
  return "Unexpected runtime failure captured automatically; inspect the source endpoint/component and recent changes.";
}

export function buildIncidentDedupeKey(source: string, message: string): string {
  const cleanSrc = source.trim().toLowerCase().slice(0, 80);
  const cleanMsg = sanitizeIncidentText(message, 100)
    .toLowerCase()
    .replace(/\b[0-9a-f]{8,}\b/g, "<id>")
    .replace(/\b\d+\b/g, "<n>");
  return `${cleanSrc}::${cleanMsg}`;
}

export function resetIncidentDedupeForTests(): void {
  recentIncidentTimestamps.clear();
}

/**
 * Reports an unexpected error anywhere in FlowGuard (Public web, Customer, Plumber, Mobile APIs, Admin, or Server Actions)
 * to Bashir (engineering_ai) with 15-minute deduplication, root-cause hint, Team Note, and Urgent Owner alert.
 */
export async function reportSystemIncident(
  input: SystemIncidentInput,
  deps: { nowMs?: number } = {}
): Promise<{ recorded: boolean; skippedReason?: string; taskId?: string; area: IncidentArea }> {
  const source = sanitizeIncidentText(input.source || "unknown", 120) || "unknown";
  const area = input.area ?? inferIncidentArea(source, input.routePath);
  const cleanMessage = sanitizeIncidentText(input.errorMessage, 320);

  if (!cleanMessage || cleanMessage.length < 3) {
    return { recorded: false, skippedReason: "empty_message", area };
  }

  // Ignore expected user abort / resize noise
  if (
    /\b(ResizeObserver loop|AbortError: The user aborted a request|Non-Error promise rejection)\b/i.test(
      cleanMessage
    )
  ) {
    return { recorded: false, skippedReason: "benign_browser_noise", area };
  }

  const nowMs = deps.nowMs ?? Date.now();
  const dedupeKey = buildIncidentDedupeKey(source, cleanMessage);
  const lastSeen = recentIncidentTimestamps.get(dedupeKey);
  if (lastSeen !== undefined && nowMs - lastSeen < DEDUPE_WINDOW_MS) {
    return { recorded: false, skippedReason: "deduped_in_memory", area };
  }
  recentIncidentTimestamps.set(dedupeKey, nowMs);

  // Prune old keys so memory stays bounded
  if (recentIncidentTimestamps.size > 200) {
    for (const [k, ts] of recentIncidentTimestamps.entries()) {
      if (nowMs - ts >= DEDUPE_WINDOW_MS) recentIncidentTimestamps.delete(k);
    }
  }

  const hint = diagnoseIncidentHint(cleanMessage);
  const stackSnippet = input.stack ? sanitizeIncidentText(input.stack, 400) : "";
  const contextLine = input.context
    ? sanitizeIncidentText(JSON.stringify(input.context), 220)
    : "";

  const deliverable = [
    `[Area: ${area.toUpperCase()}] Source: ${source}`,
    `Error: ${cleanMessage}`,
    `Bashir Diagnosis: ${hint}`,
    input.routePath ? `Path: ${sanitizeIncidentText(input.routePath, 140)}` : "",
    input.actorRole ? `Actor Role: ${sanitizeIncidentText(input.actorRole, 40)}` : "",
    contextLine ? `Context: ${contextLine}` : "",
    stackSnippet ? `Trace: ${stackSnippet}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  try {
    const supabase = getServiceSupabase();
    const cutoffIso = new Date(nowMs - DEDUPE_WINDOW_MS).toISOString();
    const taskTitle = `Incident [${area.toUpperCase()}]: ${source}`.slice(0, 140);

    // Cross-instance serverless deduplication via ai_tasks
    const { data: recentDb } = await supabase
      .from("ai_tasks")
      .select("id, output_summary")
      .eq("assigned_agent_id", "engineering_ai")
      .eq("title", taskTitle)
      .gte("created_at", cutoffIso)
      .limit(3);

    if (
      (recentDb || []).some((r) =>
        String(r.output_summary || "")
          .toLowerCase()
          .includes(cleanMessage.slice(0, 60).toLowerCase())
      )
    ) {
      return { recorded: false, skippedReason: "deduped_in_db", area };
    }

    const taskId = randomUUID();
    const nowIso = new Date(nowMs).toISOString();
    await supabase.from("ai_tasks").insert({
      id: taskId,
      title: taskTitle,
      description: deliverable.slice(0, 1000),
      requester_id: "system_incident_monitor",
      assigned_agent_id: "engineering_ai",
      owner_agent: "engineering_ai",
      created_by: "system_incident_monitor",
      parent_task_id: null,
      priority: "high",
      status: "reported",
      due_at: computeDueAtFromPriority("high"),
      deliverable: deliverable.slice(0, 1000),
      qa_status: "approved",
      lessons: [`[${area}] ${cleanMessage.slice(0, 110)}`.slice(0, 140)],
      output_summary: deliverable.slice(0, 500),
      completed_at: nowIso,
    });

    await supabase.from("ai_task_events").insert({
      id: randomUUID(),
      task_id: taskId,
      agent_id: "engineering_ai",
      event_type: "reported",
      message: `Bashir captured ${area} incident in ${source}: ${cleanMessage.slice(0, 180)}`,
    });

    await supabase
      .from("ai_agent_memory")
      .upsert(
        {
          agent_id: "engineering_ai",
          namespace: "ns_engineering_ai",
          memory_key: `incident:${area}:${Date.now().toString(36)}`,
          content: `[${area}] ${source}: ${cleanMessage.slice(0, 120)}`,
          source: "incident_monitor",
          approved_by_owner: true,
        },
        { onConflict: "namespace,memory_key" }
      )
      .then(
        () => {},
        () => {}
      );

    await recordTeamNote({
      fromAgent: "engineering_ai",
      toAgent: "operations_manager",
      taskId,
      note: `Bashir detected [${area.toUpperCase()}] issue in ${source}: ${cleanMessage.slice(0, 130)} — ${hint.slice(0, 110)}`,
    }).catch(() => {});

    await reportToOwner({
      agentId: "engineering_ai",
      status: "urgent",
      urgent: true,
      taskId,
      summary: `[${area.toUpperCase()}] Issue in ${source}: ${cleanMessage.slice(0, 150)}`,
      evidence: [hint.slice(0, 120)],
      destination: "/admin/workforce?tab=tasks",
    }).catch(() => {});

    return { recorded: true, taskId, area };
  } catch (err) {
    console.error("[incident-monitor]", err instanceof Error ? err.message : err);
    return { recorded: false, skippedReason: "persist_failed", area };
  }
}

export async function captureActionError(
  source: string,
  error: unknown,
  options: { area?: IncidentArea; routePath?: string; actorRole?: string; context?: Record<string, unknown> } = {}
): Promise<void> {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown server error";
  const stack = error instanceof Error ? error.stack : undefined;
  await reportSystemIncident({
    source,
    errorMessage: msg,
    stack,
    area: options.area,
    routePath: options.routePath,
    actorRole: options.actorRole,
    context: options.context,
  }).catch(() => {});
}

/**
 * Wraps an App Router API handler so both uncaught exceptions and HTTP >= 500
 * responses across Public, Customer, Plumber, Mobile, Tracking, Chat, or Admin
 * routes automatically alert Bashir with 15-minute deduplication.
 */
export function withIncidentMonitor<TArgs extends unknown[]>(
  source: string,
  area: IncidentArea,
  handler: (...args: TArgs) => Promise<Response>
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      const res = await handler(...args);
      if (res.status >= 500) {
        const preview = await res
          .clone()
          .text()
          .catch(() => "");
        void reportSystemIncident({
          source,
          area,
          errorMessage: `HTTP ${res.status} in ${source}${preview ? `: ${preview.slice(0, 180)}` : ""}`,
        });
      }
      return res;
    } catch (err) {
      await captureActionError(source, err, { area });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
