"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, RotateCcw, Send, Square, Volume2, VolumeX, X } from "lucide-react";
import { ChatMessageText } from "@/components/ai/ChatMessageText";
import { useZiatVoice } from "@/components/ai/useZiatVoice";

interface AiTurn {
  role: "user" | "assistant";
  content: string;
  audioDataUrl?: string;
}

const STORAGE_KEY = "flowguard-ziat-customer-chat-v1";
const INITIAL_TURNS: AiTurn[] = [
  {
    role: "assistant",
    content:
      "Hi there! I'm Ziat from FlowGuard. Tell me what's going on with your plumbing in Kano, and I'll help you right away or guide you on booking a technician.",
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
  } = useZiatVoice("flowguard-ziat-customer-voice-v1");

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

  const sendMessage = async (
    voicePayload?: { audioBase64: string; audioMimeType: string; durationSec: number }
  ) => {
    const text = voicePayload
      ? `Voice note (${voicePayload.durationSec}s)`
      : input.trim();
    if ((!text && !voicePayload) || loading) return;
    const nextTurns: AiTurn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    if (!voicePayload) setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextTurns.map((t) => ({ role: t.role, content: t.content })),
          ...(voicePayload
            ? {
                audioBase64: voicePayload.audioBase64,
                audioMimeType: voicePayload.audioMimeType,
              }
            : {}),
          wantVoiceReply: voiceRepliesEnabled || Boolean(voicePayload),
        }),
      });
      const data = await res.json();
      const reply =
        typeof data?.reply === "string" && data.reply.trim()
          ? data.reply.trim()
          : data?.error || "Unable to reach FlowGuard AI right now.";
      const audioDataUrl =
        typeof data?.audioDataUrl === "string" && data.audioDataUrl.startsWith("data:audio/")
          ? data.audioDataUrl
          : undefined;
      const updated = [...nextTurns, { role: "assistant" as const, content: reply, audioDataUrl }];
      setTurns(updated);
      if (audioDataUrl && (voiceRepliesEnabled || Boolean(voicePayload))) {
        playAudio(audioDataUrl, updated.length - 1);
      }
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
          <button
            type="button"
            onClick={toggleVoiceReplies}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#0B1F3A]"
            aria-label={voiceRepliesEnabled ? "Mute Ziat voice replies" : "Enable Ziat voice replies"}
            title={voiceRepliesEnabled ? "Voice replies on" : "Voice replies off"}
          >
            {voiceRepliesEnabled ? (
              <Volume2 className="h-4 w-4 text-[#0B1F3A]" />
            ) : (
              <VolumeX className="h-4 w-4 text-slate-400" />
            )}
          </button>
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

      <div
        ref={scrollContainerRef}
        className="mt-3 max-h-64 space-y-3 overflow-y-auto rounded-xl bg-slate-50/70 p-2.5"
      >
        {turns.map((t, idx) => (
          <div
            key={idx}
            className={`flex items-end gap-2 ${t.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {t.role === "assistant" && (
              <Image
                src="/images/ai/ziat-avatar.jpg"
                alt="Ziat"
                width={24}
                height={24}
                className="mb-0.5 h-6 w-6 shrink-0 rounded-full border border-[#F5B301]/70 object-cover"
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
              {t.role === "assistant" && t.audioDataUrl && (
                <button
                  type="button"
                  onClick={() => playAudio(t.audioDataUrl!, idx)}
                  className="mt-1 inline-flex items-center gap-1 whitespace-nowrap px-1 text-[10px] font-semibold text-[#0B1F3A] transition hover:text-[#F5B301]"
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
          </div>
        ))}
        {loading && (
          <div className="flex items-end gap-2">
            <Image
              src="/images/ai/ziat-avatar.jpg"
              alt="Ziat"
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full border border-[#F5B301]/70 object-cover"
            />
            <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-xs">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50 [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50 [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#0B1F3A]/50" />
            </div>
          </div>
        )}
      </div>

      {micError && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-600">
          {micError}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
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
                  sendMessage();
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
                  sendMessage({ audioBase64, audioMimeType, durationSec });
                })
              }
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-[#0B1F3A] hover:bg-slate-100 disabled:opacity-40"
              aria-label="Send voice note to Ziat"
              title="Speak to Ziat"
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] px-3.5 text-xs font-bold text-white hover:bg-[#0B1F3A]/90 disabled:opacity-40"
              aria-label="Ask AI"
            >
              <Send className="h-4 w-4" />
            </button>
          </>
        )}
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
