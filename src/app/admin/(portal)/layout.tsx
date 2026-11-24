import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { getAdminNotifications } from "@/lib/admin-notifications";
import { getVerifiedAppRole } from "@/lib/auth-role";
import { requireAdminUser } from "@/lib/security";

export const instant = false;

export const metadata = {
  title: "Admin Portal | FlowGuard Plumbing Enterprises",
  description: "Secure operational administration and CRM portal for FlowGuard Plumbing Enterprises.",
  robots: { index: false, follow: false },
};

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const role = getVerifiedAppRole(user);

  if (role === "customer" || role === "plumber") {
    redirect(role === "customer" ? "/customer" : "/plumber");
  }

  const adminUser = await requireAdminUser();
  if (!adminUser) {
    redirect("/admin/login?error=unauthorized");
  }

  const {
    items: notifications,
    unreadEnquiriesCount,
    unreadCommunicationsCount,
    unreadWorkforceCount,
  } = await getAdminNotifications();

  return (
    <AdminLayoutShell
      userEmail={user.email || "admin@flowguard.com.ng"}
      unreadCount={notifications.length}
      unreadEnquiriesCount={unreadEnquiriesCount}
      unreadCommunicationsCount={unreadCommunicationsCount}
      unreadWorkforceCount={unreadWorkforceCount}
      notifications={notifications}
    >
      {children}
    </AdminLayoutShell>
  );
}
