import { generateText, jsonSchema, type ModelMessage, stepCountIs, tool } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  downloadChatUploadAudio,
  synthesizeZiatSpeech,
  uploadZiatVoiceNote,
} from "@/lib/ai-voice";
import {
  getMarketplaceSettings,
  postJobMessage,
} from "@/lib/marketplace";
import { getAdminToolGateway } from "@/lib/ai-workforce/admin-tools";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TicketAiContext {
  ticketNumber: string;
  status?: string;
  problemCategory?: string;
  assignedTechnician?: string | null;
  recentMessages?: { senderName: string; senderRole: string; message: string }[];
}

const HUMAN_PAUSE_WINDOW_MS = 15 * 60 * 1000;

async function buildSystemPrompt(ticket?: TicketAiContext | null): Promise<string> {
  const settings = await getMarketplaceSettings().catch(() => null);
  const categories = (settings?.service_categories || [])
    .filter((c) => c.active !== false)
    .map((c) => c.name || c.title)
    .filter(Boolean)
    .slice(0, 12)
    .join(", ");
  const areas = (settings?.active_coverage_locations || []).slice(0, 15).join(", ");
  const hours = settings?.business_hours || "Mon–Sun, Emergency Dispatch Available";

  const lines = [
    "You are Ziat, the friendly front-desk coordinator for FlowGuard Plumbing Enterprises in Kano, Nigeria.",
    "Tone & style:",
    "- Sound like a warm, capable human colleague — natural, clear, and conversational (2–4 short sentences).",
    "- Skip robotic AI openers like 'Certainly!', 'I'd be happy to help!', 'As an AI', or 'Here is a summary:'.",
    "- Never output raw Markdown formatting like **bold**, ### headings, * bullets, or `backticks`. Write plain, natural prose.",
    "- Languages (CRITICAL): You are fluent in English, Kano Hausa, and Nigerian Pidgin. Customers in Kano frequently write or send voice notes in Hausa (e.g. 'ruwa yana zuba', 'famfo ya fashe', 'bututu', 'makewayi/bayan gida', 'injin famfo', 'tankin ruwa', 'nawa ne', 'yaushe zai zo') or Nigerian Pidgin ('pipe don burst', 'water dey leak', 'abeg', 'how much'). Always understand their exact meaning and reply naturally in the SAME language they used (Hausa if Hausa, Pidgin if Pidgin, English if English).",
    `Services offered: ${categories || "Pipe installation & repairs, leak detection, drainage, borehole/pump & water tank systems, sanitaryware"}.`,
    `Coverage areas: ${areas || "Kano metropolitan areas"}.`,
    `Operating hours: ${hours}.`,
    "Rules:",
    "- NEVER invent or promise fixed prices or final quotation amounts. Explain that an assigned technician inspects on-site and submits an itemised quotation for customer approval.",
    "- If the customer reports a burst pipe, active leak, or flooding, immediately advise shutting off the main water stopcock valve and switching off nearby electrical outlets if water is near sockets.",
    "- Remind customers they can submit a request directly in the app/portal or wait for Admin/Technician confirmation.",
    "- Never ask for passwords, OTPs, or secret keys.",
  ];

  if (ticket) {
    lines.push(
      `Current ticket context: Ticket ${ticket.ticketNumber}, status=${ticket.status || "active"}, category=${ticket.problemCategory || "Plumbing Service"}, assignedTechnician=${ticket.assignedTechnician || "Pending assignment"}.`
    );
    if (ticket.recentMessages && ticket.recentMessages.length > 0) {
      const snippet = ticket.recentMessages
        .slice(-6)
        .map((m) => `${m.senderName} (${m.senderRole}): ${m.message}`)
        .join("\n");
      lines.push(`Recent conversation:\n${snippet}`);
    }
  }

  return lines.join("\n");
}

function buildFallbackReply(userText: string, ticket?: TicketAiContext | null): string {
  const lower = userText.toLowerCase();
  if (lower.includes("leak") || lower.includes("burst") || lower.includes("flood")) {
    return "Please turn off your main water stopcock valve right away to prevent damage. Our dispatch team has your message and will confirm a technician shortly.";
  }
  if (lower.includes("price") || lower.includes("cost") || lower.includes("quote") || lower.includes("how much")) {
    return "Final pricing depends on an on-site inspection. Once a technician is assigned and arrives, they will send an itemised quotation directly in the app for your approval before work starts.";
  }
  if (ticket) {
    return `Thanks for reaching out on ${ticket.ticketNumber}. An Admin or your assigned technician will respond shortly — you can also share photos or a voice note here so we can prepare.`;
  }
  return "Hello! I'm Ziat, your FlowGuard AI Assistant. Ask me about our plumbing services in Kano, emergency leak steps, or tap New Request to book a verified technician.";
}

export interface AiAudioInput {
  data: Buffer;
  mimeType: string;
}

function buildModelMessages(
  turns: AiChatTurn[],
  audio?: AiAudioInput | null
): ModelMessage[] {
  const base: ModelMessage[] = turns
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 1500),
    }));

  if (!audio) return base;

  const lastContent =
    base.length > 0 && base[base.length - 1].role === "user"
      ? String(base[base.length - 1].content).trim()
      : "";
  const isGenericVoicePlaceholder = /^voice note(\s*\(\d+s\))?$/i.test(lastContent);
  const promptText =
    lastContent && !isGenericVoicePlaceholder
      ? lastContent
      : "Listen carefully to the attached audio recording. The speaker may be speaking Kano Hausa, Nigerian Pidgin, or English. Understand their exact plumbing issue or request and reply warmly, concisely, and naturally in the EXACT same language they spoke.";

  const audioTurn: ModelMessage = {
    role: "user",
    content: [
      { type: "text", text: promptText },
      { type: "file", data: audio.data, mediaType: audio.mimeType },
    ],
  };

  if (base.length > 0 && base[base.length - 1].role === "user") {
    return [...base.slice(0, -1), audioTurn];
  }
  return [...base, audioTurn];
}

export async function generateSupportReply(params: {
  messages: AiChatTurn[];
  ticketContext?: TicketAiContext | null;
  audio?: AiAudioInput | null;
}): Promise<{ text: string; model: string; fallback: boolean; reason?: string }> {
  const modelMessages = buildModelMessages(params.messages, params.audio);
  const lastUser =
    [...params.messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

  if (!apiKey) {
    return {
      text: buildFallbackReply(lastUser, params.ticketContext),
      model: "fallback-rule",
      fallback: true,
      reason: "missing_key",
    };
  }

  const googleProvider = createGoogleGenerativeAI({ apiKey });
  const system = await buildSystemPrompt(params.ticketContext);
  const candidates = [
    "gemini-3-flash-preview",
    "gemini-3.1-flash-lite-preview",
    "gemini-3.8-flash",
  ];
  const reasons: string[] = [];

  const tryModel = async (modelId: string) => {
    const isGemini3 = modelId.startsWith("gemini-3");
    const result = await generateText({
      model: googleProvider(modelId),
      system,
      messages: modelMessages,
      maxOutputTokens: 350,
      providerOptions: {
        google: {
          thinkingConfig: isGemini3
            ? { thinkingLevel: "minimal" }
            : { thinkingBudget: 0 },
        },
      },
      abortSignal: AbortSignal.timeout(10000),
    });
    return result.text?.trim() || "";
  };

  for (const modelId of candidates) {
    try {
      const text = await tryModel(modelId);
      if (text) {
        return { text, model: modelId, fallback: false };
      }
      reasons.push(`${modelId}: empty_text`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const short = `${modelId}: ${msg.slice(0, 90)}`;
      reasons.push(short);
      console.error("[ai-assistant] failed:", short);
    }
  }

  // Dynamic model discovery fallback if static IDs change
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (listRes.ok) {
      const listJson = (await listRes.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[];
      };
      const dynamicFlash = (listJson.models || [])
        .filter(
          (m) =>
            m.name?.includes("flash") &&
            !m.name?.includes("image") &&
            !m.name?.includes("tts") &&
            !m.name?.includes("audio") &&
            m.supportedGenerationMethods?.includes("generateContent")
        )
        .map((m) => String(m.name).replace(/^models\//, ""))
        .reverse()
        .slice(0, 2);

      for (const modelId of dynamicFlash) {
        if (candidates.includes(modelId)) continue;
        try {
          const text = await tryModel(modelId);
          if (text) {
            return { text, model: modelId, fallback: false };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          reasons.push(`${modelId}: ${msg.slice(0, 90)}`);
        }
      }
    }
  } catch {
    // Ignore discovery failure
  }

  return {
    text: buildFallbackReply(lastUser, params.ticketContext),
    model: "fallback-error",
    fallback: true,
    reason: reasons.join(" | "),
  };
}

export async function maybeAutoReplyToTicketMessage(params: {
  requestId: string;
  ticketNumber: string;
  customerId: string | null;
  customerMessage: string;
  attachment?: {
    url?: string;
    name?: string;
    size?: number;
    mimeType?: string;
  } | null;
}) {
  const cleanMsg = params.customerMessage.trim();
  const isAudioAttachment = Boolean(
    params.attachment?.url &&
      (params.attachment?.mimeType?.startsWith("audio/") ||
        /\.(webm|ogg|mp3|wav|m4a|mp4|aac)$/i.test(params.attachment?.name || ""))
  );
  if (!cleanMsg && !isAudioAttachment) return null;

  try {
    const supabase = getServiceSupabase();
    const { data: recentRows } = await supabase
      .from("messages")
      .select("sender_role, sender_name, message, is_internal, created_at")
      .eq("ticket_number", params.ticketNumber)
      .order("created_at", { ascending: false })
      .limit(8);

    const rows = (recentRows || []).filter((r) => !r.is_internal);
    const now = Date.now();

    // Pause AI if a human admin or plumber replied within the last 15 minutes.
    const recentHumanReply = rows.find((r) => {
      const senderName = String(r.sender_name || "");
      const isHumanStaff =
        (r.sender_role === "admin" || r.sender_role === "plumber") &&
        senderName !== "Ziat" &&
        senderName !== "FlowGuard AI Assistant";
      if (!isHumanStaff) return false;
      const ts = new Date(String(r.created_at || "")).getTime();
      return Number.isFinite(ts) && now - ts < HUMAN_PAUSE_WINDOW_MS;
    });

    if (recentHumanReply) {
      return null;
    }

    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("status, problem_category, assigned_technician")
      .eq("ticket_number", params.ticketNumber)
      .maybeSingle();

    const orderedRecent = [...rows]
      .reverse()
      .map((r) => ({
        senderName: String(r.sender_name || r.sender_role),
        senderRole: String(r.sender_role || "user"),
        message: String(r.message || ""),
      }))
      .filter((r) => r.message.trim().length > 0);

    const audioInput =
      isAudioAttachment && params.attachment?.url
        ? await downloadChatUploadAudio(
            params.attachment.url,
            params.attachment.mimeType
          )
        : null;

    if (!cleanMsg && !audioInput) {
      return null;
    }

    const { text } = await generateSupportReply({
      messages: [
        {
          role: "user",
          content:
            cleanMsg ||
            "Listen to this customer voice note (it may be in Hausa, English, or Nigerian Pidgin). Understand their plumbing issue or request and reply warmly and clearly in the same language they spoke.",
        },
      ],
      audio: audioInput,
      ticketContext: {
        ticketNumber: params.ticketNumber,
        status: reqRow?.status ? String(reqRow.status) : undefined,
        problemCategory: reqRow?.problem_category ? String(reqRow.problem_category) : undefined,
        assignedTechnician: reqRow?.assigned_technician ? String(reqRow.assigned_technician) : null,
        recentMessages: orderedRecent,
      },
    });

    // If customer sent a voice note, Ziat replies with a synthesized voice note too
    let replyAttachment:
      | { url: string; name: string; size: number; mimeType: string }
      | undefined;
    if (audioInput) {
      const speech = await synthesizeZiatSpeech(text);
      if (speech) {
        const uploaded = await uploadZiatVoiceNote(speech.wavBuffer, params.ticketNumber);
        if (uploaded) replyAttachment = uploaded;
      }
    }

    const aiMsg = await postJobMessage({
      requestId: params.requestId,
      ticketNumber: params.ticketNumber,
      senderRole: "admin",
      senderName: "Ziat",
      senderId: null,
      recipientRole: "customer",
      recipientId: params.customerId,
      recipients: [
        {
          recipientId: params.customerId || "customer",
          recipientRole: "customer",
        },
      ],
      message: text,
      ...(replyAttachment ? { attachment: replyAttachment } : {}),
      isInternal: false,
    });

    return aiMsg;
  } catch (err) {
    console.error("[ai-assistant] maybeAutoReply failed:", err instanceof Error ? err.message : "error");
    return null;
  }
}

export async function generateAdminCopilotReply(params: {
  messages: AiChatTurn[];
  adminActor?: string;
  audio?: AiAudioInput | null;
  liveCall?: boolean;
}): Promise<{ text: string; model: string; fallback: boolean; actionsTaken: string[] }> {
  const actorLabel = params.adminActor || "Admin AI";
  const actionsTaken: string[] = [];
  const modelMessages = buildModelMessages(params.messages, params.audio);

  const supabase = getServiceSupabase();
  const [reqRes, plumberRes, payRes, compRes, msgRes, quoteRes, enqRes] = await Promise.all([
    supabase
      .from("service_requests")
      .select(
        "ticket_number, status, urgency, problem_category, customer_name, city_lga, address_in_kano, assigned_plumber_id, assigned_technician, created_at"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("plumbers")
      .select(
        "id, full_name, verification_status, is_available, preferred_locations, residential_location, rating, total_jobs"
      )
      .is("deleted_at", null),
    supabase
      .from("payments")
      .select(
        "ticket_number, total_payment, company_commission, labour_portion, materials_portion, verification_status, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("complaints")
      .select("id, ticket_number, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("messages")
      .select("id, ticket_number, sender_name, sender_role, message, admin_read, created_at")
      .eq("admin_read", false)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("quotations")
      .select("ticket_number, total_amount, customer_approval_status, created_at")
      .eq("customer_approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("enquiries")
      .select("id, full_name, service_category, area_in_kano, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const reqs = reqRes.data || [];
  const plumbers = plumberRes.data || [];
  const payments = payRes.data || [];
  const complaints = compRes.data || [];
  const unreadMsgs = msgRes.data || [];
  const pendingQuotes = quoteRes.data || [];
  const enquiries = enqRes.data || [];

  const unassignedReqs = reqs.filter(
    (r) => !r.assigned_plumber_id && !["completed", "cancelled"].includes(String(r.status || ""))
  );
  const activeReqs = reqs.filter((r) => !["completed", "cancelled"].includes(String(r.status || "")));
  const approvedPlumbers = plumbers.filter((p) => p.verification_status === "approved");
  const pendingPlumbers = plumbers.filter((p) => p.verification_status !== "approved");
  const availablePlumbers = approvedPlumbers.filter((p) => p.is_available === true);

  const activeCountByPlumber = new Map<string, number>();
  for (const r of activeReqs) {
    if (r.assigned_plumber_id) {
      const pid = String(r.assigned_plumber_id);
      activeCountByPlumber.set(pid, (activeCountByPlumber.get(pid) || 0) + 1);
    }
  }

  const verifiedPayments = payments.filter((p) => p.verification_status === "verified");
  const pendingPayments = payments.filter((p) => p.verification_status === "pending");
  const totalVerifiedRevenue = verifiedPayments.reduce(
    (s, p) => s + (Number(p.total_payment) || 0),
    0
  );
  const totalVerifiedCommission = verifiedPayments.reduce(
    (s, p) => s + (Number(p.company_commission) || 0),
    0
  );
  const openComplaints = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed");

  const snapshotLines = [
    `LIVE OPERATIONS SNAPSHOT (${new Date().toISOString()}):`,
    `- Active requests: ${activeReqs.length} (${unassignedReqs.length} unassigned)`,
    `- Plumbers: ${approvedPlumbers.length} approved (${availablePlumbers.length} currently On Duty / Available), ${pendingPlumbers.length} pending verification`,
    `- Pending quotations awaiting customer approval: ${pendingQuotes.length}`,
    `- Payments (recent 50): ${pendingPayments.length} pending verification, ${verifiedPayments.length} verified (Revenue: ₦${totalVerifiedRevenue.toLocaleString()}, Commission: ₦${totalVerifiedCommission.toLocaleString()})`,
    `- Open complaints: ${openComplaints.length}`,
    `- Unread customer/plumber messages: ${unreadMsgs.length}`,
    `- Recent direct enquiries: ${enquiries.length}`,
    "",
    "NEWEST / ACTIVE TICKETS (most recent first):",
    ...activeReqs.slice(0, 15).map(
      (r) =>
        `  • ${r.ticket_number} [${r.status}${r.urgency === "urgent" ? ", URGENT" : ""}] ${r.problem_category || "Plumbing"} @ ${r.city_lga || r.address_in_kano || "Kano"} | Customer: ${r.customer_name || "N/A"} | Plumber: ${r.assigned_technician || "UNASSIGNED"} | Created: ${r.created_at}`
    ),
    "",
    "UNREAD MESSAGES:",
    ...unreadMsgs.slice(0, 8).map(
      (m) => `  • ${m.ticket_number} from ${m.sender_name || m.sender_role}: ${(m.message || "Voice note/attachment").slice(0, 80)}`
    ),
    "",
    "PENDING PLUMBERS:",
    ...pendingPlumbers.slice(0, 6).map(
      (p) => `  • ${p.full_name} [${p.verification_status}] | Areas: ${Array.isArray(p.preferred_locations) ? p.preferred_locations.join(", ") : p.residential_location || "Kano"}`
    ),
    "",
    "APPROVED PLUMBERS:",
    ...approvedPlumbers.slice(0, 15).map((p) => {
      const areas = Array.isArray(p.preferred_locations)
        ? p.preferred_locations.join(", ")
        : p.residential_location || "Kano";
      const load = activeCountByPlumber.get(String(p.id)) || 0;
      return `  • ${p.full_name} [${p.is_available ? "On Duty" : "Off Duty"}] | Areas: ${areas} | Active jobs: ${load} | Rating: ${p.rating ?? "N/A"} (${p.total_jobs || 0} jobs)`;
    }),
    "",
    "PENDING PAYMENTS:",
    ...pendingPayments.slice(0, 8).map(
      (p) => `  • ${p.ticket_number}: ₦${Number(p.total_payment || 0).toLocaleString()} (Commission: ₦${Number(p.company_commission || 0).toLocaleString()})`
    ),
    "",
    "OPEN COMPLAINTS:",
    ...openComplaints.slice(0, 6).map(
      (c) => `  • ${c.ticket_number || c.id}: ${c.subject || "Complaint"} [${c.status}]`
    ),
  ];

  const systemPrompt = [
    "You are the FlowGuard AI Operations Manager for FlowGuard Plumbing Enterprises (Kano, Nigeria).",
    "VOICE & WRITING STYLE:",
    "- Write like a sharp, reliable human operations manager talking directly to the boss — natural, warm, concise, and clear.",
    "- Never use robotic AI filler ('Certainly!', 'I have analyzed the data', 'Here is a breakdown:', 'Let me know if you need anything else').",
    "- Never output raw Markdown syntax such as **bold**, ### headings, * bullets, or `backticks`. Write clean, natural sentences; if listing multiple items, use simple lines with '• ' and plain readable text.",
    "- Languages: Admin or customers may speak/write in English, Hausa, or Nigerian Pidgin. Understand voice notes and text in all three and reply naturally in the same language used.",
    ...(params.liveCall
      ? [
          "LIVE VOICE CALL MODE:",
          "- You are on a live voice call with the Boss right now. Respond in 1 to 3 short, natural spoken sentences — warm, conversational, and fast to listen to. Avoid bullet lists or long readouts unless asked.",
        ]
      : []),
    "",
    "FULL ACCESS & LIVE TRUTH:",
    "- You have FULL live read and action access to FlowGuard's database (all service requests/tickets, enquiries, plumbers, quotations, payments, complaints, messages, and settings). NEVER claim you do not have access to tickets, enquiries, or live records.",
    "- ALWAYS trust the latest LIVE OPERATIONS SNAPSHOT and your tools over earlier messages in chat history — new tickets and payments arrive in real time.",
    "- Before assigning a plumber, updating a ticket, verifying a payment, or replying to a customer, first call your read/analysis tools (inspectTicket, findBestPlumbersForArea, inspectFinancialSummary, getLiveOperationsFeed) to verify exact facts.",
    "- For financial, approval, cancellation, or irreversible actions (verifyPayment, updatePlumberStatus, updateCommissionSettings, cancelling tickets), only execute when the Admin explicitly instructs you to execute — otherwise share what you found and ask if you should go ahead.",
    "- Never invent tickets, plumbers, or Naira figures not returned by the snapshot or tools.",
    "",
    snapshotLines.join("\n"),
  ].join("\n");

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    return {
      text: `Operations Summary: ${unassignedReqs.length} unassigned jobs, ${pendingPayments.length} pending payments, ${openComplaints.length} open complaints, ${unreadMsgs.length} unread messages, ${availablePlumbers.length} plumbers On Duty.`,
      model: "fallback-rule",
      fallback: true,
      actionsTaken,
    };
  }

  const adminTools = {
    getLiveOperationsFeed: tool({
      description:
        "Fetch the latest live tickets, unassigned jobs, pending payments, pending quotations, unread messages, and direct enquiries directly from the database right now.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const [latestReqs, latestPays, latestUnread, latestEnqs] = await Promise.all([
          supabase
            .from("service_requests")
            .select("ticket_number, status, urgency, problem_category, customer_name, city_lga, assigned_technician, created_at")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(15),
          supabase
            .from("payments")
            .select("ticket_number, total_payment, verification_status, created_at")
            .eq("verification_status", "pending")
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("messages")
            .select("ticket_number, sender_name, sender_role, message, created_at")
            .eq("admin_read", false)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("enquiries")
            .select("full_name, service_category, area_in_kano, status, created_at")
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        return {
          ok: true,
          newestTickets: latestReqs.data || [],
          pendingPayments: latestPays.data || [],
          unreadMessages: latestUnread.data || [],
          recentEnquiries: latestEnqs.data || [],
        };
      },
    }),

    inspectTicket: tool({
      description: "Analyze full details of a ticket (request info, quotations, payments, history, and recent messages) before taking action.",
      inputSchema: jsonSchema<{ ticketNumber: string }>({
        type: "object",
        properties: {
          ticketNumber: { type: "string", description: "Ticket number e.g. BP-261122-1234" },
        },
        required: ["ticketNumber"],
      }),
      execute: async ({ ticketNumber }) => {
        const clean = ticketNumber.trim();
        const [{ data: req }, { data: quotes }, { data: pays }, { data: msgs }] = await Promise.all([
          supabase.from("service_requests").select("*").eq("ticket_number", clean).maybeSingle(),
          supabase
            .from("quotations")
            .select("id, revision_number, total_amount, labour_charge, materials_cost, company_commission, plumber_payable, customer_approval_status, created_at")
            .eq("ticket_number", clean)
            .order("created_at", { ascending: false }),
          supabase
            .from("payments")
            .select("id, total_payment, company_commission, verification_status, payment_method, proof_url, created_at")
            .eq("ticket_number", clean)
            .order("created_at", { ascending: false }),
          supabase
            .from("messages")
            .select("sender_name, sender_role, message, attachment_url, attachment_name, attachment_type, is_internal, created_at")
            .eq("ticket_number", clean)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);
        if (!req) return { ok: false, error: `Ticket ${clean} not found.` };
        return {
          ok: true,
          request: {
            ticket_number: req.ticket_number,
            status: req.status,
            urgency: req.urgency,
            category: req.problem_category,
            description: req.issue_description,
            address: req.address_in_kano,
            city_lga: req.city_lga,
            customer_name: req.customer_name,
            assigned_technician: req.assigned_technician,
          },
          quotations: quotes || [],
          payments: pays || [],
          recentMessages: (msgs || []).reverse(),
        };
      },
    }),

    findBestPlumbersForArea: tool({
      description: "Analyze and rank approved plumbers by availability (On Duty), Kano area match, active workload, and rating.",
      inputSchema: jsonSchema<{ areaOrAddress: string }>({
        type: "object",
        properties: {
          areaOrAddress: { type: "string", description: "Customer area, LGA, or address in Kano" },
        },
        required: ["areaOrAddress"],
      }),
      execute: async ({ areaOrAddress }) => {
        const needle = areaOrAddress.trim().toLowerCase();
        const ranked = approvedPlumbers
          .map((p) => {
            const areas = Array.isArray(p.preferred_locations)
              ? p.preferred_locations.map((a) => String(a).toLowerCase())
              : [];
            const resLoc = String(p.residential_location || "").toLowerCase();
            const areaMatch =
              Boolean(needle) &&
              (areas.some((a) => needle.includes(a) || a.includes(needle)) ||
                resLoc.includes(needle));
            const load = activeCountByPlumber.get(String(p.id)) || 0;
            const score =
              (p.is_available ? 50 : 0) +
              (areaMatch ? 30 : 0) -
              load * 10 +
              (Number(p.rating) || 0) * 2;
            return {
              id: p.id,
              name: p.full_name,
              onDuty: Boolean(p.is_available),
              areaMatch,
              activeJobs: load,
              rating: p.rating ?? null,
              totalJobs: p.total_jobs || 0,
              score,
            };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 6);
        return { areaQueried: areaOrAddress, candidates: ranked };
      },
    }),

    inspectFinancialSummary: tool({
      description: "Analyze full payment totals, company commission, plumber payouts, and current commission settings.",
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => {
        const [{ data: allPays }, settings] = await Promise.all([
          supabase
            .from("payments")
            .select("ticket_number, total_payment, company_commission, plumber_payable, verification_status, created_at"),
          getMarketplaceSettings(),
        ]);
        const list = allPays || [];
        const verified = list.filter((p) => p.verification_status === "verified");
        const pending = list.filter((p) => p.verification_status === "pending");
        return {
          verifiedCount: verified.length,
          verifiedRevenue: verified.reduce((s, p) => s + (Number(p.total_payment) || 0), 0),
          verifiedCommission: verified.reduce((s, p) => s + (Number(p.company_commission) || 0), 0),
          verifiedPlumberPayable: verified.reduce((s, p) => s + (Number(p.plumber_payable) || 0), 0),
          pendingCount: pending.length,
          pendingTotal: pending.reduce((s, p) => s + (Number(p.total_payment) || 0), 0),
          pendingTickets: pending.slice(0, 10).map((p) => p.ticket_number),
          commissionSettings: {
            defaultRate: settings.commission_default_rate,
            smallJobRate: settings.commission_small_job_rate,
            smallJobThreshold: settings.small_job_threshold,
            smallJobRuleEnabled: settings.small_job_rule_enabled,
          },
        };
      },
    }),

    assignPlumberToTicket: tool({
      description: "Propose assigning an approved plumber (by name or ID) to a service request ticket. Requires Owner approval.",
      inputSchema: jsonSchema<{ ticketNumber: string; plumberNameOrId: string }>({
        type: "object",
        properties: {
          ticketNumber: { type: "string", description: "Ticket number e.g. BP-261122-1234" },
          plumberNameOrId: { type: "string", description: "Plumber full name or ID" },
        },
        required: ["ticketNumber", "plumberNameOrId"],
      }),
      execute: async ({ ticketNumber, plumberNameOrId }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "assign_plumber_to_ticket",
          rawInput: { ticketNumber: ticketNumber.trim(), plumberNameOrId: plumberNameOrId.trim() },
          targetResource: ticketNumber.trim(),
          actionSummary: `Assign ${plumberNameOrId.trim()} to ${ticketNumber.trim()}`,
          reason: "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to assign ${plumberNameOrId} to ${ticketNumber}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    updateTicketStatus: tool({
      description: "Propose updating the status or internal notes of a service request ticket. Requires Owner approval.",
      inputSchema: jsonSchema<{ ticketNumber: string; status: string; internalNote?: string }>({
        type: "object",
        properties: {
          ticketNumber: { type: "string" },
          status: {
            type: "string",
            enum: [
              "new",
              "contacted",
              "scheduled",
              "inspection_required",
              "in_progress",
              "work_completed",
              "awaiting_final_payment",
              "completed",
              "cancelled",
            ],
          },
          internalNote: { type: "string" },
        },
        required: ["ticketNumber", "status"],
      }),
      execute: async ({ ticketNumber, status, internalNote }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "update_ticket_status",
          rawInput: { ticketNumber: ticketNumber.trim(), status, internalNote },
          targetResource: ticketNumber.trim(),
          actionSummary: `Update ${ticketNumber.trim()} status to ${status}`,
          reason: internalNote || "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to set ${ticketNumber} to ${status}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    sendTicketMessage: tool({
      description: "Propose sending a chat message on a ticket to the customer or plumber. Requires Owner approval.",
      inputSchema: jsonSchema<{
        ticketNumber: string;
        recipientRole: "customer" | "plumber";
        message: string;
        isInternal?: boolean;
      }>({
        type: "object",
        properties: {
          ticketNumber: { type: "string" },
          recipientRole: { type: "string", enum: ["customer", "plumber"] },
          message: { type: "string" },
          isInternal: { type: "boolean" },
        },
        required: ["ticketNumber", "recipientRole", "message"],
      }),
      execute: async ({ ticketNumber, recipientRole, message, isInternal }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "send_ticket_message",
          rawInput: { ticketNumber: ticketNumber.trim(), recipientRole, message: message.trim(), isInternal: Boolean(isInternal) },
          targetResource: ticketNumber.trim(),
          actionSummary: `Send message on ${ticketNumber.trim()} to ${recipientRole}`,
          reason: "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to message ${recipientRole} on ${ticketNumber}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    verifyPayment: tool({
      description: "Propose verifying or rejecting a pending payment by ticketNumber. Requires Owner approval.",
      inputSchema: jsonSchema<{ ticketNumber: string; decision: "verified" | "rejected" }>({
        type: "object",
        properties: {
          ticketNumber: { type: "string" },
          decision: { type: "string", enum: ["verified", "rejected"] },
        },
        required: ["ticketNumber", "decision"],
      }),
      execute: async ({ ticketNumber, decision }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "verify_payment",
          rawInput: { ticketNumber: ticketNumber.trim(), decision },
          targetResource: ticketNumber.trim(),
          actionSummary: `Mark payment for ${ticketNumber.trim()} as ${decision}`,
          reason: "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to mark payment for ${ticketNumber} as ${decision}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    updatePlumberStatus: tool({
      description: "Propose approving, rejecting, or suspending a plumber by name or ID. Requires Owner approval.",
      inputSchema: jsonSchema<{
        plumberNameOrId: string;
        status: "approved" | "rejected" | "suspended";
        notes?: string;
      }>({
        type: "object",
        properties: {
          plumberNameOrId: { type: "string" },
          status: { type: "string", enum: ["approved", "rejected", "suspended"] },
          notes: { type: "string" },
        },
        required: ["plumberNameOrId", "status"],
      }),
      execute: async ({ plumberNameOrId, status, notes }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "update_plumber_status",
          rawInput: { plumberNameOrId: plumberNameOrId.trim(), status, notes },
          targetResource: plumberNameOrId.trim(),
          actionSummary: `Set plumber ${plumberNameOrId.trim()} status to ${status}`,
          reason: notes || "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to set plumber ${plumberNameOrId} to ${status}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    resolveComplaint: tool({
      description: "Propose updating a complaint status with a resolution note. Requires Owner approval.",
      inputSchema: jsonSchema<{
        complaintIdOrTicket: string;
        status: "under_review" | "investigating" | "resolved";
        adminNote?: string;
      }>({
        type: "object",
        properties: {
          complaintIdOrTicket: { type: "string" },
          status: { type: "string", enum: ["under_review", "investigating", "resolved"] },
          adminNote: { type: "string" },
        },
        required: ["complaintIdOrTicket", "status"],
      }),
      execute: async ({ complaintIdOrTicket, status, adminNote }) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "resolve_complaint",
          rawInput: { complaintIdOrTicket: complaintIdOrTicket.trim(), status, adminNote },
          targetResource: complaintIdOrTicket.trim(),
          actionSummary: `Set complaint ${complaintIdOrTicket.trim()} to ${status}`,
          reason: adminNote || "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to update complaint ${complaintIdOrTicket}`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),

    updateCommissionSettings: tool({
      description: "Propose updating global commission rates or small-job threshold. Requires Owner approval.",
      inputSchema: jsonSchema<{
        commissionDefaultRate?: number;
        commissionSmallJobRate?: number;
        smallJobThreshold?: number;
        smallJobRuleEnabled?: boolean;
      }>({
        type: "object",
        properties: {
          commissionDefaultRate: { type: "number" },
          commissionSmallJobRate: { type: "number" },
          smallJobThreshold: { type: "number" },
          smallJobRuleEnabled: { type: "boolean" },
        },
      }),
      execute: async (input) => {
        const res = await getAdminToolGateway().invoke({
          ctx: {
            agentId: "operations_manager",
            actorUserId: actorLabel,
            actorEmail: actorLabel,
          },
          toolName: "update_commission_settings",
          rawInput: input,
          targetResource: "marketplace_settings",
          actionSummary: "Update marketplace commission settings",
          reason: "Requested via Admin Operations Manager",
        });
        if (res.approvalId) {
          actionsTaken.push(`Approval requested (${res.approvalId}) to update commission settings`);
        }
        return res.data ?? { ok: res.ok, error: res.error };
      },
    }),
  };

  const googleProvider = createGoogleGenerativeAI({ apiKey });
  for (const modelId of ["gemini-3-flash-preview", "gemini-3.1-flash-lite-preview"]) {
    try {
      const result = await generateText({
        model: googleProvider(modelId),
        system: systemPrompt,
        messages: modelMessages,
        tools: adminTools,
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1400,
        abortSignal: AbortSignal.timeout(20000),
      });
      const text = result.text?.trim();
      if (text) return { text, model: modelId, fallback: false, actionsTaken };
    } catch (err) {
      console.error("[ai-admin] failed:", err instanceof Error ? err.message : "error");
    }
  }

  return {
    text: `Operations Summary: ${unassignedReqs.length} unassigned jobs, ${pendingPayments.length} pending payments, ${openComplaints.length} open complaints, ${unreadMsgs.length} unread messages, ${availablePlumbers.length} plumbers On Duty.`,
    model: "fallback-error",
    fallback: true,
    actionsTaken,
  };
}
