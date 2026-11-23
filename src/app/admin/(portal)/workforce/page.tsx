import { redirect } from "next/navigation";
import { WorkforceConsoleClient } from "@/components/admin/WorkforceConsoleClient";
import { requireAdminUser } from "@/lib/security";

export const metadata = {
  title: "AI Workforce Console | FlowGuard Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWorkforcePage() {
  const admin = await requireAdminUser();
  if (!admin) {
    redirect("/admin/login?error=unauthorized");
  }
  return <WorkforceConsoleClient />;
}
