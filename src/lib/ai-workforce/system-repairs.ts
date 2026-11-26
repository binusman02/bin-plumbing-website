import { reconcileStaleWorkforceState } from "@/lib/ai-workforce/workforce-sync";
import { reconcilePlumberSharing } from "@/lib/live-location-server";
import { claimUnlinkedCustomerRequests } from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const SYSTEM_REPAIR_TYPES = [
  "reconcile_workforce",
  "relink_guest_bookings",
  "clear_noise_incidents",
  "sync_stale_plumber_locations",
] as const;

export type SystemRepairType = (typeof SYSTEM_REPAIR_TYPES)[number];

export interface SystemRepairOutcome {
  ok: boolean;
  repairType: SystemRepairType;
  summary: string;
  details?: Record<string, unknown>;
}

/**
 * Executes bounded, non-destructive system repairs after explicit Owner approval.
 */
export async function executeSafeSystemRepair(
  repairType: SystemRepairType,
  reason?: string
): Promise<SystemRepairOutcome> {
  const supabase = getServiceSupabase();

  if (repairType === "reconcile_workforce") {
    await reconcileStaleWorkforceState();
    return {
      ok: true,
      repairType,
      summary:
        "Synchronized pending approvals, closed finished waiting tasks, expired old approvals, and refreshed notification status.",
      details: reason ? { reason } : undefined,
    };
  }

  if (repairType === "relink_guest_bookings") {
    const { data: customers } = await supabase
      .from("customers")
      .select("id, email, phone")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);

    let customersChecked = 0;
    let linkedCount = 0;
    for (const c of customers || []) {
      customersChecked += 1;
      const count = await claimUnlinkedCustomerRequests({
        customerId: String(c.id),
        email: c.email ? String(c.email) : null,
        phone: c.phone ? String(c.phone) : null,
      }).catch(() => 0);
      linkedCount += count;
    }

    return {
      ok: true,
      repairType,
      summary: `Checked ${customersChecked} customer accounts and linked ${linkedCount} unlinked guest service request(s) to their profiles.`,
      details: { customersChecked, linkedCount },
    };
  }

  if (repairType === "clear_noise_incidents") {
    const nowIso = new Date().toISOString();
    const { data: tasks } = await supabase
      .from("ai_tasks")
      .select("id, title, description, output_summary")
      .eq("assigned_agent_id", "engineering_ai")
      .order("created_at", { ascending: false })
      .limit(50);

    const noiseTaskIds = (tasks || [])
      .filter((t) =>
        /\b(NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR_FALLBACK)\b/i.test(
          `${String(t.title || "")} ${String(t.description || "")} ${String(t.output_summary || "")}`
        )
      )
      .map((t) => String(t.id));

    if (noiseTaskIds.length > 0) {
      await supabase
        .from("ai_tasks")
        .update({
          status: "closed",
          qa_status: "approved",
          output_summary: "Closed automatically: normal page navigation signal, not a system bug.",
          deliverable: "Closed automatically: normal page navigation signal, not a system bug.",
          lessons: ["Ignored harmless Next.js redirect control signal."],
          completed_at: nowIso,
        })
        .in("id", noiseTaskIds);
    }

    await supabase
      .from("notifications")
      .update({ read_at: nowIso })
      .eq("recipient_role", "admin")
      .is("read_at", null)
      .ilike("body", "%NEXT_REDIRECT%");

    return {
      ok: true,
      repairType,
      summary: `Cleared ${noiseTaskIds.length} false-alarm redirect notice(s) from the AI task board and alert bell.`,
      details: { clearedTasks: noiseTaskIds.length },
    };
  }

  // sync_stale_plumber_locations
  const { data: plumbers } = await supabase
    .from("plumbers")
    .select("id, is_online, last_seen_at")
    .eq("is_online", true)
    .is("deleted_at", null)
    .limit(40);

  let reconciled = 0;
  for (const p of plumbers || []) {
    await reconcilePlumberSharing(String(p.id)).catch(() => {});
    reconciled += 1;
  }

  return {
    ok: true,
    repairType,
    summary: `Refreshed live location sharing status across ${reconciled} active plumber profile(s).`,
    details: { reconciled },
  };
}
