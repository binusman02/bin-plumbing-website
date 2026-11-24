import { redirect } from "next/navigation";
import { connection } from "next/server";
import { WorkforceConsoleClient } from "@/components/admin/WorkforceConsoleClient";
import { requireAdminUser } from "@/lib/security";

export const metadata = {
  title: "AI Workforce Console | FlowGuard Admin",
  robots: { index: false, follow: false },
};

export default async function AdminWorkforcePage() {
  await connection();
  const admin = await requireAdminUser();
  if (!admin) {
    redirect("/admin/login?error=unauthorized");
  }
  return <WorkforceConsoleClient />;
}
