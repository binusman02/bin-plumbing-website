import path from "path";
import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const actor = await resolveChatActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { filename } = await context.params;
  const safeName = path.basename(decodeURIComponent(filename || ""));
  if (!safeName || safeName.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const adminSupabase = getServiceSupabase();

    // 1. Check if this file is attached to a persisted message
    const { data: attachedMsgs } = await adminSupabase
      .from("messages")
      .select("id, ticket_number, is_internal, deleted_for_everyone")
      .filter("attachment->>url", "ilike", `%${encodeURIComponent(safeName)}%`)
      .limit(1);

    const attachedMsg = attachedMsgs?.[0];

    if (attachedMsg) {
      if (attachedMsg.deleted_for_everyone) {
        return NextResponse.json({ error: "Attachment removed" }, { status: 404 });
      }
      if (actor.role === "customer" && attachedMsg.is_internal) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const ctx = await verifyTicketAccess(actor, String(attachedMsg.ticket_number));
      if (!ctx) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (actor.role !== "admin") {
      // 2. Check if this is a service request photo and verify actor owns/is assigned to that request
      let authorizedViaRequestPhoto = false;
      if (safeName.startsWith("req-")) {
        const encoded = encodeURIComponent(safeName);
        const { data: matchingReqs } = await adminSupabase
          .from("service_requests")
          .select("id, photos")
          .contains("photos", [`/api/chat/file/${encoded}`])
          .limit(1);
        const matchedReq = matchingReqs?.[0];
        if (matchedReq) {
          const ctx = await verifyTicketAccess(actor, String(matchedReq.id));
          if (ctx) authorizedViaRequestPhoto = true;
        }
      }

      if (!authorizedViaRequestPhoto) {
        // 3. Otherwise check if this is a pending upload belonging to this uploader
        const { data: tokenRow } = await adminSupabase
          .from("chat_upload_tokens")
          .select("uploader_id, expires_at")
          .eq("stored_name", safeName)
          .maybeSingle();

        if (
          !tokenRow ||
          String(tokenRow.uploader_id) !== actor.id ||
          new Date(String(tokenRow.expires_at)).getTime() < Date.now()
        ) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }

    const { data, error } = await adminSupabase.storage
      .from("chat-uploads")
      .createSignedUrl(safeName, 300);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    return NextResponse.redirect(data.signedUrl, {
      status: 302,
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }
}
