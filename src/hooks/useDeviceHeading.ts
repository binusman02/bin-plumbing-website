"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NAV_CONFIG, normalizeHeading, smoothHeading } from "@/lib/live-navigation";

export interface DeviceHeadingState {
  /** Smoothed heading in degrees [0, 360), or null if never known. */
  heading: number | null;
  /** True when live heading source (GPS > 1 m/s or active compass) is feeding updates. */
  hasLiveHeading: boolean;
  /** Whether iOS-style DeviceOrientationEvent.requestPermission() is required. */
  needsPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

/**
 * Combines GPS course-over-ground (when moving > 1 m/s) with device compass
 * (`deviceorientationabsolute` -> `deviceorientation` fallback) when stationary
 * or walking slowly, smoothed with a shortest-angle low-pass filter and capped
 * at 10 Hz for UI/map updates.
 */
export function useDeviceHeading(params: {
  enabled: boolean;
  gpsHeadingDeg: number | null;
  gpsSpeedMps: number | null;
}): DeviceHeadingState {
  const { enabled, gpsHeadingDeg, gpsSpeedMps } = params;
  const [heading, setHeading] = useState<number | null>(null);
  const [hasLiveHeading, setHasLiveHeading] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);

  const smoothedRef = useRef<number | null>(null);
  const lastEmitMsRef = useRef(0);
  const compassActiveRef = useRef(false);
  const lastCompassMsRef = useRef(0);

  const pushSample = useCallback((rawDeg: number, live: boolean) => {
    const next = smoothHeading(smoothedRef.current, rawDeg, 0.28);
    smoothedRef.current = next;
    const now = performance.now();
    const minIntervalMs = 100; // max 10 Hz
    if (now - lastEmitMsRef.current >= minIntervalMs) {
      lastEmitMsRef.current = now;
      setHeading(next);
      setHasLiveHeading(live);
    }
  }, []);

  // When moving > 1 m/s with valid GPS heading, prefer GPS heading
  useEffect(() => {
    if (!enabled) return;
    if (
      gpsSpeedMps != null &&
      Number.isFinite(gpsSpeedMps) &&
      gpsSpeedMps > NAV_CONFIG.MIN_MOVING_SPEED_MPS &&
      gpsHeadingDeg != null &&
      Number.isFinite(gpsHeadingDeg)
    ) {
      pushSample(gpsHeadingDeg, true);
    } else if (!compassActiveRef.current) {
      // Stationary/slow without compass: hold last known heading and hide cone
      setHasLiveHeading(false);
    }
  }, [enabled, gpsHeadingDeg, gpsSpeedMps, pushSample]);

  const attachListeners = useCallback(() => {
    if (typeof window === "undefined") return () => {};

    let hasAbsoluteEvent = false;

    const handleOrientation = (ev: DeviceOrientationEvent, isAbsolute: boolean) => {
      if (isAbsolute) hasAbsoluteEvent = true;
      else if (hasAbsoluteEvent) return; // prefer absolute if available

      // If moving fast, GPS heading takes precedence
      if (
        gpsSpeedMps != null &&
        Number.isFinite(gpsSpeedMps) &&
        gpsSpeedMps > NAV_CONFIG.MIN_MOVING_SPEED_MPS
      ) {
        return;
      }

      const webkitHeading = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let rawDeg: number | null = null;
      if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
        rawDeg = webkitHeading;
      } else if (typeof ev.alpha === "number" && Number.isFinite(ev.alpha)) {
        // Standard DeviceOrientation alpha is counter-clockwise from North (when absolute)
        rawDeg = normalizeHeading(360 - ev.alpha);
      }

      if (rawDeg == null) return;
      compassActiveRef.current = true;
      lastCompassMsRef.current = Date.now();
      pushSample(rawDeg, true);
    };

    const onAbs = (e: Event) => handleOrientation(e as DeviceOrientationEvent, true);
    const onRel = (e: Event) => handleOrientation(e as DeviceOrientationEvent, false);

    window.addEventListener("deviceorientationabsolute", onAbs, true);
    window.addEventListener("deviceorientation", onRel, true);

    return () => {
      window.removeEventListener("deviceorientationabsolute", onAbs, true);
      window.removeEventListener("deviceorientation", onRel, true);
    };
  }, [gpsSpeedMps, pushSample]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setHasLiveHeading(false);
      return;
    }

    const DeviceOrient = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;

    if (DeviceOrient && typeof DeviceOrient.requestPermission === "function") {
      setNeedsPermission(true);
      return;
    }

    return attachListeners();
  }, [enabled, attachListeners]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const DeviceOrient = window.DeviceOrientationEvent as
      | (typeof DeviceOrientationEvent & {
          requestPermission?: () => Promise<"granted" | "denied">;
        })
      | undefined;
    if (!DeviceOrient || typeof DeviceOrient.requestPermission !== "function") {
      setNeedsPermission(false);
      return true;
    }
    try {
      const res = await DeviceOrient.requestPermission();
      if (res === "granted") {
        setNeedsPermission(false);
        attachListeners();
        return true;
      }
    } catch {
      // Ignore permission rejection; cone stays hidden gracefully
    }
    return false;
  }, [attachListeners]);

  return { heading, hasLiveHeading, needsPermission, requestPermission };
}
