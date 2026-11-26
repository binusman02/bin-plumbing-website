import { NextResponse } from "next/server";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import { captureActionError } from "@/lib/ai-workforce/incident-monitor";
import type { AgentId } from "@/lib/ai-workforce/types";
import { requireAdminUser } from "@/lib/security";

export const maxDuration = 60;

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tasks = await defaultWorkforceOrchestrator.listTasks(40);
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const instruction =
    typeof body?.instruction === "string" ? body.instruction.trim() : "";
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : instruction.slice(0, 80);

  if (!instruction) {
    return NextResponse.json(
      { error: "Provide an instruction for the AI Operations Manager." },
      { status: 400 }
    );
  }

  const targetAgentId =
    typeof body?.targetAgentId === "string" && body.targetAgentId.trim()
      ? (body.targetAgentId.trim() as AgentId)
      : undefined;
  const priority =
    body?.priority === "low" ||
    body?.priority === "normal" ||
    body?.priority === "high" ||
    body?.priority === "urgent"
      ? body.priority
      : "normal";

  try {
    const task = await defaultWorkforceOrchestrator.dispatchInstruction({
      requesterId: admin.userId,
      title,
      instruction,
      targetAgentId,
      priority,
    });
    return NextResponse.json({ ok: true, task });
  } catch (err) {
    void captureActionError("/api/admin/workforce/tasks:POST", err, { area: "ai-workforce" });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to dispatch task." },
      { status: 400 }
    );
  }
}
