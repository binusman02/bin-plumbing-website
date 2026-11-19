import { NextRequest, NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const actor = await resolvePortalActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const fcmToken = String(body?.fcmToken || "").trim();
  const appFlavor = body?.appFlavor === "technician" ? "technician" : "customer";
  const platform = String(body?.platform || "android").slice(0, 20);

  if (!fcmToken) {
    return NextResponse.json({ error: "Missing fcmToken" }, { status: 400 });
  }

  const adminSupabase = getServiceSupabase();
  const { error } = await adminSupabase.from("device_tokens").upsert(
    {
      actor_id: actor.id,
      actor_role: actor.role,
      app_flavor: appFlavor,
      fcm_token: fcmToken,
      platform,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fcm_token" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const actor = await resolvePortalActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const fcmToken = String(body?.fcmToken || "").trim();
  if (!fcmToken) {
    return NextResponse.json({ error: "Missing fcmToken" }, { status: 400 });
  }

  const adminSupabase = getServiceSupabase();
  await adminSupabase
    .from("device_tokens")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("fcm_token", fcmToken)
    .eq("actor_id", actor.id);

  return NextResponse.json({ success: true });
}
