import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import {
  acknowledgeMessageDeliveryForActor,
  clearChatPresence,
  getAllPlumbers,
  getChatPresenceStatus,
  getMessagesForAuthorizedTicket,
  updateChatPresence,
} from "@/lib/marketplace";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preferredRole = url.searchParams.get("role") as
    | "admin"
    | "customer"
    | "plumber"
    | null;

  const actor = await resolveChatActor(preferredRole || undefined);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = url.searchParams.get("ticket");
  const presence = await getChatPresenceStatus();

  // Only expose plumber availability map to admin/plumber, or minimal presence to customer
  const plumberAvailability: Record<string, boolean> = {};
  if (actor.role === "admin" || actor.role === "plumber") {
    const plumbers = await getAllPlumbers();
    for (const p of plumbers) {
      plumberAvailability[p.id] = Boolean(p.is_available);
    }
  }

  if (ticket) {
    const ctx = await verifyTicketAccess(actor, ticket);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Reconnection / fetch acknowledges delivery (NEVER marks read!)
    await acknowledgeMessageDeliveryForActor({
      actorId: actor.id,
      actorRole: actor.role,
      ticketNumber: ctx.ticketNumber,
    });

    const ticketMessages = await getMessagesForAuthorizedTicket({
      ticketNumber: ctx.ticketNumber,
      actorId: actor.id,
      actorRole: actor.role,
    });

    return NextResponse.json(
      { presence, plumberAvailability, messages: ticketMessages },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    { presence, plumberAvailability },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const preferredRole =
      body?.role === "admin" || body?.role === "customer" || body?.role === "plumber"
        ? body.role
        : undefined;

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (body?.action === "offline") {
      await clearChatPresence(actor.role, actor.id);
    } else {
      // Strictly use verified actor.role and actor.id — never trust body.userId
      await updateChatPresence(actor.role, actor.id);
    }

    return NextResponse.json(
      { presence: await getChatPresenceStatus() },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
