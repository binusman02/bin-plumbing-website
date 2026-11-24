import { NextResponse } from "next/server";
import { runTeamMeetingTurn, type MeetingTurn } from "@/lib/ai-workforce/meeting";
import type { AgentId } from "@/lib/ai-workforce/types";
import { requireAdminUser } from "@/lib/security";

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const founderMessage =
    typeof body?.message === "string" ? body.message.trim() : "";
  const callOnAgent =
    typeof body?.callOnAgent === "string" && body.callOnAgent.trim()
      ? (body.callOnAgent.trim() as AgentId)
      : undefined;
  const wrapUp = Boolean(body?.wrapUp);

  if (!founderMessage && !callOnAgent && !wrapUp) {
    return NextResponse.json(
      { error: "Provide a message, call on a team member, or wrap up the meeting." },
      { status: 400 }
    );
  }

  const participants: AgentId[] = Array.isArray(body?.participants)
    ? body.participants.map(String) as AgentId[]
    : ["operations_manager"];
  const history: MeetingTurn[] = Array.isArray(body?.history)
    ? (body.history as MeetingTurn[])
    : [];

  const result = await runTeamMeetingTurn({
    founderMessage: founderMessage || (wrapUp ? "Please wrap up this meeting." : ""),
    participants,
    history,
    callOnAgent,
    wrapUp,
  });

  return NextResponse.json({ ok: true, ...result });
}
