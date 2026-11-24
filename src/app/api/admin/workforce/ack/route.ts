import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = getServiceSupabase();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_role", "admin")
      .eq("is_read", false)
      .in("type", ["ai_approval_pending", "engineering_incident"]);
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ ok: true });
}
