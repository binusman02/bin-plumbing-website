/**
 * Road routing service (server side).
 *
 * Provider is configurable so it can be swapped without touching the map:
 *   ROUTING_PROVIDER = osrm (default) | openrouteservice | none
 *   ROUTING_OSRM_URL = base URL of an OSRM server (default: public demo server)
 *   ROUTING_API_KEY  = server-only key for openrouteservice (never NEXT_PUBLIC_)
 *   ROUTING_ORS_URL  = optional override for a self-hosted ORS
 *
 * IMPORTANT: the public OSRM demo server (router.project-osrm.org) has NO SLA and a
 * fair-use policy. It is suitable for development/testing only. For production use
 * a paid/hosted OSRM, openrouteservice (free tier + paid plans) or self-host OSRM
 * with a Nigeria extract. None of these providers returns live-traffic ETAs, so
 * durations are *estimated journey times*, never traffic-aware guarantees.
 *
 * Privacy: only the plumber's and the property's coordinates are sent to the
 * provider, with no names, phone numbers or ticket references.
 */

export interface RouteStep {
  instruction: string;
  distanceM: number;
}

export interface RoadRoute {
  provider: string;
  distanceM: number;
  durationS: number;
  /** [lat, lng] pairs, ready for Leaflet. */
  points: [number, number][];
  steps: RouteStep[];
  /** Always false: no supported provider returns live-traffic durations. */
  trafficAware: false;
  computedAt: string;
}

export type RouteResult =
  | { ok: true; route: RoadRoute; cached: boolean }
  | { ok: false; reason: "disabled" | "unavailable" | "no_route" };

const MAX_POINTS = 400;
const CACHE_TTL_MS = 45_000;
const FAILURE_TTL_MS = 20_000;
const REQUEST_TIMEOUT_MS = 8_000;

type Coord = { lat: number; lng: number };

interface CacheEntry {
  at: number;
  result: RouteResult;
}
const routeCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RouteResult>>();

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------
export function decimatePoints(points: [number, number][], max = MAX_POINTS): [number, number][] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

function geojsonToLatLng(coords: unknown): [number, number][] {
  if (!Array.isArray(coords)) return [];
  const out: [number, number][] = [];
  for (const c of coords) {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number" &&
      Number.isFinite(c[0]) &&
      Number.isFinite(c[1])
    ) {
      out.push([c[1], c[0]]);
    }
  }
  return out;
}

function osrmInstruction(step: any): string {
  const m = step?.maneuver || {};
  const type = String(m.type || "");
  const modifier = String(m.modifier || "").replace("slight ", "slightly ");
  const name = step?.name ? ` onto ${step.name}` : "";
  switch (type) {
    case "depart":
      return `Head ${modifier || "out"}${step?.name ? ` on ${step.name}` : ""}`.trim();
    case "arrive":
      return "Arrive at the destination";
    case "roundabout":
    case "rotary":
      return `Enter the roundabout${m.exit ? ` and take exit ${m.exit}` : ""}${name}`;
    case "turn":
    case "end of road":
    case "fork":
    case "on ramp":
    case "off ramp":
      return `Turn ${modifier || "ahead"}${name}`;
    case "merge":
      return `Merge ${modifier || ""}${name}`.trim();
    default:
      return `Continue ${modifier || "straight"}${name}`.trim();
  }
}

export function parseOsrmRoute(json: any, provider = "osrm"): RoadRoute | null {
  const r = json?.routes?.[0];
  if (!r || json?.code !== "Ok") return null;
  const distanceM = Number(r.distance);
  const durationS = Number(r.duration);
  const points = geojsonToLatLng(r.geometry?.coordinates);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationS) || points.length < 2) {
    return null;
  }
  const steps: RouteStep[] = [];
  for (const leg of r.legs || []) {
    for (const s of leg.steps || []) {
      steps.push({ instruction: osrmInstruction(s), distanceM: Number(s.distance) || 0 });
    }
  }
  return {
    provider,
    distanceM,
    durationS,
    points: decimatePoints(points),
    steps: steps.slice(0, 40),
    trafficAware: false,
    computedAt: new Date().toISOString(),
  };
}

export function parseOrsRoute(json: any, provider = "openrouteservice"): RoadRoute | null {
  const f = json?.features?.[0];
  if (!f) return null;
  const summary = f.properties?.summary;
  const distanceM = Number(summary?.distance);
  const durationS = Number(summary?.duration);
  const points = geojsonToLatLng(f.geometry?.coordinates);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationS) || points.length < 2) {
    return null;
  }
  const steps: RouteStep[] = [];
  for (const seg of f.properties?.segments || []) {
    for (const s of seg.steps || []) {
      steps.push({
        instruction: String(s.instruction || "Continue"),
        distanceM: Number(s.distance) || 0,
      });
    }
  }
  return {
    provider,
    distanceM,
    durationS,
    points: decimatePoints(points),
    steps: steps.slice(0, 40),
    trafficAware: false,
    computedAt: new Date().toISOString(),
  };
}

export function routeCacheKey(a: Coord, b: Coord): string {
  const r = (n: number) => n.toFixed(4); // ~11 m buckets
  return `${r(a.lat)},${r(a.lng)}>${r(b.lat)},${r(b.lng)}`;
}

// ---------------------------------------------------------------------------
// Provider calls
// ---------------------------------------------------------------------------
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

async function callProvider(from: Coord, to: Coord): Promise<RouteResult> {
  const provider = (process.env.ROUTING_PROVIDER || "osrm").toLowerCase();

  if (provider === "none") return { ok: false, reason: "disabled" };

  try {
    if (provider === "openrouteservice") {
      const key = process.env.ROUTING_API_KEY;
      if (!key) {
        console.error("[routing] ROUTING_PROVIDER=openrouteservice but ROUTING_API_KEY is missing");
        return { ok: false, reason: "unavailable" };
      }
      const base = process.env.ROUTING_ORS_URL || "https://api.openrouteservice.org";
      const res = await fetchWithTimeout(`${base}/v2/directions/driving-car/geojson`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: key },
        body: JSON.stringify({
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
          instructions: true,
        }),
      });
      if (!res.ok) {
        console.error(`[routing] openrouteservice responded ${res.status}`);
        return { ok: false, reason: res.status === 404 ? "no_route" : "unavailable" };
      }
      const route = parseOrsRoute(await res.json());
      return route ? { ok: true, route, cached: false } : { ok: false, reason: "no_route" };
    }

    // default: OSRM-compatible server
    const base = (process.env.ROUTING_OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
    const url =
      `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson&steps=true`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      console.error(`[routing] osrm responded ${res.status}`);
      return { ok: false, reason: "unavailable" };
    }
    const json = await res.json();
    if (json?.code === "NoRoute") return { ok: false, reason: "no_route" };
    const route = parseOsrmRoute(json);
    return route ? { ok: true, route, cached: false } : { ok: false, reason: "unavailable" };
  } catch (err) {
    console.error("[routing] provider call failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * Cached + de-duplicated road route lookup. Safe to call from many requests:
 * identical (rounded) coordinate pairs reuse one provider call for 45 seconds and
 * provider failures are remembered for 20 seconds so we never hammer a down service.
 */
export async function getRoadRoute(from: Coord, to: Coord): Promise<RouteResult> {
  const key = routeCacheKey(from, to);
  const now = Date.now();

  const hit = routeCache.get(key);
  if (hit) {
    const ttl = hit.result.ok ? CACHE_TTL_MS : FAILURE_TTL_MS;
    if (now - hit.at < ttl) {
      return hit.result.ok ? { ...hit.result, cached: true } : hit.result;
    }
  }

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = callProvider(from, to)
    .then((result) => {
      routeCache.set(key, { at: Date.now(), result });
      if (routeCache.size > 300) {
        const oldest = [...routeCache.entries()].sort((x, y) => x[1].at - y[1].at)[0];
        if (oldest) routeCache.delete(oldest[0]);
      }
      return result;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}
