import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getAllComplaints,
  getAllPayments,
  getAllPlumbers,
  getAllQuotations,
  getAllServiceRequests,
  getChatPresenceStatus,
  getGuides,
} from "@/lib/marketplace";
import { getBlogEngagementMap } from "@/lib/blog-engagement";
import { DashboardClient } from "@/components/admin/DashboardClient";

export const instant = false;

export const metadata = {
  title: "Admin Overview | FlowGuard Plumbing Enterprises",
};

export default async function AdminDashboardPage() {
  await connection();
  const supabase = await createClient();

  const [requests, plumbers, quotations, payments, complaints, enquiriesRes, guides, blogEngagementMap] = await Promise.all([
    getAllServiceRequests(),
    getAllPlumbers(),
    getAllQuotations(),
    getAllPayments(),
    getAllComplaints(),
    supabase.from("enquiries").select("*").order("created_at", { ascending: false }),
    getGuides(false),
    getBlogEngagementMap(),
  ]);

  const enquiries = enquiriesRes.data || [];

  const totalEnquiries = enquiries.length;
  const unreadEnquiries = enquiries.filter((e) => e.status === "unread").length;

  const newRequestsCount = requests.filter((r) => r.status === "new").length;
  const awaitingQualificationCount = requests.filter(
    (r) => r.status === "new" || r.status === "contacted"
  ).length;
  const qualifiedCount = requests.filter((r) => r.status === "approved").length;
  const assignedJobsCount = requests.filter((r) => Boolean(r.assigned_plumber_id)).length;
  const activeJobsCount = requests.filter((r) =>
    [
      "scheduled",
      "in_progress",
      "inspection_required",
      "quotation_submitted",
      "awaiting_approval",
      "approved",
      "work_completed",
      "awaiting_final_payment",
    ].includes(r.status)
  ).length;
  const completedJobsCount = requests.filter((r) => r.status === "completed").length;
  const cancelledJobsCount = requests.filter((r) => r.status === "cancelled").length;

  const registeredPlumbersCount = plumbers.length;
  const approvedPlumbersCount = plumbers.filter(
    (p) => p.verification_status === "approved"
  ).length;
  const pendingPlumbers = plumbers.filter(
    (p) =>
      p.verification_status === "submitted" ||
      p.verification_status === "under_review" ||
      p.verification_status === "documents_required"
  );

  // Financial figures from real verified/outstanding payments only
  const verifiedPayments = payments.filter((p) => p.verification_status === "verified");
  const revenueCollected = verifiedPayments.reduce(
    (acc, p) => acc + (Number(p.total_payment) || 0),
    0
  );
  const companyCommission = verifiedPayments.reduce(
    (acc, p) => acc + (Number(p.company_commission) || 0),
    0
  );
  const outstandingPayments = payments
    .filter((p) => p.verification_status === "pending" || p.payment_status === "pending")
    .reduce((acc, p) => acc + (Number(p.total_payment) || 0), 0);

  const openComplaintsCount = complaints.filter(
    (c) => c.status === "new" || c.status === "under_review"
  ).length;

  const pendingQuotations = quotations.filter((q) => q.customer_approval_status === "pending");
  const unverifiedPayments = payments.filter((p) => p.verification_status === "pending");

  // Real service category distribution (computed from actual requests, no invented categories or %)
  const categoryMap = new Map<string, number>();
  for (const r of requests) {
    const cat = r.problem_category || r.property_type || "General Plumbing";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }
  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const approvedPlumbers = plumbers.filter(
    (p) => p.verification_status === "approved"
  );
  const { onlinePlumberIds } = await getChatPresenceStatus();

  return (
    <DashboardClient
      metrics={{
        totalEnquiries,
        unreadEnquiries,
        totalRequests: requests.length,
        newRequestsCount,
        awaitingQualificationCount,
        qualifiedCount,
        assignedJobsCount,
        activeJobsCount,
        completedJobsCount,
        cancelledJobsCount,
        registeredPlumbersCount,
        approvedPlumbersCount,
        revenueCollected,
        outstandingPayments,
        companyCommission,
        openComplaintsCount,
      }}
      latestRequests={requests.slice(0, 5)}
      pendingPlumbers={pendingPlumbers.slice(0, 5)}
      pendingQuotations={pendingQuotations.slice(0, 5)}
      unverifiedPaymentsCount={unverifiedPayments.length}
      categoryBreakdown={categoryBreakdown}
      approvedPlumbers={approvedPlumbers}
      initialOnlinePlumberIds={onlinePlumberIds}
      recentGuides={guides.slice(0, 5)}
      blogEngagementMap={blogEngagementMap}
    />
  );
}
