import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AdminLayoutShell } from "@/components/admin/AdminLayoutShell";
import { getAdminNotifications } from "@/lib/admin-notifications";
import { requireAdminUser } from "@/lib/security";

export const instant = false;

export const metadata = {
  title: "Admin Portal | Bin Plumbing Services Ltd",
  description: "Secure operational administration and CRM portal for Bin Plumbing Services Ltd.",
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

  const role =
    (user.app_metadata?.role as string | undefined) ||
    (user.user_metadata?.role as string | undefined);

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
  } = await getAdminNotifications();

  return (
    <AdminLayoutShell
      userEmail={user.email || "admin@binplumbing.com"}
      unreadCount={notifications.length}
      unreadEnquiriesCount={unreadEnquiriesCount}
      unreadCommunicationsCount={unreadCommunicationsCount}
      notifications={notifications}
    >
      {children}
    </AdminLayoutShell>
  );
}
