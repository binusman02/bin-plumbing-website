import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";

const MIN_AUDIO_BYTES = 250;

export function resolveAudioContentType(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base.includes("ogg")) return "audio/ogg";
  if (base.includes("mp4") || base.includes("m4a")) return "audio/mp4";
  if (base.includes("wav")) return "audio/wav";
  if (base.includes("mpeg") || base.includes("mp3")) return "audio/mpeg";
  return "audio/webm";
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  const elevenKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.FLOWGUARD_AI_VOICES?.trim();

  if (!deepgramKey && !elevenKey) {
    return NextResponse.json(
      { error: "Speech service is not configured yet." },
      { status: 503 }
    );
  }

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio received" }, { status: 400 });
  }
  if (audio.size < MIN_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio too short" }, { status: 400 });
  }

  const contentType = resolveAudioContentType(audio.type || "audio/webm");

  // 1. Primary: Deepgram Nova-3 (retry once on timeout or 5xx)
  if (deepgramKey) {
    const audioBytes = await audio.arrayBuffer();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const dgRes = await fetch(
          "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${deepgramKey}`,
              "Content-Type": contentType,
            },
            body: audioBytes,
            signal: AbortSignal.timeout(12000),
          }
        );
        const dgData = (await dgRes.json().catch(() => ({}))) as {
          results?: {
            channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
          };
        };
        if (dgRes.ok) {
          const transcript = String(
            dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
          ).trim();
          if (!transcript) {
            return NextResponse.json({ error: "Audio too short" }, { status: 400 });
          }
          return NextResponse.json({ ok: true, text: transcript, provider: "deepgram" });
        }
        if (attempt === 0 && isRetryableStatus(dgRes.status)) {
          continue;
        }
        break;
      } catch {
        if (attempt === 0) continue;
      }
    }
    if (!elevenKey) {
      return NextResponse.json(
        { error: "Speech service busy, try again" },
        { status: 502 }
      );
    }
  }

  // 2. Fallback: ElevenLabs Scribe (retry once on timeout or 5xx)
  if (elevenKey) {
    const ext = contentType.split("/")[1] || "webm";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const formData = new FormData();
      formData.append("file", audio, `founder-voice.${ext}`);
      formData.append("model_id", "scribe_v1");

      try {
        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": elevenKey },
          body: formData,
          signal: AbortSignal.timeout(12000),
        });
        const data = (await res.json().catch(() => ({}))) as { text?: string };
        if (res.ok) {
          const transcript = String(data.text || "").trim();
          if (!transcript) {
            return NextResponse.json({ error: "Audio too short" }, { status: 400 });
          }
          return NextResponse.json({ ok: true, text: transcript, provider: "elevenlabs" });
        }
        if (attempt === 0 && isRetryableStatus(res.status)) {
          continue;
        }
        break;
      } catch {
        if (attempt === 0) continue;
      }
    }
  }

  return NextResponse.json(
    { error: "Speech service busy, try again" },
    { status: 502 }
  );
}
