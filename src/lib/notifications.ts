import crypto from "crypto";
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
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  destination?: string;
  dedupeKey?: string;
}): Promise<NotificationRecord | null> {
  try {
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

    const rows = listRes.data as NotificationRecord[];
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
      .select("entity_type, entity_id")
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
    if (!entityType || !entityId) {
      return { valid: true };
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entityId);

    if (entityType === "service_request" || entityType === "message" || entityType === "quotation") {
      const q = supabase.from("service_requests").select("id, assigned_plumber_id");
      const { data: req } = isUuid
        ? await q.eq("id", entityId).maybeSingle()
        : await q.eq("ticket_number", entityId).maybeSingle();
      if (!req) {
        return { valid: false, reason: "The associated service request no longer exists." };
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
