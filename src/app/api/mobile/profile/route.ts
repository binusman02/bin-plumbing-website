import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { updateCustomerProfile } from "@/lib/marketplace";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "@/lib/customer-session";
import { getServiceSupabase } from "@/lib/supabase/admin";

function parseBankFromNotes(notes: unknown): {
  bankName: string;
  accountNumber: string;
  accountName: string;
} {
  const raw = typeof notes === "string" ? notes : "";
  const match = raw.match(/\[BANK_JSON:(.*?)\]/);
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1]);
      return {
        bankName: String(parsed.bankName || ""),
        accountNumber: String(parsed.accountNumber || ""),
        accountName: String(parsed.accountName || ""),
      };
    } catch {
      // ignore
    }
  }
  return { bankName: "", accountNumber: "", accountName: "" };
}

function embedBankInNotes(
  existingNotes: unknown,
  bank: { bankName: string; accountNumber: string; accountName: string }
): string {
  const clean = (typeof existingNotes === "string" ? existingNotes : "")
    .replace(/\s*\[BANK_JSON:.*?\]/g, "")
    .trim();
  const tag = `[BANK_JSON:${JSON.stringify(bank)}]`;
  return clean ? `${clean} ${tag}` : tag;
}

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

  const safeData: Record<string, unknown> = { ...data };
  delete safeData.password_hash;

  if (actor.role === "plumber") {
    const bank = parseBankFromNotes(data.notes);
    safeData.bank_name = data.bank_name || bank.bankName;
    safeData.account_number = data.account_number || bank.accountNumber;
    safeData.account_name = data.account_name || bank.accountName;
    safeData.address = data.residential_location || data.city_lga || "";
  }

  return NextResponse.json({ profile: safeData, role: actor.role });
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

    const supabase = getServiceSupabase();

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
      if (typeof body?.phone === "string" && body.phone.trim()) {
        await supabase
          .from("customers")
          .update({ phone: body.phone.trim() })
          .eq("id", actor.id);
      }
      return NextResponse.json({ success: true, profile: updated });
    }

    if (actor.role === "plumber") {
      const { data: current } = await supabase
        .from("plumbers")
        .select("notes")
        .eq("id", actor.id)
        .maybeSingle();

      const existingBank = parseBankFromNotes(current?.notes);
      const nextBank = {
        bankName:
          typeof body?.bankName === "string"
            ? body.bankName.trim()
            : existingBank.bankName,
        accountNumber:
          typeof body?.accountNumber === "string"
            ? body.accountNumber.trim()
            : existingBank.accountNumber,
        accountName:
          typeof body?.accountName === "string"
            ? body.accountName.trim()
            : existingBank.accountName,
      };

      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        notes: embedBankInNotes(current?.notes, nextBank),
      };
      if (typeof body?.fullName === "string" && body.fullName.trim()) {
        payload.full_name = body.fullName.trim();
      }
      if (typeof body?.phone === "string" && body.phone.trim()) {
        payload.phone = body.phone.trim();
      }
      if (typeof body?.email === "string" && body.email.trim()) {
        payload.email = body.email.trim();
      }
      if (typeof body?.address === "string") {
        payload.residential_location = body.address.trim();
      }
      if (typeof body?.cityLga === "string") {
        payload.city_lga = body.cityLga.trim();
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
      const safeData: Record<string, unknown> = { ...data };
      delete safeData.password_hash;
      safeData.bank_name = nextBank.bankName;
      safeData.account_number = nextBank.accountNumber;
      safeData.account_name = nextBank.accountName;
      return NextResponse.json({ success: true, profile: safeData });
    }

    return NextResponse.json({ error: "Unsupported role" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update profile" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

    const currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const newPassword =
      typeof body?.newPassword === "string" ? body.newPassword : "";

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const supabase = getServiceSupabase();
    const table = actor.role === "plumber" ? "plumbers" : "customers";
    const { data: row } = await supabase
      .from(table)
      .select("id, auth_user_id, password_hash")
      .eq("id", actor.id)
      .maybeSingle();

    if (
      row?.password_hash &&
      currentPassword &&
      !verifyCustomerPassword(currentPassword, String(row.password_hash))
    ) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    const authUserId = actor.authUserId || (row?.auth_user_id ? String(row.auth_user_id) : null);
    if (authUserId) {
      const { error: authErr } = await supabase.auth.admin.updateUserById(
        authUserId,
        { password: newPassword }
      );
      if (authErr) {
        return NextResponse.json({ error: authErr.message }, { status: 400 });
      }
    }

    await supabase
      .from(table)
      .update({
        password_hash: hashCustomerPassword(newPassword),
        updated_at: new Date().toISOString(),
      })
      .eq("id", actor.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update password" },
      { status: 500 }
    );
  }
}
