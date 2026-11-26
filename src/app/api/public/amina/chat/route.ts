import { NextResponse } from "next/server";
import {
  defaultPublicAminaStore,
  handlePublicAminaTurn,
} from "@/lib/ai-workforce/public-amina";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

const COOKIE_NAME = "fg_amina_session";

function readTokenFromRequest(request: Request): string | null {
  const headerToken = request.headers.get("x-amina-session")?.trim();
  if (headerToken && /^amina_[a-zA-Z0-9_-]{8,}$/.test(headerToken)) {
    return headerToken;
  }
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) {
      const val = decodeURIComponent(rest.join("=") || "").trim();
      if (/^amina_[a-zA-Z0-9_-]{8,}$/.test(val)) return val;
    }
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("sessionToken")?.trim();
  const token =
    (queryToken && /^amina_[a-zA-Z0-9_-]{8,}$/.test(queryToken) ? queryToken : null) ||
    readTokenFromRequest(request);

  if (!token) {
    return NextResponse.json({
      ok: true,
      sessionToken: null,
      ticketNumber: null,
      visitorProfile: null,
      messages: [],
    });
  }

  const session = await defaultPublicAminaStore.findSessionByToken(token);
  if (!session) {
    return NextResponse.json({
      ok: true,
      sessionToken: token,
      ticketNumber: null,
      visitorProfile: null,
      messages: [],
    });
  }

  const messages = await defaultPublicAminaStore.listMessages(session.id, 40);
  return NextResponse.json({
    ok: true,
    sessionToken: session.sessionToken,
    ticketNumber: session.ticketNumber,
    visitorProfile: {
      fullName: session.visitorName,
      phone: session.visitorPhone,
      email: session.visitorEmail,
    },
    messages,
  });
}

export async function POST(request: Request) {
  const rate = await checkRateLimit("public_amina_chat", 20, 10 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${rate.retryAfterSeconds}s before sending another message.`,
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    source?: "text" | "voice";
    sessionToken?: string;
    history?: Array<{ role?: string; content?: string; source?: string }>;
  };
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Please write or record a message." }, { status: 400 });
  }

  const bodyToken =
    typeof body?.sessionToken === "string" &&
    /^amina_[a-zA-Z0-9_-]{8,}$/.test(body.sessionToken.trim())
      ? body.sessionToken.trim()
      : null;
  const sessionToken = bodyToken || readTokenFromRequest(request);

  const clientHistory = Array.isArray(body?.history)
    ? body.history
        .filter(
          (item): item is { role: "customer" | "assistant"; content: string; source?: "text" | "voice" } =>
            Boolean(item) &&
            (item.role === "customer" || item.role === "assistant") &&
            typeof item.content === "string" &&
            item.content.trim().length > 0
        )
        .slice(-12)
        .map((item) => ({
          role: item.role,
          content: item.content.trim().slice(0, 700),
          source: (item.source === "voice" ? "voice" : "text") as "text" | "voice",
        }))
    : undefined;

  const result = await handlePublicAminaTurn({
    sessionToken,
    customerMessage: message,
    source: body?.source === "voice" ? "voice" : "text",
    clientHistory,
  });

  const res = NextResponse.json({
    ok: true,
    sessionToken: result.sessionToken,
    reply: result.reply,
    readyToBook: result.readyToBook,
    bookingDraft: result.bookingDraft,
    ticketNumber: result.ticketNumber,
    messages: result.messages,
  });

  res.cookies.set(COOKIE_NAME, result.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return res;
}
