import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolvePortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

function getTableForRole(role: "admin" | "customer" | "plumber") {
  if (role === "admin") return "admin_users";
  if (role === "customer") return "customers";
  return "plumbers";
}

function isMissingColumnError(message: string | undefined, column: string) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return (
    lower.includes(column.toLowerCase()) &&
    (lower.includes("schema cache") || lower.includes("does not exist") || lower.includes("could not find"))
  );
}

async function updateProfileAvatarColumns(
  supabase: ReturnType<typeof getServiceSupabase>,
  table: string,
  id: string,
  avatarUrl: string | null,
  storagePath: string | null
) {
  const updatedAt = new Date().toISOString();
  const fullPayload = {
    avatar_url: avatarUrl,
    avatar_storage_path: storagePath,
    updated_at: updatedAt,
  };

  const { error } = await supabase.from(table).update(fullPayload).eq("id", id);
  if (!error) return null;

  if (isMissingColumnError(error.message, "avatar_storage_path")) {
    const { error: fallbackError } = await supabase
      .from(table)
      .update({ avatar_url: avatarUrl, updated_at: updatedAt })
      .eq("id", id);

    if (!fallbackError || isMissingColumnError(fallbackError.message, "avatar_url")) {
      return null;
    }
    return fallbackError;
  }

  if (isMissingColumnError(error.message, "avatar_url")) {
    return null;
  }

  return error;
}

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const queryRole = url.searchParams.get("role") as "admin" | "customer" | "plumber" | null;
    const preAuthActor = await resolvePortalActor(queryRole || undefined);
    if (!preAuthActor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const preferredRole = formData.get("role") as "admin" | "customer" | "plumber" | null;
    const targetPlumberId = (formData.get("targetPlumberId") as string | null)?.trim() || "";

    const actor = (await resolvePortalActor(preferredRole || undefined)) || preAuthActor;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WebP images are allowed." },
        { status: 400 }
      );
    }
    if (file.size > MAX_AVATAR_BYTES) {
      return NextResponse.json(
        { error: "Profile photo must be 5 MB or smaller." },
        { status: 400 }
      );
    }

    const effectiveRole: "admin" | "customer" | "plumber" =
      actor.role === "admin" && targetPlumberId ? "plumber" : actor.role;
    const effectiveId =
      actor.role === "admin" && targetPlumberId ? targetPlumberId : actor.id;

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const storagePath = `avatars/${effectiveRole}/${effectiveId}/${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabase = getServiceSupabase();

    // Use existing private bucket plumber-documents (or avatars if created)
    const bucket = "plumber-documents";
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, bytes, { contentType: file.type, upsert: true });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const avatarUrl = signed?.signedUrl || "";
    const table = getTableForRole(effectiveRole);

    const updateError = await updateProfileAvatarColumns(
      supabase,
      table,
      effectiveId,
      avatarUrl,
      storagePath
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    revalidatePath("/plumber");
    revalidatePath("/customer");
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin/profile");
    revalidatePath("/admin/communications");

    return NextResponse.json({ success: true, avatarUrl, storagePath });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to upload avatar" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const preferredRole =
      body?.role === "admin" || body?.role === "customer" || body?.role === "plumber"
        ? body.role
        : undefined;

    const actor = await resolvePortalActor(preferredRole);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targetPlumberId =
      typeof body?.targetPlumberId === "string" ? body.targetPlumberId.trim() : "";
    const effectiveRole: "admin" | "customer" | "plumber" =
      actor.role === "admin" && targetPlumberId ? "plumber" : actor.role;
    const effectiveId =
      actor.role === "admin" && targetPlumberId ? targetPlumberId : actor.id;

    const table = getTableForRole(effectiveRole);
    const supabase = getServiceSupabase();
    const updateError = await updateProfileAvatarColumns(supabase, table, effectiveId, null, null);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    revalidatePath("/plumber");
    revalidatePath("/customer");
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin/profile");
    revalidatePath("/admin/communications");

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to remove avatar" },
      { status: 500 }
    );
  }
}
