import { randomUUID } from "node:crypto";
import { FLOWGUARD_KNOWLEDGE_DOCS } from "@/lib/ai-workforce/knowledge";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import {
  defaultReportStore,
  reportToOwner,
  type ReportStore,
} from "@/lib/ai-workforce/owner-report";
import { getAgentDefinition, SHARED_COMMUNICATION_STANDARD } from "@/lib/ai-workforce/registry";
import {
  detectEscalationTriggers,
  runRoleSopChecklist,
  verifyToolClaimsInText,
} from "@/lib/ai-workforce/sops";
import { createDefaultEmailAdapter, type EmailProviderAdapter } from "@/lib/ai-workforce/specialists/sales";
import {
  defaultTeamMemoryStore,
  recordTeamNote,
  saveTaskMemories,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface PublicAminaSession {
  id: string;
  sessionToken: string;
  visitorName: string | null;
  visitorPhone: string | null;
  visitorEmail: string | null;
  ticketNumber: string | null;
  lastTopic: string | null;
  reportedToOwnerAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicAminaMessage {
  id: string;
  sessionId: string;
  role: "customer" | "assistant" | "system";
  content: string;
  source: "text" | "voice" | "assignment_update";
  createdAt: string;
}

export interface PublicBookingDraft {
  fullName?: string;
  phone?: string;
  email?: string;
  cityOrLga?: string;
  address?: string;
  problemType?: string;
  issueSummary?: string;
  urgency?: "standard" | "urgent";
}

export interface PublicAminaStore {
  getOrCreateSession(sessionToken?: string | null): Promise<PublicAminaSession>;
  findSessionByToken(sessionToken: string): Promise<PublicAminaSession | null>;
  findSessionByTicket(ticketNumber: string): Promise<PublicAminaSession | null>;
  updateSession(
    sessionId: string,
    patch: Partial<PublicAminaSession>
  ): Promise<PublicAminaSession | null>;
  listMessages(sessionId: string, limit?: number): Promise<PublicAminaMessage[]>;
  appendMessage(msg: Omit<PublicAminaMessage, "id" | "createdAt">): Promise<PublicAminaMessage>;
}

function mapSessionRow(row: Record<string, unknown>): PublicAminaSession {
  return {
    id: String(row.id),
    sessionToken: String(row.session_token),
    visitorName: row.visitor_name ? String(row.visitor_name) : null,
    visitorPhone: row.visitor_phone ? String(row.visitor_phone) : null,
    visitorEmail: row.visitor_email ? String(row.visitor_email) : null,
    ticketNumber: row.ticket_number ? String(row.ticket_number) : null,
    lastTopic: row.last_topic ? String(row.last_topic) : null,
    reportedToOwnerAt: row.reported_to_owner_at ? String(row.reported_to_owner_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at || row.created_at),
  };
}

function mapMessageRow(row: Record<string, unknown>): PublicAminaMessage {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    role: String(row.role) as PublicAminaMessage["role"],
    content: String(row.content),
    source: String(row.source || "text") as PublicAminaMessage["source"],
    createdAt: String(row.created_at),
  };
}

export class InMemoryPublicAminaStore implements PublicAminaStore {
  private sessions = new Map<string, PublicAminaSession>();
  public messages: PublicAminaMessage[] = [];

  async findSessionByToken(sessionToken: string): Promise<PublicAminaSession | null> {
    for (const s of this.sessions.values()) {
      if (s.sessionToken === sessionToken) return structuredClone(s);
    }
    return null;
  }

  async findSessionByTicket(ticketNumber: string): Promise<PublicAminaSession | null> {
    for (const s of this.sessions.values()) {
      if (s.ticketNumber === ticketNumber) return structuredClone(s);
    }
    return null;
  }

  async getOrCreateSession(sessionToken?: string | null): Promise<PublicAminaSession> {
    if (sessionToken) {
      const existing = await this.findSessionByToken(sessionToken);
      if (existing) return existing;
    }
    const now = new Date().toISOString();
    const created: PublicAminaSession = {
      id: randomUUID(),
      sessionToken: sessionToken || `amina_${randomUUID()}`,
      visitorName: null,
      visitorPhone: null,
      visitorEmail: null,
      ticketNumber: null,
      lastTopic: null,
      reportedToOwnerAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(created.id, created);
    return structuredClone(created);
  }

  async updateSession(
    sessionId: string,
    patch: Partial<PublicAminaSession>
  ): Promise<PublicAminaSession | null> {
    const cur = this.sessions.get(sessionId);
    if (!cur) return null;
    const next: PublicAminaSession = {
      ...cur,
      ...structuredClone(patch),
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, next);
    return structuredClone(next);
  }

  async listMessages(sessionId: string, limit = 40): Promise<PublicAminaMessage[]> {
    return this.messages
      .filter((m) => m.sessionId === sessionId)
      .slice(-limit)
      .map((m) => structuredClone(m));
  }

  async appendMessage(
    msg: Omit<PublicAminaMessage, "id" | "createdAt">
  ): Promise<PublicAminaMessage> {
    const record: PublicAminaMessage = {
      id: randomUUID(),
      sessionId: msg.sessionId,
      role: msg.role,
      content: msg.content,
      source: msg.source,
      createdAt: new Date().toISOString(),
    };
    this.messages.push(record);
    return structuredClone(record);
  }
}

export class SupabasePublicAminaStore implements PublicAminaStore {
  private fallbackStore = new InMemoryPublicAminaStore();

  async findSessionByToken(sessionToken: string): Promise<PublicAminaSession | null> {
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("ai_public_sessions")
        .select("*")
        .eq("session_token", sessionToken)
        .maybeSingle();
      if (!error && data) return mapSessionRow(data);
    } catch {
      // Fall through to in-memory fallback
    }
    return this.fallbackStore.findSessionByToken(sessionToken);
  }

  async findSessionByTicket(ticketNumber: string): Promise<PublicAminaSession | null> {
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("ai_public_sessions")
        .select("*")
        .eq("ticket_number", ticketNumber)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) return mapSessionRow(data);
    } catch {
      // Fall through to in-memory fallback
    }
    return this.fallbackStore.findSessionByTicket(ticketNumber);
  }

  async getOrCreateSession(sessionToken?: string | null): Promise<PublicAminaSession> {
    if (sessionToken) {
      const existing = await this.findSessionByToken(sessionToken);
      if (existing) return existing;
    }
    const token = sessionToken || `amina_${randomUUID()}`;
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("ai_public_sessions")
        .insert({ session_token: token })
        .select("*")
        .single();
      if (!error && data) return mapSessionRow(data);
      if (error) {
        console.warn("[public-amina] Session insert fallback:", error.message);
      }
    } catch {
      // Fallback if table not migrated yet
    }
    return this.fallbackStore.getOrCreateSession(token);
  }

  async updateSession(
    sessionId: string,
    patch: Partial<PublicAminaSession>
  ): Promise<PublicAminaSession | null> {
    try {
      const supabase = getServiceSupabase();
      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.visitorName !== undefined) dbPatch.visitor_name = patch.visitorName;
      if (patch.visitorPhone !== undefined) dbPatch.visitor_phone = patch.visitorPhone;
      if (patch.visitorEmail !== undefined) dbPatch.visitor_email = patch.visitorEmail;
      if (patch.ticketNumber !== undefined) dbPatch.ticket_number = patch.ticketNumber;
      if (patch.lastTopic !== undefined) dbPatch.last_topic = patch.lastTopic;
      if (patch.reportedToOwnerAt !== undefined) {
        dbPatch.reported_to_owner_at = patch.reportedToOwnerAt;
      }
      const { data, error } = await supabase
        .from("ai_public_sessions")
        .update(dbPatch)
        .eq("id", sessionId)
        .select("*")
        .maybeSingle();
      if (!error && data) return mapSessionRow(data);
    } catch {
      // Fall through to in-memory fallback
    }
    return this.fallbackStore.updateSession(sessionId, patch);
  }

  async listMessages(sessionId: string, limit = 40): Promise<PublicAminaMessage[]> {
    try {
      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("ai_public_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.slice().reverse().map((r) => mapMessageRow(r));
      }
    } catch {
      // Fall through to in-memory fallback
    }
    return this.fallbackStore.listMessages(sessionId, limit);
  }

  async appendMessage(
    msg: Omit<PublicAminaMessage, "id" | "createdAt">
  ): Promise<PublicAminaMessage> {
    const id = randomUUID();
    const now = new Date().toISOString();
    try {
      const supabase = getServiceSupabase();
      const { error } = await supabase.from("ai_public_messages").insert({
        id,
        session_id: msg.sessionId,
        role: msg.role,
        content: msg.content,
        source: msg.source,
        created_at: now,
      });
      if (!error) {
        return {
          id,
          sessionId: msg.sessionId,
          role: msg.role,
          content: msg.content,
          source: msg.source,
          createdAt: now,
        };
      }
      console.warn("[public-amina] Message insert fallback:", error.message);
    } catch {
      // Non-fatal in test/unmigrated DB
    }
    return this.fallbackStore.appendMessage(msg);
  }
}

export const defaultPublicAminaStore = new SupabasePublicAminaStore();

export function cleanPublicReplyText(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildKnowledgeFallbackReply(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (/\b(burst|flood|flooding|gushing|water everywhere|electric|shock|spark)\b/.test(lower)) {
    return "Please shut off your main water stopcock valve and switch off any nearby electrical sockets right away for safety. Once it's safe, share your name, phone, email, Kano area, and street address or tap Book above so we can dispatch an urgent plumber.";
  }

  if (/\b(price|cost|how much|charge|fee|quote|quotation|estimate|naira|ngn)\b/.test(lower)) {
    return "We don't give fixed prices before seeing the job. An approved FlowGuard technician inspects on-site first and sends you an itemised quotation (materials, labour, and transport) to approve before any repair starts.";
  }

  if (/\b(track|status|reference|ticket|where is)\b/.test(lower)) {
    return "You can follow live progress anytime on the Track Request page using your ticket reference number and the phone number you booked with. If you haven't booked yet, tap Book above and I'll set up a request for you.";
  }

  if (/\b(area|location|cover|coverage|where|kano|lga|nassarawa|tarauni|bompai|fagge|dala|gwale|ungogo|kumbotso|sabon gari)\b/.test(lower)) {
    return "FlowGuard covers homes and businesses across Kano metropolitan areas including Nassarawa, Tarauni, Bompai, Fagge, Dala, Gwale, Kano Municipal, Ungogo, Kumbotso, and Sabon Gari. Which area are you in and what plumbing work do you need?";
  }

  if (/\b(service|offer|do you do|pipe|leak|drain|borehole|pump|tank|toilet|sink|tap|plumbing)\b/.test(lower) && !/\b(about|what is)\b/.test(lower)) {
    return "We handle pipe installation and repairs, leak detection, drainage unblocking, borehole and water pump systems, tanks, sanitaryware, and emergency dispatch across Kano. Tell me what's going on or tap Book above for an on-site inspection.";
  }

  if (/\b(flowguard|fluw|flw|about|who are you|what is|how does it work|how it works|explain|know about)\b/.test(lower)) {
    return "FlowGuard Plumbing Enterprises connects homes and businesses in Kano with vetted, approved plumbers through a clear, trackable process.\n\nYou submit your issue to get a reference number, our coordinator assigns a reviewed technician, the plumber inspects on-site and sends an itemised quote for your approval before work starts, and you can track every step live. Would you like to ask about a specific issue or book an inspection?";
  }

  return "I'm Amina at FlowGuard Plumbing in Kano. We handle leaks, pipes, drainage, boreholes, pumps, and emergency plumbing with on-site inspection and upfront itemised quotes before work begins. Tell me what plumbing issue you need help with or which area in Kano you're in.";
}

export function parseAminaConciergeOutput(rawText: string): {
  reply: string;
  topicSummary: string | null;
  shouldReportToOwner: boolean;
  readyToBook: boolean;
  bookingDraft: PublicBookingDraft | null;
} {
  const markerIdx = rawText.indexOf("META_JSON:");
  const rawReplyPart = markerIdx >= 0 ? rawText.slice(0, markerIdx) : rawText;
  const replyPart = rawReplyPart.replace(/```json\s*$/i, "").replace(/```\s*$/i, "");
  const reply = cleanPublicReplyText(replyPart);

  let topicSummary: string | null = null;
  let shouldReportToOwner = false;
  let readyToBook = false;
  let bookingDraft: PublicBookingDraft | null = null;

  if (markerIdx >= 0) {
    const jsonRaw = rawText
      .slice(markerIdx + "META_JSON:".length)
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      const parsed = JSON.parse(jsonRaw) as {
        topicSummary?: string;
        shouldReportToOwner?: boolean;
        readyToBook?: boolean;
        bookingDraft?: PublicBookingDraft;
      };
      if (typeof parsed.topicSummary === "string" && parsed.topicSummary.trim()) {
        topicSummary = cleanPublicReplyText(parsed.topicSummary).slice(0, 180);
      }
      shouldReportToOwner = Boolean(parsed.shouldReportToOwner);
      readyToBook = Boolean(parsed.readyToBook);
      if (parsed.bookingDraft && typeof parsed.bookingDraft === "object") {
        bookingDraft = {
          fullName:
            typeof parsed.bookingDraft.fullName === "string"
              ? parsed.bookingDraft.fullName.trim()
              : undefined,
          phone:
            typeof parsed.bookingDraft.phone === "string"
              ? parsed.bookingDraft.phone.trim()
              : undefined,
          email:
            typeof parsed.bookingDraft.email === "string"
              ? parsed.bookingDraft.email.trim()
              : undefined,
          cityOrLga:
            typeof parsed.bookingDraft.cityOrLga === "string"
              ? parsed.bookingDraft.cityOrLga.trim()
              : undefined,
          address:
            typeof parsed.bookingDraft.address === "string"
              ? parsed.bookingDraft.address.trim()
              : undefined,
          problemType:
            typeof parsed.bookingDraft.problemType === "string"
              ? parsed.bookingDraft.problemType.trim()
              : undefined,
          issueSummary:
            typeof parsed.bookingDraft.issueSummary === "string"
              ? parsed.bookingDraft.issueSummary.trim()
              : undefined,
          urgency: parsed.bookingDraft.urgency === "urgent" ? "urgent" : "standard",
        };
      }
    } catch {
      // Ignore malformed trailing metadata safely
    }
  }

  return {
    reply: reply || "I'm here to help. Tell me what plumbing issue you're having or which area in Kano you're in.",
    topicSummary,
    shouldReportToOwner,
    readyToBook,
    bookingDraft,
  };
}

export async function handlePublicAminaTurn(params: {
  sessionToken?: string | null;
  customerMessage: string;
  source?: "text" | "voice";
  clientHistory?: Array<{ role: "customer" | "assistant"; content: string; source?: "text" | "voice" }>;
  store?: PublicAminaStore;
  teamStore?: TeamBoardAndMemoryStore;
  reportStore?: ReportStore;
  notifyFn?: typeof createNotification;
  modelRunner?: typeof runWithFreeFirstModel;
}): Promise<{
  sessionToken: string;
  reply: string;
  readyToBook: boolean;
  bookingDraft: PublicBookingDraft | null;
  ticketNumber: string | null;
  messages: PublicAminaMessage[];
}> {
  const store = params.store ?? defaultPublicAminaStore;
  const teamStore = params.teamStore ?? defaultTeamMemoryStore;
  const reportStore = params.reportStore ?? defaultReportStore;
  const notifyFn = params.notifyFn ?? createNotification;
  const runner = params.modelRunner ?? runWithFreeFirstModel;

  const session = await store.getOrCreateSession(params.sessionToken);
  const cleanUserMsg = cleanPublicReplyText(params.customerMessage).slice(0, 700);
  const userMsgRecord = await store.appendMessage({
    sessionId: session.id,
    role: "customer",
    content: cleanUserMsg,
    source: params.source ?? "text",
  });

  const [storedHistory, memories] = await Promise.all([
    store.listMessages(session.id, 16),
    teamStore.loadMemories("sales_ai", "ns_sales_ai", 10).catch(() => []),
  ]);

  const sanitizedClientHistory: PublicAminaMessage[] = (params.clientHistory || [])
    .filter(
      (m) =>
        m &&
        (m.role === "customer" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-12)
    .map((m, idx) => ({
      id: `client-${idx}`,
      sessionId: session.id,
      role: m.role,
      content: cleanPublicReplyText(m.content).slice(0, 700),
      source: m.source === "voice" ? "voice" : "text",
      createdAt: new Date().toISOString(),
    }));

  const history: PublicAminaMessage[] =
    storedHistory.length > 1
      ? storedHistory
      : [...sanitizedClientHistory, userMsgRecord];

  const publicKnowledge = FLOWGUARD_KNOWLEDGE_DOCS.filter(
    (d) => d.accessScope === "shared_workforce"
  )
    .map((d) => `${d.title}: ${d.content}`)
    .join("\n\n");

  const playbookLines = memories
    .filter((m) => m.namespace.startsWith("playbook:"))
    .map((m) => `- ${m.content}`)
    .join("\n");

  const conversationLines = history
    .map((m) => `${m.role === "customer" ? "Customer" : "Amina"}: ${m.content}`)
    .join("\n");

  const aminaDef = getAgentDefinition("sales_ai");
  const systemPrompt = [
    "You are Amina, the intelligent and friendly front-desk customer representative at FlowGuard Plumbing Enterprises in Kano, Nigeria.",
    "Think carefully about what the customer is actually asking (even if they have spelling typos like 'fluw gauard') and give a clear, helpful, accurate answer grounded in the approved company info below.",
    "Reply naturally and warmly like a real human colleague messaging a customer. Keep replies concise (1 to 4 sentences) unless explaining FlowGuard's steps or answering a multi-part question.",
    SHARED_COMMUNICATION_STANDARD,
    "STRICT PUBLIC RULES:",
    "- NEVER quote fixed Naira/dollar prices or promise discounts. Explain clearly that an approved technician inspects on-site first and gives a transparent itemised quote before work starts.",
    "- If the customer asks about FlowGuard, our services, Kano coverage, pricing policy, or how booking/tracking works, answer directly and clearly using the approved company info.",
    "- If the customer mentions flooding, burst pipes, or water near electricity, advise shutting off the main stopcock valve and switching off nearby sockets right away, then offer to book an urgent plumber immediately.",
    "- If the customer wants to book a plumber, warmly ask for any missing details (Full Name, Phone, Email, Kano Area/LGA, Address, and Issue) or set readyToBook=true so the booking card opens for them.",
    "- NEVER claim you already assigned a plumber unless the conversation already includes an assignment update. Booking creates a ticket first, then our coordinator assigns an approved plumber and notifies the customer.",
    "- NEVER invent ticket numbers or pretend you can access private records.",
    `APPROVED COMPANY INFO:\n${publicKnowledge}`,
    playbookLines ? `OWNER PLAYBOOK RULES:\n${playbookLines}` : "",
    session.ticketNumber
      ? `CURRENT SESSION TICKET: ${session.ticketNumber} (already booked for this visitor).`
      : "",
    'OUTPUT FORMAT: Write your plain text reply first. Then on a new line append:\nMETA_JSON: {"topicSummary":"short 1-sentence summary of what visitor asked","shouldReportToOwner":true/false,"readyToBook":true/false,"bookingDraft":{"fullName":"","phone":"","email":"","cityOrLga":"","address":"","problemType":"","issueSummary":"","urgency":"standard|urgent"}}',
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelRes = await runner({
    agentId: "sales_ai",
    routeId: aminaDef?.modelRoute || "mimo-v2-6-flash-free",
    systemPrompt,
    userPrompt: `CONVERSATION SO FAR:\n${conversationLines}\n\nThink through what the customer asked and write a helpful, natural reply.`,
    maxTokens: 1400,
    timeoutMs: 25000,
  });

  if (!modelRes.ok || !modelRes.text) {
    console.warn(
      "[public-amina] Model response unavailable, using knowledge fallback:",
      modelRes.code,
      modelRes.error
    );
  }

  const rawText =
    modelRes.ok && modelRes.text
      ? modelRes.text
      : buildKnowledgeFallbackReply(cleanUserMsg);

  const parsed = parseAminaConciergeOutput(rawText);
  let safeReply = verifyToolClaimsInText({
    text: parsed.reply,
    executedTools: [],
  }).text;

  const sopCheck = runRoleSopChecklist({
    agentId: "sales_ai",
    deliverable: safeReply,
    evidence: [],
  });
  if (!sopCheck.passed) {
    safeReply =
      "We always send an approved FlowGuard technician to inspect on-site first and give you a clear itemised quote before work begins. Share your name, phone, email, Kano area, and address whenever you'd like me to book an inspection.";
  }

  const assistantMsgRecord = await store.appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: safeReply,
    source: "text",
  });

  const escalations = detectEscalationTriggers(cleanUserMsg);
  const topicChanged =
    parsed.topicSummary && parsed.topicSummary !== session.lastTopic;

  if (parsed.topicSummary) {
    await saveTaskMemories(
      {
        agentId: "sales_ai",
        namespace: "ns_sales_ai",
        taskId: `web:${session.id}`,
        outputText: `Website visitor asked: ${parsed.topicSummary}`,
        shareWithTeam: true,
      },
      teamStore
    ).catch(() => {});
  }

  const wantsReport =
    escalations.length > 0 ||
    (parsed.shouldReportToOwner && topicChanged) ||
    (!session.reportedToOwnerAt && history.length >= 2 && Boolean(parsed.topicSummary));

  if (wantsReport) {
    const summaryText =
      escalations.length > 0
        ? `Urgent website visitor (${escalations.join(", ")}): "${cleanUserMsg.slice(0, 140)}"`
        : `Website visitor asked: ${parsed.topicSummary || cleanUserMsg.slice(0, 140)}`;

    await recordTeamNote(
      {
        fromAgent: "sales_ai",
        toAgent: "operations_manager",
        ticketNumber: session.ticketNumber,
        note: summaryText,
      },
      teamStore
    ).catch(() => {});

    await reportToOwner(
      {
        agentId: "sales_ai",
        status: escalations.length > 0 ? "urgent" : "reported",
        urgent: escalations.length > 0,
        ticketNumber: session.ticketNumber,
        summary: summaryText,
        forceStoreReport: true,
      },
      notifyFn,
      reportStore
    ).catch(() => {});

    await store.updateSession(session.id, {
      lastTopic: parsed.topicSummary || session.lastTopic,
      reportedToOwnerAt: new Date().toISOString(),
    });
  } else if (parsed.topicSummary && parsed.topicSummary !== session.lastTopic) {
    await store.updateSession(session.id, { lastTopic: parsed.topicSummary });
  }

  if (parsed.bookingDraft) {
    const patch: Partial<PublicAminaSession> = {};
    if (parsed.bookingDraft.fullName && !session.visitorName) {
      patch.visitorName = parsed.bookingDraft.fullName;
    }
    if (parsed.bookingDraft.phone && !session.visitorPhone) {
      patch.visitorPhone = parsed.bookingDraft.phone;
    }
    if (parsed.bookingDraft.email && !session.visitorEmail) {
      patch.visitorEmail = parsed.bookingDraft.email;
    }
    if (Object.keys(patch).length > 0) {
      await store.updateSession(session.id, patch);
    }
  }

  const wantsBookIntent =
    parsed.readyToBook ||
    /\b(book|send a plumber|request a plumber|schedule inspection|come fix|book now)\b/i.test(
      cleanUserMsg
    );

  const storedMessages = await store.listMessages(session.id, 40);
  const updatedMessages =
    storedMessages.length >= 2
      ? storedMessages
      : [...sanitizedClientHistory, userMsgRecord, assistantMsgRecord];

  return {
    sessionToken: session.sessionToken,
    reply: safeReply,
    readyToBook: !session.ticketNumber && wantsBookIntent,
    bookingDraft: parsed.bookingDraft,
    ticketNumber: session.ticketNumber,
    messages: updatedMessages,
  };
}

export async function sendBookingConfirmationEmail(params: {
  email?: string | null;
  customerName: string;
  ticketNumber: string;
  cityOrLga: string;
  siteUrl?: string;
  emailAdapter?: EmailProviderAdapter;
}): Promise<void> {
  if (!params.email?.trim()) return;
  const adapter = params.emailAdapter ?? createDefaultEmailAdapter();
  const baseUrl =
    params.siteUrl ||
    process.env.NEXT_PUBLIC_SITE_UR?.trim() ||
    "https://flowguard-ng.vercel.app";
  const trackingUrl = `${baseUrl.replace(/\/$/, "")}/tracking?ticket=${encodeURIComponent(params.ticketNumber)}`;
  await adapter
    .sendApprovedEmail({
      to: params.email.trim(),
      subject: `FlowGuard Request Received (${params.ticketNumber})`,
      body: [
        `Hello ${params.customerName || "Customer"},`,
        "",
        `Thank you for contacting FlowGuard Plumbing Enterprises. Your service request in ${params.cityOrLga || "Kano"} has been logged with ticket number ${params.ticketNumber}.`,
        "Our operations coordinator is reviewing available approved technicians for your area and will notify you as soon as a plumber is assigned.",
        "",
        `Track your request anytime here: ${trackingUrl}`,
        "",
        "Best regards,",
        "Amina — FlowGuard Plumbing Enterprises",
      ].join("\n"),
    })
    .catch(() => {});
}

export async function notifyCustomerOnPlumberAssigned(params: {
  ticketNumber: string;
  plumberName: string;
  customerId?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  store?: PublicAminaStore;
  notifyFn?: typeof createNotification;
  emailAdapter?: EmailProviderAdapter;
  siteUrl?: string;
}): Promise<void> {
  const store = params.store ?? defaultPublicAminaStore;
  const notifyFn = params.notifyFn ?? createNotification;
  const adapter = params.emailAdapter ?? createDefaultEmailAdapter();

  let customerId = params.customerId ?? null;
  let customerEmail = params.customerEmail ?? null;
  let customerName = params.customerName ?? null;

  if (!customerId || !customerEmail) {
    try {
      const supabase = getServiceSupabase();
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("customer_id, customer_email, customer_name")
        .eq("ticket_number", params.ticketNumber)
        .maybeSingle();
      if (reqRow) {
        customerId = customerId || (reqRow.customer_id ? String(reqRow.customer_id) : null);
        customerEmail =
          customerEmail || (reqRow.customer_email ? String(reqRow.customer_email) : null);
        customerName = customerName || (reqRow.customer_name ? String(reqRow.customer_name) : null);
      }
    } catch {
      // Non-fatal in tests
    }
  }

  const baseUrl =
    params.siteUrl ||
    process.env.NEXT_PUBLIC_SITE_UR?.trim() ||
    "https://flowguard-ng.vercel.app";
  const trackingUrl = `${baseUrl.replace(/\/$/, "")}/tracking?ticket=${encodeURIComponent(params.ticketNumber)}`;

  if (customerId) {
    await notifyFn({
      recipientId: customerId,
      recipientRole: "customer",
      actorRole: "admin",
      type: "plumber_assigned",
      title: `Plumber Assigned: ${params.ticketNumber}`,
      body: `${params.plumberName} has been assigned to your service request.`,
      entityType: "service_request",
      entityId: params.ticketNumber,
      destination: `/customer?tab=requests&ticket=${params.ticketNumber}`,
      dedupeKey: `plumber-assigned:${params.ticketNumber}:${params.plumberName}`,
    }).catch(() => {});
  }

  const linkedSession = await store.findSessionByTicket(params.ticketNumber);
  if (linkedSession) {
    customerEmail = customerEmail || linkedSession.visitorEmail;
    customerName = customerName || linkedSession.visitorName;
    await store.appendMessage({
      sessionId: linkedSession.id,
      role: "assistant",
      source: "assignment_update",
      content: `Good news! ${params.plumberName} has just been assigned to your request (${params.ticketNumber}). You can follow live updates on your tracking page: ${trackingUrl}`,
    });
  }

  if (customerEmail?.trim()) {
    await adapter
      .sendApprovedEmail({
        to: customerEmail.trim(),
        subject: `Plumber Assigned to Your Request (${params.ticketNumber})`,
        body: [
          `Hello ${customerName || "Customer"},`,
          "",
          `Good news — ${params.plumberName} has been assigned to your FlowGuard plumbing request (${params.ticketNumber}).`,
          "They will inspect the job on-site and share an itemised quotation before starting work.",
          "",
          `Track live progress here: ${trackingUrl}`,
          "",
          "Best regards,",
          "FlowGuard Plumbing Enterprises",
        ].join("\n"),
      })
      .catch(() => {});
  }
}
