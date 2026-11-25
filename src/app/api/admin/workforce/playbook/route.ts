import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import { getAgentDefinition } from "@/lib/ai-workforce/registry";
import {
  defaultTeamMemoryStore,
  savePlaybookRule,
} from "@/lib/ai-workforce/team-memory";
import type { AgentId } from "@/lib/ai-workforce/types";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rules = await defaultTeamMemoryStore.listPlaybookRules();
  return NextResponse.json({ ok: true, rules });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    agentId?: string;
    rule?: string;
  };
  const agentId = String(body?.agentId || "") as AgentId;
  const rule = typeof body?.rule === "string" ? body.rule.trim() : "";
  if (!getAgentDefinition(agentId) || !rule) {
    return NextResponse.json(
      { error: "Valid agentId and rule text are required." },
      { status: 400 }
    );
  }
  const created = await savePlaybookRule({ agentId, rule, source: "owner_manual" });
  if (!created) {
    return NextResponse.json(
      { error: "Rule was too short or contained sensitive tokens." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, rule: created });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    id?: string;
    content?: string;
  };
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!id || !content) {
    return NextResponse.json({ error: "id and content are required." }, { status: 400 });
  }
  await defaultTeamMemoryStore.updateMemoryContent(id, content);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  if (!id) {
    return NextResponse.json({ error: "id query parameter is required." }, { status: 400 });
  }
  await defaultTeamMemoryStore.deleteMemory(id);
  return NextResponse.json({ ok: true });
}
