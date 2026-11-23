"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RotateCcw, Send, X } from "lucide-react";
import { ChatMessageText } from "@/components/ai/ChatMessageText";

interface AiTurn {
  role: "user" | "assistant";
  content: string;
}

const STORAGE_KEY = "flowguard-ziat-admin-chat-v1";
const INITIAL_TURNS: AiTurn[] = [
  {
    role: "assistant",
    content:
      "Hey Boss, I'm Ziat. Tell me what you'd like to handle today — whether it's checking pending payments, assigning a plumber, drafting a quick update, or reviewing today's numbers.",
  },
];

const QUICK_PROMPTS = [
  { label: "Daily Briefing", prompt: "Give me a daily operations briefing of what needs my attention right now." },
  { label: "Assign Plumber", prompt: "Which unassigned jobs do we have and which On-Duty plumber should I assign to each?" },
  { label: "Draft Reply", prompt: "Help me draft a polite update message for a customer waiting on verification or technician arrival." },
  { label: "Financials", prompt: "Summarize our verified revenue, total commission, and any pending payments." },
];

export function AdminAiCopilot() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
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

  const askAdminAi = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;
    const nextTurns: AiTurn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    if (!textOverride) setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextTurns }),
      });
      const data = await res.json();
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : data?.error || "Admin AI unavailable right now.";
      setTurns([...nextTurns, { role: "assistant", content: reply }]);
      if (Array.isArray(data?.actionsTaken) && data.actionsTaken.length > 0) {
        window.dispatchEvent(new Event("admin-signals-refresh"));
        window.dispatchEvent(new Event("notifications-refresh"));
        router.refresh();
      }
    } catch {
      setTurns([
        ...nextTurns,
        { role: "assistant", content: "Connection error. Please try again." },
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
        className="fixed bottom-20 right-4 z-40 inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#0B1F3A] pl-1.5 pr-4 text-xs font-bold text-white shadow-lg ring-2 ring-[#F5B301]/80 transition hover:bg-[#132f57] md:bottom-6 md:right-6"
      >
        <Image
          src="/images/ai/ziat-avatar.jpg"
          alt="Ziat"
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full border border-[#F5B301] object-cover"
        />
        Ask Ziat
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-3 z-50 flex max-h-[76vh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-6 md:right-6">
      <div className="flex items-center justify-between bg-[#0B1F3A] px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <Image
            src="/images/ai/ziat-avatar.jpg"
            alt="Ziat"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
          />
          <div>
            <p className="text-xs font-extrabold">Ziat • Admin Copilot</p>
            <p className="text-[10px] text-slate-300">Live Dispatch, Analysis &amp; Actions</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {turns.length > 1 && (
            <button
              type="button"
              onClick={clearChat}
              disabled={loading}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20 disabled:opacity-40"
              aria-label="Clear chat history"
              title="New chat"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            aria-label="Close Admin AI"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50 px-3 py-2">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={loading}
            onClick={() => askAdminAi(q.prompt)}
            className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-[#0B1F3A] hover:border-[#F5B301] hover:bg-amber-50/50 disabled:opacity-50"
          >
            {q.label}
          </button>
        ))}
      </div>

      <div ref={scrollContainerRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-3.5">
        {turns.map((t, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {t.role === "assistant" && (
              <Image
                src="/images/ai/ziat-avatar.jpg"
                alt="Ziat"
                width={26}
                height={26}
                className="mb-0.5 h-6.5 w-6.5 shrink-0 rounded-full border border-[#F5B301]/70 object-cover shadow-xs"
              />
            )}
            <div className={`flex max-w-[84%] flex-col ${t.role === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`px-3.5 py-2.5 shadow-xs ${
                  t.role === "user"
                    ? "rounded-2xl rounded-br-sm bg-[#0B1F3A] text-white"
                    : "rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white text-slate-800"
                }`}
              >
                <ChatMessageText content={t.content} isUser={t.role === "user"} />
              </div>
              {t.role === "assistant" && idx > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(t.content);
                      setCopiedIdx(idx);
                      setTimeout(() => setCopiedIdx(null), 1500);
                    } catch {}
                  }}
                  className="mt-1 inline-flex items-center gap-1 whitespace-nowrap px-1 text-[10px] font-medium text-slate-400 transition hover:text-[#0B1F3A]"
                >
                  {copiedIdx === idx ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedIdx === idx ? "Copied" : "Copy"}
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <Image
              src="/images/ai/ziat-avatar.jpg"
              alt="Ziat"
              width={26}
              height={26}
              className="h-6.5 w-6.5 shrink-0 rounded-full border border-[#F5B301]/70 object-cover"
            />
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs text-slate-500 shadow-xs">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              askAdminAi();
            }
          }}
          placeholder="Ask about jobs, plumbers, replies, revenue..."
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
        />
        <button
          type="button"
          onClick={() => askAdminAi()}
          disabled={loading || !input.trim()}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#0B1F3A]/90 disabled:opacity-40"
          aria-label="Send to Admin AI"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
