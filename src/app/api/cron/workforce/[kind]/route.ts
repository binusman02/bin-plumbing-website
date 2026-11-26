import { executeWorkforceRoutineRequest } from "@/lib/ai-workforce/routine-runner";

export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> }
) {
  const { kind } = await context.params;
  return executeWorkforceRoutineRequest(request, kind, { cronOnly: true });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ kind: string }> }
) {
  const { kind } = await context.params;
  return executeWorkforceRoutineRequest(request, kind, { cronOnly: true });
}
