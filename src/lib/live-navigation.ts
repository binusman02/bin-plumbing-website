/**
 * Pure navigation math helpers for Google-Maps-style MapLibre tracking.
 * Zero I/O or DOM dependencies so all functions can be unit tested directly.
 */
const MAX_PLAUSIBLE_SPEED_MPS = 70;

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const NAV_CONFIG = {
  /** Reject fixes worse than this accuracy (metres) for local dot/extrapolation. */
  MAX_DISPLAY_ACCURACY_M: 100,
  /** Maximum extrapolation window for own local dot (ms). */
  OWN_MAX_EXTRAPOLATION_MS: 3_000,
  /** Maximum extrapolation window for remote viewer (customer/admin) (ms). */
  REMOTE_MAX_EXTRAPOLATION_MS: 5_000,
  /** Speed below this (m/s) uses compass instead of GPS course and pauses extrapolation. */
  MIN_MOVING_SPEED_MPS: 1.0,
  /** Minimum speed to extrapolate position (m/s). */
  MIN_EXTRAPOLATE_SPEED_MPS: 0.5,
  /** Snap dot to route when within this distance (metres). */
  ROUTE_SNAP_DISTANCE_M: 30,
  /** Off-route threshold (metres). */
  OFF_ROUTE_DISTANCE_M: 50,
  /** Duration off-route before triggering reroute (ms). */
  OFF_ROUTE_DURATION_MS: 10_000,
  /** Minimum interval between automatic reroute requests (ms). */
  REROUTE_COOLDOWN_MS: 15_000,
} as const;

export function normalizeHeading(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod;
}

/** Signed shortest-angle delta in [-180, 180] from `fromDeg` to `toDeg`. */
export function shortestAngleDelta(fromDeg: number, toDeg: number): number {
  const from = normalizeHeading(fromDeg);
  const to = normalizeHeading(toDeg);
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/**
 * Low-pass filter over the shortest angular path.
 * `alpha` in (0, 1]; lower values smooth more aggressively.
 */
export function smoothHeading(
  prevDeg: number | null | undefined,
  nextDeg: number,
  alpha = 0.25
): number {
  const target = normalizeHeading(nextDeg);
  if (prevDeg == null || !Number.isFinite(prevDeg)) return target;
  const clampedAlpha = Math.min(1, Math.max(0.01, alpha));
  const delta = shortestAngleDelta(prevDeg, target);
  return normalizeHeading(prevDeg + delta * clampedAlpha);
}

export interface LocalFix {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestampMs: number;
}

/**
 * Rejects invalid coordinates, accuracy > 100 m, or implausible jumps (> 70 m/s).
 */
export function isAcceptableNavFix(
  fix: LocalFix,
  prevFix?: LocalFix | null
): boolean {
  if (!isValidCoord(fix.lat, fix.lng)) return false;
  if (
    typeof fix.accuracy === "number" &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy > NAV_CONFIG.MAX_DISPLAY_ACCURACY_M
  ) {
    return false;
  }
  if (prevFix) {
    const dtSec = Math.max(0.5, (fix.timestampMs - prevFix.timestampMs) / 1000);
    const dist = distMeters(prevFix.lat, prevFix.lng, fix.lat, fix.lng);
    // Allow a small grace buffer (30m) for initial GPS lock tightening
    if (dist > 30 && dist / dtSec > MAX_PLAUSIBLE_SPEED_MPS) {
      return false;
    }
  }
  return true;
}

/**
 * Extrapolates forward from a known fix using speed & heading, capped at `maxExtrapolationMs`.
 * Stops extrapolating when stationary (< 0.5 m/s) or when accuracy > 100 m.
 */
export function extrapolatePosition(params: {
  lat: number;
  lng: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  elapsedMs: number;
  accuracyMeters?: number | null;
  maxExtrapolationMs?: number;
}): { lat: number; lng: number; extrapolated: boolean } {
  const {
    lat,
    lng,
    speedMps,
    headingDeg,
    elapsedMs,
    accuracyMeters,
    maxExtrapolationMs = NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS,
  } = params;

  if (
    !isValidCoord(lat, lng) ||
    elapsedMs <= 0 ||
    typeof speedMps !== "number" ||
    !Number.isFinite(speedMps) ||
    speedMps < NAV_CONFIG.MIN_EXTRAPOLATE_SPEED_MPS ||
    typeof headingDeg !== "number" ||
    !Number.isFinite(headingDeg) ||
    (typeof accuracyMeters === "number" &&
      Number.isFinite(accuracyMeters) &&
      accuracyMeters > NAV_CONFIG.MAX_DISPLAY_ACCURACY_M)
  ) {
    return { lat, lng, extrapolated: false };
  }

  const cappedMs = Math.min(elapsedMs, maxExtrapolationMs);
  const distanceM = speedMps * (cappedMs / 1000);
  if (distanceM <= 0) return { lat, lng, extrapolated: false };

  const R = 6_371_000;
  const bearingRad = (normalizeHeading(headingDeg) * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDist = distanceM / R;

  const nextLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDist) +
      Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad)
  );
  const nextLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(nextLatRad)
    );

  return {
    lat: (nextLatRad * 180) / Math.PI,
    lng: (nextLngRad * 180) / Math.PI,
    extrapolated: true,
  };
}

export interface RouteProjection {
  snappedPoint: [number, number];
  distanceMeters: number;
  segmentIndex: number;
  tOnSegment: number;
}

/**
 * Projects `[lat, lng]` onto a polyline `[lat, lng][]` using local equirectangular
 * coordinates (accurate within Kano / city-scale distances).
 */
export function projectPointOntoRoute(
  point: [number, number],
  route: [number, number][]
): RouteProjection | null {
  if (!route || route.length < 2) return null;
  const [pLat, pLng] = point;
  if (!isValidCoord(pLat, pLng)) return null;

  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  let bestDist = Infinity;
  let bestPoint: [number, number] = route[0];
  let bestSeg = 0;
  let bestT = 0;

  for (let i = 0; i < route.length - 1; i++) {
    const [aLat, aLng] = route[i];
    const [bLat, bLng] = route[i + 1];
    const ax = (aLng - pLng) * mPerDegLng;
    const ay = (aLat - pLat) * mPerDegLat;
    const bx = (bLng - pLng) * mPerDegLng;
    const by = (bLat - pLat) * mPerDegLat;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? -(ax * dx + ay * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));

    const projLat = aLat + t * (bLat - aLat);
    const projLng = aLng + t * (bLng - aLng);
    const d = distMeters(pLat, pLng, projLat, projLng);
    if (d < bestDist) {
      bestDist = d;
      bestPoint = [projLat, projLng];
      bestSeg = i;
      bestT = t;
    }
  }

  return {
    snappedPoint: bestPoint,
    distanceMeters: bestDist,
    segmentIndex: bestSeg,
    tOnSegment: bestT,
  };
}

/** Splits a route into passed (`grey`) and remaining (`active`) segments at a projection. */
export function splitRouteAtProjection(
  route: [number, number][],
  proj: RouteProjection
): { passed: [number, number][]; remaining: [number, number][] } {
  const passed = route.slice(0, proj.segmentIndex + 1);
  passed.push(proj.snappedPoint);
  const remaining: [number, number][] = [
    proj.snappedPoint,
    ...route.slice(proj.segmentIndex + 1),
  ];
  return { passed, remaining };
}

export interface OffRouteState {
  offRouteSinceMs: number | null;
  lastRerouteAtMs: number;
}

export function updateOffRouteState(
  prev: OffRouteState,
  distanceToRouteMeters: number,
  nowMs: number
): { nextState: OffRouteState; shouldReroute: boolean } {
  if (distanceToRouteMeters <= NAV_CONFIG.OFF_ROUTE_DISTANCE_M) {
    return {
      nextState: { offRouteSinceMs: null, lastRerouteAtMs: prev.lastRerouteAtMs },
      shouldReroute: false,
    };
  }

  const offSince = prev.offRouteSinceMs ?? nowMs;
  const offDuration = nowMs - offSince;
  const cooldownElapsed = nowMs - prev.lastRerouteAtMs >= NAV_CONFIG.REROUTE_COOLDOWN_MS;

  if (offDuration >= NAV_CONFIG.OFF_ROUTE_DURATION_MS && cooldownElapsed) {
    return {
      nextState: { offRouteSinceMs: null, lastRerouteAtMs: nowMs },
      shouldReroute: true,
    };
  }

  return {
    nextState: { offRouteSinceMs: offSince, lastRerouteAtMs: prev.lastRerouteAtMs },
    shouldReroute: false,
  };
}
