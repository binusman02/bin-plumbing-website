import { NextResponse } from "next/server";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import { requireAdminUser } from "@/lib/security";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const task = await defaultWorkforceOrchestrator.cancelTask(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, task });
}
