import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  countUnrepliedMessagesForAdmin,
  getAllComplaints,
  getAllMessages,
  getAllPayments,
  getAllPlumbers,
  getAllServiceRequests,
} from "@/lib/marketplace";
import { formatNGN } from "@/lib/currency";

export type AdminNotificationKind =
  | "request"
  | "plumber"
  | "payment"
  | "complaint";

export interface AdminNotificationItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  kind: AdminNotificationKind;
}

export async function getAdminNotifications(): Promise<{
  items: AdminNotificationItem[];
  unreadEnquiriesCount: number;
  unreadCommunicationsCount: number;
  unreadWorkforceCount: number;
}> {
  const supabase = await createClient();
  const serviceSb = getServiceSupabase();

  const [requests, plumbers, payments, complaints, messages, enquiriesRes, workforceNotifRes] =
    await Promise.all([
      getAllServiceRequests(),
      getAllPlumbers(),
      getAllPayments(),
      getAllComplaints(),
      getAllMessages(),
      supabase
        .from("enquiries")
        .select("id", { count: "exact", head: true })
        .eq("status", "unread"),
      serviceSb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_role", "admin")
        .is("read_at", null)
        .is("deleted_at", null)
        .in("type", [
          "ai_approval_pending",
          "engineering_incident",
          "ai_workforce_report",
          "ai_urgent_alert",
          "ai_task_failed",
        ]),
    ]);

  const items: AdminNotificationItem[] = [];

  for (const r of requests.filter((req) => req.status === "new")) {
    items.push({
      id: `req-${r.id}`,
      title: `New service request ${r.ticket_number}`,
      detail: `${r.problem_category || r.property_type} — ${r.address_in_kano}`,
      href: "/admin/requests",
      createdAt: r.created_at,
      kind: "request",
    });
  }

  for (const p of plumbers.filter(
    (pl) =>
      pl.verification_status === "submitted" ||
      pl.verification_status === "under_review" ||
      pl.verification_status === "documents_required"
  )) {
    items.push({
      id: `pl-${p.id}`,
      title: `Plumber application: ${p.full_name}`,
      detail: `${p.application_ref || p.id} • ${p.phone}`,
      href: "/admin/plumbers",
      createdAt: p.created_at,
      kind: "plumber",
    });
  }

  for (const pay of payments.filter((pm) => pm.verification_status === "pending")) {
    items.push({
      id: `pay-${pay.id}`,
      title: `Payment pending verification (${pay.ticket_number})`,
      detail: `${pay.customer_name} • ${formatNGN(pay.total_payment)}`,
      href: "/admin/financials",
      createdAt: pay.created_at,
      kind: "payment",
    });
  }

  for (const c of complaints.filter((cp) => cp.status === "new")) {
    items.push({
      id: `cmp-${c.id}`,
      title: `New customer ${c.category}`,
      detail: `${c.customer_name}${c.ticket_number ? ` • ${c.ticket_number}` : ""} — ${c.message.slice(0, 80)}`,
      href: "/admin/complaints",
      createdAt: c.created_at,
      kind: "complaint",
    });
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const unreadCommunicationsCount = countUnrepliedMessagesForAdmin(messages);

  return {
    items,
    unreadEnquiriesCount: enquiriesRes.count || 0,
    unreadCommunicationsCount,
    unreadWorkforceCount: workforceNotifRes.count || 0,
  };
}
