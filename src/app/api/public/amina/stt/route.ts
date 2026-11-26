import { NextResponse } from "next/server";
import { resolveAudioContentType } from "@/app/api/admin/workforce/stt/route";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

const MIN_AUDIO_BYTES = 250;
const MAX_AUDIO_BYTES = 2_500_000;

export async function POST(request: Request) {
  const rate = await checkRateLimit("public_amina_stt", 12, 10 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Voice limit reached. Please type your message or wait ${rate.retryAfterSeconds}s.`,
      },
      { status: 429 }
    );
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!deepgramKey) {
    return NextResponse.json(
      { error: "Voice notes are currently unavailable. Please type your message instead." },
      { status: 503 }
    );
  }

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get("audio");
  if (!audio || !(audio instanceof Blob)) {
    return NextResponse.json({ error: "No audio received." }, { status: 400 });
  }
  if (audio.size < MIN_AUDIO_BYTES) {
    return NextResponse.json({ error: "Voice note was too short." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      { error: "Voice note is too long. Keep voice notes under 60 seconds." },
      { status: 400 }
    );
  }

  const bytes = await audio.arrayBuffer();
  const contentType = resolveAudioContentType(audio.type || "");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 16000);
    try {
      const dgRes = await fetch(
        "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramKey}`,
            "Content-Type": contentType,
          },
          body: bytes,
          signal: ctrl.signal,
        }
      );
      clearTimeout(timer);

      if (dgRes.ok) {
        const dgData = (await dgRes.json().catch(() => ({}))) as {
          results?: {
            channels?: Array<{ alternatives?: Array<{ transcript?: string }> }>;
          };
        };
        const text =
          dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || "";
        if (!text) {
          return NextResponse.json(
            { error: "Couldn't hear anything clearly — try speaking closer to the mic or typing." },
            { status: 400 }
          );
        }
        return NextResponse.json({ ok: true, text, provider: "deepgram" });
      }

      if (!(dgRes.status >= 500 || dgRes.status === 429) || attempt >= 1) {
        return NextResponse.json(
          { error: "Speech service is busy right now. Please type your message." },
          { status: 502 }
        );
      }
    } catch {
      clearTimeout(timer);
      if (attempt >= 1) {
        return NextResponse.json(
          { error: "Speech service timed out. Please type your message." },
          { status: 504 }
        );
      }
    }
  }

  return NextResponse.json(
    { error: "Speech service is busy right now. Please type your message." },
    { status: 502 }
  );
}
