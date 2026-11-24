import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getAgentDefinition, listAgentDefinitions } from "@/lib/ai-workforce/registry";
import { getFlowGuardKnowledgeContext } from "@/lib/ai-workforce/knowledge";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import { stripAudioTags } from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";

export interface MeetingTurn {
  id: string;
  speakerType: "founder" | "agent" | "system";
  speakerId: string;
  speakerName: string;
  avatarUrl?: string;
  text: string;
  spokenText?: string;
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
  { id: "engineering_ai", rx: /\b(bashir|engineer(?:ing)?)\b/i },
  { id: "sales_ai", rx: /\b(amina|sales)\b/i },
  { id: "customer_support_ai", rx: /\b(zainab|support)\b/i },
  { id: "research_ai", rx: /\b(faruk|research)\b/i },
  { id: "operations_manager", rx: /\b(sadiq|ops|operations)\b/i },
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
  explicitCallOn?: AgentId
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

async function fetchMeetingSnapshot(): Promise<string> {
  try {
    const supabase = getServiceSupabase();
    const [reqsRes, plumbersRes, paysRes, tasksRes, apprsRes] = await Promise.all([
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

    return [
      `LIVE FLOWGUARD SNAPSHOT (${new Date().toISOString()}):`,
      `- Recent tickets: ${(reqsRes.data || []).map((r) => `${r.ticket_number}[${r.status}, ${r.problem_category}, ${r.assigned_technician || "Unassigned"}]`).join("; ") || "None"}`,
      `- Approved plumbers: ${(plumbersRes.data || []).map((p) => `${p.full_name}(${p.is_available ? "On Duty" : "Off Duty"})`).join(", ") || "None"}`,
      `- Pending payments: ${(paysRes.data || []).length}`,
      `- Recent AI tasks: ${(tasksRes.data || []).map((t) => `[${t.assigned_agent_id}] ${t.title}(${t.status})`).join("; ") || "None"}`,
      `- Pending approvals: ${(apprsRes.data || []).map((a) => `[${a.requested_by_agent}] ${a.action_summary}`).join("; ") || "None"}`,
    ].join("\n");
  } catch {
    return "Snapshot unavailable.";
  }
}

export async function runTeamMeetingTurn(params: {
  founderMessage: string;
  participants: AgentId[];
  history: MeetingTurn[];
  callOnAgent?: AgentId;
  wrapUp?: boolean;
}): Promise<{
  participants: AgentId[];
  speakerTurn: MeetingTurn;
  raisedHands: RaisedHand[];
  wrappedUpTasksCreated?: number;
}> {
  const nextParticipants = detectInvitedAgents(params.founderMessage, params.participants);
  const speakerId: AgentId = params.wrapUp
    ? "operations_manager"
    : detectPrimarySpeaker(params.founderMessage, nextParticipants, params.callOnAgent);

  const speaker = getAgentDefinition(speakerId) ?? getAgentDefinition("operations_manager")!;
  const snapshot = await fetchMeetingSnapshot();
  const otherInRoom = nextParticipants
    .filter((id) => id !== speaker.id)
    .map((id) => getAgentDefinition(id)?.displayName || id)
    .join(", ");

  const recentTranscript = params.history
    .slice(-10)
    .map((t) => `${t.speakerName}: ${t.text}`)
    .join("\n");

  const knowledge = getFlowGuardKnowledgeContext(speaker.id === "engineering_ai");
  const systemPrompt = [
    speaker.systemPrompt,
    `APPROVED FLOWGUARD KNOWLEDGE:\n${knowledge}`,
    `MEETING CONTEXT: You are in a live FlowGuard team meeting with the Founder (Boss) and colleagues in the room: ${otherInRoom || "just you and the Founder"}.`,
    "HOW TO SPEAK IN THE MEETING:",
    "- Talk like a real human teammate on a live voice call — warm, natural, conversational (2–4 short sentences), using contractions ('I'm', 'we've', 'let's') and zero corporate/AI filler.",
    "- Include 1 to 3 subtle ElevenLabs audio tags naturally inside your reply so your voice sounds genuinely human, such as [chuckles], [thoughtful], [short pause], or [sighs] (e.g. \"[chuckles] Ha, close enough — Amina here, Boss. [short pause] Quick update from my side...\"). Never overuse them.",
    "- You may ask the Founder a direct question if a business decision or clarification is needed.",
    "- Only mention facts from the LIVE FLOWGUARD SNAPSHOT or meeting history; never invent tickets, revenue, or completed work.",
    params.wrapUp
      ? "- The Founder asked to wrap up: briefly summarize the agreed decisions and next steps clearly."
      : "- Return STRICT JSON only (no markdown fences) with shape: {\"reply\":\"your spoken reply\",\"raisedHands\":[{\"agentId\":\"sales_ai|customer_support_ai|research_ai|engineering_ai|operations_manager\",\"kind\":\"question|suggestion\",\"topic\":\"short 5-10 word reason\"}]}. Only include raisedHands (0 to 2) for colleagues currently in the room if they genuinely have an important question for the Founder or a helpful suggestion.",
    snapshot,
  ].join("\n\n");

  const userPrompt = params.callOnAgent
    ? `Meeting transcript so far:\n${recentTranscript || "(start of meeting)"}\n\nThe Founder just called on you (${speaker.displayName}) because you raised your hand. Share your question or suggestion naturally.`
    : `Meeting transcript so far:\n${recentTranscript || "(start of meeting)"}\n\nFounder just said: "${params.founderMessage}"`;

  const modelRes = await runWithFreeFirstModel({
    agentId: speaker.id,
    routeId: speaker.modelRoute,
    systemPrompt,
    userPrompt,
    maxTokens: speaker.id === "engineering_ai" ? 3000 : 1200,
  });

  let replyText = "";
  let spokenText = "";
  let raisedHands: RaisedHand[] = [];

  if (modelRes.ok && modelRes.text) {
    if (params.wrapUp) {
      spokenText = modelRes.text;
      replyText = stripAudioTags(modelRes.text);
    } else {
      const parsed = parseStructuredMeetingOutput(modelRes.text, nextParticipants, speaker.id);
      spokenText = parsed.reply;
      replyText = stripAudioTags(parsed.reply);
      raisedHands = parsed.raisedHands;
    }
  } else {
    replyText = `I couldn't reach my model right now (${modelRes.error || "unavailable"}), Boss. Let's check Models & Audit or try again in a moment.`;
    spokenText = replyText;
  }

  let wrappedUpTasksCreated = 0;
  if (params.wrapUp && replyText) {
    try {
      const supabase = getServiceSupabase();
      await supabase.from("ai_tasks").insert({
        id: randomUUID(),
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
    } catch {
      // Non-fatal
    }
  }

  return {
    participants: nextParticipants,
    speakerTurn: {
      id: randomUUID(),
      speakerType: "agent",
      speakerId: speaker.id,
      speakerName: speaker.displayName,
      avatarUrl: speaker.avatarUrl,
      text: replyText,
      spokenText,
      createdAt: new Date().toISOString(),
    },
    raisedHands,
    ...(params.wrapUp ? { wrappedUpTasksCreated } : {}),
  };
}
