import path from "path";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { validateUploadFile } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryRole = url.searchParams.get("role") as "admin" | "customer" | "plumber" | null;
    const preAuthActor = await resolveChatActor(queryRole || undefined);
    if (!preAuthActor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const ticketNumber = typeof formData.get("ticketNumber") === "string"
      ? String(formData.get("ticketNumber")).trim()
      : "";
    const preferredRole = formData.get("role") as "admin" | "customer" | "plumber" | null;

    const actor = (await resolveChatActor(preferredRole || undefined)) || preAuthActor;

    if (ticketNumber) {
      const ctx = await verifyTicketAccess(actor, ticketNumber);
      if (!ctx) {
        return NextResponse.json({ error: "Forbidden for this ticket" }, { status: 403 });
      }
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const validation = validateUploadFile(file, "chat");
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
    const safeBase = path
      .basename(file.name, path.extname(file.name))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 48);
    const uniqueId = crypto.randomBytes(6).toString("hex");
    const storedName = `${Date.now()}-${uniqueId}-${safeBase || "file"}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const adminSupabase = getServiceSupabase();
    const { error: uploadError } = await adminSupabase.storage
      .from("chat-uploads")
      .upload(storedName, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Failed to store file: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Bind temporary upload token to the authenticated uploader
    try {
      await adminSupabase.from("chat_upload_tokens").insert({
        stored_name: storedName,
        uploader_id: actor.id,
        uploader_role: actor.role,
        ticket_number: ticketNumber || null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch {
      // Ignore if chat_upload_tokens table is not yet migrated
    }

    return NextResponse.json({
      url: `/api/chat/file/${encodeURIComponent(storedName)}`,
      name: file.name,
      size: file.size,
      mimeType,
    });
  } catch (err) {
    console.error("Chat upload failed:", err);
    return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
  }
}
