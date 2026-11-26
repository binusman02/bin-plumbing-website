import { FLOWGUARD_KNOWLEDGE_DOCS } from "@/lib/ai-workforce/knowledge";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";
import {
  defaultReportStore,
  reportToOwner,
  type ReportStore,
} from "@/lib/ai-workforce/owner-report";
import {
  cleanPublicReplyText,
  defaultPublicAminaStore,
  type PublicAminaMessage,
  type PublicAminaStore,
} from "@/lib/ai-workforce/public-amina";
import { getAgentDefinition, SHARED_COMMUNICATION_STANDARD } from "@/lib/ai-workforce/registry";
import {
  detectEscalationTriggers,
  runRoleSopChecklist,
  verifyToolClaimsInText,
} from "@/lib/ai-workforce/sops";
import {
  defaultTeamMemoryStore,
  recordTeamNote,
  saveTaskMemories,
  type TeamBoardAndMemoryStore,
} from "@/lib/ai-workforce/team-memory";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface CustomerTicketSnapshot {
  ticketNumber: string;
  status: string;
  problemCategory: string;
  address: string;
  assignedTechnician: string | null;
  pendingQuoteTotalNgn?: number | null;
}

export function customerSessionToken(customerId: string): string {
  return `cust_${customerId}`;
}

export function buildZainabFallbackReply(
  userMessage: string,
  tickets: CustomerTicketSnapshot[]
): string {
  const lower = userMessage.toLowerCase();
  const latest = tickets[0];

  if (/\b(burst|flood|flooding|gushing|water everywhere|electric|shock|spark)\b/.test(lower)) {
    return "Please shut off your main water stopcock valve and switch off any nearby electrical sockets right away for safety. I've flagged this urgently for our coordinator so you get immediate priority attention.";
  }

  if (/\b(quote|quotation|price|amount|approve|reject|bill|pay)\b/.test(lower)) {
    if (latest?.pendingQuoteTotalNgn != null) {
      return `Your ticket ${latest.ticketNumber} has an itemised quotation of ₦${latest.pendingQuoteTotalNgn.toLocaleString()} waiting for your review under My Requests or Overview. Open the request to approve it or request changes before work starts.`;
    }
    return "As soon as your assigned technician inspects the job on-site, they submit an itemised quotation right in your portal so you can review and approve it before any work starts.";
  }

  if (/\b(status|plumber|where|track|eta|location|update|ticket)\b/.test(lower)) {
    if (!latest) {
      return "You don't have any active plumbing requests linked yet. Tap 'New Plumbing Request' on Overview to submit one and get instant live tracking.";
    }
    if (latest.assignedTechnician) {
      return `Your latest request ${latest.ticketNumber} (${latest.problemCategory}) is currently "${latest.status}" with technician ${latest.assignedTechnician} assigned. Tap 'Track Plumber' on Overview once they start their trip to see their live GPS location.`;
    }
    return `Your latest request ${latest.ticketNumber} (${latest.problemCategory}) is currently "${latest.status}". Our coordinator is reviewing approved technicians in your area and you'll get a notification as soon as a plumber is assigned.`;
  }

  if (latest) {
    return `Hi! I'm Zainab on FlowGuard Support. I can see your ticket ${latest.ticketNumber} (${latest.status}${latest.assignedTechnician ? `, assigned to ${latest.assignedTechnician}` : ""}). Ask me about your job status, quotation, live tracking, or any plumbing support question.`;
  }

  return "Hi! I'm Zainab on FlowGuard Support. Ask me anytime about your plumbing requests, quotes, live tracking, or payment receipts.";
}

export function parseZainabOutput(rawText: string): {
  reply: string;
  topicSummary: string | null;
  shouldReportToOwner: boolean;
} {
  const markerIdx = rawText.indexOf("META_JSON:");
  const rawReplyPart = markerIdx >= 0 ? rawText.slice(0, markerIdx) : rawText;
  const reply = cleanPublicReplyText(
    rawReplyPart.replace(/```json\s*$/i, "").replace(/```\s*$/i, "")
  );

  let topicSummary: string | null = null;
  let shouldReportToOwner = false;

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
      };
      if (typeof parsed.topicSummary === "string" && parsed.topicSummary.trim()) {
        topicSummary = cleanPublicReplyText(parsed.topicSummary).slice(0, 180);
      }
      shouldReportToOwner = Boolean(parsed.shouldReportToOwner);
    } catch {
      // Ignore malformed metadata cleanly
    }
  }

  return {
    reply: reply || "I'm here to help with your FlowGuard job. Tell me what you need.",
    topicSummary,
    shouldReportToOwner,
  };
}

export async function loadVerifiedCustomerTickets(
  customerId: string
): Promise<CustomerTicketSnapshot[]> {
  try {
    const supabase = getServiceSupabase();
    const { data: reqRows } = await supabase
      .from("service_requests")
      .select("ticket_number, status, problem_category, address, address_in_kano, assigned_technician")
      .eq("customer_id", customerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(8);

    const rows = reqRows || [];
    const tickets = rows.map((r) => String(r.ticket_number));
    const quoteTotals = new Map<string, number>();

    if (tickets.length > 0) {
      const { data: qRows } = await supabase
        .from("quotations")
        .select("ticket_number, total_amount, status")
        .in("ticket_number", tickets)
        .eq("status", "pending");
      for (const q of qRows || []) {
        quoteTotals.set(String(q.ticket_number), Number(q.total_amount || 0));
      }
    }

    return rows.map((r) => ({
      ticketNumber: String(r.ticket_number),
      status: String(r.status || "new"),
      problemCategory: String(r.problem_category || "Plumbing"),
      address: String(r.address || r.address_in_kano || ""),
      assignedTechnician: r.assigned_technician ? String(r.assigned_technician) : null,
      pendingQuoteTotalNgn: quoteTotals.get(String(r.ticket_number)) ?? null,
    }));
  } catch {
    return [];
  }
}

export async function handleCustomerZainabTurn(params: {
  customerId: string;
  customerName: string;
  customerMessage: string;
  source?: "text" | "voice";
  clientHistory?: Array<{ role: "customer" | "assistant"; content: string; source?: "text" | "voice" }>;
  tickets?: CustomerTicketSnapshot[];
  store?: PublicAminaStore;
  teamStore?: TeamBoardAndMemoryStore;
  reportStore?: ReportStore;
  notifyFn?: typeof createNotification;
  modelRunner?: typeof runWithFreeFirstModel;
}): Promise<{
  sessionToken: string;
  reply: string;
  messages: PublicAminaMessage[];
}> {
  const store = params.store ?? defaultPublicAminaStore;
  const teamStore = params.teamStore ?? defaultTeamMemoryStore;
  const reportStore = params.reportStore ?? defaultReportStore;
  const notifyFn = params.notifyFn ?? createNotification;
  const runner = params.modelRunner ?? runWithFreeFirstModel;

  const token = customerSessionToken(params.customerId);
  const session = await store.getOrCreateSession(token);
  const cleanUserMsg = cleanPublicReplyText(params.customerMessage).slice(0, 700);
  const userMsgRecord = await store.appendMessage({
    sessionId: session.id,
    role: "customer",
    content: cleanUserMsg,
    source: params.source ?? "text",
  });

  const [storedHistory, memories, tickets] = await Promise.all([
    store.listMessages(session.id, 16),
    teamStore.loadMemories("customer_support_ai", "ns_customer_support_ai", 10).catch(() => []),
    params.tickets ? Promise.resolve(params.tickets) : loadVerifiedCustomerTickets(params.customerId),
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

  const ticketContext =
    tickets.length > 0
      ? tickets
          .map(
            (t) =>
              `- ${t.ticketNumber}: status=${t.status}, service=${t.problemCategory}, technician=${t.assignedTechnician || "Not assigned yet"}${t.pendingQuoteTotalNgn != null ? `, pendingQuote=₦${t.pendingQuoteTotalNgn}` : ""}`
          )
          .join("\n")
      : "No active requests linked to this customer yet.";

  const conversationLines = history
    .map((m) => `${m.role === "customer" ? params.customerName : "Zainab"}: ${m.content}`)
    .join("\n");

  const zainabDef = getAgentDefinition("customer_support_ai");
  const systemPrompt = [
    `You are Zainab, Customer Support Specialist at FlowGuard Plumbing Enterprises in Kano, speaking directly to verified customer ${params.customerName}.`,
    "Speak warmly, empathetically, and concisely like a real colleague helping a valued customer (1 to 4 plain sentences, no Markdown asterisks ** or backticks).",
    SHARED_COMMUNICATION_STANDARD,
    "STRICT SUPPORT RULES:",
    "- You have verified this customer's identity. Only share details about their own tickets listed below.",
    "- NEVER promise fixed repair prices, free repairs, or unauthorised refunds/discounts.",
    "- If the customer reports flooding, a burst pipe, or water near electricity, tell them to shut off their main stopcock valve and nearby electric sockets immediately and confirm you are flagging it urgently.",
    "- If a technician is assigned, explain they can tap 'Track Plumber' on Overview to watch live GPS location once the plumber starts their trip.",
    "- NEVER claim you already verified a payment or sent an email/assignment you did not perform.",
    `APPROVED COMPANY INFO:\n${publicKnowledge}`,
    `VERIFIED CUSTOMER TICKETS:\n${ticketContext}`,
    playbookLines ? `OWNER PLAYBOOK RULES:\n${playbookLines}` : "",
    'OUTPUT FORMAT: Write your plain text reply first. Optionally append on a new line:\nMETA_JSON: {"topicSummary":"short 1-sentence summary","shouldReportToOwner":true/false}',
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelRes = await runner({
    agentId: "customer_support_ai",
    routeId: zainabDef?.modelRoute || "mimo-v2-6-flash-free",
    systemPrompt,
    userPrompt: `CONVERSATION SO FAR:\n${conversationLines}\n\nWrite Zainab's helpful plain-text reply.`,
    maxTokens: 1000,
    timeoutMs: 25000,
  });

  const rawText =
    modelRes.ok && modelRes.text
      ? modelRes.text
      : buildZainabFallbackReply(cleanUserMsg, tickets);

  const parsed = parseZainabOutput(rawText);
  let safeReply = parsed.reply;

  const sopCheck = runRoleSopChecklist({
    agentId: "customer_support_ai",
    deliverable: safeReply,
    evidence: ["support_read_verified_ticket"],
  });
  if (!sopCheck.passed) {
    safeReply = buildZainabFallbackReply(cleanUserMsg, tickets);
  }

  const claimCheck = verifyToolClaimsInText({
    text: safeReply,
    executedTools: [],
  });
  if (claimCheck.rewritten) {
    safeReply = buildZainabFallbackReply(cleanUserMsg, tickets);
  }

  await store.appendMessage({
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
        agentId: "customer_support_ai",
        namespace: "ns_customer_support_ai",
        taskId: `cust:${params.customerId}`,
        outputText: `Customer ${params.customerName} asked: ${parsed.topicSummary}`,
        shareWithTeam: true,
      },
      teamStore
    ).catch(() => {});
  }

  if (
    escalations.length > 0 ||
    (parsed.shouldReportToOwner && topicChanged)
  ) {
    const latestTicket = tickets[0]?.ticketNumber ?? null;
    const summaryText =
      escalations.length > 0
        ? `Urgent customer support message (${escalations.join(", ")}) from ${params.customerName}: "${cleanUserMsg.slice(0, 140)}"`
        : `Customer ${params.customerName} asked support: ${parsed.topicSummary || cleanUserMsg.slice(0, 140)}`;

    await recordTeamNote(
      {
        fromAgent: "customer_support_ai",
        toAgent: "operations_manager",
        ticketNumber: latestTicket,
        note: summaryText,
      },
      teamStore
    ).catch(() => {});

    await reportToOwner(
      {
        agentId: "customer_support_ai",
        status: escalations.length > 0 ? "urgent" : "reported",
        urgent: escalations.length > 0,
        ticketNumber: latestTicket,
        summary: summaryText,
        forceStoreReport: true,
      },
      notifyFn,
      reportStore
    ).catch(() => {});

    await store.updateSession(session.id, {
      visitorName: params.customerName,
      ticketNumber: latestTicket,
      lastTopic: parsed.topicSummary || session.lastTopic,
      reportedToOwnerAt: new Date().toISOString(),
    });
  } else if (parsed.topicSummary && parsed.topicSummary !== session.lastTopic) {
    await store.updateSession(session.id, {
      visitorName: params.customerName,
      ticketNumber: tickets[0]?.ticketNumber ?? null,
      lastTopic: parsed.topicSummary,
    });
  }

  const updatedMessages = await store.listMessages(session.id, 40);
  return {
    sessionToken: session.sessionToken,
    reply: safeReply,
    messages: updatedMessages,
  };
}
