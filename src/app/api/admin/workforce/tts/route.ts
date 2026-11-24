import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import {
  cleanTextForSpeech,
  getElevenLabsVoiceId,
} from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";

const MAX_TTS_CHARS = 500;

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.FLOWGUARD_AI_VOICES?.trim();
  if (!apiKey) {
    return NextResponse.json({ fallback: true, error: "ELEVENLABS_API_KEY not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    agentId?: string;
  };
  const clean = cleanTextForSpeech(String(body?.text || "")).slice(0, MAX_TTS_CHARS);
  if (!clean) {
    return NextResponse.json({ error: "No speakable text provided." }, { status: 400 });
  }

  const agentId = (body?.agentId || "operations_manager") as AgentId;
  const voiceId = getElevenLabsVoiceId(agentId);

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: clean,
        model_id: "eleven_flash_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { fallback: true, error: `ElevenLabs TTS error (${res.status}): ${errText.slice(0, 160)}` },
        { status: 502 }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { fallback: true, error: err instanceof Error ? err.message : "TTS failed." },
      { status: 502 }
    );
  }
}
