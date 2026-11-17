"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem("bp-pwa-dismissed") === "1") {
        setDismissed(true);
      }
    } catch {}

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem("bp-pwa-dismissed", "1");
    } catch {}
  };

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-[#F5B301]/40 bg-[#0B1F3A] px-4 py-3 text-white shadow-xs">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[#F5B301]">Install FlowGuard Plumbing App</p>
        <p className="text-xs text-slate-300">
          Add to your home screen for faster access to jobs, quotes, and chat.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F5B301] px-3 text-xs font-bold text-[#07152B] hover:bg-[#e5a700]"
        >
          <Download className="h-3.5 w-3.5" />
          Install
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
