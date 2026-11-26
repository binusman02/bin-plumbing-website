"use client";

import { useEffect } from "react";
import { reportClientIncident } from "@/components/pwa/ClientIncidentReporter";

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientIncident({
      source: "client:next_global_error",
      message: error?.message || "Global layout crash",
      stack: error?.stack,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <html lang="en-NG">
      <body className="flex min-h-screen items-center justify-center bg-slate-50 p-6 font-sans text-[#1B2430]">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-xl font-extrabold text-[#0B1F3A]">
            FlowGuard encountered a temporary error
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            This incident was automatically reported to our engineering monitor.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 rounded-xl bg-[#0B1F3A] px-5 py-2.5 text-xs font-bold text-white"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
