"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Square, X } from "lucide-react";

interface ZainabMsg {
  id: string;
  role: "customer" | "assistant" | "system";
  content: string;
  source: "text" | "voice" | "assignment_update";
  createdAt: string;
}

interface ZainabConciergeWidgetProps {
  customerId: string;
  customerName: string;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}

function createLocalMessage(
  id: string,
  role: ZainabMsg["role"],
  content: string,
  source: ZainabMsg["source"]
): ZainabMsg {
  return {
    id,
    role,
    content,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function ZainabConciergeWidget({
  customerId,
  customerName,
  open: controlledOpen,
  onOpenChange,
}: ZainabConciergeWidgetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange]
  );

  const storageKey = `fg_zainab_msgs_v1_${customerId}`;
  const [messages, setMessages] = useState<ZainabMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const msgSeqRef = useRef(0);

  const readCache = useCallback((): ZainabMsg[] => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as ZainabMsg[]).slice(-40) : [];
    } catch {
      return [];
    }
  }, [storageKey]);

  const writeCache = useCallback(
    (msgs: ZainabMsg[]) => {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(msgs.slice(-40)));
      } catch {
        // Ignore storage limits
      }
    },
    [storageKey]
  );

  const syncMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/customer/zainab/chat", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: ZainabMsg[] };
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(data.messages);
        writeCache(data.messages);
      }
    } catch {
      // Non-fatal
    }
  }, [writeCache]);

  useEffect(() => {
    const cached = readCache();
    if (cached.length > 0) setMessages(cached);
    void syncMessages();
  }, [readCache, syncMessages]);

  useEffect(() => {
    if (!open || !scrollContainerRef.current) return;
    scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
  }, [messages, open, sending, transcribing]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function sendTextMessage(text: string, source: "text" | "voice" = "text") {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setErrorMsg(null);
    if (source === "text") setInput("");

    const prior = messages.slice(-12).map((m) => ({
      role: m.role === "customer" ? ("customer" as const) : ("assistant" as const),
      content: m.content,
      source: m.source === "voice" ? ("voice" as const) : ("text" as const),
    }));

    msgSeqRef.current += 1;
    const optimistic = createLocalMessage(
      `local-${msgSeqRef.current}`,
      "customer",
      trimmed,
      source
    );
    const nextOptimistic = [...messages, optimistic];
    setMessages(nextOptimistic);
    writeCache(nextOptimistic);
    setSending(true);

    try {
      const res = await fetch("/api/customer/zainab/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, source, history: prior }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        reply?: string;
        messages?: ZainabMsg[];
      };
      if (!res.ok) throw new Error(json?.error || "Could not reach Zainab right now.");

      if (Array.isArray(json.messages) && json.messages.length > nextOptimistic.length) {
        setMessages(json.messages);
        writeCache(json.messages);
      } else if (json.reply) {
        msgSeqRef.current += 1;
        const appended = createLocalMessage(
          `reply-${msgSeqRef.current}`,
          "assistant",
          json.reply,
          "text"
        );
        const merged = [...nextOptimistic, appended];
        setMessages(merged);
        writeCache(merged);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Message failed. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function toggleVoiceNote() {
    if (transcribing || sending) return;
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      setRecording(false);
      if (recordTimerRef.current) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMsg("Microphone recording is unavailable on this browser.");
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/ogg")
          ? "audio/ogg"
          : "audio/mp4";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType });
        chunksRef.current = [];
        if (blob.size < 250) {
          setErrorMsg("Voice note was too short. Speak for at least 1 second.");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice-note.webm");
          const res = await fetch("/api/customer/zainab/stt", { method: "POST", body: fd });
          const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok || !json.text) {
            throw new Error(json.error || "Could not transcribe voice note.");
          }
          await sendTextMessage(json.text, "voice");
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "Voice note failed.");
        } finally {
          setTranscribing(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordSeconds((s) => {
          if (s >= 55 && recorderRef.current && recorderRef.current.state === "recording") {
            recorderRef.current.stop();
            setRecording(false);
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      setErrorMsg("Microphone permission was denied. Please allow mic access or type below.");
    }
  }

  return (
    <>
      {!open && (
        <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ask Zainab Support"
            className="flex items-center gap-2.5 rounded-full border-2 border-[#F5B301] bg-[#0B1F3A] py-1.5 pl-1.5 pr-4 text-left text-white shadow-xl transition hover:scale-[1.02] hover:bg-[#122e55]"
          >
            <span className="relative h-9 w-9 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ai/zainab.jpg"
                alt="Zainab"
                className="h-9 w-9 rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0B1F3A] bg-emerald-400" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-extrabold">Ask Zainab</span>
              <span className="block text-[10px] text-[#F5B301]">Support • Always here</span>
            </span>
          </button>
        </div>
      )}

      {open && (
        <section
          aria-label="Chat with Zainab Support"
          className="fixed bottom-20 right-4 z-50 flex max-h-[75vh] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl md:bottom-6 md:right-6 md:max-h-[560px] md:w-[390px]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-[#0B1F3A] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ai/zainab.jpg"
                  alt="Zainab"
                  className="h-10 w-10 rounded-full border-2 border-[#F5B301] object-cover"
                />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0B1F3A] bg-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold leading-tight">Zainab</h2>
                <p className="text-[11px] text-slate-200">FlowGuard Support Desk</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Zainab chat"
              className="rounded-lg p-1.5 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain touch-pan-y bg-slate-50/70 p-4"
          >
            <div className="flex items-start gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ai/zainab.jpg"
                alt="Zainab"
                className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
              />
              <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#1B2430] shadow-sm">
                Hi {customerName.split(" ")[0] || "there"}! I&apos;m Zainab on FlowGuard Support.
                Send a message or voice note about your booking, quotation, plumber tracking, or any
                urgent leak.
              </div>
            </div>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-1.5 pl-9">
                {[
                  "Check my latest request status",
                  "How does quotation approval work?",
                  "I have an urgent leak",
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void sendTextMessage(q, "text")}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0B1F3A] hover:border-[#F5B301] hover:bg-amber-50/40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) =>
              m.role === "customer" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-[#0B1F3A] px-3.5 py-2 text-xs leading-relaxed text-white shadow-sm">
                    {m.source === "voice" && (
                      <span className="mb-1 inline-flex items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#F5B301]">
                        <Mic className="h-2.5 w-2.5" /> Voice note
                      </span>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/ai/zainab.jpg"
                    alt="Zainab"
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                  <div className="max-w-[84%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#1B2430] shadow-sm">
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              )
            )}

            {(sending || transcribing) && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ai/zainab.jpg"
                  alt="Zainab"
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
                  {transcribing ? "Listening to your voice note..." : "Zainab is typing..."}
                </span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="shrink-0 border-t border-red-200 bg-red-50 px-3.5 py-2 text-[11px] font-semibold text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendTextMessage(input, "text");
            }}
            className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white p-3"
          >
            <button
              type="button"
              onClick={() => void toggleVoiceNote()}
              disabled={transcribing || sending}
              title={recording ? "Stop & send voice note" : "Send voice note"}
              aria-label={recording ? "Stop voice note" : "Record voice note"}
              className={`inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl px-3 text-xs font-bold transition ${
                recording
                  ? "animate-pulse bg-red-600 text-white"
                  : "border border-slate-200 bg-slate-50 text-[#0B1F3A] hover:bg-slate-100"
              }`}
            >
              {recording ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>{recordSeconds}s</span>
                </>
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={recording || transcribing}
              placeholder={recording ? "Recording... tap red button to send" : "Message Zainab..."}
              className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || transcribing || recording || !input.trim()}
              aria-label="Send message to Zainab"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] text-white hover:bg-[#132f57] disabled:opacity-45"
            >
              <Send className="h-4 w-4 text-[#F5B301]" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
