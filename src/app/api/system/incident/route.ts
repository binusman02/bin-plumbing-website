import { NextResponse } from "next/server";
import { reportSystemIncident } from "@/lib/ai-workforce/incident-monitor";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 30;

function readClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = readClientIp(request);
  const limit = await checkRateLimit("system_incident_client", 10, 60_000, ip);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as {
    source?: unknown;
    message?: unknown;
    routePath?: unknown;
    stack?: unknown;
    digest?: unknown;
  } | null;

  if (!body || typeof body.message !== "string" || !body.message.trim()) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const source =
    typeof body.source === "string" && body.source.trim()
      ? body.source.trim().slice(0, 100)
      : "client:web";
  const routePath =
    typeof body.routePath === "string" ? body.routePath.trim().slice(0, 160) : undefined;
  const stack = typeof body.stack === "string" ? body.stack.slice(0, 500) : undefined;
  const digest = typeof body.digest === "string" ? body.digest.slice(0, 60) : undefined;

  await reportSystemIncident({
    source,
    errorMessage: body.message,
    routePath,
    stack,
    context: digest ? { digest } : undefined,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
