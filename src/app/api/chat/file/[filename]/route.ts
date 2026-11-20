import path from "path";
import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  let actor = await resolveChatActor();
  if (!actor) {
    // Support ?token=<jwt> for mobile AudioPlayer / Image.network media streams
    const url = new URL(request.url);
    const qToken = url.searchParams.get("token")?.trim();
    if (qToken) {
      const adminSb = getServiceSupabase();
      const { data: tokenData } = await adminSb.auth.getUser(qToken);
      if (tokenData?.user) {
        const uid = tokenData.user.id;
        const { data: cust } = await adminSb
          .from("customers")
          .select("id, full_name, phone, email")
          .eq("auth_user_id", uid)
          .maybeSingle();
        if (cust) {
          actor = {
            role: "customer",
            id: String(cust.id),
            authUserId: uid,
            name: String(cust.full_name || "Customer"),
            phone: String(cust.phone || ""),
            email: cust.email ? String(cust.email) : undefined,
          };
        } else {
          const { data: plb } = await adminSb
            .from("plumbers")
            .select("id, full_name, phone, email, verification_status")
            .eq("auth_user_id", uid)
            .maybeSingle();
          if (plb) {
            actor = {
              role: "plumber",
              id: String(plb.id),
              authUserId: uid,
              name: String(plb.full_name || "Plumber"),
              phone: String(plb.phone || ""),
              email: plb.email ? String(plb.email) : undefined,
              isApproved: plb.verification_status === "approved",
            };
          }
        }
      }
    }
  }
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
