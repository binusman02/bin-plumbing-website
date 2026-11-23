import path from "path";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, validateFileMagicBytes, validateUploadFile } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimit("request_photo", 10, 10 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `Too many uploads. Please wait ${rate.retryAfterSeconds} seconds.` },
        { status: 429 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image file provided." }, { status: 400 });
    }

    const check = validateUploadFile(file, "request_photo");
    if (!check.valid) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    const rawExt = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "").toLowerCase();
    const safeExt = rawExt || ".jpg";
    const fileName = `req-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${safeExt}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const magicCheck = validateFileMagicBytes(bytes, safeExt);
    if (!magicCheck.valid) {
      return NextResponse.json({ error: magicCheck.error }, { status: 400 });
    }

    const supabase = getServiceSupabase();
    const { error: uploadError } = await supabase.storage
      .from("chat-uploads")
      .upload(fileName, bytes, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Could not store image." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: `/api/chat/file/${encodeURIComponent(fileName)}`,
      name: file.name,
    });
  } catch (err) {
    console.error("Request photo upload error:", err);
    return NextResponse.json({ error: "Failed to upload photo." }, { status: 500 });
  }
}
