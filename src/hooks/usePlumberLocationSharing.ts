"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  sendLocationHeartbeatAction,
  updatePlumberLocationAction,
} from "@/app/actions/marketplace-actions";
import { broadcastRealtimeEvent } from "@/lib/realtime-hub";
import { decideSend, LOCATION_CONFIG } from "@/lib/live-location";

export type SharingPhase =
  /** Not sharing (Off Duty with no active job). */
  | "off"
  /** Waiting for permission / first server-confirmed update. NOT shown as active. */
  | "starting"
  /** Server confirmed a recent update. */
  | "active"
  | "permission_denied"
  | "gps_unavailable"
  | "gps_timeout"
  | "weak_signal"
  | "offline"
  | "update_failed"
  | "not_allowed";

export interface DeviceGpsFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  speed: number | null;
  timestampMs: number;
}

export interface PlumberSharingState {
  phase: SharingPhase;
  /** Epoch ms of the last update the SERVER confirmed (server clock). */
  lastConfirmedAtMs: number | null;
  /** Latest device fix (for the plumber's own map), confirmed or not. */
  deviceCoords: { lat: number; lng: number } | null;
  /** Full local GPS fix for 60fps own-position rendering without server round-trip. */
  deviceFix: DeviceGpsFix | null;
  accuracyM: number | null;
  message: string | null;
}

const MAX_BACKOFF_MS = 60_000;

/**
 * Foreground GPS sharing for an approved plumber.
 *
 * Rules:
 *  - "active" is only ever set after the server confirmed persistence.
 *  - Updates are throttled/filtered (time, distance, accuracy) and de-duplicated
 *    (one request in flight; newest fix wins).
 *  - Offline: the newest fix is retained and sent when the connection returns.
 *  - Stationary: heartbeats keep the plumber from looking offline.
 *  - Browser tabs that are closed/suspended cannot send GPS; the server/status
 *    thresholds will honestly show STALE / LAST SEEN.
 */
export function usePlumberLocationSharing(params: {
  enabled: boolean;
  /** When false, watches local GPS for own-screen dot only and sends NOTHING to the server. */
  shareToServer?: boolean;
  /** Active job ticket numbers; used only to tell viewers a refresh is due. */
  activeTickets: string[];
}): PlumberSharingState & { retrying: boolean; retry: () => void } {
  const { enabled, shareToServer = true, activeTickets } = params;
  const [retrying, setRetrying] = useState(false);
  const [state, setState] = useState<PlumberSharingState>({
    phase: "off",
    lastConfirmedAtMs: null,
    deviceCoords: null,
    deviceFix: null,
    accuracyM: null,
    message: null,
  });

  const ticketsRef = useRef(activeTickets);
  const shareToServerRef = useRef(shareToServer);
  const lastSentRef = useRef<{ lat: number; lng: number; sentAtMs: number } | null>(null);
  const lastFixRef = useRef<GeolocationPosition | null>(null);
  const lastFixTimeMsRef = useRef(0);
  const lastWatchEventRef = useRef(0);
  const gnssWeakUntilRef = useRef(0);
  const throttleTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<GeolocationPosition | null>(null);
  const failuresRef = useRef(0);
  const blockedUntilRef = useRef(0);
  const permissionDeniedRef = useRef(false);

  useEffect(() => {
    ticketsRef.current = activeTickets;
  }, [activeTickets]);

  const patch = useCallback((p: Partial<PlumberSharingState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const handleResult = useCallback(
    (
      res:
        | { success: true; confirmedAt: string; ignored?: boolean }
        | { success: false; code: string; error: string }
    ) => {
      if (res.success) {
        failuresRef.current = 0;
        blockedUntilRef.current = 0;
        patch({
          phase: "active",
          lastConfirmedAtMs: Date.parse(res.confirmedAt) || Date.now(),
          message: null,
        });
        // Signal only (no coordinates). Authorised viewers re-fetch.
        broadcastRealtimeEvent("location_update", {
          ticketNumbers: ticketsRef.current.slice(0, 20),
        });
        return;
      }
      switch (res.code) {
        case "unauthorized":
        case "not_allowed":
          patch({ phase: "not_allowed", message: res.error });
          break;
        case "poor_accuracy":
          patch({
            phase: "weak_signal",
            message: "GPS accuracy is currently low. Move to an open area and try again.",
          });
          break;
        case "rate_limited":
          blockedUntilRef.current = Date.now() + 10_000;
          break;
        case "implausible":
          // Keep sharing; one unreliable fix must not break the session.
          break;
        default: {
          failuresRef.current += 1;
          const backoff = Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (failuresRef.current - 1));
          blockedUntilRef.current = Date.now() + backoff;
          patch({
            phase: "update_failed",
            message: "Location update failed. Your last confirmed location is still available.",
          });
        }
      }
    },
    [patch]
  );

  const submitRef = useRef<
    (pos: GeolocationPosition, decision: "send" | "heartbeat") => Promise<void>
  >(async () => {});

  const submit = useCallback(
    async (pos: GeolocationPosition, decision: "send" | "heartbeat") => {
      if (inFlightRef.current) {
        pendingRef.current = pos; // newest fix wins
        return;
      }
      inFlightRef.current = true;
      try {
        let res;
        if (decision === "heartbeat") {
          res = await sendLocationHeartbeatAction();
          // Heartbeat can only confirm an already-stored location.
          if (!res.success && res.code === "no_location") {
            res = await updatePlumberLocationAction({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              timestamp: pos.timestamp,
            });
          }
        } else {
          res = await updatePlumberLocationAction({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          });
        }
        if (res.success && decision === "send") {
          lastSentRef.current = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            sentAtMs: Date.now(),
          };
        } else if (res.success) {
          lastSentRef.current = lastSentRef.current
            ? { ...lastSentRef.current, sentAtMs: Date.now() }
            : null;
        }
        handleResult(res);
      } catch {
        // Network failure: the action never reached the server.
        failuresRef.current += 1;
        blockedUntilRef.current =
          Date.now() + Math.min(MAX_BACKOFF_MS, 5_000 * 2 ** (failuresRef.current - 1));
        pendingRef.current = pos;
        patch({
          phase: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "update_failed",
          message: "Connection lost. Your last confirmed location is still available.",
        });
      } finally {
        inFlightRef.current = false;
        const next = pendingRef.current;
        if (next && Date.now() >= blockedUntilRef.current) {
          pendingRef.current = null;
          if (Date.now() - next.timestamp < LOCATION_CONFIG.MAX_FIX_AGE_MS) {
            void submitRef.current(next, "send");
          }
        }
      }
    },
    [handleResult, patch]
  );

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    shareToServerRef.current = shareToServer;
    if (!shareToServer) {
      lastSentRef.current = null;
      pendingRef.current = null;
      if (throttleTimerRef.current != null) {
        window.clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      setState((s) =>
        s.phase === "off"
          ? s
          : { ...s, phase: "off", lastConfirmedAtMs: null, message: null }
      );
    } else if (lastFixRef.current && enabled) {
      setState((s) => (s.phase === "off" ? { ...s, phase: "starting" } : s));
      void submitRef.current(lastFixRef.current, "send");
    }
  }, [shareToServer, enabled]);

  const onFix = useCallback(
    (pos: GeolocationPosition) => {
      const prevFix = lastFixRef.current;
      lastFixRef.current = pos;
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      const rawTimeMs =
        typeof pos.timestamp === "number" && pos.timestamp > 0 ? pos.timestamp : Date.now();
      const coordsChanged =
        !prevFix ||
        Math.abs(latitude - prevFix.coords.latitude) > 1e-7 ||
        Math.abs(longitude - prevFix.coords.longitude) > 1e-7;
      const fixTimeMs =
        coordsChanged && rawTimeMs <= lastFixTimeMsRef.current
          ? Math.max(Date.now(), lastFixTimeMsRef.current + 1)
          : rawTimeMs;
      lastFixTimeMsRef.current = Math.max(lastFixTimeMsRef.current, fixTimeMs);
      permissionDeniedRef.current = false;
      patch({
        deviceCoords: { lat: latitude, lng: longitude },
        deviceFix: {
          lat: latitude,
          lng: longitude,
          accuracyM: Number.isFinite(accuracy) ? accuracy : null,
          heading: heading != null && Number.isFinite(heading) ? heading : null,
          speed: speed != null && Number.isFinite(speed) ? speed : null,
          timestampMs: fixTimeMs,
        },
        accuracyM: Number.isFinite(accuracy) ? accuracy : null,
      });

      // Local-only preview mode (before Start Trip / after Arrived): never upload to server.
      if (!shareToServerRef.current) {
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        pendingRef.current = pos;
        patch({
          phase: "offline",
          message: "Connection lost. Your last confirmed location is still available.",
        });
        return;
      }
      if (Number.isFinite(accuracy) && accuracy > LOCATION_CONFIG.MAX_ACCEPTABLE_ACCURACY_M) {
        patch({
          phase: "weak_signal",
          message: "GPS accuracy is currently low. Move to an open area and try again.",
        });
        return;
      }
      if (Date.now() < blockedUntilRef.current) {
        pendingRef.current = pos;
        return;
      }

      const decision = decideSend({
        previous: lastSentRef.current,
        next: { lat: latitude, lng: longitude },
        nowMs: Date.now(),
      });
      if (decision === "skip") {
        // Schedule a deferred flush so the latest movement is never dropped by the throttle window
        if (lastSentRef.current && throttleTimerRef.current == null) {
          const waitMs = Math.max(
            200,
            LOCATION_CONFIG.MIN_SEND_INTERVAL_MS -
              (Date.now() - lastSentRef.current.sentAtMs) +
              100
          );
          throttleTimerRef.current = window.setTimeout(() => {
            throttleTimerRef.current = null;
            const latest = lastFixRef.current;
            if (!latest) return;
            const retryDecision = decideSend({
              previous: lastSentRef.current,
              next: { lat: latest.coords.latitude, lng: latest.coords.longitude },
              nowMs: Date.now(),
            });
            if (retryDecision !== "skip") {
              void submitRef.current(latest, retryDecision);
            }
          }, waitMs);
        }
        return;
      }
      if (throttleTimerRef.current != null) {
        window.clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      void submit(pos, decision);
    },
    [patch, submit]
  );

  const onGeoError = useCallback(
    (err: GeolocationPositionError) => {
      setRetrying(false);
      if (err.code === err.PERMISSION_DENIED) {
        permissionDeniedRef.current = true;
        patch({
          phase: "permission_denied",
          message:
            "Location access is disabled. Please enable location permission in your browser settings, then tap Retry.",
        });
      } else if (err.code === err.TIMEOUT) {
        patch({
          phase: "gps_timeout",
          message: "GPS is taking too long. Move to an open area; we will keep trying.",
        });
      } else {
        patch({
          phase: "gps_unavailable",
          message: "Your device could not retrieve its current location. Please try again.",
        });
      }
    },
    [patch]
  );

  const requestOnce = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setRetrying(false);
      patch({
        phase: "gps_unavailable",
        message: "This device or browser does not support location.",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRetrying(false);
        onFix(pos);
      },
      (err) => {
        if (err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setRetrying(false);
              onFix(pos);
            },
            onGeoError,
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 }
          );
          return;
        }
        onGeoError(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 15_000,
      }
    );
  }, [onFix, onGeoError, patch]);

  const retry = useCallback(() => {
    permissionDeniedRef.current = false;
    failuresRef.current = 0;
    blockedUntilRef.current = 0;
    lastSentRef.current = null;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      patch({
        phase: "gps_unavailable",
        message: "This device or browser does not support location.",
      });
      return;
    }
    setRetrying(true);
    patch({ message: "Checking GPS location..." });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setRetrying(false);
        onFix(pos);
      },
      (err) => {
        if (err.code === err.TIMEOUT) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setRetrying(false);
              onFix(pos);
            },
            onGeoError,
            { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15_000 }
          );
          return;
        }
        onGeoError(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 0,
      }
    );
  }, [onFix, onGeoError, patch]);

  // Main lifecycle: watchPosition while enabled; clearWatch on stop/unmount.
  useEffect(() => {
    if (!enabled) {
      setState((s) =>
        s.phase === "off"
          ? s
          : {
              phase: "off",
              lastConfirmedAtMs: null,
              deviceCoords: null,
              deviceFix: null,
              accuracyM: null,
              message: null,
            }
      );
      lastSentRef.current = null;
      pendingRef.current = null;
      failuresRef.current = 0;
      blockedUntilRef.current = 0;
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      patch({
        phase: "gps_unavailable",
        message: "This device or browser does not support location.",
      });
      return;
    }

    if (shareToServerRef.current) {
      patch({ phase: "starting", message: null });
    }
    requestOnce();

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        lastWatchEventRef.current = Date.now();
        gnssWeakUntilRef.current = 0;
        onFix(pos);
      },
      onGeoError,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );

    // Indoors or on throttled phones, high-accuracy GNSS watchPosition can stall.
    // Poll every 2.5s when quiet and immediately switch to fused Wi-Fi/network fixes
    // for 15s whenever GNSS times out, instead of blocking 16s per update.
    const pollFused = () => {
      navigator.geolocation.getCurrentPosition(
        onFix,
        (fallbackErr) => {
          if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
            onGeoError(fallbackErr);
          }
        },
        {
          enableHighAccuracy: false,
          timeout: 4_000,
          maximumAge: 1_500,
        }
      );
    };

    const keepAlive = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (permissionDeniedRef.current) return;
      const now = Date.now();
      const silentMs = now - lastWatchEventRef.current;
      if (silentMs < 2_500) return;

      if (now < gnssWeakUntilRef.current) {
        pollFused();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        onFix,
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            onGeoError(err);
            return;
          }
          gnssWeakUntilRef.current = Date.now() + 15_000;
          pollFused();
        },
        {
          enableHighAccuracy: true,
          timeout: 2_500,
          maximumAge: 0,
        }
      );
    }, 2_500);

    const flushPending = () => {
      const pos = pendingRef.current;
      if (pos && Date.now() - pos.timestamp < LOCATION_CONFIG.MAX_FIX_AGE_MS) {
        pendingRef.current = null;
        blockedUntilRef.current = 0;
        void submit(pos, "send");
      } else {
        requestOnce();
      }
    };
    const onOnline = () => flushPending();
    const onOffline = () =>
      patch({
        phase: "offline",
        message: "Connection lost. Your last confirmed location is still available.",
      });
    const onVisible = () => {
      if (document.visibilityState === "visible") requestOnce();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    // Detect permission changes made in browser settings while the app is open.
    let permStatus: PermissionStatus | null = null;
    const onPermChange = () => {
      if (!permStatus) return;
      if (permStatus.state === "denied") {
        permissionDeniedRef.current = true;
        patch({
          phase: "permission_denied",
          message:
            "Location access is disabled. Please enable location permission in your browser settings, then tap Retry.",
        });
      } else if (permStatus.state === "granted") {
        permissionDeniedRef.current = false;
        requestOnce();
      }
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          permStatus = status;
          status.addEventListener("change", onPermChange);
          if (status.state === "denied") onPermChange();
        })
        .catch(() => {});
    }

    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.clearInterval(keepAlive);
      if (throttleTimerRef.current != null) {
        window.clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      permStatus?.removeEventListener("change", onPermChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { ...state, retrying, retry };
}
