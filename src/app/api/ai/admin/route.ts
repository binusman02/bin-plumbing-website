import { NextResponse } from "next/server";
import { generateAdminCopilotReply, type AiChatTurn } from "@/lib/ai-assistant";
import { synthesizeZiatSpeech } from "@/lib/ai-voice";
import { resolvePortalActor } from "@/lib/portal-auth";
import { enforceTrackingRateLimit } from "@/lib/tracking-api";
import { triggerEngineeringIncidentWatch } from "@/lib/ai-workforce/auto-triggers";

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("admin");
    if (!actor || actor.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateLimited = await enforceTrackingRateLimit("ai_admin", actor.id, 30);
    if (rateLimited) return rateLimited;

    const body = await request.json().catch(() => ({}));
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const singlePrompt = typeof body?.message === "string" ? body.message.trim() : "";

    const turns: AiChatTurn[] =
      rawMessages.length > 0
        ? rawMessages
            .filter(
              (m: unknown) =>
                m &&
                typeof m === "object" &&
                ((m as Record<string, unknown>).role === "user" ||
                  (m as Record<string, unknown>).role === "assistant") &&
                typeof (m as Record<string, unknown>).content === "string"
            )
            .map((m: Record<string, unknown>) => ({
              role: m.role as "user" | "assistant",
              content: String(m.content),
            }))
        : singlePrompt
          ? [{ role: "user", content: singlePrompt }]
          : [];

    const rawAudioBase64 = typeof body?.audioBase64 === "string" ? body.audioBase64.trim() : "";
    const audioMimeType =
      typeof body?.audioMimeType === "string" && body.audioMimeType.trim()
        ? body.audioMimeType.trim().split(";")[0]
        : "audio/webm";
    const wantVoiceReply = Boolean(body?.wantVoiceReply || rawAudioBase64);
    const audioBuffer = rawAudioBase64 ? Buffer.from(rawAudioBase64, "base64") : null;
    const hasAudio = Boolean(audioBuffer && audioBuffer.length > 0 && audioBuffer.length <= 10 * 1024 * 1024);

    if (turns.length === 0 && !hasAudio) {
      return NextResponse.json(
        { error: "Provide at least one message or voice note." },
        { status: 400 }
      );
    }

    const res = await generateAdminCopilotReply({
      messages: turns,
      adminActor: actor.email || actor.name || "Admin",
      audio: hasAudio && audioBuffer ? { data: audioBuffer, mimeType: audioMimeType } : null,
      liveCall: Boolean(body?.liveCall),
    });
    const speech = wantVoiceReply && res.text ? await synthesizeZiatSpeech(res.text) : null;
    const audioDataUrl = speech
      ? `data:${speech.mimeType};base64,${speech.wavBuffer.toString("base64")}`
      : null;

    return NextResponse.json({
      success: true,
      reply: res.text,
      audioDataUrl,
      model: res.model,
      fallback: res.fallback,
      actionsTaken: res.actionsTaken,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Admin AI failed.";
    void triggerEngineeringIncidentWatch({
      source: "/api/ai/admin",
      errorMessage: msg,
    });
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
