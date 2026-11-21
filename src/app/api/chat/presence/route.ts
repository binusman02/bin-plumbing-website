import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  acknowledgeMessageDeliveryForActor,
  clearChatPresence,
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

  if (ticket) {
    const [presence, ctx] = await Promise.all([
      getChatPresenceStatus(),
      verifyTicketAccess(actor, ticket),
    ]);
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
      { presence, plumberAvailability: {}, messages: ticketMessages },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const plumberAvailability: Record<string, boolean> = {};
  const [presence, plumberRows] = await Promise.all([
    getChatPresenceStatus(),
    actor.role === "admin" || actor.role === "plumber"
      ? getServiceSupabase()
          .from("plumbers")
          .select("id, is_available")
          .is("deleted_at", null)
          .then((r) => r.data || [])
      : Promise.resolve([]),
  ]);

  for (const p of plumberRows) {
    plumberAvailability[String(p.id)] = Boolean(p.is_available);
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
      // Mark incoming undelivered messages as delivered (NEVER read) when actor is online
      const nowIso = new Date().toISOString();
      const sb = getServiceSupabase();
      await sb
        .from("messages")
        .update({ delivered_at: nowIso })
        .eq("recipient_role", actor.role)
        .is("delivered_at", null);
    }

    return NextResponse.json(
      { presence: await getChatPresenceStatus() },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
