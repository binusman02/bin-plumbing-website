import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSupabase = getServiceSupabase();
  const { data: adminRow } = await adminSupabase
    .from("admin_users")
    .select("id, is_active")
    .eq("auth_user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storagePath = request.nextUrl.searchParams.get("path")?.trim() || "";
  const folder = request.nextUrl.searchParams.get("folder")?.trim() || "";
  const file = request.nextUrl.searchParams.get("file")?.trim() || "";

  const targetPath =
    storagePath || (folder && file ? `${folder}/${file}` : "");

  if (
    !targetPath ||
    targetPath.includes("..") ||
    targetPath.startsWith("/") ||
    targetPath.includes("\\")
  ) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  const { data, error } = await adminSupabase.storage
    .from("plumber-documents")
    .createSignedUrl(targetPath, 300);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
