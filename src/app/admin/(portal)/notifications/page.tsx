import { connection } from "next/server";
import { NotificationDrawer } from "@/components/ui/NotificationDrawer";

export const instant = false;

export const metadata = {
  title: "Notifications | FlowGuard Plumbing Admin",
};

export default async function AdminNotificationsPage() {
  await connection();

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1F3A]">Notifications Inbox</h2>
        <p className="text-sm text-slate-500">
          Persistent operational notifications across requests, messages, plumber
          applications, quotations, payments, enquiries, and complaints.
        </p>
      </div>

      <NotificationDrawer role="admin" variant="inline" />
    </div>
  );
}
