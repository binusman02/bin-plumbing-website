import type { PortalActor } from "@/lib/portal-auth";
import { getChatPresenceStatus } from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

export type ConversationType =
  | "customer_plumber"
  | "customer_support"
  | "plumber_support";

export interface OwnedConversationSummary {
  conversationId: string;
  conversationType: ConversationType;
  requestId: string;
  ticketNumber: string;
  problemCategory: string;
  requestStatus: string;
  peerName: string;
  peerRole: "customer" | "plumber" | "admin";
  peerAvatarUrl: string | null;
  ownerRole: "admin" | "plumber";
  ownerId: string;
  ownerName: string;
  status: "open" | "closed";
  lastMessage: string;
  lastMessageAt: string | null;
  lastSenderRole: string | null;
  lastReceiptStatus: "sent" | "delivered" | "read" | null;
  unreadCount: number;
  online: boolean;
}

let conversationsTableMissingUntil = 0;

function isMissingConversationsTable(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  return (
    msg.includes("conversations") &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find"))
  );
}

async function resolveDefaultSupportOwner(): Promise<{ id: string; name: string }> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("admin_users")
    .select("id, full_name")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      id: String(data.id),
      name: String(data.full_name || "FlowGuard Support"),
    };
  }
  return { id: "support-ops", name: "FlowGuard Support" };
}

export async function listOwnedConversationsForActor(actor: PortalActor): Promise<{
  conversations: OwnedConversationSummary[];
  totalUnread: number;
}> {
  const supabase = getServiceSupabase();

  const reqQuery =
    actor.role === "customer"
      ? supabase
          .from("service_requests")
          .select(
            "id, ticket_number, problem_category, status, customer_id, customer_name, assigned_plumber_id, assigned_technician, created_at, updated_at, deleted_at"
          )
          .eq("customer_id", actor.id)
          .order("updated_at", { ascending: false })
          .limit(50)
      : supabase
          .from("service_requests")
          .select(
            "id, ticket_number, problem_category, status, customer_id, customer_name, assigned_plumber_id, assigned_technician, created_at, updated_at, deleted_at"
          )
          .eq("assigned_plumber_id", actor.id)
          .order("updated_at", { ascending: false })
          .limit(50);

  const [{ data: reqRows }, presence, supportOwner] = await Promise.all([
    reqQuery,
    getChatPresenceStatus(),
    resolveDefaultSupportOwner(),
  ]);

  const activeReqs = (reqRows || []).filter((r) => !r.deleted_at);
  if (activeReqs.length === 0) {
    return { conversations: [], totalUnread: 0 };
  }

  const tickets = activeReqs.map((r) => String(r.ticket_number));
  const plumberIds = [
    ...new Set(
      activeReqs
        .map((r) => (r.assigned_plumber_id ? String(r.assigned_plumber_id) : ""))
        .filter(Boolean)
    ),
  ];
  const customerIds = [
    ...new Set(
      activeReqs
        .map((r) => (r.customer_id ? String(r.customer_id) : ""))
        .filter(Boolean)
    ),
  ];

  const [msgRes, plumberRes, customerRes] = await Promise.all([
    supabase
      .from("messages")
      .select(
        "id, ticket_number, sender_role, recipient_role, message, attachment, read_by, delivered_at, read_at, is_internal, deleted_for_everyone, created_at"
      )
      .in("ticket_number", tickets)
      .eq("is_internal", false)
      .order("created_at", { ascending: true }),
    plumberIds.length > 0
      ? supabase
          .from("plumbers")
          .select("id, full_name, avatar_url, is_online")
          .in("id", plumberIds)
      : Promise.resolve({ data: [] }),
    customerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, full_name, avatar_url")
          .in("id", customerIds)
      : Promise.resolve({ data: [] }),
  ]);

  const plumberMap = new Map<string, Record<string, unknown>>();
  for (const p of (plumberRes.data || []) as Record<string, unknown>[]) {
    plumberMap.set(String(p.id), p);
  }
  const customerMap = new Map<string, Record<string, unknown>>();
  for (const c of (customerRes.data || []) as Record<string, unknown>[]) {
    customerMap.set(String(c.id), c);
  }

  const msgsByTicket = new Map<string, Record<string, unknown>[]>();
  for (const m of (msgRes.data || []) as Record<string, unknown>[]) {
    if (m.deleted_for_everyone === true) continue;
    const t = String(m.ticket_number || "");
    const list = msgsByTicket.get(t) || [];
    list.push(m);
    msgsByTicket.set(t, list);
  }

  const useDbConversations = Date.now() > conversationsTableMissingUntil;
  const dbConvMap = new Map<string, Record<string, unknown>>();

  if (useDbConversations) {
    try {
      const { data: existingConvs, error } = await supabase
        .from("conversations")
        .select("*")
        .in("ticket_number", tickets);
      if (error && isMissingConversationsTable(error)) {
        conversationsTableMissingUntil = Date.now() + 60_000;
      } else {
        for (const c of (existingConvs || []) as Record<string, unknown>[]) {
          dbConvMap.set(`${c.ticket_number}::${c.conversation_type}`, c);
        }
      }
    } catch {
      conversationsTableMissingUntil = Date.now() + 60_000;
    }
  }

  const summaries: OwnedConversationSummary[] = [];

  for (const req of activeReqs) {
    const ticket = String(req.ticket_number);
    const reqId = String(req.id);
    const reqMsgs = msgsByTicket.get(ticket) || [];
    const reqClosed = req.status === "completed" || req.status === "cancelled";

    // 1. Job Direct Conversation (Customer <-> Assigned Plumber)
    if (req.assigned_plumber_id) {
      const pid = String(req.assigned_plumber_id);
      const cid = req.customer_id ? String(req.customer_id) : "";
      const pRow = plumberMap.get(pid);
      const cRow = customerMap.get(cid);
      const plumberName = String(
        pRow?.full_name || req.assigned_technician || "Assigned Technician"
      );
      const customerName = String(
        cRow?.full_name || req.customer_name || "Customer"
      );
      const directMsgs = reqMsgs.filter((m) => {
        const s = String(m.sender_role || "");
        const r = String(m.recipient_role || "");
        return (
          (s === "customer" && r === "plumber") ||
          (s === "plumber" && r === "customer")
        );
      });
      const last = directMsgs.length > 0 ? directMsgs[directMsgs.length - 1] : null;
      const unread = directMsgs.filter((m) => {
        const sender = String(m.sender_role || "");
        if (sender === actor.role) return false;
        const readBy = Array.isArray(m.read_by) ? (m.read_by as string[]) : [];
        return !readBy.includes(actor.role) && m.read_at == null;
      }).length;

      const convId = `conv-${ticket}-direct`;
      const dbKey = `${ticket}::customer_plumber`;
      const dbConv = dbConvMap.get(dbKey);

      if (Date.now() > conversationsTableMissingUntil && !dbConv) {
        try {
          await supabase.from("conversations").upsert(
            {
              id: convId,
              request_id: reqId,
              ticket_number: ticket,
              conversation_type: "customer_plumber",
              customer_id: cid || null,
              assigned_plumber_id: pid,
              owner_role: "plumber",
              owner_id: pid,
              owner_name: plumberName,
              status: reqClosed ? "closed" : "open",
              last_message_text: last ? String(last.message || "Attachment") : "",
              last_message_at: last
                ? String(last.created_at)
                : String(req.updated_at || req.created_at),
            },
            { onConflict: "ticket_number,conversation_type" }
          );
        } catch {
          conversationsTableMissingUntil = Date.now() + 60_000;
        }
      }

      const lastSender = last ? String(last.sender_role || "") : null;
      const receipt: "sent" | "delivered" | "read" | null = last
        ? last.read_at != null ||
          (Array.isArray(last.read_by) && last.read_by.length > 0)
          ? "read"
          : last.delivered_at != null
            ? "delivered"
            : "sent"
        : null;

      summaries.push({
        conversationId: dbConv ? String(dbConv.id) : convId,
        conversationType: "customer_plumber",
        requestId: reqId,
        ticketNumber: ticket,
        problemCategory: String(req.problem_category || "Plumbing Service"),
        requestStatus: String(req.status || "new"),
        peerName: actor.role === "customer" ? plumberName : customerName,
        peerRole: actor.role === "customer" ? "plumber" : "customer",
        peerAvatarUrl:
          actor.role === "customer"
            ? (pRow?.avatar_url ? String(pRow.avatar_url) : null)
            : (cRow?.avatar_url ? String(cRow.avatar_url) : null),
        ownerRole: "plumber",
        ownerId: pid,
        ownerName: plumberName,
        status: reqClosed ? "closed" : "open",
        lastMessage: last
          ? String(last.message || "Attachment")
          : `Job ${ticket} • ${req.problem_category || "Plumbing"}`,
        lastMessageAt: last
          ? String(last.created_at)
          : String(req.updated_at || req.created_at),
        lastSenderRole: lastSender,
        lastReceiptStatus: receipt,
        unreadCount: unread,
        online:
          actor.role === "customer"
            ? presence.plumberOnline || pRow?.is_online === true
            : presence.customerOnline,
      });
    }

    // 2. Support Conversation (Customer <-> Support OR Plumber <-> Support)
    const supportType: ConversationType =
      actor.role === "customer" ? "customer_support" : "plumber_support";
    const supportMsgs = reqMsgs.filter((m) => {
      const s = String(m.sender_role || "");
      const r = String(m.recipient_role || "");
      return (
        (s === actor.role && r === "admin") ||
        (s === "admin" && r === actor.role) ||
        (!req.assigned_plumber_id && s === actor.role)
      );
    });

    // Show support conversation on active requests or any request that already has support messages
    if (!reqClosed || supportMsgs.length > 0) {
      const last = supportMsgs.length > 0 ? supportMsgs[supportMsgs.length - 1] : null;
      const unread = supportMsgs.filter((m) => {
        const sender = String(m.sender_role || "");
        if (sender === actor.role) return false;
        const readBy = Array.isArray(m.read_by) ? (m.read_by as string[]) : [];
        return !readBy.includes(actor.role) && m.read_at == null;
      }).length;

      const convId = `conv-${ticket}-${supportType}`;
      const dbKey = `${ticket}::${supportType}`;
      const dbConv = dbConvMap.get(dbKey);

      if (Date.now() > conversationsTableMissingUntil && !dbConv) {
        try {
          await supabase.from("conversations").upsert(
            {
              id: convId,
              request_id: reqId,
              ticket_number: ticket,
              conversation_type: supportType,
              customer_id: req.customer_id ? String(req.customer_id) : null,
              assigned_plumber_id: req.assigned_plumber_id
                ? String(req.assigned_plumber_id)
                : null,
              owner_role: "admin",
              owner_id: supportOwner.id,
              owner_name: supportOwner.name,
              status: reqClosed ? "closed" : "open",
              last_message_text: last ? String(last.message || "Attachment") : "",
              last_message_at: last
                ? String(last.created_at)
                : String(req.updated_at || req.created_at),
            },
            { onConflict: "ticket_number,conversation_type" }
          );
        } catch {
          conversationsTableMissingUntil = Date.now() + 60_000;
        }
      }

      const lastSender = last ? String(last.sender_role || "") : null;
      const receipt: "sent" | "delivered" | "read" | null = last
        ? last.read_at != null ||
          (Array.isArray(last.read_by) && last.read_by.length > 0)
          ? "read"
          : last.delivered_at != null
            ? "delivered"
            : "sent"
        : null;

      summaries.push({
        conversationId: dbConv ? String(dbConv.id) : convId,
        conversationType: supportType,
        requestId: reqId,
        ticketNumber: ticket,
        problemCategory: String(req.problem_category || "Support"),
        requestStatus: String(req.status || "new"),
        peerName:
          actor.role === "customer"
            ? `${supportOwner.name} (Operations)`
            : `${supportOwner.name} (Dispatch)`,
        peerRole: "admin",
        peerAvatarUrl: null,
        ownerRole: "admin",
        ownerId: dbConv ? String(dbConv.owner_id) : supportOwner.id,
        ownerName: dbConv ? String(dbConv.owner_name) : supportOwner.name,
        status: reqClosed ? "closed" : "open",
        lastMessage: last
          ? String(last.message || "Attachment")
          : `Support for ${ticket}`,
        lastMessageAt: last
          ? String(last.created_at)
          : String(req.updated_at || req.created_at),
        lastSenderRole: lastSender,
        lastReceiptStatus: receipt,
        unreadCount: unread,
        online: presence.adminOnline,
      });
    }
  }

  // Sort most recently active conversations first
  summaries.sort((a, b) => {
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });

  const totalUnread = summaries.reduce((sum, c) => sum + c.unreadCount, 0);
  return { conversations: summaries, totalUnread };
}
