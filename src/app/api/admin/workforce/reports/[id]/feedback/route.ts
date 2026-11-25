import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { savePlaybookRule } from "@/lib/ai-workforce/team-memory";
import type { AgentId } from "@/lib/ai-workforce/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    feedback?: string;
    note?: string;
  };
  const feedback = body?.feedback === "up" || body?.feedback === "down" ? body.feedback : null;
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 200) : "";

  if (!feedback && !note) {
    return NextResponse.json(
      { error: "Provide thumbs up/down feedback or a correction note." },
      { status: 400 }
    );
  }

  const supabase = getServiceSupabase();
  const { data: reportRow } = await supabase
    .from("ai_reports")
    .select("id, agent_id, message")
    .eq("id", id)
    .maybeSingle();

  if (!reportRow) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  await supabase
    .from("ai_reports")
    .update({
      ...(feedback ? { feedback } : {}),
      ...(note ? { feedback_note: note } : {}),
      feedback_at: nowIso,
    })
    .eq("id", id);

  let createdRule = null;
  if (note) {
    createdRule = await savePlaybookRule({
      agentId: String(reportRow.agent_id) as AgentId,
      rule: note,
      source: `owner_feedback:${id}`,
    });
  }

  return NextResponse.json({
    ok: true,
    reportId: id,
    feedback,
    note: note || null,
    playbookRuleCreated: createdRule,
  });
}
