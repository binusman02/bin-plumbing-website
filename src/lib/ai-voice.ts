import crypto from "crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";

/**
 * Wraps raw 16-bit signed little-endian PCM audio in a standard 44-byte RIFF/WAVE header.
 */
export function pcm16ToWavBuffer(
  pcmBuffer: Buffer,
  sampleRate = 24000,
  channels = 1
): Buffer {
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // PCM subchunk size
  header.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generates natural female speech (WAV buffer) from text using Gemini TTS.
 * Returns null gracefully if API key is missing or synthesis fails.
 */
export async function synthesizeZiatSpeech(
  text: string
): Promise<{ wavBuffer: Buffer; mimeType: "audio/wav" } | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const cleanText = text
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/₦\s*([\d,]+(?:\.\d+)?)/g, "$1 Naira")
    .replace(/[•]/g, "")
    .trim()
    .slice(0, 900);
  if (!apiKey || !cleanText) return null;

  const ttsModels = [
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-flash-preview-tts",
    "gemini-2.5-pro-preview-tts",
  ];
  for (let i = 0; i < ttsModels.length; i++) {
    const modelId = ttsModels[i];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: cleanText }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede",
                  },
                },
              },
            },
          }),
          signal: AbortSignal.timeout(16000),
        }
      );

      if (!res.ok) {
        if ((res.status === 429 || res.status === 503) && i === 0) {
          await new Promise((r) => setTimeout(r, 850));
        }
        continue;
      }
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { data?: string; mimeType?: string };
            }>;
          };
        }>;
      };

      const inline = json.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data
      )?.inlineData;
      if (!inline?.data) continue;

      const rawBuffer = Buffer.from(inline.data, "base64");
      const mime = (inline.mimeType || "").toLowerCase();
      if (mime.includes("wav")) {
        return { wavBuffer: rawBuffer, mimeType: "audio/wav" };
      }
      const rateMatch = mime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? Number(rateMatch[1]) || 24000 : 24000;
      const wavBuffer = pcm16ToWavBuffer(rawBuffer, sampleRate, 1);
      return { wavBuffer, mimeType: "audio/wav" };
    } catch {
      // Try next model or return null
    }
  }

  return null;
}

/**
 * Downloads a chat upload audio file from Supabase Storage by its `/api/chat/file/<name>` URL.
 */
export async function downloadChatUploadAudio(
  attachmentUrl: string,
  fallbackMimeType?: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    const marker = "/api/chat/file/";
    const idx = attachmentUrl.indexOf(marker);
    if (idx === -1) return null;
    const rawName = attachmentUrl.slice(idx + marker.length).split("?")[0];
    const storedName = decodeURIComponent(rawName).replace(/[^a-zA-Z0-9._-]/g, "");
    if (!storedName) return null;

    const supabase = getServiceSupabase();
    const { data, error } = await supabase.storage
      .from("chat-uploads")
      .download(storedName);
    if (error || !data) return null;

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return null;

    return {
      data: buffer,
      mimeType: (fallbackMimeType || data.type || "audio/webm").split(";")[0],
    };
  } catch {
    return null;
  }
}

/**
 * Uploads Ziat's synthesized WAV voice note to Supabase `chat-uploads` storage.
 */
export async function uploadZiatVoiceNote(
  wavBuffer: Buffer,
  ticketNumber?: string
): Promise<{ url: string; name: string; size: number; mimeType: string } | null> {
  try {
    const uniqueId = crypto.randomBytes(6).toString("hex");
    const safeTicket = (ticketNumber || "ziat").replace(/[^a-zA-Z0-9_-]/g, "");
    const storedName = `${Date.now()}-${uniqueId}-ziat-${safeTicket}.wav`;

    const supabase = getServiceSupabase();
    const { error } = await supabase.storage
      .from("chat-uploads")
      .upload(storedName, wavBuffer, {
        contentType: "audio/wav",
        upsert: false,
      });
    if (error) return null;

    return {
      url: `/api/chat/file/${encodeURIComponent(storedName)}`,
      name: `Ziat-Voice-${safeTicket || "Reply"}.wav`,
      size: wavBuffer.length,
      mimeType: "audio/wav",
    };
  } catch {
    return null;
  }
}
