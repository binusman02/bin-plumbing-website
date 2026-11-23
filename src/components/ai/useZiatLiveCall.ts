"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveCallState = "idle" | "listening" | "thinking" | "speaking";

interface UtterancePayload {
  audioBase64: string;
  audioMimeType: string;
  durationSec: number;
}

export interface LiveCallReply {
  audioDataUrl?: string;
  replyText?: string;
}

export function useZiatLiveCall(
  onUtterance: (payload: UtterancePayload) => Promise<LiveCallReply>
) {
  const [callState, setCallState] = useState<LiveCallState>("idle");
  const [callSeconds, setCallSeconds] = useState(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [callError, setCallError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const stateRef = useRef<LiveCallState>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const callTimerRef = useRef<number | null>(null);
  const vadTimerRef = useRef<number | null>(null);
  const onUtteranceRef = useRef(onUtterance);
  const startListeningTurnRef = useRef<() => void>(() => {});

  useEffect(() => {
    onUtteranceRef.current = onUtterance;
  }, [onUtterance]);

  const setStateSync = useCallback((next: LiveCallState) => {
    stateRef.current = next;
    setCallState(next);
  }, []);

  const stopPlayback = useCallback(() => {
    if (audioElRef.current) {
      audioElRef.current.onended = null;
      audioElRef.current.onerror = null;
      audioElRef.current.pause();
      audioElRef.current = null;
    }
  }, []);

  const stopVadLoop = useCallback(() => {
    if (vadTimerRef.current != null) {
      window.clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    setVoiceLevel(0);
  }, []);

  const endCall = useCallback(() => {
    activeRef.current = false;
    stopVadLoop();
    stopPlayback();

    if (callTimerRef.current != null) {
      window.clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      try {
        recorderRef.current.stop();
      } catch {}
    }
    recorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      analyserRef.current = null;
    }

    setCallSeconds(0);
    setStateSync("idle");
  }, [setStateSync, stopPlayback, stopVadLoop]);

  useEffect(() => {
    return () => {
      endCall();
    };
  }, [endCall]);

  const startListeningTurn = useCallback(() => {
    if (!activeRef.current || !streamRef.current) return;
    const stream = streamRef.current;

    const preferredTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mimeType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    chunksRef.current = [];
    const startedAt = Date.now();
    let hasSpoken = false;
    let lastSpeechAt = 0;
    let consecutiveSpeechFrames = 0;
    let totalSpeechFrames = 0;
    let noiseSamples = 0;
    let noiseSum = 0;
    let noiseFloor = 0.015;

    setStateSync("listening");

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    recorder.onstop = async () => {
      stopVadLoop();
      if (!activeRef.current) return;

      const finalMime = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunksRef.current, { type: finalMime });
      const durationSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

      // Ignore background bumps/clicks or short noise bursts
      if (!hasSpoken || totalSpeechFrames < 4 || blob.size < 900) {
        startListeningTurnRef.current();
        return;
      }

      setStateSync("thinking");

      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          const commaIdx = result.indexOf(",");
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : "");
        };
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });

      if (!activeRef.current || !base64) {
        if (activeRef.current) startListeningTurnRef.current();
        return;
      }

      const { audioDataUrl } = await onUtteranceRef.current({
        audioBase64: base64,
        audioMimeType: finalMime,
        durationSec,
      });

      if (!activeRef.current) return;

      const resumeAfterSpeak = () => {
        audioElRef.current = null;
        if (activeRef.current) startListeningTurnRef.current();
      };

      if (audioDataUrl) {
        setStateSync("speaking");
        const audio = new Audio(audioDataUrl);
        audioElRef.current = audio;
        audio.onended = resumeAfterSpeak;
        audio.onerror = resumeAfterSpeak;
        audio.play().catch(resumeAfterSpeak);
      } else {
        startListeningTurnRef.current();
      }
    };

    recorderRef.current = recorder;
    recorder.start(250);

    // Silence & noise-floor adaptive detection loop via AnalyserNode
    stopVadLoop();
    const analyser = analyserRef.current;
    if (analyser) {
      const dataArray = new Uint8Array(analyser.fftSize);
      vadTimerRef.current = window.setInterval(() => {
        if (!activeRef.current || stateRef.current !== "listening") return;
        analyser.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        setVoiceLevel(Math.min(1, rms * 6));

        // Calibrate ambient room noise over the first ~350ms before speech
        if (!hasSpoken && noiseSamples < 5) {
          noiseSum += rms;
          noiseSamples += 1;
          noiseFloor = noiseSum / noiseSamples;
        }

        const speechThreshold = Math.max(0.045, noiseFloor * 2.3);
        const now = Date.now();
        if (rms > speechThreshold) {
          consecutiveSpeechFrames += 1;
          totalSpeechFrames += 1;
          if (consecutiveSpeechFrames >= 3) {
            hasSpoken = true;
            lastSpeechAt = now;
          }
        } else {
          consecutiveSpeechFrames = 0;
        }

        const elapsed = now - startedAt;
        const silenceMs = hasSpoken ? now - lastSpeechAt : 0;

        // Faster turn-around (~850ms silence after sustained speech), or cap at 25s
        if ((hasSpoken && silenceMs >= 850) || (hasSpoken && elapsed >= 25000)) {
          if (recorder.state !== "inactive") {
            recorder.stop();
          }
        }
      }, 70);
    }
  }, [setStateSync, stopVadLoop]);

  useEffect(() => {
    startListeningTurnRef.current = startListeningTurn;
  }, [startListeningTurn]);

  const startCall = useCallback(async () => {
    setCallError(null);
    if (activeRef.current) return;

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setCallError("Live voice call is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      activeRef.current = true;
      setCallSeconds(0);
      callTimerRef.current = window.setInterval(() => {
        setCallSeconds((s) => s + 1);
      }, 1000);

      startListeningTurn();
    } catch {
      endCall();
      setCallError("Microphone permission denied.");
    }
  }, [endCall, startListeningTurn]);

  const interruptAndListen = useCallback(() => {
    if (!activeRef.current) return;
    stopPlayback();
    if (stateRef.current === "speaking") {
      startListeningTurn();
    } else if (
      stateRef.current === "listening" &&
      recorderRef.current &&
      recorderRef.current.state !== "inactive"
    ) {
      recorderRef.current.stop();
    }
  }, [startListeningTurn, stopPlayback]);

  return {
    callState,
    callSeconds,
    voiceLevel,
    callError,
    startCall,
    endCall,
    interruptAndListen,
  };
}
