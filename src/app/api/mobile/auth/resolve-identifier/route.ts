import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security";

function normalizeNigerianDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = String(body?.identifier || "").trim();
  const expectedRole = body?.expectedRole === "plumber" ? "plumber" : "customer";

  if (!raw) {
    return NextResponse.json({ error: "Identifier is required." }, { status: 400 });
  }

  const rate = await checkRateLimit("mobile_login_lookup", 20, 15 * 60 * 1000, raw);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  if (raw.includes("@")) {
    return NextResponse.json({ email: raw.toLowerCase() });
  }

  const normalized = normalizeNigerianDigits(raw);
  if (normalized.length < 10) {
    return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
  }

  const adminSupabase = getServiceSupabase();

  if (expectedRole === "plumber") {
    const { data: plumbers } = await adminSupabase
      .from("plumbers")
      .select("email, phone")
      .is("deleted_at", null);
    const match = (plumbers || []).find(
      (p) => normalizeNigerianDigits(String(p.phone || "")) === normalized
    );
    if (match) {
      const email = match.email
        ? String(match.email).toLowerCase()
        : `p_${normalized}@plumber.binplumbing.local`;
      return NextResponse.json({ email });
    }
    return NextResponse.json({ error: "Invalid sign-in details." }, { status: 404 });
  }

  const { data: customers } = await adminSupabase
    .from("customers")
    .select("email, phone")
    .is("deleted_at", null);
  const custMatch = (customers || []).find(
    (c) => normalizeNigerianDigits(String(c.phone || "")) === normalized
  );
  if (custMatch) {
    const email = custMatch.email
      ? String(custMatch.email).toLowerCase()
      : `c_${normalized}@customer.binplumbing.local`;
    return NextResponse.json({ email });
  }

  return NextResponse.json({ error: "Invalid sign-in details." }, { status: 404 });
}
