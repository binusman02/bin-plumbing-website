import type {
  AccuracyClass,
  CustomerTrackingState,
  JobTripState,
  LocationStatus,
} from "@/lib/live-location";

/** A plumber's authorised, server-evaluated location (status computed with server time). */
export interface TrackedPlumber {
  plumberId: string;
  name: string;
  avatarUrl?: string;
  isAvailable: boolean;
  /** Active (non-completed/cancelled) ticket numbers assigned to this plumber. */
  ticketNumbers: string[];
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  accuracyClass: AccuracyClass;
  heading: number | null;
  speed: number | null;
  sharingEnabled: boolean;
  status: LocationStatus;
  statusLabel: string;
  ageSeconds: number | null;
  /** ISO – freshest confirmation (GPS fix or heartbeat). */
  lastConfirmedAt: string | null;
  /** ISO – when the stored coordinates were produced by the phone. */
  coordinatesAt: string | null;
}

export interface TrackedJob {
  requestId: string;
  ticketNumber: string;
  status: string;
  hasAssignedPlumber: boolean;
  assignedTechnician?: string;
  plumberPhone?: string;
  /** Fixed property destination. */
  destination: { lat: number; lng: number } | null;
  /** Present only when the viewer is authorised to see it AND the job is active. */
  plumber: TrackedPlumber | null;
  trackingState: CustomerTrackingState;
  tripState?: JobTripState;
}

export interface TrackingSnapshot {
  /** Server clock (ms). Clients use it to correct their own clock skew. */
  serverNow: number;
  viewer: "admin" | "customer" | "plumber";
  jobs: TrackedJob[];
  /** Admin dispatch only: every approved plumber with their location state. */
  plumbers?: TrackedPlumber[];
}

export interface RouteVoiceInstruction {
  distanceAlongGeometry: number;
  text: string;
}

export interface RouteStep {
  instruction: string;
  distanceM: number;
  durationS?: number;
  maneuverLat?: number;
  maneuverLng?: number;
  maneuverType?: string;
  maneuverModifier?: string;
  bannerPrimary?: string;
  bannerSecondary?: string;
  voice?: RouteVoiceInstruction[];
}

export interface RoutePayload {
  ok: boolean;
  reason?: "disabled" | "unavailable" | "no_route" | "no_location" | "forbidden";
  distanceM?: number;
  durationS?: number;
  points?: [number, number][];
  steps?: RouteStep[];
  provider?: string;
  trafficAware?: boolean;
  computedAt?: string;
  /** Straight-line fallback distance (clearly NOT a driving distance). */
  straightLineM?: number;
}
