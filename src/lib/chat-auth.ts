import { resolvePortalActor, type PortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface AuthorizedTicketContext {
  requestId: string;
  ticketNumber: string;
  customerId: string | null;
  assignedPlumberId: string | null;
  assignedTechnician: string | null;
}

function normalizePhoneTail(raw?: string | null): string {
  return String(raw || "").replace(/\D/g, "").slice(-10);
}

export async function resolveChatActor(
  preferredRole?: "admin" | "customer" | "plumber"
): Promise<PortalActor | null> {
  return resolvePortalActor(preferredRole);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyTicketAccess(
  actor: PortalActor,
  ticketOrRequestId: string
): Promise<AuthorizedTicketContext | null> {
  const clean = ticketOrRequestId.trim();
  if (!clean) return null;

  const supabase = getServiceSupabase();
  const baseQuery = supabase
    .from("service_requests")
    .select("id, ticket_number, customer_id, customer_phone, assigned_plumber_id, assigned_technician");

  const { data: req } = UUID_RE.test(clean)
    ? await baseQuery.eq("id", clean).maybeSingle()
    : await baseQuery.eq("ticket_number", clean).maybeSingle();

  if (!req) return null;

  if (actor.role === "admin") {
    return {
      requestId: String(req.id),
      ticketNumber: String(req.ticket_number),
      customerId: req.customer_id ? String(req.customer_id) : null,
      assignedPlumberId: req.assigned_plumber_id ? String(req.assigned_plumber_id) : null,
      assignedTechnician: req.assigned_technician ? String(req.assigned_technician) : null,
    };
  }

  if (actor.role === "customer") {
    const idMatch = Boolean(req.customer_id && String(req.customer_id) === actor.id);
    // Legacy rows created before customer_id FK was always populated: verify exact verified DB phone
    let legacyPhoneMatch = false;
    if (!req.customer_id && actor.phone) {
      const actorTail = normalizePhoneTail(actor.phone);
      const reqTail = normalizePhoneTail(req.customer_phone);
      legacyPhoneMatch = Boolean(actorTail && reqTail && actorTail === reqTail);
    }
    if (!idMatch && !legacyPhoneMatch) return null;

    return {
      requestId: String(req.id),
      ticketNumber: String(req.ticket_number),
      customerId: req.customer_id ? String(req.customer_id) : actor.id,
      assignedPlumberId: req.assigned_plumber_id ? String(req.assigned_plumber_id) : null,
      assignedTechnician: req.assigned_technician ? String(req.assigned_technician) : null,
    };
  }

  if (actor.role === "plumber") {
    const idMatch = Boolean(req.assigned_plumber_id && String(req.assigned_plumber_id) === actor.id);
    const legacyNameMatch =
      !req.assigned_plumber_id &&
      Boolean(req.assigned_technician && req.assigned_technician.trim() === actor.name.trim());
    if (!idMatch && !legacyNameMatch) {
      return null;
    }
    return {
      requestId: String(req.id),
      ticketNumber: String(req.ticket_number),
      customerId: req.customer_id ? String(req.customer_id) : null,
      assignedPlumberId: req.assigned_plumber_id ? String(req.assigned_plumber_id) : actor.id,
      assignedTechnician: req.assigned_technician ? String(req.assigned_technician) : null,
    };
  }

  return null;
}

export function getAuthorizedRecipients(
  ctx: AuthorizedTicketContext,
  senderRole: "admin" | "customer" | "plumber",
  isInternal: boolean
): { recipientId: string; recipientRole: "admin" | "customer" | "plumber" }[] {
  const recipients: { recipientId: string; recipientRole: "admin" | "customer" | "plumber" }[] = [];

  if (senderRole === "admin") {
    if (ctx.assignedPlumberId) {
      recipients.push({ recipientId: ctx.assignedPlumberId, recipientRole: "plumber" });
    }
    if (!isInternal && ctx.customerId) {
      recipients.push({ recipientId: ctx.customerId, recipientRole: "customer" });
    }
    return recipients;
  }

  if (senderRole === "customer") {
    recipients.push({ recipientId: "admin", recipientRole: "admin" });
    if (ctx.assignedPlumberId) {
      recipients.push({ recipientId: ctx.assignedPlumberId, recipientRole: "plumber" });
    }
    return recipients;
  }

  // Plumber
  recipients.push({ recipientId: "admin", recipientRole: "admin" });
  if (!isInternal && ctx.customerId) {
    recipients.push({ recipientId: ctx.customerId, recipientRole: "customer" });
  }
  return recipients;
}
