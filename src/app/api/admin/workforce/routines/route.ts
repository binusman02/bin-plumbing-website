import { executeWorkforceRoutineRequest } from "@/lib/ai-workforce/routine-runner";

export const maxDuration = 60;

export async function GET(request: Request) {
  return executeWorkforceRoutineRequest(request);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { kind?: string };
  return executeWorkforceRoutineRequest(request, body?.kind);
}
