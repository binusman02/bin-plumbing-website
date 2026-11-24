import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not configured." },
      { status: 503 }
    );
  }

  const incoming = await request.formData().catch(() => null);
  const audio = incoming?.get("audio");
  if (!audio || !(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Audio recording is required." }, { status: 400 });
  }

  const formData = new FormData();
  formData.append("file", audio, "founder-voice.webm");
  formData.append("model_id", "scribe_v1");

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
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

    return NextResponse.json({ ok: true, text: String(data.text || "").trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Voice transcription failed." },
      { status: 502 }
    );
  }
}
