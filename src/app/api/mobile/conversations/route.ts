import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { listOwnedConversationsForActor } from "@/lib/conversations";
import { markTicketMessagesReadForActor } from "@/lib/marketplace";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleHint = url.searchParams.get("role") as
    | "customer"
    | "plumber"
    | "admin"
    | null;
  const actor = await resolvePortalActor(roleHint || undefined);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await listOwnedConversationsForActor(actor);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
    const roleHint =
      body?.role === "customer" || body?.role === "plumber"
        ? body.role
        : undefined;
    const actor = await resolvePortalActor(roleHint);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ticketNumber) {
      return NextResponse.json(
        { error: "ticketNumber is required" },
        { status: 400 }
      );
    }

    const updated = await markTicketMessagesReadForActor({
      actorId: actor.id,
      actorRole: actor.role,
      ticketNumber,
    });

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to mark read" },
      { status: 500 }
    );
  }
}
