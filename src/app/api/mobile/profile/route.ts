import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { updateCustomerProfile } from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roleHint = url.searchParams.get("role") as
    | "admin"
    | "customer"
    | "plumber"
    | null;
  const actor = await resolvePortalActor(roleHint || undefined);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceSupabase();
  const table = actor.role === "plumber" ? "plumbers" : "customers";
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", actor.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile: data, role: actor.role });
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const roleHint =
      body?.role === "customer" || body?.role === "plumber"
        ? body.role
        : undefined;
    const actor = await resolvePortalActor(roleHint);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actor.role === "customer") {
      const updated = await updateCustomerProfile(actor.id, {
        full_name:
          typeof body?.fullName === "string" ? body.fullName.trim() : undefined,
        email: typeof body?.email === "string" ? body.email.trim() : undefined,
        address_in_kano:
          typeof body?.address === "string" ? body.address.trim() : undefined,
        city_lga:
          typeof body?.cityLga === "string" ? body.cityLga.trim() : undefined,
        neighbourhood:
          typeof body?.neighbourhood === "string"
            ? body.neighbourhood.trim()
            : undefined,
        property_type:
          typeof body?.propertyType === "string"
            ? body.propertyType.trim()
            : undefined,
      });
      return NextResponse.json({ success: true, profile: updated });
    }

    if (actor.role === "plumber") {
      const supabase = getServiceSupabase();
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (typeof body?.fullName === "string") payload.full_name = body.fullName.trim();
      if (typeof body?.email === "string") payload.email = body.email.trim();
      if (typeof body?.address === "string") payload.address = body.address.trim();
      if (typeof body?.cityLga === "string") payload.city_lga = body.cityLga.trim();
      if (typeof body?.bankName === "string") payload.bank_name = body.bankName.trim();
      if (typeof body?.accountNumber === "string") {
        payload.account_number = body.accountNumber.trim();
      }
      if (typeof body?.accountName === "string") {
        payload.account_name = body.accountName.trim();
      }

      const { data, error } = await supabase
        .from("plumbers")
        .update(payload)
        .eq("id", actor.id)
        .select("*")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, profile: data });
    }

    return NextResponse.json({ error: "Unsupported role" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}
