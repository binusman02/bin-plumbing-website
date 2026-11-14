"use client";

export type AnalyticsEventName =
  | "request_submitted"
  | "whatsapp_clicked"
  | "call_clicked"
  | "quote_approved"
  | "tracking_searched";

/**
 * Privacy-friendly analytics helper: dispatches an in-page CustomEvent and optional
 * navigator.sendBeacon without cookies or personal identifiers.
 */
export function trackEvent(
  event: AnalyticsEventName,
  metadata?: Record<string, string | number | boolean>
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("bp:analytics", {
        detail: { event, metadata, ts: Date.now() },
      })
    );
  } catch {}
}
