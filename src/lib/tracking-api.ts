import { NextResponse } from "next/server";
import { checkRateLimit, requireAdminUser } from "@/lib/security";
import { resolvePortalActor, type PortalActor } from "@/lib/portal-auth";

export type ViewerHint = "admin" | "customer" | "plumber";

export function parseViewerHint(value: string | null): ViewerHint | undefined {
  return value === "admin" || value === "customer" || value === "plumber" ? value : undefined;
}

/**
 * Resolves the verified actor from the session. The `as` query value is only a hint
 * to pick which session to use when a browser holds several; it is never trusted.
 */
export async function resolveTrackingActor(hint?: ViewerHint): Promise<PortalActor | null> {
  if (hint === "admin") {
    const admin = await requireAdminUser();
    return admin ? await resolvePortalActor("admin") : null;
  }
  if (hint) return resolvePortalActor(hint);
  return resolvePortalActor();
}

export function noStoreJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

export async function enforceTrackingRateLimit(
  scope: string,
  actorId: string,
  max: number
): Promise<NextResponse | null> {
  const limit = await checkRateLimit(scope, max, 60_000, actorId);
  if (limit.allowed) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down." },
    { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
  );
}
