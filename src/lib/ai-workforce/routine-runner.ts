import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import {
  runBriefingRoutine,
  runOverdueChaseRoutine,
  type RoutineKind,
} from "@/lib/ai-workforce/routines";
import { runWithFreeFirstModel } from "@/lib/ai-workforce/model-adapter";

const SLUG_TO_KIND: Record<string, RoutineKind> = {
  "chase-overdue": "chase_overdue",
  chase_overdue: "chase_overdue",
  "morning-standup": "morning_standup",
  morning_standup: "morning_standup",
  "eod-report": "eod_report",
  eod_report: "eod_report",
  "weekly-review": "weekly_review",
  weekly_review: "weekly_review",
};

export function resolveRoutineKind(raw: string | null | undefined): RoutineKind | null {
  if (!raw) return null;
  return SLUG_TO_KIND[raw.trim()] ?? null;
}

export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

export async function executeWorkforceRoutineRequest(
  request: Request,
  rawKind?: string | null,
  options?: { cronOnly?: boolean }
) {
  const cronOk = isAuthorizedCronRequest(request);
  if (!cronOk) {
    if (options?.cronOnly) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const kind = resolveRoutineKind(rawKind || searchParams.get("kind") || "chase_overdue");

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
