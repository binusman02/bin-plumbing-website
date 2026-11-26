import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  findCustomerByIdentifier,
  findPlumberByIdentifier,
  normalizeNigerianDigits,
} from "@/lib/auth-lookup";
import { getVerifiedAppRole } from "@/lib/auth-role";
import { captureActionError } from "@/lib/ai-workforce/incident-monitor";
import { checkRateLimit } from "@/lib/security";
import {
  getRequiredAnonKey,
  getRequiredSupabaseUrl,
  getServiceSupabase,
} from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const raw = String(body?.identifier || "").trim();
    const password = String(body?.password || "");
    const expectedRole = body?.expectedRole === "plumber" ? "plumber" : "customer";

    if (!raw || !password) {
      return NextResponse.json(
        { error: "Phone/email and password are required." },
        { status: 400 }
      );
    }

    const rate = await checkRateLimit("mobile_login", 10, 15 * 60 * 1000, raw);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Please wait a few minutes." },
        { status: 429 }
      );
    }

    let emailToUse = raw.includes("@") ? raw.toLowerCase() : "";

    if (!emailToUse) {
      const normalized = normalizeNigerianDigits(raw);
      if (normalized.length < 10) {
        return NextResponse.json({ error: "Invalid phone number." }, { status: 400 });
      }
      if (expectedRole === "plumber") {
        const plumber = await findPlumberByIdentifier(raw);
        if (!plumber) {
          return NextResponse.json({ error: "Invalid sign-in details." }, { status: 401 });
        }
        if (plumber.verification_status === "suspended") {
          return NextResponse.json({ error: "Account is suspended." }, { status: 403 });
        }
        emailToUse = plumber.email
          ? plumber.email.toLowerCase()
          : `p_${normalized}@plumber.binplumbing.local`;
      } else {
        const cust = await findCustomerByIdentifier(raw);
        emailToUse = cust?.email
          ? cust.email.toLowerCase()
          : `c_${normalized}@customer.binplumbing.local`;
      }
    }

    const anonClient = createClient(getRequiredSupabaseUrl(), getRequiredAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: emailToUse,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json({ error: "Invalid sign-in details." }, { status: 401 });
    }

    const appRole = getVerifiedAppRole(data.user);
    if (appRole && appRole !== expectedRole) {
      return NextResponse.json(
        { error: `This account is not registered for the ${expectedRole} app.` },
        { status: 403 }
      );
    }

    if (expectedRole === "plumber") {
      const adminSupabase = getServiceSupabase();
      const { data: plumberRow } = await adminSupabase
        .from("plumbers")
        .select("id, verification_status, deleted_at")
        .eq("auth_user_id", data.user.id)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      if (plumberRow?.verification_status === "suspended") {
        return NextResponse.json({ error: "Account is suspended." }, { status: 403 });
      }
    }

    return NextResponse.json({
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (err) {
    void captureActionError("/api/mobile/auth/sign-in:POST", err, { area: "mobile" });
    return NextResponse.json({ error: "Sign-in failed." }, { status: 500 });
  }
}
