import { randomUUID } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const FLOWGUARD_KNOWLEDGE_DOCS: Array<{
  title: string;
  category: string;
  accessScope: string;
  content: string;
}> = [
  {
    title: "FlowGuard Company Identity, Services & Kano Coverage",
    category: "company_profile",
    accessScope: "shared_workforce",
    content: [
      "Company: FlowGuard Plumbing Enterprises (Kano, Nigeria) — Web/PWA & Flutter Customer/Technician apps for residential and commercial plumbing.",
      "How FlowGuard Works: 1) Customer submits a plumbing request with their contact details, Kano area/LGA, and issue summary to receive a unique tracking reference. 2) A coordinator reviews the request and assigns a vetted, approved plumber. 3) The plumber inspects on-site and submits an itemised quotation (Materials + Labour + Transport + Other) for customer approval before work begins. 4) Once approved, work proceeds and the customer can track progress live using their reference number and phone on the Track Request page.",
      "Core Services: Pipe installation & repairs, leak detection & repair, drainage & unblocking, borehole/pump & water tank systems, sanitaryware, and emergency plumbing dispatch.",
      "Coverage: Kano metropolitan LGAs and neighbourhoods (Bompai, Nassarawa, Tarauni, Fagge, Dala, Gwale, Kano Municipal, Ungogo, Kumbotso, Sabon Gari).",
      "Pricing Policy: Never quote binding fixed prices before inspection. Approved technicians inspect on-site and submit an itemised quotation (Materials + Labour + Transport + Other) for customer approval before any repair work starts.",
      "Emergency Safety Rule: For burst pipes, active leaks, or flooding, always advise shutting off the main water stopcock valve and switching off nearby electrical sockets.",
    ].join("\n"),
  },
  {
    title: "FlowGuard Job Lifecycle & Payment Rules",
    category: "operations_sop",
    accessScope: "shared_workforce",
    content: [
      "Job Lifecycle: new -> contacted -> scheduled (approved plumber assigned) -> trip_started (live GPS tracking active) -> arrived (live tracking stops) -> quotation submitted & customer approved -> in_progress -> work_completed -> awaiting_final_payment -> completed.",
      "Customer App & Live Tracking: Customers can install the FlowGuard web app directly from the website (no Play Store required) or create an account at /customer to watch their assigned plumber's live GPS location on the map, approve itemised quotes, and receive instant job updates. Quick lookup is also available anytime at /tracking.",
      "Payment Verification: All customer bank transfer proofs remain pending until verified by the Founder/Owner. Never mark a payment verified on customer say-so.",
      "Support Ownership Rule: Zainab must verify customer ownership (authenticated customer_id) before sharing private ticket details; never infer ownership from unverified phone numbers or display names.",
    ].join("\n"),
  },
  {
    title: "FlowGuard Technical Architecture (Engineering Reference)",
    category: "engineering_docs",
    accessScope: "engineering_ai",
    content: [
      "Stack: Next.js 16.4.6 (App Router, Cache Components), React 19, TypeScript, Tailwind CSS, Supabase (PostgreSQL, Auth, RLS, Storage, Realtime), Flutter Android apps (customer & technician flavours).",
      "AI Workforce: 5 agents (Sadiq Operations Manager, Amina Sales, Zainab Customer Support, Faruk Research, Bashir Engineering) routed via Vercel AI Gateway (xiaomi/mimo-v2.6-flash and recursive/flint-v1.0) with a hard $0.00 paid spend cap and payload-bound SHA-256 ApprovalService.",
      "Security Rules: Never read .env*, key.properties, *.jks, or google-services.json; never push directly to master or merge PRs autonomously.",
    ].join("\n"),
  },
];

export function getFlowGuardKnowledgeContext(includeEngineering = false): string {
  return FLOWGUARD_KNOWLEDGE_DOCS.filter(
    (d) => d.accessScope === "shared_workforce" || includeEngineering
  )
    .map((d) => `[${d.title}]\n${d.content}`)
    .join("\n\n");
}

export async function seedFlowGuardKnowledgeToDb(): Promise<number> {
  const supabase = getServiceSupabase();
  let seeded = 0;
  for (const doc of FLOWGUARD_KNOWLEDGE_DOCS) {
    const { data: existing } = await supabase
      .from("ai_knowledge_documents")
      .select("id")
      .eq("title", doc.title)
      .maybeSingle();
    if (!existing) {
      await supabase.from("ai_knowledge_documents").insert({
        id: randomUUID(),
        title: doc.title,
        category: doc.category,
        access_scope: doc.accessScope,
        version: 1,
        content: doc.content,
        source_ref: "system_seed_v1",
        approved_by_owner: true,
        approved_at: new Date().toISOString(),
      });
      seeded += 1;
    }
  }
  return seeded;
}
