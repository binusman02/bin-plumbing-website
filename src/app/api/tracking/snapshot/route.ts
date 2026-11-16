import {
  enforceTrackingRateLimit,
  noStoreJson,
  parseViewerHint,
  resolveTrackingActor,
} from "@/lib/tracking-api";
import { buildTrackingSnapshot } from "@/lib/live-location-server";

/**
 * Authorised, server-evaluated tracking data.
 *   customer -> only the plumber assigned to their own ACTIVE jobs
 *   plumber  -> only themselves and their own jobs
 *   admin    -> all active jobs; ?dispatch=1 also returns every approved plumber
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const hint = parseViewerHint(url.searchParams.get("as"));
    const actor = await resolveTrackingActor(hint);
    if (!actor) return noStoreJson({ error: "Not authenticated." }, 401);

    const limited = await enforceTrackingRateLimit("tracking_snapshot", actor.id, 90);
    if (limited) return limited;

    const dispatch = url.searchParams.get("dispatch") === "1";
    if (dispatch && actor.role !== "admin") {
      return noStoreJson({ error: "Forbidden." }, 403);
    }
    const ticket = url.searchParams.get("ticket") || undefined;

    const snapshot = await buildTrackingSnapshot(actor, { ticket, dispatch });
    return noStoreJson(snapshot);
  } catch (err) {
    console.error("[api/tracking/snapshot]", err instanceof Error ? err.message : err);
    return noStoreJson({ error: "Tracking is temporarily unavailable." }, 500);
  }
}
