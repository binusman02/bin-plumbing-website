"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, X } from "lucide-react";

interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "flowguard-ziat-customer-chat-v1";
const INITIAL_TURNS: AiTurn[] = [
  {
    role: "assistant",
    content:
      "Hi! I'm Ziat, your FlowGuard assistant. Ask me about our plumbing services in Kano, emergency leak steps, or how to book a technician.",
  },
];

export function FlowGuardAiAssistant({
  onBookRequest,
}: {
  onBookRequest?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [turns, setTurns] = useState<AiTurn[]>(INITIAL_TURNS);
  const hydratedRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (item) =>
              item &&
              (item.role === "user" || item.role === "assistant") &&
              typeof item.content === "string"
          )
        ) {
          setTurns(parsed);
        }
      }
    } catch {
      // Ignore storage read errors
    } finally {
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-50)));
    } catch {
      // Ignore storage write errors
    }
  }, [turns]);

  useEffect(() => {
    if (!open) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [turns, loading, open]);

  const clearChat = () => {
    setTurns(INITIAL_TURNS);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextTurns: AiTurn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextTurns }),
      });
      const data = await res.json();
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : data?.error || "Unable to reach FlowGuard AI right now.";
      setTurns([...nextTurns, { role: "assistant", content: reply }]);
    } catch {
      setTurns([
        ...nextTurns,
        {
          role: "assistant",
          content: "Connection error. Please check your internet and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-[#0B1F3A]/20 bg-white px-3.5 text-xs font-bold text-[#0B1F3A] shadow-sm transition hover:bg-slate-50"
      >
        <Image
          src="/images/ai/ziat-avatar.jpg"
          alt="Ziat"
          width={24}
          height={24}
          className="h-6 w-6 rounded-full border border-[#F5B301] object-cover"
        />
        Ask Ziat
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Image
            src="/images/ai/ziat-avatar.jpg"
            alt="Ziat"
            width={34}
            height={34}
            className="h-8.5 w-8.5 rounded-full border-2 border-[#F5B301] object-cover"
          />
          <div>
            <p className="text-xs font-extrabold text-[#0B1F3A]">
              Ziat
            </p>
            <p className="text-[11px] text-slate-500">
              FlowGuard Assistant • 24/7 Plumbing Help
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {turns.length > 1 && (
            <button
              type="button"
              onClick={clearChat}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
              aria-label="Clear chat history"
              title="New chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close AI assistant"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={scrollContainerRef} className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
        {turns.map((t, idx) => (
          <div
            key={idx}
            className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                t.role === "user"
                  ? "bg-[#0B1F3A] text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask about leaks, services, or areas..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#0B1F3A]/90 disabled:opacity-40"
          aria-label="Ask AI"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {onBookRequest && (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onBookRequest}
            className="text-[11px] font-bold text-[#0B1F3A] underline hover:text-[#F5B301]"
          >
            Ready to book? Submit a New Request →
          </button>
        </div>
      )}
    </div>
  );
}
