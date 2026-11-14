import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { acknowledgeMessageDeliveryForActor } from "@/lib/marketplace";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const ticketNumber = typeof body?.ticketNumber === "string" ? body.ticketNumber : undefined;
    const preferredRole =
      body?.viewerRole === "admin" || body?.viewerRole === "plumber" || body?.viewerRole === "customer"
        ? body.viewerRole
        : undefined;

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let resolvedTicket: string | undefined;
    if (ticketNumber) {
      const ctx = await verifyTicketAccess(actor, ticketNumber);
      if (!ctx) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      resolvedTicket = ctx.ticketNumber;
    }

    const updated = await acknowledgeMessageDeliveryForActor({
      actorId: actor.id,
      actorRole: actor.role,
      ticketNumber: resolvedTicket,
    });

    return NextResponse.json({ success: true, updated });
  } catch {
    return NextResponse.json({ error: "Failed to acknowledge delivery" }, { status: 500 });
  }
}
