import { NextResponse } from "next/server";
import { seedFlowGuardKnowledgeToDb } from "@/lib/ai-workforce/knowledge";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import type { AgentId } from "@/lib/ai-workforce/types";
import { requireAdminUser } from "@/lib/security";

const KICKOFF_BRIEFS: Array<{
  agentId: AgentId;
  title: string;
  instruction: string;
}> = [
  {
    agentId: "operations_manager",
    title: "Sadiq: Live Operations Baseline",
    instruction:
      "Use get_live_operations_feed and inspect_financial_summary to report our exact current tickets, unassigned jobs, approved plumbers, and pending payments so we know where we stand right now.",
  },
  {
    agentId: "sales_ai",
    title: "Amina: Website Enquiries & Lead Audit",
    instruction:
      "Use sales_read_enquiries to review our current enquiries, spot any duplicates, and summarize which leads need follow-up.",
  },
  {
    agentId: "customer_support_ai",
    title: "Zainab: Customer Support & Triage Status",
    instruction:
      "Summarize your readiness as Customer Support AI, confirm your triage and ownership rules, and highlight any support priorities you see.",
  },
  {
    agentId: "research_ai",
    title: "Faruk: Kano Plumbing Market & SEO Baseline",
    instruction:
      "Prepare an initial Kano plumbing market & SEO opportunity brief separating verified FlowGuard coverage facts from assumptions we should test next.",
  },
  {
    agentId: "engineering_ai",
    title: "Bashir: Technical & Security Readiness Check",
    instruction:
      "Use eng_read_repo on package.json and summarize our Next.js/Supabase/Flutter architecture health, security posture, and top technical priorities.",
  },
];

export async function POST() {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const seededDocs = await seedFlowGuardKnowledgeToDb().catch(() => 0);

  const tasks = await Promise.all(
    KICKOFF_BRIEFS.map((brief) =>
      defaultWorkforceOrchestrator.dispatchInstruction({
        requesterId: admin.userId,
        title: brief.title,
        instruction: brief.instruction,
        targetAgentId: brief.agentId,
        priority: "high",
      })
    )
  );

  return NextResponse.json({
    ok: true,
    seededDocs,
    tasksCompleted: tasks.filter((t) => t.status === "completed").length,
    tasks,
  });
}
