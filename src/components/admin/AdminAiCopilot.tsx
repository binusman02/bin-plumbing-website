"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Mic, Pause, Phone, PhoneOff, Play, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { ChatMessageText } from "@/components/ai/ChatMessageText";
import { useZiatVoice } from "@/components/ai/useZiatVoice";
import { useZiatLiveCall } from "@/components/ai/useZiatLiveCall";

interface AiTurn {
  role: "user" | "assistant";
  content: string;
  audioDataUrl?: string;
}

const STORAGE_KEY = "flowguard-ops-manager-chat-v1";
const INITIAL_TURNS: AiTurn[] = [
  {
    role: "assistant",
    content:
      "Hello, I'm Sadiq, your FlowGuard AI Operations Manager. Tell me what you'd like to review or prepare today — any mutating action I propose will wait for your explicit approval.",
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
  const turnsRef = useRef<AiTurn[]>(turns);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  const {
    recording,
    recordSeconds,
    playingIdx,
    voiceRepliesEnabled,
    micError,
    toggleVoiceReplies,
    startRecording,
    stopRecording,
    playAudio,
  } = useZiatVoice("flowguard-ziat-admin-voice-v1");

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
      const compact = turns
        .slice(-50)
        .map((t) => ({ role: t.role, content: t.content }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
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

  const askAdminAi = async (
    textOverride?: string,
    voicePayload?: {
      audioBase64: string;
      audioMimeType: string;
      durationSec: number;
      suppressAutoPlay?: boolean;
      liveCall?: boolean;
    }
  ): Promise<{ audioDataUrl?: string; replyText?: string }> => {
    const text = voicePayload
      ? `Voice note (${voicePayload.durationSec}s)`
      : (textOverride ?? input).trim();
    if ((!text && !voicePayload) || loading) return {};
    const currentTurns = turnsRef.current;
    const nextTurns: AiTurn[] = [...currentTurns, { role: "user", content: text }];
    turnsRef.current = nextTurns;
    setTurns(nextTurns);
    if (!textOverride && !voicePayload) setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
          ...(voicePayload
            ? {
                audioBase64: voicePayload.audioBase64,
                audioMimeType: voicePayload.audioMimeType,
                liveCall: Boolean(voicePayload.liveCall),
              }
            : {}),
          wantVoiceReply: voiceRepliesEnabled || Boolean(voicePayload),
        }),
      });
      const data = await res.json();
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : data?.error || "Admin AI unavailable right now.";
      const audioDataUrl =
        typeof data?.audioDataUrl === "string" && data.audioDataUrl.startsWith("data:audio/")
          ? data.audioDataUrl
          : undefined;
      const updated = [...nextTurns, { role: "assistant" as const, content: reply, audioDataUrl }];
      turnsRef.current = updated;
      setTurns(updated);
      if (
        audioDataUrl &&
        !voicePayload?.suppressAutoPlay &&
        (voiceRepliesEnabled || Boolean(voicePayload))
      ) {
        playAudio(audioDataUrl, updated.length - 1);
      }
      if (Array.isArray(data?.actionsTaken) && data.actionsTaken.length > 0) {
        window.dispatchEvent(new Event("admin-signals-refresh"));
        window.dispatchEvent(new Event("notifications-refresh"));
        router.refresh();
      }
      return { audioDataUrl, replyText: reply };
    } catch {
      const errTurns = [
        ...nextTurns,
        { role: "assistant" as const, content: "Connection error. Please try again." },
      ];
      turnsRef.current = errTurns;
      setTurns(errTurns);
      return { replyText: "Connection error. Please try again." };
    } finally {
      setLoading(false);
    }
  };

  const {
    callState,
    callSeconds,
    voiceLevel,
    callError,
    startCall,
    endCall,
    interruptAndListen,
  } = useZiatLiveCall(async ({ audioBase64, audioMimeType, durationSec }) => {
    return askAdminAi(undefined, {
      audioBase64,
      audioMimeType,
      durationSec,
      suppressAutoPlay: true,
      liveCall: true,
    });
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#0B1F3A] pl-1.5 pr-4 text-xs font-bold text-white shadow-lg ring-2 ring-[#F5B301]/80 transition hover:bg-[#132f57] md:bottom-6 md:right-6"
      >
        <Image
          src="/images/ai/sadiq.jpg"
          alt="Sadiq"
          width={32}
          height={32}
          className="h-8 w-8 shrink-0 rounded-full border border-[#F5B301] object-cover"
        />
        Ask Sadiq
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-3 z-50 flex max-h-[76vh] w-[calc(100vw-1.5rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-6 md:right-6">
      <div className="flex items-center justify-between bg-[#0B1F3A] px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <Image
            src="/images/ai/sadiq.jpg"
            alt="Sadiq"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
          />
          <div>
            <p className="text-xs font-extrabold">Sadiq • Operations Manager</p>
            <p className="text-[10px] text-slate-300">Live Dispatch, Analysis &amp; Approvals</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => (callState === "idle" ? startCall() : endCall())}
            disabled={loading && callState === "idle"}
            className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold transition ${
              callState === "idle"
                ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                : "bg-rose-500 text-white hover:bg-rose-600"
            }`}
            aria-label={callState === "idle" ? "Start live voice call with Sadiq" : "End live call"}
            title={callState === "idle" ? "Live Call with Sadiq" : "End Call"}
          >
            {callState === "idle" ? (
              <>
                <Phone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Live</span>
              </>
            ) : (
              <>
                <PhoneOff className="h-3.5 w-3.5" />
                <span>End</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={toggleVoiceReplies}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            aria-label={voiceRepliesEnabled ? "Mute Sadiq voice replies" : "Enable Sadiq voice replies"}
            title={voiceRepliesEnabled ? "Voice replies on" : "Voice replies off"}
          >
            {voiceRepliesEnabled ? (
              <Volume2 className="h-3.5 w-3.5 text-[#F5B301]" />
            ) : (
              <VolumeX className="h-3.5 w-3.5 text-slate-300" />
            )}
          </button>
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
            onClick={() => {
              if (callState !== "idle") endCall();
              setOpen(false);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20"
            aria-label="Close Admin AI"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {callState !== "idle" && (
        <div className="flex items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              <span
                className="absolute inset-0 rounded-full bg-emerald-400/40 transition-transform duration-100"
                style={{
                  transform: `scale(${
                    callState === "listening"
                      ? 1 + voiceLevel * 0.45
                      : callState === "speaking"
                        ? 1.25
                        : 1.05
                  })`,
                }}
              />
              <Image
                src="/images/ai/sadiq.jpg"
                alt="Ziat Live"
                width={32}
                height={32}
                className="relative h-8 w-8 rounded-full border-2 border-emerald-500 object-cover"
              />
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-950">
                {callState === "listening" && "Listening… speak naturally"}
                {callState === "thinking" && "Ziat is checking & thinking…"}
                {callState === "speaking" && "Ziat is speaking…"}
              </p>
              <p className="text-[10px] font-medium text-emerald-700">
                Live Call • {String(Math.floor(callSeconds / 60)).padStart(2, "0")}:
                {String(callSeconds % 60).padStart(2, "0")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(callState === "speaking" || callState === "listening") && (
              <button
                type="button"
                onClick={interruptAndListen}
                className="rounded-lg bg-white px-2.5 py-1 text-[10px] font-bold text-[#0B1F3A] shadow-xs ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {callState === "speaking" ? "Interrupt" : "Send now"}
              </button>
            )}
            <button
              type="button"
              onClick={endCall}
              className="rounded-lg bg-rose-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-rose-700"
            >
              End
            </button>
          </div>
        </div>
      )}

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
                src="/images/ai/sadiq.jpg"
                alt="Sadiq"
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
                <div className="mt-1 flex items-center gap-3 px-1">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(t.content);
                        setCopiedIdx(idx);
                        setTimeout(() => setCopiedIdx(null), 1500);
                      } catch {}
                    }}
                    className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-slate-400 transition hover:text-[#0B1F3A]"
                  >
                    {copiedIdx === idx ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedIdx === idx ? "Copied" : "Copy"}
                  </button>
                  {t.audioDataUrl && (
                    <button
                      type="button"
                      onClick={() => playAudio(t.audioDataUrl!, idx)}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold text-[#0B1F3A] transition hover:text-[#F5B301]"
                    >
                      {playingIdx === idx ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                      {playingIdx === idx ? "Pause" : "Listen"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <Image
              src="/images/ai/sadiq.jpg"
              alt="Sadiq"
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

      {(micError || callError) && (
        <p className="border-t border-rose-100 bg-rose-50 px-3 py-1 text-[11px] font-medium text-rose-600">
          {callError || micError}
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5">
        {recording ? (
          <div className="flex h-10 flex-1 items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700">
            <span className="inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-600" />
              Recording… 0:{String(recordSeconds).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={stopRecording}
              className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-700"
            >
              <Square className="h-3 w-3 fill-current" /> Send
            </button>
          </div>
        ) : (
          <>
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
              placeholder="Ask in English, Hausa, or Pidgin..."
              className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() =>
                startRecording((audioBase64, audioMimeType, durationSec) => {
                  askAdminAi(undefined, { audioBase64, audioMimeType, durationSec });
                })
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#0B1F3A] hover:bg-slate-100 disabled:opacity-40"
              aria-label="Send voice note to Sadiq"
              title="Speak to Sadiq"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => askAdminAi()}
              disabled={loading || !input.trim()}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#0B1F3A]/90 disabled:opacity-40"
              aria-label="Send to Admin AI"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
