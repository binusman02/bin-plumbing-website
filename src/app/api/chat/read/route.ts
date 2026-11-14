import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { markTicketMessagesReadForActor } from "@/lib/marketplace";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticketNumber = typeof body?.ticketNumber === "string" ? body.ticketNumber : "";
    const preferredRole =
      body?.viewerRole === "admin" || body?.viewerRole === "plumber" || body?.viewerRole === "customer"
        ? body.viewerRole
        : undefined;

    if (!ticketNumber) {
      return NextResponse.json({ error: "ticketNumber is required" }, { status: 400 });
    }

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await markTicketMessagesReadForActor({
      actorId: actor.id,
      actorRole: actor.role,
      ticketNumber: ctx.ticketNumber,
    });

    return NextResponse.json({ success: true, updated });
  } catch {
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }
}
