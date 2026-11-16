"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fuseGyroCompassHeading,
  NAV_CONFIG,
  normalizeHeading,
  smoothHeading,
} from "@/lib/live-navigation";

export interface DeviceHeadingState {
  /** Smoothed heading in degrees [0, 360), or null if never known. */
  heading: number | null;
  /** True when live heading source (GPS > 1 m/s, gyro, or active compass) is feeding updates. */
  hasLiveHeading: boolean;
  /** Whether iOS-style DeviceOrientationEvent.requestPermission() is required. */
  needsPermission: boolean;
  requestPermission: () => Promise<boolean>;
}

interface GyroscopeLike {
  z?: number | null;
  timestamp?: number | null;
  start: () => void;
  stop: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

/**
 * Combines W3C Gyroscope (`z` rad/s complementary filter when available on Android Chrome),
 * device compass (`deviceorientationabsolute` -> `deviceorientation`), and GPS course (> 1 m/s),
 * smoothed with shortest-angle filtering and capped at 10 Hz for UI/map updates.
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
  const lastCompassDegRef = useRef<number | null>(null);
  const lastEmitMsRef = useRef(0);
  const compassActiveRef = useRef(false);
  const gpsRef = useRef({ heading: gpsHeadingDeg, speed: gpsSpeedMps });

  useEffect(() => {
    gpsRef.current = { heading: gpsHeadingDeg, speed: gpsSpeedMps };
  }, [gpsHeadingDeg, gpsSpeedMps]);

  const emitIfDue = useCallback((next: number | null, live: boolean) => {
    if (next == null) return;
    smoothedRef.current = next;
    const now = performance.now();
    if (now - lastEmitMsRef.current >= 100) {
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
      const next = smoothHeading(smoothedRef.current, gpsHeadingDeg, 0.28);
      emitIfDue(next, true);
    } else if (!compassActiveRef.current) {
      setHasLiveHeading(false);
    }
  }, [enabled, gpsHeadingDeg, gpsSpeedMps, emitIfDue]);

  const attachListeners = useCallback(() => {
    if (typeof window === "undefined") return () => {};

    let hasAbsoluteEvent = false;
    let gyroSensor: GyroscopeLike | null = null;
    let lastGyroSec: number | null = null;

    const handleOrientation = (ev: DeviceOrientationEvent, isAbsolute: boolean) => {
      if (isAbsolute) hasAbsoluteEvent = true;
      else if (hasAbsoluteEvent) return;

      const { speed, heading: gpsHd } = gpsRef.current;
      if (speed != null && Number.isFinite(speed) && speed > NAV_CONFIG.MIN_MOVING_SPEED_MPS) {
        return;
      }

      const webkitHeading = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let rawDeg: number | null = null;
      if (typeof webkitHeading === "number" && Number.isFinite(webkitHeading)) {
        rawDeg = webkitHeading;
      } else if (typeof ev.alpha === "number" && Number.isFinite(ev.alpha)) {
        rawDeg = normalizeHeading(360 - ev.alpha);
      }
      if (rawDeg == null) return;

      compassActiveRef.current = true;
      lastCompassDegRef.current = rawDeg;

      // If gyro is active, gyro reading loop already fuses compass at 30 Hz;
      // otherwise smooth directly from compass.
      if (!gyroSensor) {
        const next = smoothHeading(smoothedRef.current, rawDeg, 0.28);
        emitIfDue(next, true);
      } else if (smoothedRef.current == null) {
        const next = fuseGyroCompassHeading({
          currentDeg: null,
          compassDeg: rawDeg,
          gpsHeadingDeg: gpsHd,
          speedMps: speed,
        });
        emitIfDue(next, true);
      }
    };

    const onAbs = (e: Event) => handleOrientation(e as DeviceOrientationEvent, true);
    const onRel = (e: Event) => handleOrientation(e as DeviceOrientationEvent, false);

    window.addEventListener("deviceorientationabsolute", onAbs, true);
    window.addEventListener("deviceorientation", onRel, true);

    // Optional W3C Gyroscope complementary fusion (Chromium / Android Chrome)
    const GyroCtor = (
      window as unknown as {
        Gyroscope?: new (opts?: { frequency?: number; referenceFrame?: string }) => GyroscopeLike;
      }
    ).Gyroscope;

    const onGyroReading = () => {
      if (!gyroSensor) return;
      const nowSec = performance.now() / 1000;
      const dtSec = lastGyroSec != null ? nowSec - lastGyroSec : 0;
      lastGyroSec = nowSec;
      const { speed, heading: gpsHd } = gpsRef.current;
      const fused = fuseGyroCompassHeading({
        currentDeg: smoothedRef.current,
        gyroZRadPerSec: gyroSensor.z ?? null,
        dtSec,
        compassDeg: lastCompassDegRef.current,
        gpsHeadingDeg: gpsHd,
        speedMps: speed,
        correctionAlpha: 0.04,
      });
      if (fused != null) {
        emitIfDue(fused, true);
      }
    };

    const onGyroError = () => {
      if (gyroSensor) {
        try {
          gyroSensor.removeEventListener("reading", onGyroReading);
          gyroSensor.removeEventListener("error", onGyroError);
          gyroSensor.stop();
        } catch {
          // ignore
        }
        gyroSensor = null;
      }
    };

    if (typeof GyroCtor === "function") {
      try {
        gyroSensor = new GyroCtor({ frequency: 30, referenceFrame: "screen" });
        gyroSensor.addEventListener("reading", onGyroReading);
        gyroSensor.addEventListener("error", onGyroError);
        gyroSensor.start();
      } catch {
        gyroSensor = null;
      }
    }

    return () => {
      window.removeEventListener("deviceorientationabsolute", onAbs, true);
      window.removeEventListener("deviceorientation", onRel, true);
      onGyroError();
    };
  }, [emitIfDue]);

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
      // Ignore permission rejection
    }
    return false;
  }, [attachListeners]);

  return { heading, hasLiveHeading, needsPermission, requestPermission };
}
