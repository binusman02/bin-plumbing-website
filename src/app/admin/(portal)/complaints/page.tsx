import { connection } from "next/server";
import { getAllComplaints, getReviews } from "@/lib/marketplace";
import { ComplaintsManagerClient } from "@/components/admin/ComplaintsManagerClient";

export const instant = false;

export const metadata = {
  title: "Complaints & Reviews | FlowGuard Plumbing Admin",
};

export default async function AdminComplaintsPage() {
  await connection();
  const [complaints, reviews] = await Promise.all([
    getAllComplaints(),
    getReviews(),
  ]);
  return <ComplaintsManagerClient initialComplaints={complaints} initialReviews={reviews} />;
}
