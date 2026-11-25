import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getAgentDefinition, listAgentDefinitions } from "@/lib/ai-workforce/registry";
import { getFlowGuardKnowledgeContext } from "@/lib/ai-workforce/knowledge";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import { reportToOwner } from "@/lib/ai-workforce/owner-report";
import {
  defaultTeamMemoryStore,
  recordTeamNote,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";
import { stripAudioTags } from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";
import type { createNotification } from "@/lib/notifications";

export const MAX_MEETING_FOLLOW_UPS = 2;

export interface MeetingActionItem {
  ownerAgentId: AgentId;
  title: string;
  instruction: string;
}

export interface MeetingTurn {
  id: string;
  speakerType: "founder" | "agent" | "system";
  speakerId: string;
  speakerName: string;
  avatarUrl?: string;
  text: string;
  spokenText?: string;
  failed?: boolean;
  retryPrompt?: string;
  createdAt: string;
}

export interface RaisedHand {
  agentId: AgentId;
  displayName: string;
  avatarUrl: string;
  kind: "question" | "suggestion";
  topic: string;
}

const AGENT_NAME_PATTERNS: Array<{ id: AgentId; rx: RegExp }> = [
  { id: "engineering_ai", rx: /\b(bashir|basheer|engineer(?:ing)?)\b/i },
  { id: "sales_ai", rx: /\b(amina|amin|ameena|sales)\b/i },
  { id: "customer_support_ai", rx: /\b(zainab|zenab|support)\b/i },
  { id: "research_ai", rx: /\b(faruk|farooq|research)\b/i },
  { id: "operations_manager", rx: /\b(sadiq|sadi|ops|operations)\b/i },
];

export function detectInvitedAgents(message: string, current: AgentId[]): AgentId[] {
  const lower = message.toLowerCase();
  const wantsInvite = /\b(bring|invite|include|add|join|call\s+in)\b/.test(lower);
  const next = new Set<AgentId>(["operations_manager", ...current]);

  if (wantsInvite) {
    if (/\b(everyone|all|whole\s+team|full\s+team)\b/.test(lower)) {
      for (const a of listAgentDefinitions()) next.add(a.id);
    } else {
      for (const entry of AGENT_NAME_PATTERNS) {
        if (entry.rx.test(message)) next.add(entry.id);
      }
    }
  }
  return Array.from(next);
}

export function detectPrimarySpeaker(
  message: string,
  participants: AgentId[],
  explicitCallOn?: AgentId,
  lastSpeakerId?: AgentId
): AgentId {
  if (explicitCallOn && participants.includes(explicitCallOn)) {
    return explicitCallOn;
  }

  const trimmed = message.trim();
  // Explicit @Name or "Name, ..." at start takes precedence
  for (const entry of AGENT_NAME_PATTERNS) {
    const startRx = new RegExp(`^(@?${entry.rx.source})[,:\\s]`, "i");
    if (startRx.test(trimmed) && participants.includes(entry.id)) {
      return entry.id;
    }
  }

  // Otherwise check if founder specifically addressed a specialist in the room
  for (const entry of AGENT_NAME_PATTERNS) {
    if (entry.id !== "operations_manager" && entry.rx.test(trimmed) && participants.includes(entry.id)) {
      // If founder asks Sadiq to "bring/include X", Sadiq still answers first to welcome them
      if (!/\b(bring|invite|include|add)\b/i.test(trimmed)) {
        return entry.id;
      }
    }
  }

  // If founder explicitly addressed Sadiq, route to him
  const sadiqEntry = AGENT_NAME_PATTERNS.find((e) => e.id === "operations_manager");
  if (sadiqEntry && sadiqEntry.rx.test(trimmed)) {
    return "operations_manager";
  }

  // Keep the floor with the specialist currently speaking so Sadiq doesn't interrupt
  if (lastSpeakerId && lastSpeakerId !== "operations_manager" && participants.includes(lastSpeakerId)) {
    return lastSpeakerId;
  }

  return "operations_manager";
}

export function parseStructuredMeetingOutput(
  rawText: string,
  participants: AgentId[],
  speakerId: AgentId
): {
  reply: string;
  raisedHands: RaisedHand[];
} {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      reply?: string;
      raisedHands?: Array<{ agentId?: string; kind?: string; topic?: string }>;
    };
    const reply = String(parsed.reply || "").trim() || rawText.trim();
    const hands: RaisedHand[] = [];
    for (const h of parsed.raisedHands || []) {
      const aid = String(h?.agentId || "") as AgentId;
      if (!participants.includes(aid) || aid === speakerId) continue;
      const def = getAgentDefinition(aid);
      if (!def) continue;
      hands.push({
        agentId: aid,
        displayName: def.displayName,
        avatarUrl: def.avatarUrl,
        kind: h?.kind === "question" ? "question" : "suggestion",
        topic: String(h?.topic || "Has a relevant point to share").slice(0, 120),
      });
    }
    return { reply, raisedHands: hands.slice(0, 2) };
  } catch {
    return { reply: rawText.trim(), raisedHands: [] };
  }
}

let lastGoodSnapshot: string | null = null;

async function fetchMeetingSnapshot(): Promise<string> {
  try {
    const supabase = getServiceSupabase();
    const queryPromise = Promise.all([
      supabase
        .from("service_requests")
        .select("ticket_number, status, problem_category, city_lga, assigned_technician")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("plumbers")
        .select("full_name, is_available, verification_status")
        .eq("verification_status", "approved")
        .is("deleted_at", null)
        .limit(10),
      supabase
        .from("payments")
        .select("ticket_number, total_payment, verification_status")
        .eq("verification_status", "pending")
        .limit(8),
      supabase
        .from("ai_tasks")
        .select("title, assigned_agent_id, status, output_summary")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("ai_approvals")
        .select("requested_by_agent, action_summary, target_resource, status")
        .eq("status", "pending")
        .limit(8),
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Snapshot timeout")), 2500)
    );

    const [reqsRes, plumbersRes, paysRes, tasksRes, apprsRes] = await Promise.race([
      queryPromise,
      timeoutPromise,
    ]);

    const snap = [
      `LIVE FLOWGUARD SNAPSHOT (${new Date().toISOString()}):`,
      `- Recent tickets: ${(reqsRes.data || []).map((r) => `${r.ticket_number}[${r.status}, ${r.problem_category}, ${r.assigned_technician || "Unassigned"}]`).join("; ") || "None"}`,
      `- Approved plumbers: ${(plumbersRes.data || []).map((p) => `${p.full_name}(${p.is_available ? "On Duty" : "Off Duty"})`).join(", ") || "None"}`,
      `- Pending payments: ${(paysRes.data || []).length}`,
      `- Recent AI tasks: ${(tasksRes.data || []).map((t) => `[${t.assigned_agent_id}] ${t.title}(${t.status})`).join("; ") || "None"}`,
      `- Pending approvals: ${(apprsRes.data || []).map((a) => `[${a.requested_by_agent}] ${a.action_summary}`).join("; ") || "None"}`,
    ].join("\n");
    lastGoodSnapshot = snap;
    return snap;
  } catch {
    return lastGoodSnapshot || "Snapshot unavailable.";
  }
}

export function parseWrapUpOutput(rawText: string): {
  summary: string;
  actionItems: MeetingActionItem[];
} {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as {
      summary?: string;
      actionItems?: Array<{
        ownerAgentId?: string;
        title?: string;
        instruction?: string;
      }>;
    };
    const summary = stripAudioTags(String(parsed.summary || "").trim()) || stripAudioTags(rawText.trim());
    const actionItems: MeetingActionItem[] = [];
    for (const item of parsed.actionItems || []) {
      const ownerId = String(item?.ownerAgentId || "").trim() as AgentId;
      const title = String(item?.title || "").trim();
      const instruction = String(item?.instruction || "").trim();
      if (!getAgentDefinition(ownerId) || !title || !instruction) continue;
      actionItems.push({
        ownerAgentId: ownerId,
        title: title.slice(0, 140),
        instruction: instruction.slice(0, 600),
      });
    }
    return { summary, actionItems: actionItems.slice(0, 8) };
  } catch {
    return { summary: stripAudioTags(rawText.trim()), actionItems: [] };
  }
}

export async function runTeamMeetingTurn(params: {
  founderMessage: string;
  participants: AgentId[];
  history: MeetingTurn[];
  callOnAgent?: AgentId;
  wrapUp?: boolean;
  modelRunner?: typeof runWithFreeFirstModel;
  teamStore?: TeamBoardAndMemoryStore;
  notifyFn?: typeof createNotification;
  persistWrapUpTasks?: (input: {
    summaryTaskId: string;
    summary: string;
    transcript: string;
    actionItems: MeetingActionItem[];
  }) => Promise<number>;
}): Promise<{
  participants: AgentId[];
  speakerTurn: MeetingTurn;
  followUpTurns: MeetingTurn[];
  raisedHands: RaisedHand[];
  wrappedUpTasksCreated?: number;
}> {
  const runner = params.modelRunner ?? runWithFreeFirstModel;
  const teamStore = params.teamStore ?? defaultTeamMemoryStore;
  const nextParticipants = detectInvitedAgents(params.founderMessage, params.participants);
  const lastAgentTurn = [...params.history].reverse().find((t) => t.speakerType === "agent");
  const speakerId: AgentId = params.wrapUp
    ? "operations_manager"
    : detectPrimarySpeaker(
        params.founderMessage,
        nextParticipants,
        params.callOnAgent,
        lastAgentTurn?.speakerId as AgentId | undefined
      );

  const speaker = getAgentDefinition(speakerId) ?? getAgentDefinition("operations_manager")!;
  const [snapshot, teamNotes, memories] = await Promise.all([
    params.modelRunner ? Promise.resolve("Snapshot skipped in test.") : fetchMeetingSnapshot(),
    teamStore.listNotesForAgent(speaker.id, 10).catch(() => []),
    teamStore.loadMemories(speaker.id, speaker.memoryNamespace, 10).catch(() => []),
  ]);
  const otherInRoom = nextParticipants
    .filter((id) => id !== speaker.id)
    .map((id) => getAgentDefinition(id)?.displayName || id)
    .join(", ");

  const recentTranscript = params.history
    .slice(-10)
    .map((t) => `${t.speakerName}: ${t.text}`)
    .join("\n");

  const notesBlock =
    teamNotes.length > 0
      ? `RECENT TEAM BOARD NOTES:\n${teamNotes.map((n) => `- [${n.fromAgent}${n.toAgent ? ` -> ${n.toAgent}` : ""}] ${n.note}`).join("\n")}`
      : "";
  const memoryBlock =
    memories.length > 0
      ? `RECENT MEMORY:\n${memories.map((m) => `- (${m.namespace}) ${m.content}`).join("\n")}`
      : "";

  const knowledge = getFlowGuardKnowledgeContext(speaker.id === "engineering_ai");
  const systemPrompt = [
    speaker.systemPrompt,
    `APPROVED FLOWGUARD KNOWLEDGE:\n${knowledge}`,
    notesBlock,
    memoryBlock,
    `MEETING CONTEXT: You are in a live FlowGuard team meeting with the Founder (Boss) and colleagues in the room: ${otherInRoom || "just you and the Founder"}.`,
    "HOW TO SPEAK IN THE MEETING (SPOKEN VOICE):",
    "- You are speaking out loud on a live voice call with the Founder and your teammates. Write for the ear, not for an email or report.",
    "- Keep it short and natural (1 to 3 everyday sentences). Use contractions (I'm, we've, didn't, let's) and simple punctuation (commas and periods) so your voice sounds relaxed and human.",
    "- Vary your openings naturally (e.g. 'Morning Boss,', 'Yeah, on that,', 'Honestly,', 'Quick update,', 'So far,'). Never start every turn with 'Good day, Boss' or 'Certainly'.",
    "- Never use bracketed stage directions like [chuckles] or [sighs], bullet lists, em-dashes, or robotic closing lines.",
    "- You may ask the Founder a direct question if a business decision or clarification is needed.",
    "- Only mention facts from the LIVE FLOWGUARD SNAPSHOT, team notes, or meeting history; never invent tickets, revenue, or completed work.",
    params.wrapUp
      ? "- The Founder asked to wrap up: return STRICT JSON only (no markdown fences) with shape: {\"summary\":\"short spoken wrap-up\",\"actionItems\":[{\"ownerAgentId\":\"operations_manager|sales_ai|customer_support_ai|research_ai|engineering_ai\",\"title\":\"short task title\",\"instruction\":\"clear action instruction\"}]}. Include only agreed next steps."
      : "- Return STRICT JSON only (no markdown fences) with shape: {\"reply\":\"your spoken reply\",\"raisedHands\":[{\"agentId\":\"sales_ai|customer_support_ai|research_ai|engineering_ai|operations_manager\",\"kind\":\"question|suggestion\",\"topic\":\"short 5-10 word reason\"}]}. Only include raisedHands (0 to 2) for colleagues currently in the room if they genuinely have an important question for the Founder or a helpful suggestion.",
    snapshot,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userPrompt = params.callOnAgent
    ? `Meeting transcript so far:\n${recentTranscript || "(start of meeting)"}\n\nThe Founder just called on you (${speaker.displayName}) because you raised your hand. Share your question or suggestion naturally.`
    : `Meeting transcript so far:\n${recentTranscript || "(start of meeting)"}\n\nFounder just said: "${params.founderMessage}"`;

  const modelRes = await runner({
    agentId: speaker.id,
    routeId: speaker.modelRoute,
    systemPrompt,
    userPrompt,
    maxTokens: params.wrapUp ? 1200 : 400,
    timeoutMs: 22000,
  });

  let replyText = "";
  let spokenText = "";
  let raisedHands: RaisedHand[] = [];
  let actionItems: MeetingActionItem[] = [];
  let failed = false;

  if (modelRes.ok && modelRes.text) {
    if (params.wrapUp) {
      const wrapParsed = parseWrapUpOutput(modelRes.text);
      replyText = wrapParsed.summary;
      spokenText = wrapParsed.summary;
      actionItems = wrapParsed.actionItems;
    } else {
      const parsed = parseStructuredMeetingOutput(modelRes.text, nextParticipants, speaker.id);
      spokenText = parsed.reply;
      replyText = stripAudioTags(parsed.reply);
      raisedHands = parsed.raisedHands;
    }
  } else {
    failed = true;
    replyText = "Network is slow on my side, Boss. Say that again?";
    spokenText = replyText;
    // Keep raw error in ai_audit_logs, never in the meeting chat bubble
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_audit_logs").insert({
        actor_type: "agent",
        actor_id: speaker.id,
        event_type: "meeting_model_error",
        target_resource: speaker.modelRoute,
        details: {
          code: modelRes.code || "PROVIDER_ERROR",
          error: String(modelRes.error || "unavailable").slice(0, 300),
        },
      });
    } catch {
      // Non-fatal
    }
  }

  const speakerTurn: MeetingTurn = {
    id: randomUUID(),
    speakerType: "agent",
    speakerId: speaker.id,
    speakerName: speaker.displayName,
    avatarUrl: speaker.avatarUrl,
    text: replyText,
    spokenText,
    ...(failed ? { failed: true, retryPrompt: params.founderMessage } : {}),
    createdAt: new Date().toISOString(),
  };

  // Step 5: Allow up to 2 short follow-up replies from raised-hand teammates reacting naturally
  const followUpTurns: MeetingTurn[] = [];
  if (!params.wrapUp && !params.callOnAgent && raisedHands.length > 0 && modelRes.ok) {
    const candidates = raisedHands.slice(0, MAX_MEETING_FOLLOW_UPS);
    let runningTranscript = `${recentTranscript}\nFounder (You): ${params.founderMessage}\n${speaker.displayName}: ${replyText}`;

    for (const hand of candidates) {
      const colleague = getAgentDefinition(hand.agentId);
      if (!colleague || !colleague.enabled) continue;

      const followRes = await runner({
        agentId: colleague.id,
        routeId: colleague.modelRoute,
        systemPrompt: [
          colleague.systemPrompt,
          `MEETING CONTEXT: You raised your hand in the live FlowGuard team meeting (${hand.kind}: ${hand.topic}).`,
          "Reply in 1 to 2 short, natural spoken sentences directly to the Founder or your teammate (e.g. 'Sadiq, I can take that lead' or 'Boss, quick question on that'). No JSON, no lists, no stage directions.",
        ].join("\n\n"),
        userPrompt: `Recent meeting:\n${runningTranscript}\n\nSpeak up briefly now:`,
        maxTokens: 350,
        timeoutMs: 18000,
      });

      if (followRes.ok && followRes.text) {
        const cleanFollow = stripAudioTags(followRes.text);
        if (cleanFollow) {
          const turn: MeetingTurn = {
            id: randomUUID(),
            speakerType: "agent",
            speakerId: colleague.id,
            speakerName: colleague.displayName,
            avatarUrl: colleague.avatarUrl,
            text: cleanFollow,
            spokenText: cleanFollow,
            createdAt: new Date().toISOString(),
          };
          followUpTurns.push(turn);
          runningTranscript += `\n${colleague.displayName}: ${cleanFollow}`;
        }
      }
    }
    raisedHands = raisedHands.slice(followUpTurns.length);
  }

  let wrappedUpTasksCreated = 0;
  if (params.wrapUp && replyText) {
    const summaryTaskId = randomUUID();
    if (params.persistWrapUpTasks) {
      wrappedUpTasksCreated = await params.persistWrapUpTasks({
        summaryTaskId,
        summary: replyText,
        transcript: recentTranscript.slice(-1500) || params.founderMessage,
        actionItems,
      });
    } else {
      try {
        const supabase = getServiceSupabase();
        await supabase.from("ai_tasks").insert({
          id: summaryTaskId,
          title: `Weekly Meeting Summary (${new Date().toLocaleDateString("en-NG")})`,
          description: recentTranscript.slice(-1500) || params.founderMessage,
          requester_id: "founder_meeting",
          assigned_agent_id: "operations_manager",
          priority: "normal",
          status: "completed",
          output_summary: replyText,
          completed_at: new Date().toISOString(),
        });
        wrappedUpTasksCreated = 1;

        for (const item of actionItems) {
          await supabase.from("ai_tasks").insert({
            id: randomUUID(),
            title: item.title,
            description: item.instruction,
            requester_id: "founder_meeting",
            assigned_agent_id: item.ownerAgentId,
            parent_task_id: summaryTaskId,
            priority: "normal",
            status: "queued",
          });
          wrappedUpTasksCreated += 1;
        }
      } catch {
        // Non-fatal
      }
    }

    const assignmentSummary =
      actionItems.length > 0
        ? actionItems
            .map((a) => `${getAgentDefinition(a.ownerAgentId)?.displayName.split("—")[0].trim() || a.ownerAgentId}: ${a.title}`)
            .join("; ")
        : replyText;

    await recordTeamNote(
      {
        fromAgent: "operations_manager",
        taskId: summaryTaskId,
        note: `Meeting wrap-up: ${assignmentSummary.slice(0, 260)}`,
      },
      teamStore
    ).catch(() => {});

    await reportToOwner(
      {
        agentId: "operations_manager",
        status: "completed",
        summary:
          actionItems.length > 0
            ? `Meeting wrapped up with ${actionItems.length} action item(s): ${assignmentSummary}`
            : `Meeting wrapped up: ${replyText}`,
        taskId: summaryTaskId,
      },
      params.notifyFn
    ).catch(() => {});
  }

  return {
    participants: nextParticipants,
    speakerTurn,
    followUpTurns,
    raisedHands,
    ...(params.wrapUp ? { wrappedUpTasksCreated } : {}),
  };
}
