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

    // Stay on the local route window unless we're well off-route (> 45m) or a global
    // match is significantly closer (e.g., returning to the start or a genuine reroute).
    if (localProj.distanceMeters <= 25) {
      return localProj;
    }
    const globalProj = projectRange(pLat, pLng, route, 0, maxSeg);
    if (
      globalProj.distanceMeters <= NAV_CONFIG.ROUTE_SNAP_DISTANCE_M &&
      (localProj.distanceMeters > NAV_CONFIG.ROUTE_SNAP_DISTANCE_M * 1.5 ||
        globalProj.distanceMeters + 10 < localProj.distanceMeters)
    ) {
      return globalProj;
    }
    return localProj;
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

export type MovementState = "STATIONARY" | "LOW_SPEED" | "MOVING";

export type FixRejectionReason =
  | "invalid_coord"
  | "duplicate_or_older_timestamp"
  | "duplicate_stationary_coord"
  | "implausible_jump"
  | "poor_accuracy"
  | "stationary_noise";

export interface FixBufferState {
  prevFix: LocalFix | null;
  latestFix: LocalFix | null;
  rawLatestFix: LocalFix | null;
  movementState: MovementState;
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
    rawLatestFix: null,
    movementState: "STATIONARY",
    lastAccurateFixAtMs: 0,
    fromLat: 0,
    fromLng: 0,
    renderStartMs: 0,
    interpDurationMs: 400,
  };
}

/**
 * Ingests a new GPS fix into a time-ordered buffer, preserving movement continuity
 * from `currentDisplayed` (in GPS coordinate space, never route-snapped space) while
 * rejecting duplicates, out-of-order timestamps, impossible jumps, and poor-accuracy spikes.
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
    enableStationaryStabilizer?: boolean;
  }
): { accepted: boolean; rejectionReason: FixRejectionReason | null; nextState: FixBufferState } {
  if (!isValidCoord(fix.lat, fix.lng)) {
    return { accepted: false, rejectionReason: "invalid_coord", nextState: state };
  }

  const prevRaw = state.rawLatestFix ?? state.latestFix;
  const prev = state.latestFix;
  if (prevRaw) {
    // Reject duplicate or out-of-order timestamps
    if (fix.timestampMs <= prevRaw.timestampMs) {
      return {
        accepted: false,
        rejectionReason: "duplicate_or_older_timestamp",
        nextState: state,
      };
    }
    // Reject exact duplicate coordinates within 250 ms
    if (
      Math.abs(fix.lat - prevRaw.lat) < 1e-7 &&
      Math.abs(fix.lng - prevRaw.lng) < 1e-7 &&
      fix.timestampMs - prevRaw.timestampMs < 250
    ) {
      return {
        accepted: false,
        rejectionReason: "duplicate_stationary_coord",
        nextState: state,
      };
    }
  }

  const acceptable = isAcceptableNavFix(fix, prevRaw);
  let nextAccurateAt = state.lastAccurateFixAtMs;

  if (!acceptable) {
    // Reject impossible jumps always; only allow accuracy > 100 m if no accurate fix
    // was received within `allowWarmupAccuracyMs` (so indoor warm-up doesn't freeze).
    const onlyAccuracyFailed = isAcceptableNavFix({ ...fix, accuracy: 50 }, prevRaw);
    if (!onlyAccuracyFailed) {
      return { accepted: false, rejectionReason: "implausible_jump", nextState: state };
    }
    const warmupWindow = options?.allowWarmupAccuracyMs ?? 0;
    const allowWarmup =
      warmupWindow > 0 &&
      (state.lastAccurateFixAtMs === 0 || nowPerfMs - state.lastAccurateFixAtMs > warmupWindow);
    if (!allowWarmup) {
      return { accepted: false, rejectionReason: "poor_accuracy", nextState: state };
    }
  } else {
    nextAccurateAt = nowPerfMs;
  }

  // Stationary & Low-Speed Stabilizer: compare raw displacement against accuracy noise floor,
  // and track explicit MOVEMENT state without compounding smoothing across raw fixes.
  let stabilizedFix = fix;
  let nextMovementState: MovementState = "MOVING";
  if (prevRaw && prev) {
    const movedFromPrevRawM = distMeters(prevRaw.lat, prevRaw.lng, fix.lat, fix.lng);
    const movedFromAnchorM = distMeters(prev.lat, prev.lng, fix.lat, fix.lng);
    const dtSec = Math.max(0.25, (fix.timestampMs - prevRaw.timestampMs) / 1000);
    const accM =
      typeof fix.accuracy === "number" && Number.isFinite(fix.accuracy) ? fix.accuracy : 10;
    // Ignore unreliable speed readings when accuracy is poor (> 100 m)
    const trustedSpeed =
      fix.speed != null && Number.isFinite(fix.speed) && accM <= NAV_CONFIG.MAX_DISPLAY_ACCURACY_M
        ? fix.speed
        : null;
    const effectiveSpeed = trustedSpeed != null ? trustedSpeed : movedFromPrevRawM / dtSec;
    // Responsive deadband: suppresses sub-2m standing jitter without freezing slow walking
    const deadbandM = Math.min(3, Math.max(1.2, accM * 0.12));

    if (options?.enableStationaryStabilizer !== false) {
      const lowReportedSpeed = trustedSpeed == null || trustedSpeed < 0.8;
      if (
        movedFromAnchorM < deadbandM &&
        lowReportedSpeed &&
        fix.timestampMs - prevRaw.timestampMs < 15_000
      ) {
        return {
          accepted: false,
          rejectionReason: "stationary_noise",
          nextState: { ...state, movementState: "STATIONARY" },
        };
      }
      if (effectiveSpeed < 0.4) {
        nextMovementState = "STATIONARY";
      } else if (effectiveSpeed < 2.0) {
        nextMovementState = "LOW_SPEED";
        const alpha = 0.72;
        stabilizedFix = {
          ...fix,
          speed: trustedSpeed,
          lat: prev.lat + (fix.lat - prev.lat) * alpha,
          lng: prev.lng + (fix.lng - prev.lng) * alpha,
        };
      } else {
        nextMovementState = "MOVING";
        stabilizedFix = { ...fix, speed: trustedSpeed };
      }
    }
  } else if (fix.speed != null && Number.isFinite(fix.speed)) {
    nextMovementState =
      fix.speed < 0.5 ? "STATIONARY" : fix.speed < 2.0 ? "LOW_SPEED" : "MOVING";
  }

  const minDur = options?.minDurationMs ?? 250;
  const maxDur = options?.maxDurationMs ?? 2_000;
  const rawDelta = prevRaw ? fix.timestampMs - prevRaw.timestampMs : 400;
  const interpDurationMs = Math.max(minDur, Math.min(maxDur, rawDelta));

  const fromLat = options?.currentDisplayed
    ? options.currentDisplayed.lat
    : prev
    ? prev.lat
    : stabilizedFix.lat;
  const fromLng = options?.currentDisplayed
    ? options.currentDisplayed.lng
    : prev
    ? prev.lng
    : stabilizedFix.lng;

  return {
    accepted: true,
    rejectionReason: null,
    nextState: {
      prevFix: prev,
      latestFix: stabilizedFix,
      rawLatestFix: fix,
      movementState: nextMovementState,
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
): {
  lat: number;
  lng: number;
  progress: number;
  extrapolating: boolean;
  stale: boolean;
} | null {
  const latest = state.latestFix;
  if (!latest) return null;

  const elapsed = Math.max(0, nowPerfMs - state.renderStartMs);
  if (elapsed < state.interpDurationMs) {
    const t = Math.min(1, elapsed / Math.max(1, state.interpDurationMs));
    return {
      lat: state.fromLat + (latest.lat - state.fromLat) * t,
      lng: state.fromLng + (latest.lng - state.fromLng) * t,
      progress: t,
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
    progress: 1,
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

/**
 * Complementary filter fusing W3C Gyroscope z-axis angular velocity (`rad/s`,
 * right-hand rule: clockwise rotation is negative Z, so compass heading delta
 * is `-gyroZ * 180 / PI * dtSec`) with absolute reference (GPS course > 1 m/s
 * or magnetometer compass).
 */
export function fuseGyroCompassHeading(params: {
  currentDeg: number | null;
  gyroZRadPerSec?: number | null;
  dtSec?: number;
  compassDeg?: number | null;
  gpsHeadingDeg?: number | null;
  speedMps?: number | null;
  correctionAlpha?: number;
}): number | null {
  const {
    currentDeg,
    gyroZRadPerSec,
    dtSec = 0,
    compassDeg,
    gpsHeadingDeg,
    speedMps,
    correctionAlpha = 0.04,
  } = params;

  const useGps =
    speedMps != null &&
    Number.isFinite(speedMps) &&
    speedMps > NAV_CONFIG.MIN_MOVING_SPEED_MPS &&
    gpsHeadingDeg != null &&
    Number.isFinite(gpsHeadingDeg);

  const referenceDeg = useGps
    ? normalizeHeading(gpsHeadingDeg!)
    : compassDeg != null && Number.isFinite(compassDeg)
    ? normalizeHeading(compassDeg)
    : null;

  if (currentDeg == null || !Number.isFinite(currentDeg)) {
    return referenceDeg;
  }

  let predicted = currentDeg;
  if (
    gyroZRadPerSec != null &&
    Number.isFinite(gyroZRadPerSec) &&
    dtSec > 0 &&
    dtSec < 0.5
  ) {
    const deltaDeg = -(gyroZRadPerSec * 180 * dtSec) / Math.PI;
    predicted = normalizeHeading(currentDeg + deltaDeg);
  }

  if (referenceDeg == null) {
    return predicted;
  }

  const err = shortestAngleDelta(predicted, referenceDeg);
  return normalizeHeading(predicted + err * Math.min(1, Math.max(0.01, correctionAlpha)));
}

export interface StepOffset {
  dLat: number;
  dLng: number;
}

export interface StepDetectorState {
  armed: boolean;
  lastStepAtMs: number;
}

export function createStepDetectorState(): StepDetectorState {
  return { armed: true, lastStepAtMs: 0 };
}

/**
 * Hysteresis + refractory step detector for linear acceleration magnitude (m/s^2,
 * gravity removed). Arms below `0.9` m/s^2 and triggers once per footstep peak
 * in `[1.6, 18.0]` m/s^2 with a `320 ms` minimum cadence.
 */
export function processStepAcceleration(
  state: StepDetectorState,
  linearAccelMagMps2: number,
  nowMs: number
): { stepped: boolean; nextState: StepDetectorState } {
  if (!Number.isFinite(linearAccelMagMps2)) {
    return { stepped: false, nextState: state };
  }
  if (linearAccelMagMps2 < 0.9) {
    return {
      stepped: false,
      nextState: state.armed ? state : { ...state, armed: true },
    };
  }
  if (
    state.armed &&
    linearAccelMagMps2 >= 1.6 &&
    linearAccelMagMps2 <= 18.0 &&
    nowMs - state.lastStepAtMs >= 320
  ) {
    return {
      stepped: true,
      nextState: { armed: false, lastStepAtMs: nowMs },
    };
  }
  return { stepped: false, nextState: state };
}

/**
 * Advances a bounded indoor pedestrian dead-reckoning offset by `stepMeters` along
 * `headingDeg` (0 = North, 90 = East), clamped to `maxDriftM` from the last GPS anchor.
 */
export function advanceStepOffset(
  current: StepOffset,
  refLat: number,
  headingDeg: number,
  stepMeters = 0.65,
  maxDriftM = 12
): StepOffset {
  if (!Number.isFinite(headingDeg) || !Number.isFinite(refLat) || stepMeters <= 0 || maxDriftM <= 0) {
    return current;
  }
  const rad = (headingDeg * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLng = Math.max(10_000, 111_320 * Math.cos((refLat * Math.PI) / 180));

  const nextNorthM = current.dLat * metersPerDegLat + Math.cos(rad) * stepMeters;
  const nextEastM = current.dLng * metersPerDegLng + Math.sin(rad) * stepMeters;
  const totalM = Math.hypot(nextNorthM, nextEastM);

  const scale = totalM > maxDriftM ? maxDriftM / totalM : 1;
  return {
    dLat: (nextNorthM * scale) / metersPerDegLat,
    dLng: (nextEastM * scale) / metersPerDegLng,
  };
}
