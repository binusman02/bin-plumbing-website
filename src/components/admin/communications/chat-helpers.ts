import type {
  ChatAttachment,
  JobMessage,
  PlumberProfile,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

export const UNASSIGNED_CHAT_ID = "__unassigned__";

export interface TimelineEvent {
  id: string;
  ticketNumber: string;
  kind: "message" | "quotation";
  senderRole: "customer" | "plumber" | "admin";
  senderName: string;
  recipientRole: "customer" | "plumber" | "admin";
  body: string;
  attachment?: ChatAttachment;
  readBy?: Array<"admin" | "plumber" | "customer">;
  isInternal?: boolean;
  statusLabel?: string;
  quotation?: StructuredQuotation;
  createdAt: string;
}

export interface ChatContactItem {
  id: string;
  name: string;
  subtitle: string;
  phone: string;
  requests: ServiceRequestRecord[];
  lastMessage: string;
  lastAt: string;
  unrepliedCount: number;
  hasMessages: boolean;
  lastReadByRecipient: boolean;
}

export function matchesPlumberRequest(
  plumber: PlumberProfile,
  req: ServiceRequestRecord
): boolean {
  if (req.assigned_plumber_id && req.assigned_plumber_id === plumber.id) return true;
  if (!req.assigned_technician) return false;
  const tech = req.assigned_technician.toLowerCase().trim();
  const name = plumber.full_name.toLowerCase().trim();
  return tech === name || tech.includes(name) || name.includes(tech);
}

export function getInitials(name: string): string {
  return (name || "P")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

export function getThreadUnrepliedCount(threadMessages: JobMessage[]): number {
  const byTicket = new Map<string, JobMessage[]>();
  for (const m of threadMessages) {
    const list = byTicket.get(m.ticket_number) || [];
    list.push(m);
    byTicket.set(m.ticket_number, list);
  }
  let count = 0;
  for (const list of byTicket.values()) {
    list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let lastAdminIdx = -1;
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].sender_role === "admin") {
        lastAdminIdx = i;
        break;
      }
    }
    for (let i = lastAdminIdx + 1; i < list.length; i++) {
      if (list[i].sender_role !== "admin") count += 1;
    }
  }
  return count;
}
