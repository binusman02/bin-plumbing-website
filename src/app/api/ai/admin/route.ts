import { NextResponse } from "next/server";
import { generateAdminCopilotReply, type AiChatTurn } from "@/lib/ai-assistant";
import { resolvePortalActor } from "@/lib/portal-auth";
import { enforceTrackingRateLimit } from "@/lib/tracking-api";

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

    if (turns.length === 0) {
      return NextResponse.json(
        { error: "Provide at least one message." },
        { status: 400 }
      );
    }

    const res = await generateAdminCopilotReply({
      messages: turns,
      adminActor: actor.email || actor.name || "Admin",
    });
    return NextResponse.json({
      success: true,
      reply: res.text,
      model: res.model,
      fallback: res.fallback,
      actionsTaken: res.actionsTaken,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Admin AI failed." },
      { status: 500 }
    );
  }
}
