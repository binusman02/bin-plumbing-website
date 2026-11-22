import {
  enforceTrackingRateLimit,
  noStoreJson,
  parseViewerHint,
  resolveTrackingActor,
} from "@/lib/tracking-api";
import { resolveRouteEndpoints } from "@/lib/live-location-server";
import { getRoadRoute } from "@/lib/routing";
import { haversineMeters, isValidCoordinate } from "@/lib/live-location";
import type { RoutePayload } from "@/lib/tracking-types";

/**
 * Road route (distance, estimated duration, geometry, steps) for ONE ticket.
 * Coordinates are resolved on the server from the database after authorising the
 * caller for that ticket, so the endpoint cannot be used as an open routing proxy
 * or to look up other people's positions.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ticket = (url.searchParams.get("ticket") || "").trim();
    if (!ticket) return noStoreJson({ ok: false, reason: "forbidden" } satisfies RoutePayload, 400);

    const actor = await resolveTrackingActor(parseViewerHint(url.searchParams.get("as")));
    if (!actor) return noStoreJson({ error: "Not authenticated." }, 401);

    const limited = await enforceTrackingRateLimit("tracking_route", actor.id, 40);
    if (limited) return limited;

    const fromLatRaw = url.searchParams.get("fromLat");
    const fromLngRaw = url.searchParams.get("fromLng");
    const fromLat = fromLatRaw !== null ? Number(fromLatRaw) : NaN;
    const fromLng = fromLngRaw !== null ? Number(fromLngRaw) : NaN;
    const plumberOverride =
      actor.role === "plumber" && isValidCoordinate(fromLat, fromLng)
        ? { lat: fromLat, lng: fromLng }
        : null;

    const endpoints = await resolveRouteEndpoints(actor, ticket, plumberOverride);
    if (!endpoints.ok) {
      return noStoreJson({ ok: false, reason: endpoints.reason } satisfies RoutePayload, 200);
    }

    const straightLineM = Math.round(
      haversineMeters(endpoints.from.lat, endpoints.from.lng, endpoints.to.lat, endpoints.to.lng)
    );

    const result = await getRoadRoute(endpoints.from, endpoints.to);
    if (!result.ok) {
      return noStoreJson({ ok: false, reason: result.reason, straightLineM } satisfies RoutePayload);
    }
    const r = result.route;
    const payload: RoutePayload = {
      ok: true,
      distanceM: Math.round(r.distanceM),
      durationS: Math.round(r.durationS),
      points: r.points,
      steps: r.steps,
      provider: r.provider,
      trafficAware: r.trafficAware,
      computedAt: r.computedAt,
      straightLineM,
    };
    return noStoreJson(payload);
  } catch (err) {
    console.error("[api/tracking/route]", err instanceof Error ? err.message : err);
    return noStoreJson({ ok: false, reason: "unavailable" } satisfies RoutePayload, 200);
  }
}
