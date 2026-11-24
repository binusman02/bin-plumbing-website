import { NextResponse } from "next/server";
import { defaultApprovalService } from "@/lib/ai-workforce/approvals";
import { requireAdminUser } from "@/lib/security";

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const approvals = await defaultApprovalService.listApprovals(50);
  return NextResponse.json({ approvals });
}
