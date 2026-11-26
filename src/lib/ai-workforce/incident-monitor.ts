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
    return "A new field could not be saved because the database is missing that matching column yet.";
  }
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "Access check blocked an update — please check the account role or permissions for that page.";
  }
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("etimedout") || lower.includes("504")) {
    return "The AI or voice service took too long to reply. Usually temporary — trying again should work.";
  }
  if (lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("session")) {
    return "A user's sign-in session expired or could not be verified. Signing out and back in should fix it.";
  }
  if (lower.includes("storage") || lower.includes("upload") || lower.includes("bucket")) {
    return "A file or photo could not finish uploading. Check file size or ask the user to upload again.";
  }
  return "Something unexpected failed while handling this request. Ask Bashir to inspect it for a quick fix.";
}

export function humanAreaLabel(area: IncidentArea): string {
  const map: Record<IncidentArea, string> = {
    admin: "Admin Dashboard",
    customer: "Customer Portal",
    plumber: "Plumber Portal",
    public: "Website & Amina Chat",
    mobile: "Mobile App",
    tracking: "Live Map & Tracking",
    payments: "Payments & Quotes",
    chat: "Ticket Chat",
    "ai-workforce": "AI Team Console",
    system: "FlowGuard System",
  };
  return map[area] || "FlowGuard System";
}

export function humanSourceLabel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("adminupdateplumber")) return "Admin Plumbers Page";
  if (s.includes("updateprofileaction")) return "Profile Settings Save";
  if (s.includes("registercustomer")) return "Customer Sign-Up";
  if (s.includes("submitservicerequest")) return "Service Booking Form";
  if (s.includes("zainab/chat")) return "Zainab Support Chat";
  if (s.includes("zainab/stt")) return "Zainab Voice Note";
  if (s.includes("amina/book")) return "Amina Booking Flow";
  if (s.includes("amina/chat")) return "Amina Website Chat";
  if (s.includes("mobile/auth")) return "Mobile App Sign-In";
  if (s.includes("mobile/tracking")) return "Plumber Live Location";
  if (s.includes("mobile/payments")) return "Mobile Payment Submission";
  if (s.includes("mobile/quotations")) return "Mobile Quotation";
  if (s.includes("mobile/requests")) return "Mobile Booking";
  if (s.includes("mobile/jobs")) return "Plumber Job Update";
  if (s.includes("tracking/snapshot") || s.includes("tracking/route")) return "Live Tracking Map";
  if (s.includes("chat/message")) return "Ticket Messaging";
  if (s.includes("ai/admin")) return "Admin AI Assistant";
  if (s.includes("workforce/tasks")) return "AI Team Task Runner";
  if (s.includes("window_error") || s.includes("unhandled_rejection") || s.includes("error_boundary")) {
    return "Web Page Screen";
  }
  return "System Service";
}

export function plainEnglishProblem(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("schema cache") || (lower.includes("column") && lower.includes("does not exist"))) {
    return "a field could not be saved cleanly to the database";
  }
  if (lower.includes("row-level security") || lower.includes("permission denied")) {
    return "the system blocked an action due to account permissions";
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("504")) {
    return "an external service took too long to respond";
  }
  if (lower.includes("unauthorized") || lower.includes("jwt") || lower.includes("session")) {
    return "a user's sign-in session could not be verified";
  }
  if (lower.includes("storage") || lower.includes("upload") || lower.includes("bucket")) {
    return "a photo or document failed to upload";
  }
  const stripped = message
    .replace(/^HTTP \d{3} in [^:]+:\s*/i, "")
    .replace(/\{[^}]*\}/g, "")
    .trim();
  return stripped.slice(0, 130) || "an unexpected issue stopped this step from finishing";
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
  const placeName = humanSourceLabel(source);
  const areaName = humanAreaLabel(area);
  const plainProblem = plainEnglishProblem(cleanMessage);

  const deliverable = [
    `Where it happened: ${areaName} (${placeName})`,
    `What went wrong: ${plainProblem}`,
    `What Bashir recommends: ${hint}`,
    input.routePath ? `Page visited: ${sanitizeIncidentText(input.routePath, 140)}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  try {
    const supabase = getServiceSupabase();
    const cutoffIso = new Date(nowMs - DEDUPE_WINDOW_MS).toISOString();
    const taskTitle = `${areaName}: Issue in ${placeName}`.slice(0, 140);

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
          .includes(plainProblem.slice(0, 50).toLowerCase())
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
      lessons: [`${areaName}: ${plainProblem}`.slice(0, 140)],
      output_summary: deliverable.slice(0, 500),
      completed_at: nowIso,
    });

    await supabase.from("ai_task_events").insert({
      id: randomUUID(),
      task_id: taskId,
      agent_id: "engineering_ai",
      event_type: "reported",
      message: `Bashir flagged an issue on ${placeName}: ${plainProblem}`,
    });

    await supabase
      .from("ai_agent_memory")
      .upsert(
        {
          agent_id: "engineering_ai",
          namespace: "ns_engineering_ai",
          memory_key: `incident:${area}:${Date.now().toString(36)}`,
          content: `${areaName} (${placeName}): ${plainProblem}`,
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
      note: `Bashir noticed an issue on the ${placeName} (${areaName}): ${plainProblem}. ${hint}`.slice(
        0,
        360
      ),
    }).catch(() => {});

    await reportToOwner({
      agentId: "engineering_ai",
      status: "urgent",
      urgent: true,
      taskId,
      summary: `Heads up Boss, something went wrong in ${placeName} (${areaName}): ${plainProblem}. ${hint}`.slice(
        0,
        240
      ),
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
