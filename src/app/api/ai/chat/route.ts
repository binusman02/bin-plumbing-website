import { NextResponse } from "next/server";
import { generateSupportReply, type AiChatTurn, type TicketAiContext } from "@/lib/ai-assistant";
import { synthesizeZiatSpeech } from "@/lib/ai-voice";
import { resolveChatActor, verifyTicketAccess } from "@/lib/chat-auth";
import { enforceTrackingRateLimit } from "@/lib/tracking-api";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
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

    const actor = await resolveChatActor().catch(() => null);
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    const rateKey = actor ? actor.id : `ip:${forwardedFor}`;
    const rateLimited = await enforceTrackingRateLimit("ai_chat", rateKey, 20);
    if (rateLimited) {
      return rateLimited;
    }

    let ticketContext: TicketAiContext | null = null;
    const ticketNumber =
      typeof body?.ticketNumber === "string" ? body.ticketNumber.trim() : "";
    if (ticketNumber && actor) {
      const ctx = await verifyTicketAccess(actor, ticketNumber);
      if (ctx) {
        const supabase = getServiceSupabase();
        const { data: reqRow } = await supabase
          .from("service_requests")
          .select("status, problem_category, assigned_technician")
          .eq("ticket_number", ctx.ticketNumber)
          .maybeSingle();
        ticketContext = {
          ticketNumber: ctx.ticketNumber,
          status: reqRow?.status ? String(reqRow.status) : undefined,
          problemCategory: reqRow?.problem_category ? String(reqRow.problem_category) : undefined,
          assignedTechnician: reqRow?.assigned_technician
            ? String(reqRow.assigned_technician)
            : null,
        };
      }
    }

    const res = await generateSupportReply({
      messages: turns,
      ticketContext,
      audio: hasAudio && audioBuffer ? { data: audioBuffer, mimeType: audioMimeType } : null,
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
      ...(res.reason ? { reason: res.reason } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI support failed." },
      { status: 500 }
    );
  }
}
