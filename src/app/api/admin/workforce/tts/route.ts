import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import {
  FREE_TIER_ELEVENLABS_VOICE_IDS,
  cleanTextForSpeech,
  getElevenLabsVoiceId,
  stripAudioTags,
} from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";

const MAX_TTS_CHARS = 600;

async function callElevenLabsTts(params: {
  apiKey: string;
  voiceId: string;
  modelId: "eleven_v3" | "eleven_flash_v2_5";
  text: string;
}): Promise<Response> {
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(params.voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": params.apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: params.text,
        model_id: params.modelId,
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.8,
          use_speaker_boost: true,
        },
      }),
      signal: AbortSignal.timeout(20000),
    }
  );
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.FLOWGUARD_AI_VOICES?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { fallback: true, error: "ELEVENLABS_API_KEY not configured." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    agentId?: string;
  };
  const taggedText = cleanTextForSpeech(String(body?.text || ""), {
    keepAudioTags: true,
  }).slice(0, MAX_TTS_CHARS);
  if (!taggedText) {
    return NextResponse.json({ error: "No speakable text provided." }, { status: 400 });
  }

  const agentId = (body?.agentId || "operations_manager") as AgentId;
  const primaryVoiceId = getElevenLabsVoiceId(agentId);
  const freeTierVoiceId =
    FREE_TIER_ELEVENLABS_VOICE_IDS[agentId] ||
    FREE_TIER_ELEVENLABS_VOICE_IDS.operations_manager;

  try {
    // 1. Primary: configured conversational voice + eleven_v3 (supports [chuckles], [sighs], etc.)
    let res = await callElevenLabsTts({
      apiKey,
      voiceId: primaryVoiceId,
      modelId: "eleven_v3",
      text: taggedText,
    });

    // 2. If Voice Library voice requires paid plan (402), retry with built-in Free-tier voice + eleven_v3
    if (res.status === 402 && primaryVoiceId !== freeTierVoiceId) {
      res = await callElevenLabsTts({
        apiKey,
        voiceId: freeTierVoiceId,
        modelId: "eleven_v3",
        text: taggedText,
      });
    }

    // 3. If eleven_v3 is unavailable on this tier/voice, strip tags and use eleven_flash_v2_5
    if (!res.ok && (res.status === 400 || res.status === 422 || res.status === 402)) {
      const plainText = stripAudioTags(taggedText);
      res = await callElevenLabsTts({
        apiKey,
        voiceId: freeTierVoiceId,
        modelId: "eleven_flash_v2_5",
        text: plainText,
      });
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        {
          fallback: true,
          error: `ElevenLabs TTS error (${res.status}): ${errText.slice(0, 160)}`,
        },
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
