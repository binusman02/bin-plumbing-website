import { generateText, jsonSchema, type ModelMessage, stepCountIs, tool } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { getMarketplaceSettings } from "@/lib/marketplace";
import { getAdminToolGateway } from "@/lib/ai-workforce/admin-tools";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
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
    "You are Sadiq, the FlowGuard AI Operations Manager at FlowGuard Plumbing Enterprises in Kano, Nigeria.",
    "PERSONALITY & COMMUNICATION STYLE:",
    "- Calm, organised, thoughtful, and dependable — sound like a capable, approachable human colleague on the team, never like a scripted bot or corporate announcement.",
    "- Give direct answers first, keep simple updates short, and never repeat the Founder's question or recite a list of job duties when greeted or asked your name.",
    "- Skip robotic AI openers ('Certainly!', 'I'd be happy to help!', 'Here is a breakdown:', 'Anything else I can assist with?').",
    "- Never output raw Markdown syntax such as **bold**, ### headings, * bullets, or `backticks`. Write clean, natural prose; if listing items, use simple lines with '• '.",
    "- Language: Use clear English by default; understand and reply naturally in Hausa or Nigerian Pidgin when used, without forcing slang.",
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
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey && !gatewayKey) {
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

  if (gatewayKey) {
    try {
      const mimoModel = process.env.MIMO_MODEL_ID?.trim() || "xiaomi/mimo-v2.6-flash";
      const result = await generateText({
        model: mimoModel,
        system: systemPrompt,
        messages: modelMessages,
        tools: adminTools,
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1400,
        abortSignal: AbortSignal.timeout(20000),
      });
      const text = result.text?.trim();
      if (text) return { text, model: mimoModel, fallback: false, actionsTaken };
    } catch (err) {
      console.error("[ai-admin] gateway failed:", err instanceof Error ? err.message : "error");
    }
  }

  if (apiKey) {
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
  }

  return {
    text: `Operations Summary: ${unassignedReqs.length} unassigned jobs, ${pendingPayments.length} pending payments, ${openComplaints.length} open complaints, ${unreadMsgs.length} unread messages, ${availablePlumbers.length} plumbers On Duty.`,
    model: "fallback-error",
    fallback: true,
    actionsTaken,
  };
}
