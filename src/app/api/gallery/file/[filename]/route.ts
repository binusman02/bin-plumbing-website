import path from "path";
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const safeName = path.basename(decodeURIComponent(filename || ""));
  if (!safeName || safeName.includes("..")) {
    return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
  }

  try {
    const adminSupabase = getServiceSupabase();
    const { data, error } = await adminSupabase.storage
      .from("chat-uploads")
      .download(`gallery/${safeName}`);

    if (error || !data) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await data.arrayBuffer());
    const ext = path.extname(safeName).toLowerCase();
    const contentType =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : "image/jpeg";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load image" }, { status: 500 });
  }
}
