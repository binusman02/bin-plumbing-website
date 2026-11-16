"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subscribeLocationSignals } from "@/lib/realtime-hub";
import {
  computeLocationStatus,
  describeAccuracy,
  haversineMeters,
  LOCATION_CONFIG,
  type LocationStatusResult,
} from "@/lib/live-location";
import type { RoutePayload, TrackedPlumber, TrackingSnapshot } from "@/lib/tracking-types";

type Viewer = "admin" | "customer" | "plumber";

interface UseLiveTrackingOptions {
  as: Viewer;
  /** Restrict to one ticket (customer/plumber/admin). */
  ticket?: string;
  /** Admin only: also load every approved plumber. */
  dispatch?: boolean;
  enabled?: boolean;
  /** Only react to signals for these tickets (admin dispatch ignores this). */
  watchTickets?: string[];
}

export interface LiveTrackingState {
  snapshot: TrackingSnapshot | null;
  /** Never fetched successfully yet. */
  loading: boolean;
  /** Last fetch failed (network/server). Previous snapshot is kept. */
  fetchFailed: boolean;
  realtimeConnected: boolean;
  /** Local ms when `snapshot` was received. */
  fetchedAtMs: number | null;
  /** serverNow - localNow at fetch time. */
  serverOffsetMs: number;
  refresh: () => void;
}

/**
 * Authorised live tracking data with realtime signals + polling fallback.
 *  - No router.refresh(); only a small JSON request.
 *  - Polls only while the tab is visible; refetches on focus/online.
 *  - Duplicate/overlapping requests are collapsed; out-of-order responses are dropped.
 */
export function useLiveTracking(options: UseLiveTrackingOptions): LiveTrackingState {
  const { as, ticket, dispatch = false, enabled = true } = options;
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [fetchedAtMs, setFetchedAtMs] = useState<number | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const lastServerNowRef = useRef(0);
  const watchRef = useRef<string[] | undefined>(options.watchTickets);
  const connectedRef = useRef(false);
  const lastFetchStartRef = useRef(0);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    watchRef.current = options.watchTickets;
  }, [options.watchTickets]);

  const url = useMemo(() => {
    const p = new URLSearchParams({ as });
    if (ticket) p.set("ticket", ticket);
    if (dispatch) p.set("dispatch", "1");
    return `/api/tracking/snapshot?${p.toString()}`;
  }, [as, ticket, dispatch]);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    inFlightRef.current = true;
    lastFetchStartRef.current = Date.now();
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as TrackingSnapshot;
      // Drop responses older than the one already applied (out-of-order protection).
      if (data.serverNow >= lastServerNowRef.current) {
        lastServerNowRef.current = data.serverNow;
        const receivedAt = Date.now();
        setSnapshot(data);
        setFetchedAtMs(receivedAt);
        setServerOffsetMs(data.serverNow - receivedAt);
      }
      setFetchFailed(false);
    } catch {
      setFetchFailed(true);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        void loadRef.current();
      }
    }
  }, [enabled, url]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Initial load + reload when the target changes.
  useEffect(() => {
    if (!enabled) return;
    lastServerNowRef.current = 0;
    void load();
  }, [enabled, load]);

  // Realtime signals (no coordinates inside) trigger an authorised re-fetch.
  useEffect(() => {
    if (!enabled) return;
    let lastSignalFetch = 0;
    const unsubscribe = subscribeLocationSignals(
      ({ ticketNumbers }) => {
        const watch = watchRef.current;
        if (!dispatch && watch && watch.length > 0 && ticketNumbers.length > 0) {
          if (!ticketNumbers.some((t) => watch.includes(t))) return;
        }
        const now = Date.now();
        if (now - lastSignalFetch < 2_000) return; // coalesce bursts
        lastSignalFetch = now;
        void load();
      },
      (connected) => {
        connectedRef.current = connected;
        setRealtimeConnected(connected);
        if (connected) void load(); // catch up after (re)connecting
      }
    );
    return unsubscribe;
  }, [enabled, dispatch, load]);

  // Polling fallback: only while visible, slower when realtime is healthy.
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      const interval = connectedRef.current
        ? LOCATION_CONFIG.POLL_INTERVAL_MS * 2
        : LOCATION_CONFIG.POLL_INTERVAL_MS;
      if (Date.now() - lastFetchStartRef.current >= interval - 500) void load();
    };
    const timer = window.setInterval(tick, 5_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onOnline = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [enabled, load]);

  return {
    snapshot,
    loading,
    fetchFailed,
    realtimeConnected,
    fetchedAtMs,
    serverOffsetMs,
    refresh: () => void load(),
  };
}

/** Re-renders every `intervalMs` so ages/statuses progress between fetches. */
export function useNowTick(intervalMs = 1_000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs, active]);
  return now;
}

/**
 * Re-evaluates a tracked plumber's status against the current (server-corrected)
 * time. A LIVE plumber therefore turns UPDATING/LAST SEEN on screen even if no
 * new data arrived — a refresh can never make an old location look live.
 */
export function projectTrackedStatus(
  tracked: TrackedPlumber,
  nowMs: number,
  serverOffsetMs: number
): LocationStatusResult & { accuracyLabel: string } {
  const st = computeLocationStatus(
    {
      latitude: tracked.lat,
      longitude: tracked.lng,
      locationTimestamp: tracked.coordinatesAt,
      lastSeenAt: tracked.lastConfirmedAt,
      sharingEnabled: tracked.status === "not_sharing" ? false : true,
    },
    nowMs + serverOffsetMs
  );
  return { ...st, accuracyLabel: describeAccuracy(tracked.accuracyM).label };
}

// ---------------------------------------------------------------------------
// Road route hook
// ---------------------------------------------------------------------------
export interface RoadRouteState {
  route: RoutePayload | null;
  status: "idle" | "loading" | "ok" | "unavailable";
  /** Previous route is being shown although the latest refresh failed. */
  outdated: boolean;
  refreshedAtMs: number | null;
}

const ROUTE_MIN_INTERVAL_MS = 20_000;
const ROUTE_REFRESH_MOVE_M = 150;
const ROUTE_REFRESH_MAX_AGE_MS = 90_000;

/**
 * Fetches the road route for a ticket. Throttled: refreshes only after the plumber
 * moved a meaningful distance or the route got old, never on every GPS event.
 */
export function useRoadRoute(params: {
  as: Viewer;
  ticket?: string;
  plumber: { lat: number; lng: number } | null;
  destination: { lat: number; lng: number } | null;
  enabled: boolean;
}): RoadRouteState & { retry: () => void } {
  const { as, ticket, plumber, destination, enabled } = params;
  const [state, setState] = useState<RoadRouteState>({
    route: null,
    status: "idle",
    outdated: false,
    refreshedAtMs: null,
  });
  const lastFetchRef = useRef<{ at: number; lat: number; lng: number; dLat: number; dLng: number } | null>(null);
  const inFlightRef = useRef(false);
  const [retryToken, setRetryToken] = useState(0);

  const plumberLat = plumber?.lat;
  const plumberLng = plumber?.lng;
  const destLat = destination?.lat;
  const destLng = destination?.lng;

  // Reset when the ticket/destination changes.
  useEffect(() => {
    lastFetchRef.current = null;
    setState({ route: null, status: "idle", outdated: false, refreshedAtMs: null });
  }, [ticket, destLat, destLng, enabled]);

  useEffect(() => {
    if (!enabled || !ticket || plumberLat == null || plumberLng == null || destLat == null || destLng == null) {
      return;
    }
    const last = lastFetchRef.current;
    const now = Date.now();
    if (last) {
      const moved = haversineMeters(last.lat, last.lng, plumberLat, plumberLng);
      const age = now - last.at;
      const destinationChanged = last.dLat !== destLat || last.dLng !== destLng;
      const due =
        destinationChanged ||
        (age >= ROUTE_MIN_INTERVAL_MS &&
          (moved >= ROUTE_REFRESH_MOVE_M || age >= ROUTE_REFRESH_MAX_AGE_MS));
      if (!due) return;
    }
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFetchRef.current = { at: now, lat: plumberLat, lng: plumberLng, dLat: destLat, dLng: destLng };
    setState((s) => ({ ...s, status: s.route ? s.status : "loading" }));

    const qs = new URLSearchParams({ as, ticket });
    if (as === "plumber" && Number.isFinite(plumberLat) && Number.isFinite(plumberLng)) {
      qs.set("fromLat", String(plumberLat));
      qs.set("fromLng", String(plumberLng));
    }
    fetch(`/api/tracking/route?${qs.toString()}`, { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<RoutePayload>) : Promise.reject(new Error("bad status"))))
      .then((payload) => {
        if (payload.ok && payload.points && payload.points.length > 1) {
          setState({ route: payload, status: "ok", outdated: false, refreshedAtMs: Date.now() });
        } else {
          // Allow an earlier retry (after ROUTE_MIN_INTERVAL_MS) if the route failed
          lastFetchRef.current = {
            at: Date.now() - (ROUTE_REFRESH_MAX_AGE_MS - ROUTE_MIN_INTERVAL_MS),
            lat: plumberLat,
            lng: plumberLng,
            dLat: destLat,
            dLng: destLng,
          };
          setState((s) => ({
            route: s.route ? s.route : payload,
            status: s.route && s.route.ok ? "ok" : "unavailable",
            outdated: Boolean(s.route && s.route.ok),
            refreshedAtMs: s.refreshedAtMs,
          }));
        }
      })
      .catch(() => {
        lastFetchRef.current = {
          at: Date.now() - (ROUTE_REFRESH_MAX_AGE_MS - ROUTE_MIN_INTERVAL_MS),
          lat: plumberLat,
          lng: plumberLng,
          dLat: destLat,
          dLng: destLng,
        };
        setState((s) => ({
          route: s.route,
          status: s.route && s.route.ok ? "ok" : "unavailable",
          outdated: Boolean(s.route && s.route.ok),
          refreshedAtMs: s.refreshedAtMs,
        }));
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [enabled, ticket, as, plumberLat, plumberLng, destLat, destLng, retryToken]);

  const retry = useCallback(() => {
    lastFetchRef.current = null;
    setRetryToken((n) => n + 1);
  }, []);

  return { ...state, retry };
}
