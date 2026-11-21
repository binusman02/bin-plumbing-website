import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { dispatchFcmPush } from "@/lib/fcm-push";
import {
  deleteJobMessageById,
  editJobMessageById,
  postJobMessage,
} from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const preferredRole =
      body?.actorRole === "admin" ||
      body?.actorRole === "customer" ||
      body?.actorRole === "plumber"
        ? body.actorRole
        : undefined;

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!ticketNumber || (!message && !body?.attachment)) {
      return NextResponse.json(
        { error: "ticketNumber and message or attachment are required" },
        { status: 400 }
      );
    }

    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const canUseInternal = actor.role === "plumber" || actor.role === "admin";
    let isInternal = canUseInternal ? Boolean(body?.isInternal) : false;
    let replyToId =
      typeof body?.replyToId === "string" && body.replyToId.trim().length > 0
        ? body.replyToId.trim()
        : null;

    if (replyToId) {
      const supabase = getServiceSupabase();
      const { data: parentMsg } = await supabase
        .from("messages")
        .select("id, ticket_number, is_internal")
        .eq("id", replyToId)
        .maybeSingle();

      if (!parentMsg || String(parentMsg.ticket_number) !== ctx.ticketNumber) {
        replyToId = null;
      } else if (parentMsg.is_internal) {
        if (canUseInternal) {
          isInternal = true;
        } else {
          // Customers cannot reply to or reference internal messages
          replyToId = null;
          isInternal = false;
        }
      }
    }

    let recipientRole: "admin" | "customer" | "plumber" =
      body?.recipientRole === "customer" ||
      body?.recipientRole === "plumber" ||
      body?.recipientRole === "admin"
        ? body.recipientRole
        : actor.role === "customer"
          ? ctx.assignedPlumberId
            ? "plumber"
            : "admin"
          : actor.role === "plumber"
            ? "customer"
            : "customer";

    if (isInternal) {
      recipientRole = actor.role === "plumber" ? "admin" : "plumber";
    }

    const recipientId =
      recipientRole === "customer"
        ? ctx.customerId
        : recipientRole === "plumber"
          ? ctx.assignedPlumberId
          : null;

    const created = await postJobMessage({
      requestId: ctx.requestId,
      ticketNumber: ctx.ticketNumber,
      senderRole: actor.role,
      senderName: actor.name,
      senderId: actor.id,
      recipientRole,
      recipientId,
      recipients: [
        {
          recipientId: recipientId || "admin",
          recipientRole,
        },
      ],
      message,
      attachment: body?.attachment,
      isInternal,
      replyToId,
    });

    if (
      !isInternal ||
      recipientRole === "admin" ||
      (recipientRole === "plumber" && Boolean(recipientId))
    ) {
      await dispatchFcmPush({
        recipientRole,
        recipientId: recipientId || "admin",
        title: isInternal
          ? `Private • ${actor.name} (${ctx.ticketNumber})`
          : `${actor.name} • ${ctx.ticketNumber}`,
        body: message || "Sent an attachment",
        destination: `/messages?ticket=${encodeURIComponent(ctx.ticketNumber)}`,
        type: "new_message",
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, message: created });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send message" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    const newMessage = typeof body?.message === "string" ? body.message.trim() : "";
    const preferredRole =
      body?.actorRole === "admin" || body?.actorRole === "customer" || body?.actorRole === "plumber"
        ? body.actorRole
        : undefined;

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!messageId || !newMessage) {
      return NextResponse.json({ error: "messageId and message are required" }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { data: msg } = await supabase
      .from("messages")
      .select("ticket_number")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ctx = await verifyTicketAccess(actor, String(msg.ticket_number));
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const updated = await editJobMessageById({
      messageId,
      actorId: actor.id,
      actorRole: actor.role,
      newMessage,
    });

    if (!updated) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    return NextResponse.json({ success: true, message: updated });
  } catch {
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    const mode = body?.mode === "for_everyone" ? "for_everyone" : "for_me";
    const preferredRole =
      body?.actorRole === "admin" || body?.actorRole === "customer" || body?.actorRole === "plumber"
        ? body.actorRole
        : undefined;

    if (!messageId) {
      return NextResponse.json({ error: "messageId is required" }, { status: 400 });
    }

    const actor = await resolveChatActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();
    const { data: msg } = await supabase
      .from("messages")
      .select("ticket_number, is_internal")
      .eq("id", messageId)
      .maybeSingle();
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (actor.role === "customer" && msg.is_internal) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ctx = await verifyTicketAccess(actor, String(msg.ticket_number));
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const ok = await deleteJobMessageById({
      messageId,
      actorId: actor.id,
      actorRole: actor.role,
      mode,
    });

    if (!ok) {
      return NextResponse.json({ error: "Permission denied or message not found" }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete message" }, { status: 500 });
  }
}
