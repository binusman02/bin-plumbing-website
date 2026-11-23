"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useZiatVoice(voicePrefKey: string) {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(voicePrefKey);
      if (saved === "false") setVoiceRepliesEnabled(false);
    } catch {
      // Ignore storage errors
    }
  }, [voicePrefKey]);

  const toggleVoiceReplies = useCallback(() => {
    setVoiceRepliesEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(voicePrefKey, String(next));
      } catch {
        // Ignore storage errors
      }
      if (!next && audioRef.current) {
        audioRef.current.pause();
        setPlayingIdx(null);
      }
      return next;
    });
  }, [voicePrefKey]);

  const cleanupRecording = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupRecording();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [cleanupRecording]);

  const playAudio = useCallback((dataUrl: string, idx: number) => {
    if (!dataUrl) return;
    if (audioRef.current) {
      audioRef.current.pause();
      if (playingIdx === idx) {
        setPlayingIdx(null);
        return;
      }
    }
    const audio = new Audio(dataUrl);
    audioRef.current = audio;
    setPlayingIdx(idx);
    audio.onended = () => setPlayingIdx(null);
    audio.onerror = () => setPlayingIdx(null);
    audio.play().catch(() => setPlayingIdx(null));
  }, [playingIdx]);

  const startRecording = useCallback(
    async (onRecorded: (audioBase64: string, mimeType: string, seconds: number) => void) => {
      setMicError(null);
      if (recording) return;
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      ) {
        setMicError("Voice recording is not supported in this browser.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const preferredTypes = [
          "audio/webm;codecs=opus",
          "audio/webm",
          "audio/mp4",
          "audio/ogg;codecs=opus",
        ];
        const mimeType =
          preferredTypes.find((t) => MediaRecorder.isTypeSupported(t)) || "";
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);

        chunksRef.current = [];
        secondsRef.current = 0;
        setRecordSeconds(0);

        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
        };

        recorder.onstop = () => {
          const finalMime = (recorder.mimeType || mimeType || "audio/webm").split(";")[0];
          const blob = new Blob(chunksRef.current, { type: finalMime });
          const duration = Math.max(1, secondsRef.current);
          cleanupRecording();
          setRecording(false);
          setRecordSeconds(0);
          if (blob.size < 400) return;

          const reader = new FileReader();
          reader.onloadend = () => {
            const result = typeof reader.result === "string" ? reader.result : "";
            const commaIdx = result.indexOf(",");
            const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : "";
            if (base64) {
              onRecorded(base64, finalMime, duration);
            }
          };
          reader.readAsDataURL(blob);
        };

        recorderRef.current = recorder;
        recorder.start(250);
        setRecording(true);
        timerRef.current = window.setInterval(() => {
          secondsRef.current += 1;
          setRecordSeconds(secondsRef.current);
          if (secondsRef.current >= 60) {
            recorder.stop();
          }
        }, 1000);
      } catch {
        cleanupRecording();
        setRecording(false);
        setMicError("Microphone permission denied.");
      }
    },
    [cleanupRecording, recording]
  );

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  return {
    recording,
    recordSeconds,
    playingIdx,
    voiceRepliesEnabled,
    micError,
    toggleVoiceReplies,
    startRecording,
    stopRecording,
    playAudio,
  };
}
