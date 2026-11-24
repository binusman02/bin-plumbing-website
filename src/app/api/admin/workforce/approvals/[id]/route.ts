import { NextResponse } from "next/server";
import { getAdminToolGateway } from "@/lib/ai-workforce/admin-tools";
import { requireAdminUser } from "@/lib/security";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision =
    body?.decision === "approve" || body?.decision === "reject"
      ? body.decision
      : null;

  if (!decision) {
    return NextResponse.json(
      { error: "Decision must be 'approve' or 'reject'." },
      { status: 400 }
    );
  }

  const gateway = getAdminToolGateway();
  const res = await gateway.decideApproval({
    approvalId: id,
    decision,
    approver: {
      actorType: "owner",
      userId: admin.userId,
      email: admin.email,
    },
    decisionNote: typeof body?.decisionNote === "string" ? body.decisionNote.trim() : undefined,
    expectedPayloadHash:
      typeof body?.expectedPayloadHash === "string"
        ? body.expectedPayloadHash.trim()
        : undefined,
  });

  if (!res.ok) {
    const statusCode =
      res.code === "NOT_FOUND"
        ? 404
        : res.code === "SELF_APPROVAL_FORBIDDEN" || res.code === "OWNER_REQUIRED"
          ? 403
          : 409;
    return NextResponse.json(res, { status: statusCode });
  }

  return NextResponse.json(res);
}
