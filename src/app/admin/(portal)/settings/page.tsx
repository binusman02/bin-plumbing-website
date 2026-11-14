import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { getMarketplaceSettings } from "@/lib/marketplace";
import SettingsManagerClient from "@/components/admin/SettingsManagerClient";

export const instant = false;

export const metadata = {
  title: "Settings | Bin Plumbing Admin",
};

export default async function SettingsAdminPage() {
  await connection();
  const supabase = await createClient();
  const [{ data: { user } }, settings] = await Promise.all([
    supabase.auth.getUser(),
    getMarketplaceSettings(),
  ]);

  const userEmail = user?.email || "";
  const adminUsers = settings.admin_users || [];
  const matchedAdmin = adminUsers.find(
    (u) => u.email.toLowerCase() === userEmail.toLowerCase()
  );
  // If admin_users list is empty or user is marked owner or role metadata is owner, treat as owner
  const isOwner =
    adminUsers.length === 0 ||
    matchedAdmin?.role === "Owner" ||
    user?.app_metadata?.role === "owner" ||
    user?.app_metadata?.role === "admin";

  return (
    <div className="max-w-5xl space-y-6 pb-20 lg:pb-6">
      <div>
        <h1 className="text-xl font-bold text-[#0B1F3A] sm:text-2xl">
          Platform Settings
        </h1>
        <p className="text-sm text-slate-500">
          Configure company contact details, service categories, coverage areas, commission rules, and notifications.
        </p>
      </div>

      <SettingsManagerClient
        initialSettings={settings}
        currentUserEmail={userEmail}
        isOwner={Boolean(isOwner)}
      />
    </div>
  );
}
