"use client";

import { useEffect, useRef, useState } from "react";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
}

/**
 * Keeps the screen awake during an active plumber trip and automatically
 * re-acquires the Wake Lock after the user unlocks the phone (`visibilitychange`).
 */
export function useScreenWakeLock(enabled: boolean): { active: boolean } {
  const [active, setActive] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || typeof document === "undefined") {
      setActive(false);
      return;
    }

    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;

    if (!wakeLockApi || typeof wakeLockApi.request !== "function") {
      return;
    }

    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        if (sentinelRef.current && !sentinelRef.current.released) return;
        const sentinel = await wakeLockApi.request("screen");
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
        setActive(true);
        sentinel.addEventListener?.("release", () => {
          if (!cancelled) setActive(false);
        });
      } catch {
        if (!cancelled) setActive(false);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const current = sentinelRef.current;
      sentinelRef.current = null;
      setActive(false);
      if (current && !current.released) {
        current.release().catch(() => {});
      }
    };
  }, [enabled]);

  return { active };
}
