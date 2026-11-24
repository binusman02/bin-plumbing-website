"use client";

import { useEffect, useRef, useState } from "react";
import { Hand, Mic, Send, Sparkles, Square, Users, Volume2, VolumeX } from "lucide-react";
import { assignAgentVoices, cleanTextForSpeech } from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";

interface MeetingAgent {
  id: string;
  displayName: string;
  roleTitle: string;
  avatarUrl: string;
}

interface MeetingTurn {
  id: string;
  speakerType: "founder" | "agent" | "system";
  speakerId: string;
  speakerName: string;
  avatarUrl?: string;
  text: string;
  createdAt: string;
}

interface RaisedHand {
  agentId: string;
  displayName: string;
  avatarUrl: string;
  kind: "question" | "suggestion";
  topic: string;
}

export function TeamMeetingPanel({
  agents,
  onMeetingWrappedUp,
}: {
  agents: MeetingAgent[];
  onMeetingWrappedUp?: () => void;
}) {
  const [participants, setParticipants] = useState<string[]>(["operations_manager"]);
  const [turns, setTurns] = useState<MeetingTurn[]>([
    {
      id: "intro-1",
      speakerType: "agent",
      speakerId: "operations_manager",
      speakerName: "Sadiq — AI Operations Manager",
      avatarUrl: "/images/ai/sadiq.jpg",
      text: "Good day, Boss. I'm ready for our sync — tell me who you want me to bring into the room (Amina, Zainab, Faruk, Bashir, or everyone), or tap their photos above.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [raisedHands, setRaisedHands] = useState<RaisedHand[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speakOutLoud, setSpeakOutLoud] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const list = synth.getVoices();
      if (list.length > 0) setVoices(list);
    };
    updateVoices();
    synth.addEventListener("voiceschanged", updateVoices);
    return () => synth.removeEventListener("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, raisedHands]);

  function speakWithBrowserFallback(clean: string, agentId: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const liveVoices = voices.length > 0 ? voices : synth.getVoices();
      const assigned = assignAgentVoices(liveVoices);
      const profile = assigned[agentId as AgentId] ?? assigned.operations_manager;

      const utter = new SpeechSynthesisUtterance(clean);
      if (profile?.voice) {
        utter.voice = profile.voice;
        utter.lang = profile.voice.lang;
      }
      utter.rate = profile?.rate ?? 1.0;
      utter.pitch = profile?.pitch ?? 1.0;
      synth.speak(utter);
    } catch {
      // Ignore speech synthesis errors
    }
  }

  function unlockAudio() {
    if (typeof window === "undefined") return;
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    try {
      // Tiny silent wav to unlock HTMLAudioElement inside user gesture for Chrome autoplay
      const a = audioRef.current;
      if (!a.src) {
        a.src =
          "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
        void a.play().catch(() => {});
      }
    } catch {
      // Ignore unlock errors
    }
  }

  async function speakText(text: string, agentId: string, opts?: { force?: boolean }) {
    if (!speakOutLoud && !opts?.force) return;
    // Skip spending ElevenLabs credits on timeout/error notices
    if (!opts?.force && text.startsWith("I couldn't reach my model right now")) return;

    const clean = cleanTextForSpeech(text);
    if (!clean) return;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    try {
      const res = await fetch("/api/admin/workforce/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean, agentId }),
      });
      if (res.ok && res.headers.get("content-type")?.includes("audio/mpeg")) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        audio.src = url;
        audio.onended = () => {
          if (audioUrlRef.current === url) {
            URL.revokeObjectURL(url);
            audioUrlRef.current = null;
          }
        };
        await audio.play();
        setVoiceNote("ElevenLabs HD");
        return;
      }
      const errJson = (await res.json().catch(() => ({}))) as { error?: string };
      setVoiceNote(errJson.error ? `Fallback (${errJson.error.slice(0, 60)})` : "Browser fallback");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "playback blocked";
      setVoiceNote(`Fallback (${msg.slice(0, 45)})`);
    }

    speakWithBrowserFallback(clean, agentId);
  }

  async function toggleRecording() {
    if (recording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size === 0) return;

        setTranscribing(true);
        try {
          const fd = new FormData();
          fd.append("audio", blob, "founder-voice.webm");
          const res = await fetch("/api/admin/workforce/stt", { method: "POST", body: fd });
          const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!res.ok || !json.text) {
            throw new Error(json.error || "Could not transcribe voice note.");
          }
          await sendMeetingTurn(json.text);
        } catch (err) {
          setTurns((prev) => [
            ...prev,
            {
              id: `err-stt-${Date.now()}`,
              speakerType: "system",
              speakerId: "system",
              speakerName: "Meeting Room",
              text: err instanceof Error ? err.message : "Voice transcription failed.",
              createdAt: new Date().toISOString(),
            },
          ]);
        } finally {
          setTranscribing(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          id: `err-mic-${Date.now()}`,
          speakerType: "system",
          speakerId: "system",
          speakerName: "Meeting Room",
          text: "Microphone access was denied. Please allow mic permission in your browser.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }

  function toggleParticipant(id: string) {
    if (id === "operations_manager") return; // Sadiq chairs the meeting
    setParticipants((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function startWeeklySync() {
    const allIds = agents.map((a) => a.id);
    setParticipants(allIds.length > 0 ? allIds : ["operations_manager"]);
    void sendMeetingTurn("Let's start our weekly team meeting. Sadiq, give us a quick kickoff and let anyone raise a hand if they have something important.");
  }

  async function sendMeetingTurn(
    customText?: string,
    opts?: { callOnAgent?: string; wrapUp?: boolean }
  ) {
    const text = (customText ?? input).trim();
    if (!text && !opts?.callOnAgent && !opts?.wrapUp) return;

    const nextHistory = [...turns];
    if (text && !opts?.callOnAgent) {
      const founderTurn: MeetingTurn = {
        id: `founder-${Date.now()}`,
        speakerType: "founder",
        speakerId: "founder",
        speakerName: "Founder (You)",
        text,
        createdAt: new Date().toISOString(),
      };
      nextHistory.push(founderTurn);
      setTurns(nextHistory);
      if (!customText) setInput("");
    }

    if (speakOutLoud) unlockAudio();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/workforce/meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          participants,
          history: nextHistory.slice(-12),
          callOnAgent: opts?.callOnAgent,
          wrapUp: opts?.wrapUp,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Meeting request failed.");

      if (Array.isArray(json.participants)) {
        setParticipants(json.participants);
      }
      if (json.speakerTurn) {
        setTurns((prev) => [...prev, json.speakerTurn as MeetingTurn]);
        speakText(json.speakerTurn.text, json.speakerTurn.speakerId);
      }
      setRaisedHands(Array.isArray(json.raisedHands) ? json.raisedHands : []);
      if (opts?.wrapUp) {
        onMeetingWrappedUp?.();
      }
    } catch (err) {
      setTurns((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          speakerType: "system",
          speakerId: "system",
          speakerName: "Meeting Room",
          text: err instanceof Error ? err.message : "Could not reach meeting room.",
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Room Header & Participant Roster */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#0B1F3A]" />
            <h2 className="text-sm font-extrabold text-[#0B1F3A]">
              Live Team Meeting Room
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                unlockAudio();
                setSpeakOutLoud((v) => !v);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-[#0B1F3A]"
              title={voiceNote || "Toggle ElevenLabs natural voices"}
            >
              {speakOutLoud ? (
                <Volume2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 text-slate-400" />
              )}
              {speakOutLoud ? "Voice On" : "Voice Off"}
              {speakOutLoud && voiceNote && (
                <span className="ml-1 text-[10px] font-normal text-slate-500">
                  · {voiceNote}
                </span>
              )}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={startWeeklySync}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3 text-[11px] font-bold text-white disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#F5B301]" />
              Start Weekly Sync (All 5)
            </button>
            <button
              type="button"
              disabled={busy || turns.length < 2}
              onClick={() => void sendMeetingTurn("Wrap up this meeting and save our summary.", { wrapUp: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0B1F3A]/20 bg-amber-50 px-3 text-[11px] font-bold text-[#0B1F3A] disabled:opacity-50"
            >
              Wrap Up &amp; Save
            </button>
          </div>
        </div>

        <p className="mt-1.5 text-[11px] text-slate-500">
          Tap a team member to invite/remove them, or type{" "}
          <span className="font-semibold">@Bashir</span> /{" "}
          <span className="font-semibold">&quot;Sadiq, bring Amina in&quot;</span>.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {agents.map((agent) => {
            const inRoom = participants.includes(agent.id);
            const shortName = agent.displayName.split("—")[0].trim();
            return (
              <div key={agent.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleParticipant(agent.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold transition ${
                    inRoom
                      ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={agent.avatarUrl || "/images/ai/sadiq.jpg"}
                    alt={shortName}
                    className="h-6 w-6 rounded-full border border-[#F5B301] object-cover"
                  />
                  <span>{shortName}</span>
                  <span className="text-[10px] opacity-80">
                    {inRoom ? "In Room" : "+ Invite"}
                  </span>
                </button>
                {inRoom && (
                  <button
                    type="button"
                    onClick={() => setInput((prev) => `@${shortName} ${prev}`)}
                    className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-[#0B1F3A] hover:bg-slate-50"
                    title={`Ask ${shortName} directly`}
                  >
                    Ask
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Live Meeting Feed */}
      <div className="max-h-[430px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        {turns.map((turn) => {
          const isFounder = turn.speakerType === "founder";
          return (
            <div
              key={turn.id}
              className={`flex items-start gap-2.5 ${isFounder ? "flex-row-reverse" : ""}`}
            >
              {!isFounder && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={turn.avatarUrl || "/images/ai/sadiq.jpg"}
                  alt={turn.speakerName}
                  className="h-9 w-9 shrink-0 rounded-full border-2 border-[#F5B301] object-cover"
                />
              )}
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                  isFounder
                    ? "bg-[#0B1F3A] text-white"
                    : "border border-slate-200 bg-white text-slate-800"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p
                    className={`text-[10px] font-extrabold ${
                      isFounder ? "text-[#F5B301]" : "text-[#0B1F3A]"
                    }`}
                  >
                    {turn.speakerName}
                  </p>
                  {!isFounder && turn.speakerType === "agent" && (
                    <button
                      type="button"
                      onClick={() => {
                        unlockAudio();
                        void speakText(turn.text, turn.speakerId, { force: true });
                      }}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-[#0B1F3A]"
                      title="Listen with this agent's ElevenLabs voice"
                    >
                      <Volume2 className="h-3 w-3" />
                      Listen
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{turn.text}</p>
              </div>
            </div>
          );
        })}
        {busy && (
          <div className="text-xs font-semibold text-slate-500">
            Listening &amp; preparing response...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Raised Hands Bar */}
      {raisedHands.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-900">
            <Hand className="h-3.5 w-3.5 text-amber-600" />
            Raised Hands:
          </span>
          {raisedHands.map((hand) => {
            const shortName = hand.displayName.split("—")[0].trim();
            return (
              <button
                key={hand.agentId}
                type="button"
                disabled={busy}
                onClick={() => {
                  setRaisedHands((prev) => prev.filter((h) => h.agentId !== hand.agentId));
                  void sendMeetingTurn("", { callOnAgent: hand.agentId });
                }}
                className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-bold text-[#0B1F3A] hover:bg-amber-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hand.avatarUrl || "/images/ai/sadiq.jpg"}
                  alt={shortName}
                  className="h-5 w-5 rounded-full object-cover"
                />
                <span>
                  Let {shortName} speak ({hand.kind}): {hand.topic}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Meeting Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMeetingTurn();
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            recording
              ? "Recording your voice... tap Stop when done"
              : transcribing
                ? "Transcribing your voice..."
                : "Speak to the room, e.g. 'Sadiq, bring Bashir in' or '@Bashir what happened?'..."
          }
          className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none"
        />
        <button
          type="button"
          disabled={busy || transcribing}
          onClick={() => void toggleRecording()}
          title={recording ? "Stop recording" : "Speak using your microphone"}
          className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold transition disabled:opacity-50 ${
            recording
              ? "bg-red-600 text-white animate-pulse"
              : "border border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50"
          }`}
        >
          {recording ? (
            <>
              <Square className="h-3.5 w-3.5" />
              Stop
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5 text-[#0B1F3A]" />
              {transcribing ? "Sending..." : "Mic"}
            </>
          )}
        </button>
        <button
          type="submit"
          disabled={busy || transcribing || recording || !input.trim()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-5 text-xs font-extrabold text-white disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5 text-[#F5B301]" />
          Speak
        </button>
      </form>
    </div>
  );
}
