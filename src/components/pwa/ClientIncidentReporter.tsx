"use client";

import { useEffect } from "react";

const REPORTED_KEYS = new Set<string>();

function isIgnorableClientNoise(message: string, filename?: string): boolean {
  if (!message || message.trim().length < 3) return true;
  if (/^(?:NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)\b/i.test(message.trim())) {
    return true;
  }
  if (
    /ResizeObserver loop|Script error\.?$|AbortError|Load failed|ChunkLoadError/i.test(message) &&
    !filename?.includes("/_next/")
  ) {
    return true;
  }
  if (filename && /(chrome-extension:|moz-extension:|safari-extension:)/i.test(filename)) {
    return true;
  }
  return false;
}

export function reportClientIncident(payload: {
  source: string;
  message: string;
  stack?: string;
  digest?: string;
}) {
  try {
    if (typeof window === "undefined") return;
    if (isIgnorableClientNoise(payload.message)) return;
    const routePath = `${window.location.pathname}${window.location.search}`.slice(0, 160);
    const key = `${payload.source}::${routePath}::${payload.message.slice(0, 80)}`;
    if (REPORTED_KEYS.has(key)) return;
    REPORTED_KEYS.add(key);
    if (REPORTED_KEYS.size > 40) {
      REPORTED_KEYS.clear();
    }

    const body = JSON.stringify({
      source: payload.source,
      message: payload.message.slice(0, 320),
      routePath,
      stack: payload.stack?.slice(0, 450),
      digest: payload.digest,
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/system/incident", blob);
    } else {
      void fetch("/api/system/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never throw inside error reporter
  }
}

export function ClientIncidentReporter() {
  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.error?.message || event.message || "";
      if (isIgnorableClientNoise(message, event.filename)) return;
      reportClientIncident({
        source: "client:window_error",
        message,
        stack: event.error?.stack || `${event.filename || ""}:${event.lineno}:${event.colno}`,
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      if (isIgnorableClientNoise(message)) return;
      reportClientIncident({
        source: "client:unhandled_rejection",
        message,
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
