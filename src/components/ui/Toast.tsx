"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

interface ToastProps {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
  durationMs?: number;
}

const TONE_STYLES: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-white text-[#0B1F3A]",
};

export function Toast({ message, tone = "info", onDismiss, durationMs = 4500 }: ToastProps) {
  useEffect(() => {
    if (!message || durationMs <= 0) return;
    const id = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? AlertCircle : Info;

  return (
    <div className="fixed bottom-20 right-4 z-[60] max-w-sm md:bottom-6">
      <div
        role="status"
        className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${TONE_STYLES[tone]}`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md p-1 opacity-60 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
