import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import {
  acknowledgeMessageDeliveryForActor,
  getMessagesForAuthorizedTicket,
} from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preferredRole = url.searchParams.get("role") as
    | "admin"
    | "customer"
    | "plumber"
    | null;

  const actor = await resolveChatActor(preferredRole || undefined);
  if (!actor) {
    return NextResponse.json(
      {
        status: "unauthorized",
        reason: "Please sign in to access this conversation.",
      },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const rawTicket = (url.searchParams.get("ticket") || "").trim();
  const rawMessageId = (url.searchParams.get("message") || "").trim();

  if (!rawTicket && !rawMessageId) {
    return NextResponse.json(
      {
        status: "not_found",
        reason: "No conversation or message target was specified.",
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const supabase = getServiceSupabase();

  let msgRow: {
    id: string;
    ticket_number: string;
    message?: string | null;
    is_internal?: boolean | null;
    deleted_for_everyone?: boolean | null;
    deleted_by_ids?: string[] | null;
  } | null = null;

  if (rawMessageId) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("id", rawMessageId)
      .maybeSingle();

    if (data) {
      msgRow = {
        id: String(data.id),
        ticket_number: String(data.ticket_number || ""),
        message: data.message ? String(data.message) : "",
        is_internal: Boolean(data.is_internal),
        deleted_for_everyone:
          Boolean(data.deleted_for_everyone) ||
          data.message === "This message was deleted",
        deleted_by_ids: Array.isArray(data.deleted_by_ids)
          ? data.deleted_by_ids.map(String)
          : [],
      };
    }
  }

  const effectiveTicket = rawTicket || msgRow?.ticket_number || "";
  if (!effectiveTicket) {
    return NextResponse.json(
      {
        status: "not_found",
        reason: "The requested conversation or message no longer exists.",
      },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const ctx = await verifyTicketAccess(actor, effectiveTicket);
  if (!ctx) {
    // Check whether the ticket exists at all to distinguish 403 Access Denied vs 404 Not Found
    const reqQuery = supabase.from("service_requests").select("id");
    const { data: existsRow } = UUID_RE.test(effectiveTicket)
      ? await reqQuery.eq("id", effectiveTicket).maybeSingle()
      : await reqQuery.eq("ticket_number", effectiveTicket).maybeSingle();

    if (existsRow) {
      return NextResponse.json(
        {
          status: "access_denied",
          reason:
            "Access denied: You do not have permission to view this conversation or message.",
        },
        { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    return NextResponse.json(
      {
        status: "not_found",
        reason: "The associated service request no longer exists.",
      },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // Prevent cross-ticket message parameter tampering (?ticket=MY_TICKET&message=OTHER_TICKET_MSG)
  if (rawMessageId && msgRow && msgRow.ticket_number !== ctx.ticketNumber) {
    const msgTicketCtx = await verifyTicketAccess(actor, msgRow.ticket_number);
    if (!msgTicketCtx) {
      return NextResponse.json(
        {
          status: "access_denied",
          reason:
            "Access denied: You do not have permission to view the requested message.",
        },
        { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }
    return NextResponse.json(
      {
        status: "access_denied",
        reason:
          "Access denied: The requested message does not belong to this conversation.",
      },
      { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  // Prevent customer access to internal admin-plumber messages
  if (rawMessageId && msgRow && actor.role === "customer" && msgRow.is_internal) {
    return NextResponse.json(
      {
        status: "access_denied",
        reason:
          "Access denied: You do not have permission to view this internal message.",
      },
      { status: 403, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

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

  if (rawMessageId) {
    const isDeletedForActor =
      !msgRow ||
      Boolean(msgRow.deleted_for_everyone) ||
      Boolean(
        msgRow.deleted_by_ids && msgRow.deleted_by_ids.includes(actor.id)
      );

    if (isDeletedForActor || !msgRow) {
      return NextResponse.json(
        {
          status: "message_deleted",
          ticketNumber: ctx.ticketNumber,
          messageId: rawMessageId,
          reason:
            "The specific message from this notification has been deleted and is no longer available.",
          messages: ticketMessages,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    return NextResponse.json(
      {
        status: "ok",
        ticketNumber: ctx.ticketNumber,
        messageId: msgRow.id,
        messages: ticketMessages,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  return NextResponse.json(
    {
      status: "ok",
      ticketNumber: ctx.ticketNumber,
      messageId: null,
      messages: ticketMessages,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
