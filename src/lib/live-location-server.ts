/**
 * Server-only live-location persistence and authorisation (uses the service-role
 * Supabase client; never import from a client component).
 */
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { PortalActor } from "@/lib/portal-auth";
import {
  classifyAccuracy,
  computeLocationStatus,
  customerMayTrackJob,
  deriveCustomerTrackingState,
  deriveJobTripState,
  haversineMeters,
  isActiveJobStatus,
  isImplausibleJump,
  isValidCoordinate,
  type ValidatedLocation,
} from "@/lib/live-location";
import type {
  TrackedJob,
  TrackedPlumber,
  TrackingSnapshot,
} from "@/lib/tracking-types";

const TABLE = "plumber_live_locations";

interface LiveRow {
  plumber_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  heading: number | null;
  speed: number | null;
  location_timestamp: string | null;
  received_at: string | null;
  last_seen_at: string | null;
  sharing_enabled: boolean | null;
}

// ---------------------------------------------------------------------------
// Compatibility: before supabase/migrations/20261115_live_location_system.sql
// has been applied, fall back to plumbers.current_lat / current_lng so the
// application keeps working. Re-checked every minute.
// ---------------------------------------------------------------------------
let tableMissingUntil = 0;

function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") return true;
  const msg = String(error.message || "");
  return /plumber_live_locations/i.test(msg) && /(does not exist|schema cache|could not find)/i.test(msg);
}

function liveTableAvailable(): boolean {
  return Date.now() >= tableMissingUntil;
}

function markTableMissing(): void {
  tableMissingUntil = Date.now() + 60_000;
  console.warn(
    "[live-location] table plumber_live_locations not found – using legacy plumbers.current_* columns. " +
      "Apply supabase/migrations/20261115_live_location_system.sql."
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
export type SaveResult =
  | { ok: true; ignored?: "older_event"; confirmedAtIso: string }
  | { ok: false; reason: "implausible" | "storage" };

export async function saveLiveLocation(
  plumberId: string,
  v: ValidatedLocation
): Promise<SaveResult> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const fixIso = new Date(v.fixTimeMs).toISOString();

  if (liveTableAvailable()) {
    const { data: existing, error: readErr } = await supabase
      .from(TABLE)
      .select("latitude, longitude, accuracy_m, location_timestamp, last_seen_at")
      .eq("plumber_id", plumberId)
      .maybeSingle();

    if (readErr && isMissingTable(readErr)) {
      markTableMissing();
    } else if (readErr) {
      console.error("[live-location] read failed:", readErr.message);
      return { ok: false, reason: "storage" };
    } else {
      if (existing?.location_timestamp) {
        const prevMs = Date.parse(existing.location_timestamp);
        if (Number.isFinite(prevMs) && prevMs > v.fixTimeMs) {
          // Out-of-order event: a newer fix is already stored. Never overwrite it.
          return {
            ok: true,
            ignored: "older_event",
            confirmedAtIso: existing.last_seen_at || existing.location_timestamp,
          };
        }
        if (
          existing.latitude != null &&
          existing.longitude != null &&
          Number.isFinite(prevMs) &&
          isImplausibleJump(
            {
              lat: existing.latitude,
              lng: existing.longitude,
              fixTimeMs: prevMs,
              accuracyM: existing.accuracy_m,
            },
            { lat: v.lat, lng: v.lng, fixTimeMs: v.fixTimeMs, accuracyM: v.accuracyM }
          )
        ) {
          return { ok: false, reason: "implausible" };
        }
      }

      const fields = {
        latitude: v.lat,
        longitude: v.lng,
        accuracy_m: v.accuracyM,
        heading: v.heading,
        speed: v.speed,
        location_timestamp: fixIso,
        received_at: nowIso,
        last_seen_at: nowIso,
        sharing_enabled: true,
        updated_at: nowIso,
      };

      let writeError: { message: string; code?: string } | null = null;
      let updateGuarded = !!existing;

      if (!existing) {
        const { error } = await supabase.from(TABLE).insert({ plumber_id: plumberId, ...fields });
        if (error?.code === "23505") {
          updateGuarded = true; // concurrent insert won the race; update with the guard below
        } else if (error) {
          writeError = error;
        }
      }

      if (updateGuarded && !writeError) {
        const { data, error } = await supabase
          .from(TABLE)
          .update(fields)
          .eq("plumber_id", plumberId)
          .or(`location_timestamp.is.null,location_timestamp.lte.${fixIso}`)
          .select("plumber_id");
        if (error) {
          writeError = error;
        } else if (!data || data.length === 0) {
          return { ok: true, ignored: "older_event", confirmedAtIso: nowIso };
        }
      }

      if (writeError) {
        if (isMissingTable(writeError)) {
          markTableMissing();
        } else {
          console.error("[live-location] write failed:", writeError.message);
          return { ok: false, reason: "storage" };
        }
      } else {
        // Backwards-compatible mirror for any code still reading plumbers.current_*.
        const { error: mirrorErr } = await supabase
          .from("plumbers")
          .update({ current_lat: v.lat, current_lng: v.lng, location_updated_at: nowIso })
          .eq("id", plumberId);
        if (mirrorErr) console.warn("[live-location] legacy mirror failed:", mirrorErr.message);
        return { ok: true, confirmedAtIso: nowIso };
      }
    }
  }

  // Legacy path (table not migrated yet)
  const { error } = await supabase
    .from("plumbers")
    .update({ current_lat: v.lat, current_lng: v.lng, location_updated_at: nowIso })
    .eq("id", plumberId);
  if (error) {
    console.error("[live-location] legacy write failed:", error.message);
    return { ok: false, reason: "storage" };
  }
  return { ok: true, confirmedAtIso: nowIso };
}

export async function recordHeartbeat(
  plumberId: string
): Promise<{ ok: true; confirmedAtIso: string } | { ok: false; reason: "no_location" | "storage" }> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();

  if (liveTableAvailable()) {
    const { data, error } = await supabase
      .from(TABLE)
      .update({ last_seen_at: nowIso, sharing_enabled: true, updated_at: nowIso })
      .eq("plumber_id", plumberId)
      .not("latitude", "is", null)
      .select("plumber_id");
    if (error && isMissingTable(error)) {
      markTableMissing();
    } else if (error) {
      console.error("[live-location] heartbeat failed:", error.message);
      return { ok: false, reason: "storage" };
    } else if (!data || data.length === 0) {
      return { ok: false, reason: "no_location" };
    } else {
      return { ok: true, confirmedAtIso: nowIso };
    }
  }

  const { data, error } = await supabase
    .from("plumbers")
    .update({ location_updated_at: nowIso })
    .eq("id", plumberId)
    .not("current_lat", "is", null)
    .select("id");
  if (error) return { ok: false, reason: "storage" };
  if (!data || data.length === 0) return { ok: false, reason: "no_location" };
  return { ok: true, confirmedAtIso: nowIso };
}

/**
 * Enable/disable sharing. Disabling also erases the stored coordinates so a
 * plumber who is Off Duty (and has no active job) leaves no trace on any map.
 */
export async function setSharing(plumberId: string, enabled: boolean): Promise<boolean> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();

  if (liveTableAvailable()) {
    const result = enabled
      ? await supabase
          .from(TABLE)
          .upsert(
            { plumber_id: plumberId, sharing_enabled: true, updated_at: nowIso },
            { onConflict: "plumber_id" }
          )
      : await supabase
          .from(TABLE)
          .update({
            sharing_enabled: false,
            latitude: null,
            longitude: null,
            accuracy_m: null,
            heading: null,
            speed: null,
            updated_at: nowIso,
          })
          .eq("plumber_id", plumberId);
    if (result.error && isMissingTable(result.error)) {
      markTableMissing();
    } else if (result.error) {
      console.error("[live-location] setSharing failed:", result.error.message);
      return false;
    }
  }

  if (!enabled) {
    const { error } = await supabase
      .from("plumbers")
      .update({ current_lat: null, current_lng: null })
      .eq("id", plumberId);
    if (error) {
      console.warn("[live-location] legacy clear failed:", error.message);
    }
  }
  return true;
}

export async function plumberHasActiveJob(plumberId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("service_requests")
    .select("status, deleted_at")
    .eq("assigned_plumber_id", plumberId);
  if (error) {
    // deleted_at may not exist on very old databases
    const retry = await supabase
      .from("service_requests")
      .select("status")
      .eq("assigned_plumber_id", plumberId);
    return (retry.data || []).some((r) => isActiveJobStatus(String(r.status)));
  }
  return (data || []).some((r) => !r.deleted_at && isActiveJobStatus(String(r.status)));
}

/**
 * Returns true ONLY if the plumber has an active (non-completed/non-cancelled) job
 * whose latest trip event is `trip_started` with no later `arrived` or `trip_cancelled`.
 */
export async function plumberHasOpenTrip(plumberId: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("service_requests")
    .select("status, history, deleted_at")
    .eq("assigned_plumber_id", plumberId);
  if (error) {
    const retry = await supabase
      .from("service_requests")
      .select("status, history")
      .eq("assigned_plumber_id", plumberId);
    return (retry.data || []).some(
      (r) =>
        isActiveJobStatus(String(r.status)) &&
        deriveJobTripState(Array.isArray(r.history) ? r.history : []) === "on_the_way"
    );
  }
  return (data || []).some(
    (r) =>
      !r.deleted_at &&
      isActiveJobStatus(String(r.status)) &&
      deriveJobTripState(Array.isArray(r.history) ? r.history : []) === "on_the_way"
  );
}

/**
 * Called whenever a job ends/changes assignment or a plumber changes availability:
 * if the plumber has no open trip, tracking is terminated.
 */
export async function reconcilePlumberSharing(plumberId: string | null | undefined): Promise<void> {
  if (!plumberId) return;
  try {
    if (await plumberHasOpenTrip(plumberId)) return;
    await setSharing(plumberId, false);
  } catch (err) {
    console.error("[live-location] reconcile failed:", err instanceof Error ? err.message : err);
  }
}

/** Convenience for code paths that only know the request id. */
export async function reconcileSharingForRequest(requestId: string): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("service_requests")
      .select("assigned_plumber_id")
      .eq("id", requestId)
      .maybeSingle();
    await reconcilePlumberSharing(data?.assigned_plumber_id ? String(data.assigned_plumber_id) : null);
  } catch (err) {
    console.error("[live-location] reconcile for request failed:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
async function loadLocationRows(ids?: string[]): Promise<Map<string, LiveRow>> {
  const supabase = getServiceSupabase();
  const map = new Map<string, LiveRow>();
  if (ids && ids.length === 0) return map;

  if (liveTableAvailable()) {
    let q = supabase.from(TABLE).select("*");
    if (ids) q = q.in("plumber_id", ids);
    const { data, error } = await q;
    if (error && isMissingTable(error)) {
      markTableMissing();
    } else if (error) {
      console.error("[live-location] load failed:", error.message);
      return map;
    } else {
      for (const r of (data || []) as LiveRow[]) map.set(String(r.plumber_id), r);
      return map;
    }
  }

  // Legacy fallback
  let q = supabase.from("plumbers").select("id, current_lat, current_lng, location_updated_at");
  if (ids) q = q.in("id", ids);
  const { data } = await q;
  for (const p of data || []) {
    if (p.current_lat == null || p.current_lng == null) continue;
    map.set(String(p.id), {
      plumber_id: String(p.id),
      latitude: Number(p.current_lat),
      longitude: Number(p.current_lng),
      accuracy_m: null,
      heading: null,
      speed: null,
      location_timestamp: p.location_updated_at ? String(p.location_updated_at) : null,
      received_at: p.location_updated_at ? String(p.location_updated_at) : null,
      last_seen_at: p.location_updated_at ? String(p.location_updated_at) : null,
      sharing_enabled: true,
    });
  }
  return map;
}

function toTrackedPlumber(
  plumber: Record<string, unknown>,
  loc: LiveRow | undefined,
  activeTickets: string[],
  nowMs: number
): TrackedPlumber {
  const lat = loc?.latitude ?? null;
  const lng = loc?.longitude ?? null;
  const validCoords = isValidCoordinate(lat, lng);
  const st = computeLocationStatus(
    {
      latitude: lat,
      longitude: lng,
      locationTimestamp: loc?.location_timestamp,
      lastSeenAt: loc?.last_seen_at,
      // A plumber without any row has never shared: "unavailable", not "not sharing".
      sharingEnabled: loc ? loc.sharing_enabled !== false : true,
    },
    nowMs
  );
  return {
    plumberId: String(plumber.id),
    name: String(plumber.full_name || "Plumber"),
    avatarUrl: plumber.avatar_url ? String(plumber.avatar_url) : undefined,
    isAvailable: plumber.is_available !== false,
    ticketNumbers: activeTickets,
    lat: validCoords ? (lat as number) : null,
    lng: validCoords ? (lng as number) : null,
    accuracyM: validCoords && typeof loc?.accuracy_m === "number" ? loc.accuracy_m : null,
    accuracyClass: classifyAccuracy(validCoords ? loc?.accuracy_m : null),
    heading: validCoords && typeof loc?.heading === "number" ? loc.heading : null,
    speed: validCoords && typeof loc?.speed === "number" ? loc.speed : null,
    sharingEnabled: loc ? loc.sharing_enabled !== false : false,
    status: st.status,
    statusLabel: st.label,
    ageSeconds: st.ageSeconds,
    lastConfirmedAt: st.lastConfirmedAt,
    coordinatesAt: st.coordinatesAt,
  };
}

const PLUMBER_COLUMNS = "id, full_name, avatar_url, is_available, verification_status, deleted_at";

async function loadPlumbers(ids?: string[]): Promise<Map<string, Record<string, unknown>>> {
  const supabase = getServiceSupabase();
  const map = new Map<string, Record<string, unknown>>();
  if (ids && ids.length === 0) return map;
  let q = supabase.from("plumbers").select(PLUMBER_COLUMNS);
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  let rows = data as Record<string, unknown>[] | null;
  if (error) {
    let retry = supabase.from("plumbers").select("id, full_name, avatar_url, is_available, verification_status");
    if (ids) retry = retry.in("id", ids);
    rows = (await retry).data as Record<string, unknown>[] | null;
  }
  for (const p of rows || []) {
    if (p.deleted_at) continue;
    map.set(String(p.id), p);
  }
  return map;
}

function buildJob(
  req: Record<string, unknown>,
  plumber: TrackedPlumber | null
): TrackedJob {
  const lat = req.customer_lat != null ? Number(req.customer_lat) : null;
  const lng = req.customer_lng != null ? Number(req.customer_lng) : null;
  const destination = isValidCoordinate(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
  const status = String(req.status || "new");
  const hasAssignedPlumber = Boolean(req.assigned_plumber_id);
  const tripState = deriveJobTripState(
    Array.isArray(req.history) ? (req.history as { action?: string }[]) : []
  );

  let distanceMeters: number | null = null;
  if (plumber && plumber.lat != null && plumber.lng != null && destination) {
    distanceMeters = haversineMeters(plumber.lat, plumber.lng, destination.lat, destination.lng);
  }

  return {
    requestId: String(req.id),
    ticketNumber: String(req.ticket_number),
    status,
    hasAssignedPlumber,
    assignedTechnician: req.assigned_technician ? String(req.assigned_technician) : undefined,
    destination,
    plumber,
    tripState,
    trackingState: deriveCustomerTrackingState({
      requestStatus: status,
      hasAssignedPlumber,
      locationStatus: plumber ? plumber.status : null,
      distanceMeters,
      tripState,
    }),
  };
}

/**
 * Builds the tracking data an authenticated actor is allowed to see.
 * All authorisation happens here, on the server, from the verified session.
 */
export async function buildTrackingSnapshot(
  actor: PortalActor,
  opts: { ticket?: string; dispatch?: boolean } = {}
): Promise<TrackingSnapshot> {
  const supabase = getServiceSupabase();
  const nowMs = Date.now();
  const ticket = opts.ticket?.trim();

  // ---- Customer ------------------------------------------------------------
  if (actor.role === "customer") {
    let q = supabase
      .from("service_requests")
      .select("*")
      .eq("customer_id", actor.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (ticket) q = q.eq("ticket_number", ticket);
    const { data } = await q;
    const reqs = (data || []).filter((r) => !r.deleted_at);

    const trackable = reqs.filter((r) =>
      customerMayTrackJob(
        {
          status: String(r.status),
          assignedPlumberId: r.assigned_plumber_id ? String(r.assigned_plumber_id) : null,
          customerId: r.customer_id ? String(r.customer_id) : null,
        },
        { id: actor.id }
      )
    );
    const plumberIds = [...new Set(trackable.map((r) => String(r.assigned_plumber_id)))];
    const [plumbers, locs] = await Promise.all([loadPlumbers(plumberIds), loadLocationRows(plumberIds)]);

    const jobs = reqs.map((r) => {
      const allowed = trackable.includes(r);
      let tracked: TrackedPlumber | null = null;
      if (allowed) {
        const pid = String(r.assigned_plumber_id);
        const p = plumbers.get(pid);
        if (p) tracked = toTrackedPlumber(p, locs.get(pid), [String(r.ticket_number)], nowMs);
      }
      return buildJob(r, tracked);
    });
    return { serverNow: nowMs, viewer: "customer", jobs };
  }

  // ---- Plumber (own location + own jobs only) -----------------------------
  if (actor.role === "plumber") {
    if (!actor.isApproved) return { serverNow: nowMs, viewer: "plumber", jobs: [] };
    let q = supabase
      .from("service_requests")
      .select("*")
      .eq("assigned_plumber_id", actor.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (ticket) q = q.eq("ticket_number", ticket);
    const { data } = await q;
    const reqs = (data || []).filter((r) => !r.deleted_at);
    const [plumbers, locs] = await Promise.all([loadPlumbers([actor.id]), loadLocationRows([actor.id])]);
    const me = plumbers.get(actor.id);
    const activeTickets = reqs
      .filter((r) => isActiveJobStatus(String(r.status)))
      .map((r) => String(r.ticket_number));
    const self = me ? toTrackedPlumber(me, locs.get(actor.id), activeTickets, nowMs) : null;
    return {
      serverNow: nowMs,
      viewer: "plumber",
      jobs: reqs.map((r) => buildJob(r, isActiveJobStatus(String(r.status)) ? self : null)),
      plumbers: self ? [self] : [],
    };
  }

  // ---- Admin ---------------------------------------------------------------
  let q = supabase.from("service_requests").select("*").limit(2000);
  if (ticket) {
    q = q.eq("ticket_number", ticket);
  } else {
    q = q.not("status", "in", "(completed,cancelled)");
  }
  const { data } = await q;
  const reqs = (data || []).filter((r) => !r.deleted_at);

  const activeByPlumber = new Map<string, string[]>();
  for (const r of reqs) {
    if (!r.assigned_plumber_id || !isActiveJobStatus(String(r.status))) continue;
    const pid = String(r.assigned_plumber_id);
    const list = activeByPlumber.get(pid) || [];
    list.push(String(r.ticket_number));
    activeByPlumber.set(pid, list);
  }

  const wantAll = Boolean(opts.dispatch);
  const needIds = wantAll
    ? undefined
    : [...new Set(reqs.map((r) => (r.assigned_plumber_id ? String(r.assigned_plumber_id) : "")).filter(Boolean))];
  const [plumbers, locs] = await Promise.all([loadPlumbers(needIds), loadLocationRows(needIds)]);

  const tracked = new Map<string, TrackedPlumber>();
  for (const [id, p] of plumbers) {
    if (wantAll && p.verification_status !== "approved") continue;
    tracked.set(id, toTrackedPlumber(p, locs.get(id), activeByPlumber.get(id) || [], nowMs));
  }

  const jobs = reqs.map((r) => {
    const pid = r.assigned_plumber_id ? String(r.assigned_plumber_id) : "";
    const visible = pid && isActiveJobStatus(String(r.status)) ? tracked.get(pid) || null : null;
    return buildJob(r, visible);
  });

  return {
    serverNow: nowMs,
    viewer: "admin",
    jobs,
    plumbers: wantAll ? [...tracked.values()] : undefined,
  };
}

/** Resolve the two endpoints of a route for a ticket, after authorisation. */
export async function resolveRouteEndpoints(
  actor: PortalActor,
  ticket: string,
  plumberOverride?: { lat: number; lng: number } | null
): Promise<
  | { ok: true; from: { lat: number; lng: number }; to: { lat: number; lng: number } }
  | { ok: false; reason: "forbidden" | "no_location" }
> {
  const snap = await buildTrackingSnapshot(actor, { ticket });
  const job = snap.jobs.find((j) => j.ticketNumber === ticket);
  if (!job) return { ok: false, reason: "forbidden" };

  if (actor.role === "plumber") {
    if (!job.destination) return { ok: false, reason: "no_location" };
    if (
      plumberOverride &&
      isValidCoordinate(plumberOverride.lat, plumberOverride.lng)
    ) {
      return {
        ok: true,
        from: plumberOverride,
        to: job.destination,
      };
    }
    if (!job.plumber || job.plumber.lat == null || job.plumber.lng == null) {
      return { ok: false, reason: "no_location" };
    }
    return {
      ok: true,
      from: { lat: job.plumber.lat, lng: job.plumber.lng },
      to: job.destination,
    };
  }

  if (!job.plumber) return { ok: false, reason: "forbidden" };
  if (!job.destination || job.plumber.lat == null || job.plumber.lng == null) {
    return { ok: false, reason: "no_location" };
  }
  if (job.plumber.status === "not_sharing" || job.plumber.status === "unavailable") {
    return { ok: false, reason: "no_location" };
  }
  return {
    ok: true,
    from: { lat: job.plumber.lat, lng: job.plumber.lng },
    to: job.destination,
  };
}
