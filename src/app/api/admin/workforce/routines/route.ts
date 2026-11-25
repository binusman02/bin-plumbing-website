import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import {
  runBriefingRoutine,
  runOverdueChaseRoutine,
  type RoutineKind,
} from "@/lib/ai-workforce/routines";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";

export const maxDuration = 60;

function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function handleRoutine(request: Request, explicitKind?: string) {
  const cronOk = isAuthorizedCron(request);
  if (!cronOk) {
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const kind = (explicitKind || searchParams.get("kind") || "chase_overdue") as RoutineKind;

  if (kind === "chase_overdue") {
    const result = await runOverdueChaseRoutine();
    return NextResponse.json({ ok: true, kind, result });
  }

  if (kind === "morning_standup" || kind === "eod_report" || kind === "weekly_review") {
    const result = await runBriefingRoutine(kind, {
      modelRunner: runWithFreeFirstModel,
    });
    return NextResponse.json({ ok: true, kind, result });
  }

  return NextResponse.json({ error: "Unknown routine kind." }, { status: 400 });
}

export async function GET(request: Request) {
  return handleRoutine(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  return handleRoutine(request, body?.kind);
}
