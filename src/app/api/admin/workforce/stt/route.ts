import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";

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
      { error: "No STT API key configured (DEEPGRAM_API_KEY)." },
      { status: 503 }
    );
  }

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get("audio");
  if (!audio || !(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Audio recording is required." }, { status: 400 });
  }

  // 1. Primary: Deepgram Nova-3
  if (deepgramKey) {
    try {
      const audioBytes = await audio.arrayBuffer();
      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&language=en",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramKey}`,
            "Content-Type": audio.type || "audio/webm",
          },
          body: audioBytes,
          signal: AbortSignal.timeout(20000),
        }
      );
      const dgData = (await dgRes.json().catch(() => ({}))) as {
        results?: {
          channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
        };
        err_msg?: string;
      };
      if (dgRes.ok) {
        const transcript = String(
          dgData.results?.channels?.[0]?.alternatives?.[0]?.transcript || ""
        ).trim();
        return NextResponse.json({ ok: true, text: transcript, provider: "deepgram" });
      }
      if (!elevenKey) {
        return NextResponse.json(
          { error: dgData.err_msg || `Deepgram STT failed (${dgRes.status}).` },
          { status: 502 }
        );
      }
    } catch (err) {
      if (!elevenKey) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Voice transcription failed." },
          { status: 502 }
        );
      }
    }
  }

  // 2. Fallback: ElevenLabs Scribe
  if (elevenKey) {
    const formData = new FormData();
    formData.append("file", audio, "founder-voice.webm");
    formData.append("model_id", "scribe_v1");

    try {
      const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
        method: "POST",
        headers: {
          "xi-api-key": elevenKey,
        },
        body: formData,
        signal: AbortSignal.timeout(20000),
      });

      const data = (await res.json().catch(() => ({}))) as {
        text?: string;
        detail?: { message?: string } | string;
      };

      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : data.detail?.message || `ElevenLabs STT failed (${res.status}).`;
        return NextResponse.json({ error: msg }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        text: String(data.text || "").trim(),
        provider: "elevenlabs",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Voice transcription failed." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: "STT unavailable." }, { status: 503 });
}
