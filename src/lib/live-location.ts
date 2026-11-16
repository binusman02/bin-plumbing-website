/**
 * Shared (client + server) live-location rules.
 *
 * Pure functions only: no I/O, no framework imports, so they can be unit tested
 * and reused by a future native Android/iOS client with the same thresholds.
 */

export const LOCATION_CONFIG = {
  /** Fix/heartbeat newer than this is LIVE. */
  LIVE_MAX_AGE_MS: 60_000,
  /** Older than LIVE but not older than this is STALE (updating). */
  STALE_MAX_AGE_MS: 180_000,
  /** Never send location updates more often than this. */
  MIN_SEND_INTERVAL_MS: 5_000,
  /** Send immediately once the device moved at least this far. */
  MIN_MOVE_METERS: 10,
  /** When stationary, send a heartbeat this often. */
  HEARTBEAT_INTERVAL_MS: 25_000,
  /** Fixes worse than this are not sent (shown as weak GPS). */
  MAX_ACCEPTABLE_ACCURACY_M: 2_500,
  /** Server rejects fixes whose implied speed exceeds this (m/s ~ 250 km/h). */
  MAX_PLAUSIBLE_SPEED_MPS: 70,
  /** Server rejects fixes whose GPS timestamp is older than this. */
  MAX_FIX_AGE_MS: 5 * 60_000,
  /** Server rejects fixes timestamped further in the future than this. */
  MAX_CLOCK_SKEW_MS: 60_000,
  /** Accuracy classes (metres). */
  GOOD_ACCURACY_M: 30,
  MODERATE_ACCURACY_M: 100,
  /** Customer-facing proximity states. */
  APPROACHING_METERS: 1_000,
  ARRIVED_METERS: 75,
  /** Client polling fallback (when realtime signals do not arrive). */
  POLL_INTERVAL_MS: 10_000,
} as const;

export type LocationStatus =
  | "live"
  | "stale"
  | "last_seen"
  | "unavailable"
  | "not_sharing";

export type AccuracyClass = "good" | "moderate" | "poor" | "unknown";

export const LOCATION_STATUS_LABEL: Record<LocationStatus, string> = {
  live: "LIVE",
  stale: "UPDATING",
  last_seen: "LAST SEEN",
  unavailable: "LOCATION UNAVAILABLE",
  not_sharing: "NOT SHARING",
};

/** Job statuses after which nobody may track the plumber for that job. */
export const TERMINAL_JOB_STATUSES = ["completed", "cancelled"] as const;

export function isActiveJobStatus(status: string | null | undefined): boolean {
  return !!status && !(TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    // (0,0) "null island" is what broken devices report; never a real job site.
    !(lat === 0 && lng === 0)
  );
}

// ---------------------------------------------------------------------------
// Validation of an incoming GPS fix (used by the server action)
// ---------------------------------------------------------------------------
export interface LocationInput {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  /** Epoch milliseconds produced by the phone's GPS (Position.timestamp). */
  timestamp?: number | null;
}

export interface ValidatedLocation {
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  speed: number | null;
  /** Epoch ms of the GPS fix. */
  fixTimeMs: number;
}

export type ValidationResult =
  | { ok: true; value: ValidatedLocation }
  | { ok: false; code: "invalid_coordinates" | "poor_accuracy" | "invalid_timestamp" | "stale_fix"; message: string };

function optionalNumber(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

export function validateLocationInput(
  raw: LocationInput,
  nowMs: number = Date.now()
): ValidationResult {
  if (!raw || !isValidCoordinate(raw.lat, raw.lng)) {
    return {
      ok: false,
      code: "invalid_coordinates",
      message: "The reported coordinates are not valid.",
    };
  }

  const accuracyM = optionalNumber(raw.accuracy, 0, 100_000);
  if (accuracyM != null && accuracyM > LOCATION_CONFIG.MAX_ACCEPTABLE_ACCURACY_M) {
    return {
      ok: false,
      code: "poor_accuracy",
      message: "GPS accuracy is currently low.",
    };
  }

  let fixTimeMs = nowMs;
  if (raw.timestamp != null) {
    if (typeof raw.timestamp !== "number" || !Number.isFinite(raw.timestamp) || raw.timestamp <= 0) {
      return {
        ok: false,
        code: "invalid_timestamp",
        message: "The reported GPS timestamp is not valid.",
      };
    }
    if (raw.timestamp > nowMs + LOCATION_CONFIG.MAX_CLOCK_SKEW_MS) {
      return {
        ok: false,
        code: "invalid_timestamp",
        message: "The reported GPS timestamp is in the future.",
      };
    }
    if (nowMs - raw.timestamp > LOCATION_CONFIG.MAX_FIX_AGE_MS) {
      return {
        ok: false,
        code: "stale_fix",
        message: "The GPS fix is too old to be saved.",
      };
    }
    // Never let a slightly-fast phone clock produce a "future" fix.
    fixTimeMs = Math.min(raw.timestamp, nowMs);
  }

  return {
    ok: true,
    value: {
      lat: raw.lat,
      lng: raw.lng,
      accuracyM,
      heading: optionalNumber(raw.heading, 0, 360),
      speed: optionalNumber(raw.speed, 0, 400),
      fixTimeMs,
    },
  };
}

/**
 * True when moving from `prev` to `next` would need an impossible speed.
 * Accuracy of both fixes is subtracted from the distance so noisy fixes
 * taken seconds apart are not flagged.
 */
export function isImplausibleJump(
  prev: { lat: number; lng: number; fixTimeMs: number; accuracyM?: number | null },
  next: { lat: number; lng: number; fixTimeMs: number; accuracyM?: number | null }
): boolean {
  const dtSeconds = (next.fixTimeMs - prev.fixTimeMs) / 1000;
  if (dtSeconds <= 0) return false; // ordering is handled elsewhere
  const rawDistance = haversineMeters(prev.lat, prev.lng, next.lat, next.lng);
  const distance = Math.max(0, rawDistance - (prev.accuracyM || 0) - (next.accuracyM || 0));
  if (distance < 300) return false; // too small to matter
  return distance / dtSeconds > LOCATION_CONFIG.MAX_PLAUSIBLE_SPEED_MPS;
}

// ---------------------------------------------------------------------------
// Client send policy (throttle + distance + heartbeat)
// ---------------------------------------------------------------------------
export type SendDecision = "send" | "heartbeat" | "skip";

export function decideSend(params: {
  previous: { lat: number; lng: number; sentAtMs: number } | null;
  next: { lat: number; lng: number };
  nowMs: number;
}): SendDecision {
  const { previous, next, nowMs } = params;
  if (!previous) return "send";
  const elapsed = nowMs - previous.sentAtMs;
  if (elapsed < LOCATION_CONFIG.MIN_SEND_INTERVAL_MS) return "skip";
  const moved = haversineMeters(previous.lat, previous.lng, next.lat, next.lng);
  if (moved >= LOCATION_CONFIG.MIN_MOVE_METERS) return "send";
  if (elapsed >= LOCATION_CONFIG.HEARTBEAT_INTERVAL_MS) return "heartbeat";
  return "skip";
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------
export interface LocationStatusInput {
  latitude?: number | null;
  longitude?: number | null;
  /** ISO string of the GPS fix time. */
  locationTimestamp?: string | null;
  /** ISO string of the last heartbeat (device alive + GPS confirmed). */
  lastSeenAt?: string | null;
  sharingEnabled?: boolean | null;
}

export interface LocationStatusResult {
  status: LocationStatus;
  label: string;
  /** Seconds since the freshest confirmation (fix or heartbeat). */
  ageSeconds: number | null;
  /** ISO of the freshest confirmation. */
  lastConfirmedAt: string | null;
  /** ISO of the last time the coordinates themselves changed/were received. */
  coordinatesAt: string | null;
}

function parseMs(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function computeLocationStatus(
  input: LocationStatusInput,
  nowMs: number = Date.now()
): LocationStatusResult {
  const fixMs = parseMs(input.locationTimestamp);
  const seenMs = parseMs(input.lastSeenAt);
  const freshest = Math.max(fixMs ?? -Infinity, seenMs ?? -Infinity);
  const hasFreshest = Number.isFinite(freshest);
  const lastConfirmedAt = hasFreshest ? new Date(freshest).toISOString() : null;
  const coordinatesAt = fixMs != null ? new Date(fixMs).toISOString() : null;

  const make = (status: LocationStatus, ageSeconds: number | null): LocationStatusResult => ({
    status,
    label: LOCATION_STATUS_LABEL[status],
    ageSeconds,
    lastConfirmedAt,
    coordinatesAt,
  });

  if (input.sharingEnabled === false) return make("not_sharing", null);
  if (!isValidCoordinate(input.latitude, input.longitude) || !hasFreshest) {
    return make("unavailable", null);
  }

  const ageMs = Math.max(0, nowMs - freshest);
  const ageSeconds = Math.round(ageMs / 1000);
  if (ageMs <= LOCATION_CONFIG.LIVE_MAX_AGE_MS) return make("live", ageSeconds);
  if (ageMs <= LOCATION_CONFIG.STALE_MAX_AGE_MS) return make("stale", ageSeconds);
  return make("last_seen", ageSeconds);
}

export function classifyAccuracy(accuracyM: number | null | undefined): AccuracyClass {
  if (typeof accuracyM !== "number" || !Number.isFinite(accuracyM) || accuracyM < 0) {
    return "unknown";
  }
  if (accuracyM <= LOCATION_CONFIG.GOOD_ACCURACY_M) return "good";
  if (accuracyM <= LOCATION_CONFIG.MODERATE_ACCURACY_M) return "moderate";
  return "poor";
}

export function describeAccuracy(
  accuracyM: number | null | undefined
): { cls: AccuracyClass; label: string } {
  const cls = classifyAccuracy(accuracyM);
  if (cls === "unknown") return { cls, label: "" };
  const metres = Math.round(accuracyM as number);
  const text = cls === "good" ? "Good" : cls === "moderate" ? "Moderate" : "Poor";
  return { cls, label: `${text} accuracy (±${metres} m)` };
}

export function formatAgo(ageSeconds: number | null | undefined): string {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return "";
  if (ageSeconds < 5) return "just now";
  if (ageSeconds < 60) return `${Math.round(ageSeconds)}s ago`;
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Authorisation (pure decision functions, enforced again server side)
// ---------------------------------------------------------------------------
export interface JobAccessInfo {
  status: string;
  assignedPlumberId?: string | null;
  customerId?: string | null;
  customerPhoneLast10?: string | null;
}

/**
 * May this customer see the live location of the plumber assigned to this job?
 * Requires: customer owns the job, a plumber is assigned, job still active.
 */
export function customerMayTrackJob(
  job: JobAccessInfo,
  customer: { id: string; phoneLast10?: string | null }
): boolean {
  if (!job.assignedPlumberId) return false;
  if (!isActiveJobStatus(job.status)) return false;
  const ownsById = !!job.customerId && job.customerId === customer.id;
  const ownsByPhone =
    !!job.customerPhoneLast10 &&
    !!customer.phoneLast10 &&
    job.customerPhoneLast10 === customer.phoneLast10;
  return ownsById || ownsByPhone;
}

export function plumberMayShareLocation(params: {
  isApproved: boolean;
  hasOpenTrip: boolean;
  isOnDuty?: boolean;
  hasActiveJob?: boolean;
}): boolean {
  return params.isApproved && params.hasOpenTrip === true;
}

// ---------------------------------------------------------------------------
// Customer tracking state machine
// ---------------------------------------------------------------------------
export type CustomerTrackingState =
  | "waiting_assignment"
  | "waiting_first_location"
  | "live"
  | "temporarily_unavailable"
  | "approaching"
  | "arrived"
  | "completed"
  | "cancelled";

export type JobTripState = "idle" | "on_the_way" | "arrived";

/**
 * Derives whether a job currently has an active trip ("on_the_way") or has
 * recorded arrival ("arrived") from its history log without altering main status.
 */
export function deriveJobTripState(
  history: ReadonlyArray<{ action?: string | null }> | null | undefined
): JobTripState {
  if (!Array.isArray(history) || history.length === 0) return "idle";
  for (let i = history.length - 1; i >= 0; i--) {
    const action = history[i]?.action;
    if (action === "arrived") return "arrived";
    if (action === "trip_started") return "on_the_way";
    if (action === "trip_cancelled") return "idle";
  }
  return "idle";
}

export function deriveCustomerTrackingState(params: {
  requestStatus: string;
  hasAssignedPlumber: boolean;
  locationStatus: LocationStatus | null;
  distanceMeters: number | null;
  tripState?: JobTripState;
}): CustomerTrackingState {
  const { requestStatus, hasAssignedPlumber, locationStatus, distanceMeters, tripState } = params;
  if (requestStatus === "completed") return "completed";
  if (requestStatus === "cancelled") return "cancelled";
  if (!hasAssignedPlumber) return "waiting_assignment";
  if (tripState === "arrived") return "arrived";
  if (!locationStatus || locationStatus === "unavailable" || locationStatus === "not_sharing") {
    // No coordinates have ever arrived (or sharing is off) for this job.
    return locationStatus === "not_sharing" ? "temporarily_unavailable" : "waiting_first_location";
  }
  if (locationStatus === "stale" || locationStatus === "last_seen") {
    return "temporarily_unavailable";
  }
  if (distanceMeters != null) {
    if (distanceMeters <= LOCATION_CONFIG.ARRIVED_METERS) return "arrived";
    if (distanceMeters <= LOCATION_CONFIG.APPROACHING_METERS) return "approaching";
  }
  return "live";
}

export const CUSTOMER_TRACKING_COPY: Record<
  CustomerTrackingState,
  { title: string; body: string }
> = {
  waiting_assignment: {
    title: "Request received",
    body: "We are assigning a technician. Live tracking starts once a plumber is assigned.",
  },
  waiting_first_location: {
    title: "Plumber assigned",
    body: "Waiting for your technician's first location update.",
  },
  live: {
    title: "Plumber sharing live location",
    body: "Your technician's location updates automatically.",
  },
  temporarily_unavailable: {
    title: "Plumber location temporarily unavailable",
    body: "The latest location is no longer current. Waiting for a new GPS update.",
  },
  approaching: {
    title: "Plumber approaching the property",
    body: "Your technician is close to your property.",
  },
  arrived: {
    title: "Plumber arrived",
    body: "Your technician has reached your property.",
  },
  completed: {
    title: "Job completed",
    body: "Live tracking has ended for this job.",
  },
  cancelled: {
    title: "Job cancelled",
    body: "Live tracking is not available for a cancelled job.",
  },
};

// ---------------------------------------------------------------------------
// Navigation links
// ---------------------------------------------------------------------------
export function googleMapsDirectionsUrl(
  destination: { lat: number; lng: number },
  origin?: { lat: number; lng: number } | null
): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: "driving",
  });
  if (origin && isValidCoordinate(origin.lat, origin.lng)) {
    params.set("origin", `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
