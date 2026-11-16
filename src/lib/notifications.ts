import crypto from "crypto";
import {
  ensureMessageInDestination,
  parseNotificationDestination,
} from "@/lib/notification-navigation";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface NotificationRecord {
  id: string;
  recipient_id: string;
  recipient_role: "admin" | "customer" | "plumber";
  type: string;
  title: string;
  body: string;
  entity_type: string;
  entity_id: string;
  destination: string;
  read_at: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export async function createNotification(input: {
  recipientId: string;
  recipientRole: "admin" | "customer" | "plumber";
  actorRole?: "admin" | "customer" | "plumber";
  actorId?: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  destination?: string;
  dedupeKey?: string;
}): Promise<NotificationRecord | null> {
  try {
    // Never notify the actor who performed the action
    if (input.actorRole && input.actorRole === input.recipientRole) {
      if (
        input.actorRole === "admin" ||
        !input.actorId ||
        input.actorId === input.recipientId
      ) {
        return null;
      }
    }

    const supabase = getServiceSupabase();
    const id = `notif-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    const payload = {
      id,
      recipient_id: input.recipientId,
      recipient_role: input.recipientRole,
      type: input.type || "general",
      title: input.title,
      body: input.body || "",
      entity_type: input.entityType || "",
      entity_id: input.entityId || "",
      destination: input.destination || "",
      dedupe_key: input.dedupeKey || null,
      created_at: nowIso,
    };

    const { data, error } = await supabase
      .from("notifications")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      // Ignore dedupe conflicts or pre-migration missing table silently
      return null;
    }

    return data as NotificationRecord;
  } catch {
    return null;
  }
}

async function reconcileViewedMessageNotifications(params: {
  recipientRole: "admin" | "customer" | "plumber";
  targetIds: string[];
}): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const { data: unreadMsgNotifs } = await supabase
      .from("notifications")
      .select("id, type, entity_type, entity_id, destination")
      .eq("recipient_role", params.recipientRole)
      .in("recipient_id", params.targetIds)
      .is("read_at", null)
      .is("deleted_at", null);

    if (!unreadMsgNotifs || unreadMsgNotifs.length === 0) return;

    const candidates = unreadMsgNotifs.filter(
      (n) =>
        n.entity_type === "message" ||
        n.type === "new_message" ||
        String(n.type || "").includes("message")
    );
    if (candidates.length === 0) return;

    const msgIds = new Set<string>();
    const tickets = new Set<string>();
    const metaByNotifId = new Map<
      string,
      { messageId: string | null; ticket: string | null }
    >();

    for (const n of candidates) {
      const entityId = String(n.entity_id || "").trim();
      const parsed = parseNotificationDestination(String(n.destination || ""), {
        entityType: String(n.entity_type || ""),
        entityId,
      });
      const messageId =
        parsed.messageId ||
        (entityId && !/^BP-/i.test(entityId) ? entityId : null);
      const ticket =
        parsed.ticket || (entityId && /^BP-/i.test(entityId) ? entityId : null);

      if (messageId) msgIds.add(messageId);
      if (ticket) tickets.add(ticket);
      metaByNotifId.set(String(n.id), { messageId, ticket });
    }

    const [byIdRes, byTicketRes] = await Promise.all([
      msgIds.size > 0
        ? supabase
            .from("messages")
            .select(
              "id, ticket_number, sender_role, read_by, admin_read, deleted_for_everyone"
            )
            .in("id", Array.from(msgIds))
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      tickets.size > 0
        ? supabase
            .from("messages")
            .select(
              "id, ticket_number, sender_role, read_by, admin_read, deleted_for_everyone"
            )
            .in("ticket_number", Array.from(tickets))
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);

    const msgMap = new Map<string, Record<string, unknown>>();
    const ticketMsgsMap = new Map<string, Record<string, unknown>[]>();

    for (const row of [...(byIdRes.data || []), ...(byTicketRes.data || [])]) {
      const id = String(row.id);
      msgMap.set(id, row);
      const t = String(row.ticket_number || "");
      if (t) {
        const list = ticketMsgsMap.get(t) || [];
        if (!list.some((x) => String(x.id) === id)) {
          list.push(row);
          ticketMsgsMap.set(t, list);
        }
      }
    }

    const allFoundMsgIds = Array.from(msgMap.keys());
    const readReceiptMsgIds = new Set<string>();
    if (allFoundMsgIds.length > 0) {
      try {
        const { data: rcpts } = await supabase
          .from("message_receipts")
          .select("message_id, read_at")
          .in("message_id", allFoundMsgIds)
          .eq("recipient_role", params.recipientRole)
          .in("recipient_id", params.targetIds)
          .not("read_at", "is", null);
        for (const r of rcpts || []) {
          readReceiptMsgIds.add(String(r.message_id));
        }
      } catch {
        // Ignore if message_receipts table is unavailable
      }
    }

    const isMessageViewed = (m: Record<string, unknown>): boolean => {
      if (m.deleted_for_everyone === true) return true;
      if (String(m.sender_role) === params.recipientRole) return true;
      if (params.recipientRole === "admin" && m.admin_read === true) return true;
      const readBy = Array.isArray(m.read_by) ? (m.read_by as string[]) : [];
      if (readBy.includes(params.recipientRole)) return true;
      if (readReceiptMsgIds.has(String(m.id))) return true;
      return false;
    };

    const notifIdsToMarkRead: string[] = [];
    for (const n of candidates) {
      const meta = metaByNotifId.get(String(n.id));
      if (!meta) continue;
      if (meta.messageId) {
        const msg = msgMap.get(meta.messageId);
        if (!msg || isMessageViewed(msg)) {
          notifIdsToMarkRead.push(String(n.id));
          continue;
        }
      } else if (meta.ticket) {
        const list = ticketMsgsMap.get(meta.ticket) || [];
        const incoming = list.filter(
          (m) => String(m.sender_role) !== params.recipientRole
        );
        if (incoming.length === 0 || incoming.every(isMessageViewed)) {
          notifIdsToMarkRead.push(String(n.id));
        }
      }
    }

    if (notifIdsToMarkRead.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .in("id", notifIdsToMarkRead);
    }
  } catch {
    // Non-blocking reconciliation
  }
}

export async function listNotificationsForRecipient(params: {
  recipientRole: "admin" | "customer" | "plumber";
  recipientId: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NotificationRecord[]; unreadCount: number; hasMore: boolean }> {
  try {
    const supabase = getServiceSupabase();
    const targetIds =
      params.recipientRole === "admin"
        ? ["admin", params.recipientId]
        : [params.recipientId];

    // Ensure any notifications for already-viewed messages are automatically marked read
    await reconcileViewedMessageNotifications({
      recipientRole: params.recipientRole,
      targetIds,
    });

    const limit = Math.min(Math.max(params.limit || 30, 1), 100);
    const offset = Math.max(params.offset || 0, 0);

    const [listRes, countRes] = await Promise.all([
      supabase
        .from("notifications")
        .select("*")
        .eq("recipient_role", params.recipientRole)
        .in("recipient_id", targetIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_role", params.recipientRole)
        .in("recipient_id", targetIds)
        .is("read_at", null)
        .is("archived_at", null)
        .is("deleted_at", null),
    ]);

    if (listRes.error || !listRes.data) {
      return { items: [], unreadCount: countRes.count || 0, hasMore: false };
    }

    const rows = (listRes.data as NotificationRecord[]).map((row) => {
      const normalizedDest = ensureMessageInDestination(
        row.destination,
        row.entity_type,
        row.entity_id
      );
      if (normalizedDest && normalizedDest !== row.destination) {
        supabase
          .from("notifications")
          .update({ destination: normalizedDest })
          .eq("id", row.id)
          .then(() => {});
        return { ...row, destination: normalizedDest };
      }
      return row;
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const unreadCount = countRes.count ?? items.filter((n) => !n.read_at && !n.archived_at).length;

    return { items, unreadCount, hasMore };
  } catch {
    return { items: [], unreadCount: 0, hasMore: false };
  }
}

export type NotificationMutationAction =
  | "read"
  | "unread"
  | "archive"
  | "unarchive"
  | "delete"
  | "read_all"
  | "archive_all"
  | "bulk_read"
  | "bulk_archive"
  | "bulk_delete";

export async function updateNotificationState(params: {
  recipientRole: "admin" | "customer" | "plumber";
  recipientId: string;
  action: NotificationMutationAction;
  notificationId?: string;
  notificationIds?: string[];
}): Promise<boolean> {
  try {
    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();
    const targetIds =
      params.recipientRole === "admin"
        ? ["admin", params.recipientId]
        : [params.recipientId];

    if (params.action === "read_all") {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: nowIso })
        .eq("recipient_role", params.recipientRole)
        .in("recipient_id", targetIds)
        .is("read_at", null)
        .is("deleted_at", null);
      return !error;
    }

    if (params.action === "archive_all") {
      const { error } = await supabase
        .from("notifications")
        .update({ archived_at: nowIso, read_at: nowIso })
        .eq("recipient_role", params.recipientRole)
        .in("recipient_id", targetIds)
        .is("archived_at", null)
        .is("deleted_at", null);
      return !error;
    }

    if (
      params.action === "bulk_read" ||
      params.action === "bulk_archive" ||
      params.action === "bulk_delete"
    ) {
      const ids = Array.isArray(params.notificationIds)
        ? params.notificationIds.filter((id) => typeof id === "string" && id.trim().length > 0)
        : [];
      if (ids.length === 0) return false;
      const patch: Record<string, unknown> =
        params.action === "bulk_read"
          ? { read_at: nowIso }
          : params.action === "bulk_archive"
            ? { archived_at: nowIso, read_at: nowIso }
            : { deleted_at: nowIso };
      const { error } = await supabase
        .from("notifications")
        .update(patch)
        .in("id", ids)
        .eq("recipient_role", params.recipientRole)
        .in("recipient_id", targetIds);
      return !error;
    }

    if (!params.notificationId) return false;

    const patch: Record<string, unknown> = {};
    if (params.action === "read") patch.read_at = nowIso;
    if (params.action === "unread") patch.read_at = null;
    if (params.action === "archive") {
      patch.archived_at = nowIso;
      patch.read_at = nowIso;
    }
    if (params.action === "unarchive") patch.archived_at = null;
    if (params.action === "delete") patch.deleted_at = nowIso;

    const { error } = await supabase
      .from("notifications")
      .update(patch)
      .eq("id", params.notificationId)
      .eq("recipient_role", params.recipientRole)
      .in("recipient_id", targetIds);

    return !error;
  } catch {
    return false;
  }
}

export async function verifyNotificationDestination(params: {
  recipientRole: "admin" | "customer" | "plumber";
  recipientId: string;
  notificationId: string;
}): Promise<{ valid: boolean; reason?: string }> {
  try {
    const supabase = getServiceSupabase();
    const targetIds =
      params.recipientRole === "admin"
        ? ["admin", params.recipientId]
        : [params.recipientId];

    const { data: notif } = await supabase
      .from("notifications")
      .select("entity_type, entity_id, destination")
      .eq("id", params.notificationId)
      .eq("recipient_role", params.recipientRole)
      .in("recipient_id", targetIds)
      .is("deleted_at", null)
      .maybeSingle();

    if (!notif) {
      return { valid: false, reason: "Notification no longer exists." };
    }

    const entityType = String(notif.entity_type || "");
    const entityId = String(notif.entity_id || "").trim();
    const destination = String(notif.destination || "").trim();
    if (!entityType && !destination) {
      return { valid: true };
    }

    if (entityType === "message") {
      const parsed = parseNotificationDestination(destination, {
        entityType,
        entityId,
      });
      let ticketNumber = parsed.ticket || "";

      if (entityId && !/^BP-/i.test(entityId)) {
        const { data: msgRow } = await supabase
          .from("messages")
          .select("id, ticket_number, is_internal")
          .eq("id", entityId)
          .maybeSingle();

        if (msgRow?.ticket_number && !ticketNumber) {
          ticketNumber = String(msgRow.ticket_number);
        }
        if (params.recipientRole === "customer" && msgRow?.is_internal) {
          return {
            valid: false,
            reason: "Access denied: You do not have permission to view this message.",
          };
        }
      } else if (!ticketNumber && /^BP-/i.test(entityId)) {
        ticketNumber = entityId;
      }

      if (!ticketNumber) {
        return {
          valid: false,
          reason: "The associated conversation could not be found.",
        };
      }

      const q = supabase
        .from("service_requests")
        .select("id, ticket_number, customer_id, assigned_plumber_id");
      const { data: req } = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        ticketNumber
      )
        ? await q.eq("id", ticketNumber).maybeSingle()
        : await q.eq("ticket_number", ticketNumber).maybeSingle();

      if (!req) {
        return {
          valid: false,
          reason: "The associated service request no longer exists.",
        };
      }

      if (
        params.recipientRole === "customer" &&
        req.customer_id &&
        String(req.customer_id) !== params.recipientId
      ) {
        return {
          valid: false,
          reason: "Access denied: You do not have permission to view this conversation.",
        };
      }

      if (
        params.recipientRole === "plumber" &&
        (!req.assigned_plumber_id || String(req.assigned_plumber_id) !== params.recipientId)
      ) {
        return {
          valid: false,
          reason: "Access denied: You are no longer assigned to this service request.",
        };
      }

      return { valid: true };
    }

    if (entityType === "service_request" || entityType === "quotation") {
      const parsed = parseNotificationDestination(destination);
      const lookupTicket = parsed.ticket || entityId;
      const lookupIsUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lookupTicket);
      const q = supabase
        .from("service_requests")
        .select("id, customer_id, assigned_plumber_id");
      const { data: req } = lookupIsUuid
        ? await q.eq("id", lookupTicket).maybeSingle()
        : await q.eq("ticket_number", lookupTicket).maybeSingle();
      if (!req) {
        return { valid: false, reason: "The associated service request no longer exists." };
      }
      if (
        params.recipientRole === "customer" &&
        req.customer_id &&
        String(req.customer_id) !== params.recipientId
      ) {
        return {
          valid: false,
          reason: "Access denied: You do not have permission to view this service request.",
        };
      }
      if (
        params.recipientRole === "plumber" &&
        req.assigned_plumber_id &&
        String(req.assigned_plumber_id) !== params.recipientId
      ) {
        return { valid: false, reason: "You are no longer assigned to this service request." };
      }
      return { valid: true };
    }

    if (entityType === "plumber") {
      const { data: plumber } = await supabase
        .from("plumbers")
        .select("id")
        .eq("id", entityId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!plumber) return { valid: false, reason: "Plumber record is no longer available." };
      return { valid: true };
    }

    if (entityType === "complaint") {
      const { data: cmp } = await supabase
        .from("complaints")
        .select("id")
        .eq("id", entityId)
        .maybeSingle();
      if (!cmp) return { valid: false, reason: "Complaint record is no longer available." };
      return { valid: true };
    }

    return { valid: true };
  } catch {
    return { valid: true };
  }
}
