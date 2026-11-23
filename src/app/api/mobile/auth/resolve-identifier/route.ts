import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/security";

/**
 * Deprecated unauthenticated phone-to-email lookup.
 * Phone sign-in now executes server-side via POST /api/mobile/auth/sign-in
 * so private email addresses are never exposed to unauthenticated callers.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const raw = String(body?.identifier || "").trim();

  const rate = await checkRateLimit("mobile_login_lookup", 20, 15 * 60 * 1000, raw || "anon");
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait a few minutes." },
      { status: 429 }
    );
  }

  if (raw.includes("@")) {
    return NextResponse.json({ email: raw.toLowerCase() });
  }

  return NextResponse.json(
    {
      error:
        "Phone lookup is disabled for security. Please use /api/mobile/auth/sign-in or update your app.",
    },
    { status: 410 }
  );
}
