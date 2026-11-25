import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import {
  FREE_TIER_ELEVENLABS_VOICE_IDS,
  cleanTextForSpeech,
  getDeepgramVoiceModel,
  getElevenLabsVoiceId,
  stripAudioTags,
} from "@/lib/ai-workforce/voice-profiles";
import type { AgentId } from "@/lib/ai-workforce/types";

const MAX_TTS_CHARS = 800;

async function callDeepgramTts(params: {
  apiKey: string;
  model: string;
  text: string;
}): Promise<Response> {
  const url = `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(params.model)}&encoding=mp3`;
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: params.text }),
    signal: AbortSignal.timeout(15000),
  });
}

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

  const deepgramKey = process.env.DEEPGRAM_API_KEY?.trim();
  const elevenKey =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.FLOWGUARD_AI_VOICES?.trim();

  if (!deepgramKey && !elevenKey) {
    return NextResponse.json(
      { fallback: true, error: "No TTS API key configured (DEEPGRAM_API_KEY)." },
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
  const plainText = stripAudioTags(taggedText);
  if (!plainText) {
    return NextResponse.json({ error: "No speakable text provided." }, { status: 400 });
  }

  const agentId = (body?.agentId || "operations_manager") as AgentId;

  // 1. Primary: Deepgram Aura-2 ($200 free credit, 5 distinct conversational voices)
  if (deepgramKey) {
    try {
      const dgModel = getDeepgramVoiceModel(agentId);
      const dgRes = await callDeepgramTts({
        apiKey: deepgramKey,
        model: dgModel,
        text: plainText,
      });
      if (dgRes.ok) {
        const audioBuffer = await dgRes.arrayBuffer();
        return new NextResponse(audioBuffer, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "X-Voice-Provider": "Deepgram Aura-2",
            "Cache-Control": "no-store",
          },
        });
      }
      if (!elevenKey) {
        const errText = await dgRes.text().catch(() => "");
        return NextResponse.json(
          { fallback: true, error: `Deepgram TTS error (${dgRes.status}): ${errText.slice(0, 140)}` },
          { status: 502 }
        );
      }
    } catch (err) {
      if (!elevenKey) {
        return NextResponse.json(
          { fallback: true, error: err instanceof Error ? err.message : "Deepgram TTS failed." },
          { status: 502 }
        );
      }
    }
  }

  // 2. Fallback: ElevenLabs if configured
  if (elevenKey) {
    const primaryVoiceId = getElevenLabsVoiceId(agentId);
    const freeTierVoiceId =
      FREE_TIER_ELEVENLABS_VOICE_IDS[agentId] ||
      FREE_TIER_ELEVENLABS_VOICE_IDS.operations_manager;

    try {
      let res = await callElevenLabsTts({
        apiKey: elevenKey,
        voiceId: primaryVoiceId,
        modelId: "eleven_v3",
        text: taggedText,
      });

      if (res.status === 402 && primaryVoiceId !== freeTierVoiceId) {
        res = await callElevenLabsTts({
          apiKey: elevenKey,
          voiceId: freeTierVoiceId,
          modelId: "eleven_v3",
          text: taggedText,
        });
      }

      if (!res.ok && (res.status === 400 || res.status === 422 || res.status === 402)) {
        res = await callElevenLabsTts({
          apiKey: elevenKey,
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
            error: `ElevenLabs TTS error (${res.status}): ${errText.slice(0, 140)}`,
          },
          { status: 502 }
        );
      }

      const audioBuffer = await res.arrayBuffer();
      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "X-Voice-Provider": "ElevenLabs HD",
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

  return NextResponse.json({ fallback: true, error: "TTS unavailable." }, { status: 503 });
}
