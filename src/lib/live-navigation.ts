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
    // Reject out-of-order / stale cached fixes so the dot never snaps backwards
    if (fix.timestampMs < prevFix.timestampMs) {
      return false;
    }
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

export interface RouteProjectionOptions {
  /** Previous matched segment index for route continuity. */
  prevSegmentIndex?: number | null;
  /** Number of segments ahead to search first (default: 18). */
  forwardLookaheadSegments?: number;
  /** Small backward tolerance in segments for GPS noise (default: 2). */
  backwardToleranceSegments?: number;
}

function projectRange(
  pLat: number,
  pLng: number,
  route: [number, number][],
  startSeg: number,
  endSeg: number
): RouteProjection {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * cosLat;

  let bestDist = Infinity;
  let bestPoint: [number, number] = route[startSeg];
  let bestSeg = startSeg;
  let bestT = 0;

  for (let i = startSeg; i <= endSeg; i++) {
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

/**
 * Projects `[lat, lng]` onto a polyline `[lat, lng][]` using local equirectangular
 * coordinates. When `options.prevSegmentIndex` is supplied, searches a forward-biased
 * window first to preserve route continuity and avoid snapping to parallel roads.
 */
export function projectPointOntoRoute(
  point: [number, number],
  route: [number, number][],
  options?: RouteProjectionOptions
): RouteProjection | null {
  if (!route || route.length < 2) return null;
  const [pLat, pLng] = point;
  if (!isValidCoord(pLat, pLng)) return null;

  const maxSeg = route.length - 2;
  const prevSeg = options?.prevSegmentIndex;

  if (typeof prevSeg === "number" && Number.isInteger(prevSeg) && prevSeg >= 0 && prevSeg <= maxSeg) {
    const back = Math.max(0, options?.backwardToleranceSegments ?? 2);
    const ahead = Math.max(1, options?.forwardLookaheadSegments ?? 18);
    const winStart = Math.max(0, prevSeg - back);
    const winEnd = Math.min(maxSeg, prevSeg + ahead);
    const localProj = projectRange(pLat, pLng, route, winStart, winEnd);

    // Stay on the local route window unless we're well off-route (> 45m) and a global
    // match is actually within snap distance (e.g., after a genuine shortcut/reroute).
    if (localProj.distanceMeters <= NAV_CONFIG.ROUTE_SNAP_DISTANCE_M * 1.5) {
      return localProj;
    }
    const globalProj = projectRange(pLat, pLng, route, 0, maxSeg);
    return globalProj.distanceMeters <= NAV_CONFIG.ROUTE_SNAP_DISTANCE_M ? globalProj : localProj;
  }

  return projectRange(pLat, pLng, route, 0, maxSeg);
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

// ---------------------------------------------------------------------------
// Continuous GPS Fix Buffer & Damped-Spring Camera Controller
// ---------------------------------------------------------------------------

export interface FixBufferState {
  prevFix: LocalFix | null;
  latestFix: LocalFix | null;
  lastAccurateFixAtMs: number;
  fromLat: number;
  fromLng: number;
  renderStartMs: number;
  interpDurationMs: number;
}

export function createFixBufferState(): FixBufferState {
  return {
    prevFix: null,
    latestFix: null,
    lastAccurateFixAtMs: 0,
    fromLat: 0,
    fromLng: 0,
    renderStartMs: 0,
    interpDurationMs: 400,
  };
}

/**
 * Ingests a new GPS fix into a time-ordered buffer, preserving movement continuity
 * from `currentDisplayedPos` while rejecting duplicates, out-of-order timestamps,
 * impossible jumps, and poor-accuracy spikes.
 */
export function pushFixToBuffer(
  state: FixBufferState,
  fix: LocalFix,
  nowPerfMs: number,
  options?: {
    currentDisplayed?: { lat: number; lng: number } | null;
    minDurationMs?: number;
    maxDurationMs?: number;
    allowWarmupAccuracyMs?: number;
  }
): { accepted: boolean; nextState: FixBufferState } {
  if (!isValidCoord(fix.lat, fix.lng)) {
    return { accepted: false, nextState: state };
  }

  const prev = state.latestFix;
  if (prev) {
    // Reject duplicate or out-of-order timestamps
    if (fix.timestampMs <= prev.timestampMs) {
      return { accepted: false, nextState: state };
    }
    // Reject exact duplicate coordinates if speed is 0 / unchanged
    if (
      Math.abs(fix.lat - prev.lat) < 1e-7 &&
      Math.abs(fix.lng - prev.lng) < 1e-7 &&
      fix.timestampMs - prev.timestampMs < 250
    ) {
      return { accepted: false, nextState: state };
    }
  }

  const acceptable = isAcceptableNavFix(fix, prev);
  let nextAccurateAt = state.lastAccurateFixAtMs;

  if (!acceptable) {
    // Reject impossible jumps always; only allow accuracy > 100 m if no accurate fix
    // was received within `allowWarmupAccuracyMs` (so indoor warm-up doesn't freeze).
    const onlyAccuracyFailed = isAcceptableNavFix({ ...fix, accuracy: 50 }, prev);
    const warmupWindow = options?.allowWarmupAccuracyMs ?? 0;
    const allowWarmup =
      warmupWindow > 0 &&
      (state.lastAccurateFixAtMs === 0 || nowPerfMs - state.lastAccurateFixAtMs > warmupWindow);
    if (!onlyAccuracyFailed || !allowWarmup) {
      return { accepted: false, nextState: state };
    }
  } else {
    nextAccurateAt = nowPerfMs;
  }

  const minDur = options?.minDurationMs ?? 250;
  const maxDur = options?.maxDurationMs ?? 2_000;
  const rawDelta = prev ? fix.timestampMs - prev.timestampMs : 400;
  // Adaptive interpolation window slightly cushions jitter while staying responsive
  const interpDurationMs = Math.max(minDur, Math.min(maxDur, rawDelta));

  const fromLat = options?.currentDisplayed ? options.currentDisplayed.lat : prev ? prev.lat : fix.lat;
  const fromLng = options?.currentDisplayed ? options.currentDisplayed.lng : prev ? prev.lng : fix.lng;

  return {
    accepted: true,
    nextState: {
      prevFix: prev,
      latestFix: fix,
      lastAccurateFixAtMs: nextAccurateAt,
      fromLat,
      fromLng,
      renderStartMs: nowPerfMs,
      interpDurationMs,
    },
  };
}

/**
 * Samples the continuous position at `nowPerfMs`: linear time-based interpolation
 * during `[renderStartMs, renderStartMs + interpDurationMs]`, followed by bounded
 * dead reckoning up to `maxExtrapolationMs` (stopping when stationary or accuracy > 100 m).
 */
export function sampleBufferedPosition(
  state: FixBufferState,
  nowPerfMs: number,
  maxExtrapolationMs: number,
  overrideHeadingDeg?: number | null
): { lat: number; lng: number; extrapolating: boolean; stale: boolean } | null {
  const latest = state.latestFix;
  if (!latest) return null;

  const elapsed = Math.max(0, nowPerfMs - state.renderStartMs);
  if (elapsed < state.interpDurationMs) {
    const t = Math.min(1, elapsed / Math.max(1, state.interpDurationMs));
    return {
      lat: state.fromLat + (latest.lat - state.fromLat) * t,
      lng: state.fromLng + (latest.lng - state.fromLng) * t,
      extrapolating: false,
      stale: false,
    };
  }

  const extraMs = elapsed - state.interpDurationMs;
  const ext = extrapolatePosition({
    lat: latest.lat,
    lng: latest.lng,
    speedMps: latest.speed,
    headingDeg: overrideHeadingDeg ?? latest.heading,
    elapsedMs: extraMs,
    accuracyMeters: latest.accuracy,
    maxExtrapolationMs,
  });

  return {
    lat: ext.lat,
    lng: ext.lng,
    extrapolating: ext.extrapolated && extraMs < maxExtrapolationMs,
    stale: extraMs >= maxExtrapolationMs,
  };
}

export function computeFrameAlpha(deltaMs: number, timeConstantMs: number): number {
  if (deltaMs <= 0 || timeConstantMs <= 0) return 1;
  return 1 - Math.exp(-deltaMs / timeConstantMs);
}

export interface CameraPose {
  lat: number;
  lng: number;
  bearing: number;
}

/**
 * Smoothly steps camera centre & bearing toward `target` using an exponential
 * damped spring (`alpha = 1 - exp(-dt / tau)`) and shortest-angle rotation.
 */
export function stepCameraFollow(
  current: CameraPose | null,
  target: CameraPose,
  deltaMs: number,
  options?: { posTauMs?: number; bearingTauMs?: number }
): CameraPose {
  if (!current) {
    return {
      lat: target.lat,
      lng: target.lng,
      bearing: normalizeHeading(target.bearing),
    };
  }
  const posAlpha = computeFrameAlpha(deltaMs, options?.posTauMs ?? 140);
  const bearingAlpha = computeFrameAlpha(deltaMs, options?.bearingTauMs ?? 120);
  const dBearing = shortestAngleDelta(current.bearing, target.bearing);

  return {
    lat: current.lat + (target.lat - current.lat) * posAlpha,
    lng: current.lng + (target.lng - current.lng) * posAlpha,
    bearing: normalizeHeading(current.bearing + dBearing * bearingAlpha),
  };
}
