import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ProfileManager } from "@/components/portal/ProfileManager";
import { resolvePortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export const instant = false;

export const metadata = {
  title: "Admin Profile | Bin Plumbing Admin",
};

export default async function AdminProfilePage() {
  await connection();
  const actor = await resolvePortalActor("admin");
  if (!actor || actor.role !== "admin") {
    redirect("/admin/login");
  }

  const supabase = getServiceSupabase();
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("*")
    .eq("id", actor.id)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0B1F3A] sm:text-2xl">Account & Profile</h1>
        <p className="text-sm text-slate-500">
          Manage your administrator profile photo, contact details, and account password.
        </p>
      </div>
      <ProfileManager
        role="admin"
        initialData={{
          id: actor.id,
          fullName: String(adminRow?.full_name || actor.name),
          email: String(adminRow?.email || actor.email || ""),
          phone: adminRow?.phone ? String(adminRow.phone) : "",
          avatarUrl: adminRow?.avatar_url ? String(adminRow.avatar_url) : null,
          roleLabel: String(adminRow?.role || "Administrator"),
        }}
      />
    </div>
  );
}
