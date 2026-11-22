import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getMarketplaceSettings, postJobMessage } from "@/lib/marketplace";
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
    "You are FlowGuard AI Assistant for FlowGuard Plumbing Enterprises in Kano, Nigeria.",
    "Be warm, concise (2-4 short sentences), practical, and helpful.",
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
  return "Hello! I'm FlowGuard AI Assistant. Ask me about our plumbing services in Kano, emergency leak steps, or tap New Request to book a verified technician.";
}

export async function generateSupportReply(params: {
  messages: AiChatTurn[];
  ticketContext?: TicketAiContext | null;
}): Promise<{ text: string; model: string; fallback: boolean; reason?: string }> {
  const cleanMessages = params.messages
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, 1500),
    }));

  const lastUser = [...cleanMessages].reverse().find((m) => m.role === "user")?.content || "";
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
  const candidates = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;
  const reasons: string[] = [];

  for (const modelId of candidates) {
    try {
      const result = await generateText({
        model: googleProvider(modelId),
        system,
        messages: cleanMessages,
        maxOutputTokens: 300,
        providerOptions: {
          google: {
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        abortSignal: AbortSignal.timeout(12000),
      });

      const text = result.text?.trim();
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
}) {
  const cleanMsg = params.customerMessage.trim();
  if (!cleanMsg) return null;

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
      const isHumanStaff =
        (r.sender_role === "admin" || r.sender_role === "plumber") &&
        String(r.sender_name || "") !== "FlowGuard AI Assistant";
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

    const { text } = await generateSupportReply({
      messages: [{ role: "user", content: cleanMsg }],
      ticketContext: {
        ticketNumber: params.ticketNumber,
        status: reqRow?.status ? String(reqRow.status) : undefined,
        problemCategory: reqRow?.problem_category ? String(reqRow.problem_category) : undefined,
        assignedTechnician: reqRow?.assigned_technician ? String(reqRow.assigned_technician) : null,
        recentMessages: orderedRecent,
      },
    });

    const aiMsg = await postJobMessage({
      requestId: params.requestId,
      ticketNumber: params.ticketNumber,
      senderRole: "admin",
      senderName: "FlowGuard AI Assistant",
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
      isInternal: false,
    });

    return aiMsg;
  } catch (err) {
    console.error("[ai-assistant] maybeAutoReply failed:", err instanceof Error ? err.message : "error");
    return null;
  }
}
