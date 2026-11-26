"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientIncident } from "@/components/pwa/ClientIncidentReporter";

export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientIncident({
      source: "client:next_error_boundary",
      message: error?.message || "Unexpected page error",
      stack: error?.stack,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-extrabold uppercase tracking-wider text-amber-600">
          FlowGuard Notice
        </p>
        <h2 className="mt-2 text-xl font-extrabold text-[#0B1F3A]">
          Something went wrong on this page
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Our engineering team has been alerted automatically. Please try reloading or return home.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#132f57]"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
