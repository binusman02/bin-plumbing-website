"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Loader2,
  Mic,
  Send,
  Square,
  X,
} from "lucide-react";
import { ClassicSelect } from "@/components/ui/ClassicSelect";

interface ChatMsg {
  id: string;
  role: "customer" | "assistant" | "system";
  content: string;
  source: "text" | "voice" | "assignment_update";
  createdAt: string;
}

interface BookingDraft {
  fullName?: string;
  phone?: string;
  email?: string;
  cityOrLga?: string;
  address?: string;
  problemType?: string;
  issueSummary?: string;
  urgency?: "standard" | "urgent";
}

interface AminaConciergeWidgetProps {
  activeLocations?: string[];
  serviceOptions?: { id: string; title: string }[];
  defaultState?: string;
}

const TOKEN_STORAGE_KEY = "fg_amina_session_token_v1";
const MESSAGES_STORAGE_KEY = "fg_amina_messages_v1";

function readCachedMessages(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(MESSAGES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is ChatMsg =>
          Boolean(m) &&
          typeof m === "object" &&
          typeof (m as ChatMsg).id === "string" &&
          typeof (m as ChatMsg).content === "string" &&
          ((m as ChatMsg).role === "customer" ||
            (m as ChatMsg).role === "assistant" ||
            (m as ChatMsg).role === "system")
      )
      .slice(-40);
  } catch {
    return [];
  }
}

function writeCachedMessages(msgs: ChatMsg[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MESSAGES_STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
  } catch {
    // Ignore storage quota errors
  }
}

export default function AminaConciergeWidget({
  activeLocations = [],
  serviceOptions = [],
  defaultState = "Kano State",
}: AminaConciergeWidgetProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cityOrLga, setCityOrLga] = useState(activeLocations[0] || "Nassarawa");
  const [address, setAddress] = useState("");
  const [problemType, setProblemType] = useState(
    serviceOptions[0]?.title || "Leak Detection & Repair"
  );
  const [issueSummary, setIssueSummary] = useState("");
  const [urgency, setUrgency] = useState<"standard" | "urgent">("standard");

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef(0);
  const wasOpenRef = useRef(false);
  const wasBookingOpenRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  const isInternalPortal =
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/plumber") ||
    pathname?.startsWith("/customer");

  const syncConversation = useCallback(async (tokenOverride?: string | null) => {
    try {
      const cached = readCachedMessages();
      if (cached.length > 0) {
        setMessages((prev) => (prev.length === 0 ? cached : prev));
      }

      const saved =
        tokenOverride ??
        (typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_STORAGE_KEY) : null);
      const url = saved
        ? `/api/public/amina/chat?sessionToken=${encodeURIComponent(saved)}`
        : "/api/public/amina/chat";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        sessionToken?: string | null;
        ticketNumber?: string | null;
        visitorProfile?: { fullName?: string | null; phone?: string | null; email?: string | null } | null;
        messages?: ChatMsg[];
      };
      if (data.sessionToken) {
        setSessionToken(data.sessionToken);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, data.sessionToken);
        }
      }
      if (data.ticketNumber) setTicketNumber(data.ticketNumber);
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages((prev) => {
          const next = data.messages!.length >= prev.length ? data.messages! : prev;
          writeCachedMessages(next);
          return next;
        });
      }
      if (data.visitorProfile) {
        if (data.visitorProfile.fullName) setFullName((v) => v || data.visitorProfile!.fullName!);
        if (data.visitorProfile.phone) setPhone((v) => v || data.visitorProfile!.phone!);
        if (data.visitorProfile.email) setEmail((v) => v || data.visitorProfile!.email!);
      }
    } catch {
      // Non-fatal sync error
    }
  }, []);

  useEffect(() => {
    if (isInternalPortal) return;
    void syncConversation();
  }, [isInternalPortal, syncConversation]);

  // Poll for live plumber assignment updates when chat is open & ticket exists
  useEffect(() => {
    if (isInternalPortal || !open || !ticketNumber) return;
    const id = window.setInterval(() => {
      void syncConversation(sessionToken);
    }, 15000);
    return () => window.clearInterval(id);
  }, [isInternalPortal, open, ticketNumber, sessionToken, syncConversation]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const bookingJustOpened = showBookingForm && !wasBookingOpenRef.current;
    const countIncreased = messages.length > prevMsgCountRef.current;

    wasOpenRef.current = open;
    wasBookingOpenRef.current = showBookingForm;
    prevMsgCountRef.current = messages.length;

    if (!open) return;

    const container = scrollContainerRef.current;
    const isNearBottom = container
      ? container.scrollHeight - container.scrollTop - container.clientHeight < 140
      : true;

    if (justOpened || bookingJustOpened || (countIncreased && (sending || isNearBottom))) {
      listEndRef.current?.scrollIntoView({ behavior: justOpened ? "auto" : "smooth" });
    }
  }, [messages, open, showBookingForm, sending]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (isInternalPortal) return null;

  function applyDraft(draft: PublicDraftArg | null | undefined) {
    if (!draft) return;
    if (draft.fullName) setFullName((v) => v || draft.fullName!);
    if (draft.phone) setPhone((v) => v || draft.phone!);
    if (draft.email) setEmail((v) => v || draft.email!);
    if (draft.cityOrLga) setCityOrLga(draft.cityOrLga);
    if (draft.address) setAddress((v) => v || draft.address!);
    if (draft.problemType) setProblemType(draft.problemType);
    if (draft.issueSummary) setIssueSummary((v) => v || draft.issueSummary!);
    if (draft.urgency === "urgent") setUrgency("urgent");
  }

  type PublicDraftArg = BookingDraft;

  async function sendTextMessage(text: string, source: "text" | "voice" = "text") {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setErrorMsg(null);
    if (source === "text") setInput("");

    const priorHistory = messages
      .filter((m) => m.role === "customer" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: m.role as "customer" | "assistant",
        content: m.content,
        source: m.source === "voice" ? ("voice" as const) : ("text" as const),
      }));

    const optimisticMsg: ChatMsg = {
      id: `local-${Date.now()}`,
      role: "customer",
      content: trimmed,
      source,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => {
      const next = [...prev, optimisticMsg];
      writeCachedMessages(next);
      return next;
    });
    setSending(true);

    try {
      const res = await fetch("/api/public/amina/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          source,
          history: priorHistory,
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        sessionToken?: string;
        reply?: string;
        readyToBook?: boolean;
        bookingDraft?: BookingDraft | null;
        ticketNumber?: string | null;
        messages?: ChatMsg[];
      };
      if (!res.ok) {
        throw new Error(json?.error || "Could not reach Amina right now.");
      }
      if (json.sessionToken) {
        setSessionToken(json.sessionToken);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, json.sessionToken);
        }
      }
      if (json.ticketNumber) setTicketNumber(json.ticketNumber);

      setMessages((prev) => {
        const serverMsgs = Array.isArray(json.messages) ? json.messages : [];
        let next: ChatMsg[];
        if (serverMsgs.length >= prev.length + 1) {
          next = serverMsgs;
        } else {
          const replyText =
            typeof json.reply === "string" && json.reply.trim()
              ? json.reply.trim()
              : serverMsgs.findLast((m) => m.role === "assistant")?.content || "";
          const replyMsg: ChatMsg | null = replyText
            ? {
                id: `local-reply-${Date.now()}`,
                role: "assistant",
                content: replyText,
                source: "text",
                createdAt: new Date().toISOString(),
              }
            : null;
          next = replyMsg ? [...prev, replyMsg] : prev;
        }
        writeCachedMessages(next);
        return next;
      });

      if (json.bookingDraft) applyDraft(json.bookingDraft);
      if (json.readyToBook && !json.ticketNumber) setShowBookingForm(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Message failed. Please try again.");
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
      setErrorMsg("Microphone recording is not supported on this browser.");
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
          setErrorMsg("Voice note was too short. Tap mic and speak for at least 1 second.");
          return;
        }
        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "voice-note.webm");
          const res = await fetch("/api/public/amina/stt", { method: "POST", body: fd });
          const json = (await res.json().catch(() => ({}))) as {
            text?: string;
            error?: string;
          };
          if (!res.ok || !json.text) {
            throw new Error(json.error || "Could not understand voice note.");
          }
          await sendTextMessage(json.text, "voice");
        } catch (err) {
          setErrorMsg(err instanceof Error ? err.message : "Voice transcription failed.");
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

  async function handleBookSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (bookingSubmitting) return;
    setErrorMsg(null);
    setBookingSubmitting(true);
    try {
      const res = await fetch("/api/public/amina/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(sessionToken ? { sessionToken } : {}),
          fullName,
          phone,
          email,
          state: defaultState || "Kano State",
          cityOrLga,
          address,
          problemType,
          issueSummary,
          urgency,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        ticketNumber?: string;
        sessionToken?: string;
        confirmMessage?: string;
        messages?: ChatMsg[];
      };
      if (!res.ok) throw new Error(json.error || "Could not submit booking.");
      if (json.sessionToken) {
        setSessionToken(json.sessionToken);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(TOKEN_STORAGE_KEY, json.sessionToken);
        }
      }
      if (json.ticketNumber) setTicketNumber(json.ticketNumber);
      setMessages((prev) => {
        const serverMsgs = Array.isArray(json.messages) ? json.messages : [];
        let next: ChatMsg[];
        if (serverMsgs.length > prev.length) {
          next = serverMsgs;
        } else if (json.confirmMessage) {
          next = [
            ...prev,
            {
              id: `local-book-${Date.now()}`,
              role: "assistant",
              content: json.confirmMessage,
              source: "text",
              createdAt: new Date().toISOString(),
            },
          ];
        } else {
          next = prev;
        }
        writeCachedMessages(next);
        return next;
      });
      setShowBookingForm(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Booking failed. Please check fields.");
    } finally {
      setBookingSubmitting(false);
    }
  }

  const locationOptions = (
    activeLocations.length > 0
      ? activeLocations
      : [
          "Nassarawa",
          "Tarauni",
          "Bompai",
          "Fagge",
          "Kano Municipal",
          "Gwale",
          "Dala",
          "Ungogo",
          "Kumbotso",
        ]
  ).map((loc) => ({ value: loc, label: loc }));

  const categoryOptions = (
    serviceOptions.length > 0
      ? serviceOptions.map((s) => ({ value: s.title, label: s.title }))
      : [
          { value: "Leak Detection & Repair", label: "Leak Detection & Repair" },
          { value: "Pipe Installation & Repair", label: "Pipe Installation & Repair" },
          { value: "Drainage & Unblocking", label: "Drainage & Unblocking" },
          { value: "Borehole & Pump Systems", label: "Borehole & Pump Systems" },
          { value: "Emergency Plumbing", label: "Emergency Plumbing" },
        ]
  );

  return (
    <>
      {!open && (
        <div className="fixed bottom-20 right-4 z-40 sm:bottom-24 sm:right-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Chat with Amina"
            className="group flex items-center gap-2.5 rounded-full border-2 border-[#F5B301] bg-[#0B1F3A] py-1.5 pl-1.5 pr-4 text-left text-white shadow-xl transition hover:scale-[1.02] hover:bg-[#122e55]"
          >
            <span className="relative h-9 w-9 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/ai/amina.jpg"
                alt="Amina"
                className="h-9 w-9 rounded-full object-cover"
              />
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0B1F3A] bg-emerald-400" />
            </span>
            <span className="leading-tight">
              <span className="block text-xs font-extrabold">Ask Amina</span>
              <span className="block text-[10px] text-[#F5B301]">
                {ticketNumber ? `Ticket ${ticketNumber}` : "Online • Book or ask"}
              </span>
            </span>
          </button>
        </div>
      )}

      {open && (
        <section
          aria-label="Chat with Amina"
          className="fixed bottom-4 right-4 z-50 flex max-h-[min(580px,82vh)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:bottom-6 sm:right-6 sm:w-[400px]"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between bg-[#0B1F3A] px-4 py-3 text-white">
            <div className="flex items-center gap-2.5">
              <div className="relative h-10 w-10 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ai/amina.jpg"
                  alt="Amina"
                  className="h-10 w-10 rounded-full border-2 border-[#F5B301] object-cover"
                />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[#0B1F3A] bg-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold leading-tight">Amina</h2>
                <p className="text-[11px] text-slate-200">
                  FlowGuard Customer Desk • Kano
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!ticketNumber && (
                <button
                  type="button"
                  onClick={() => setShowBookingForm((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#F5B301] px-2.5 py-1.5 text-[11px] font-extrabold text-[#0B1F3A] hover:bg-[#e5a800]"
                >
                  <ClipboardList className="h-3.5 w-3.5" />
                  {showBookingForm ? "Chat" : "Book"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-lg p-1.5 text-slate-200 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Active Ticket Banner */}
          {ticketNumber && (
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-900">
              <span className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Ticket: {ticketNumber}
              </span>
              <Link
                href={`/tracking?ticket=${encodeURIComponent(ticketNumber)}`}
                className="inline-flex items-center gap-1 font-extrabold text-[#0B1F3A] underline"
              >
                Track live <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Conversation Body */}
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain touch-pan-y bg-slate-50/70 p-4"
          >
            {(!showBookingForm || messages.length > 0) && (
              <div className="flex items-start gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ai/amina.jpg"
                  alt="Amina"
                  className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                />
                <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-[#1B2430] shadow-sm">
                  Hello! I&apos;m Amina at FlowGuard Plumbing in Kano. You can type or send a quick
                  voice note to ask about any plumbing issue, or tap <strong>Book</strong> above and
                  I&apos;ll arrange an approved technician for you.
                </div>
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
                    src="/images/ai/amina.jpg"
                    alt="Amina"
                    className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                  <div
                    className={`max-w-[84%] rounded-2xl rounded-tl-sm border px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                      m.source === "assignment_update"
                        ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-950"
                        : "border-slate-200 bg-white text-[#1B2430]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              )
            )}

            {(sending || transcribing) && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/images/ai/amina.jpg"
                  alt="Amina"
                  className="h-6 w-6 rounded-full object-cover"
                />
                <span className="rounded-full bg-white px-3 py-1.5 shadow-sm">
                  {transcribing ? "Listening to your voice note..." : "Amina is typing..."}
                </span>
              </div>
            )}

            {showBookingForm && !ticketNumber && (
              <form
                onSubmit={handleBookSubmit}
                className="space-y-2.5 rounded-2xl border border-[#0B1F3A]/15 bg-white p-3.5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold text-[#0B1F3A]">
                    Book a Plumbing Inspection
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowBookingForm(false)}
                    className="text-[11px] font-semibold text-slate-500 hover:text-[#0B1F3A]"
                  >
                    Hide
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full Name"
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-[#0B1F3A]"
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Phone (e.g. 0803...)"
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-[#0B1F3A]"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (for updates)"
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-[#0B1F3A]"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ClassicSelect
                    size="sm"
                    value={cityOrLga}
                    onChange={setCityOrLga}
                    ariaLabel="Area or LGA in Kano"
                    options={locationOptions}
                  />
                  <ClassicSelect
                    size="sm"
                    value={urgency}
                    onChange={(v) => setUrgency(v === "urgent" ? "urgent" : "standard")}
                    ariaLabel="Urgency"
                    options={[
                      { value: "standard", label: "Standard Request" },
                      { value: "urgent", label: "Urgent Emergency" },
                    ]}
                  />
                </div>
                <ClassicSelect
                  size="sm"
                  value={problemType}
                  onChange={setProblemType}
                  ariaLabel="Plumbing Service"
                  options={categoryOptions}
                />
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House number / street address"
                  className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs text-[#0B1F3A]"
                />
                <textarea
                  required
                  rows={2}
                  value={issueSummary}
                  onChange={(e) => setIssueSummary(e.target.value)}
                  placeholder="Briefly describe the plumbing issue..."
                  className="w-full rounded-lg border border-slate-200 p-2 text-xs text-[#0B1F3A]"
                />
                <button
                  type="submit"
                  disabled={bookingSubmitting}
                  className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] text-xs font-extrabold text-white hover:bg-[#132f57] disabled:opacity-50"
                >
                  {bookingSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {bookingSubmitting ? "Creating Ticket..." : "Confirm Request & Get Ticket"}
                </button>
              </form>
            )}

            <div ref={listEndRef} />
          </div>

          {errorMsg && (
            <div className="shrink-0 border-t border-red-200 bg-red-50 px-3.5 py-2 text-[11px] font-semibold text-red-800">
              {errorMsg}
            </div>
          )}

          {/* Input Bar (Text + Voice Note) */}
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
              placeholder={
                recording ? "Recording... tap red button to send" : "Message Amina..."
              }
              className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-xs text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || transcribing || recording || !input.trim()}
              aria-label="Send message"
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
