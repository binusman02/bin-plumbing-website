import { NextResponse } from "next/server";
import { seedFlowGuardKnowledgeToDb } from "@/lib/ai-workforce/knowledge";
import { defaultWorkforceOrchestrator } from "@/lib/ai-workforce/orchestrator";
import type { AgentId } from "@/lib/ai-workforce/types";
import { requireAdminUser } from "@/lib/security";

export const maxDuration = 60;

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
      "Use research_web_search (if configured) or reference https://flowguard-ng.vercel.app with today's date (2026-11-25) to prepare an initial Kano plumbing market & SEO opportunity brief separating verified facts from assumptions we should test next.",
  },
  {
    agentId: "engineering_ai",
    title: "Bashir: Technical & Security Readiness Check",
    instruction:
      "Use eng_read_repo on package.json and summarize our Next.js/Supabase/Flutter architecture health, security posture, and top technical priorities.",
  },
];

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    agentId?: string;
    skipSeed?: boolean;
  };
  const requestedAgentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";

  const targetBriefs = requestedAgentId
    ? KICKOFF_BRIEFS.filter((b) => b.agentId === requestedAgentId)
    : KICKOFF_BRIEFS;

  if (requestedAgentId && targetBriefs.length === 0) {
    return NextResponse.json({ error: "Unknown kickoff agentId." }, { status: 400 });
  }

  const seededDocs = body?.skipSeed ? 0 : await seedFlowGuardKnowledgeToDb().catch(() => 0);

  const tasks = await Promise.all(
    targetBriefs.map((brief) =>
      defaultWorkforceOrchestrator.dispatchInstruction({
        requesterId: admin.userId,
        title: brief.title,
        instruction: brief.instruction,
        targetAgentId: brief.agentId,
        priority: "normal",
      })
    )
  );

  return NextResponse.json({
    ok: true,
    seededDocs,
    tasksCompleted: tasks.filter(
      (t) => t.status === "closed" || t.status === "completed" || t.status === "reported"
    ).length,
    tasks,
  });
}
