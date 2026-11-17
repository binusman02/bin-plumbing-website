import { connection } from "next/server";
import {
  getAllMessages,
  getAllPlumbers,
  getAllQuotations,
  getAllServiceRequests,
} from "@/lib/marketplace";
import CommunicationsManagerClient from "@/components/admin/CommunicationsManagerClient";

export const instant = false;

export const metadata = {
  title: "Communications | Flow Guard Plumbing Admin",
};

export default async function AdminCommunicationsPage() {
  await connection();
  const [messages, requests, quotations, plumbers] = await Promise.all([
    getAllMessages(),
    getAllServiceRequests(),
    getAllQuotations(),
    getAllPlumbers(),
  ]);
  const approvedQuotations = quotations.filter(
    (q) => q.customer_approval_status === "approved"
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#0B1F3A] sm:text-2xl">
          Communications
        </h1>
        <p className="text-sm text-slate-500">
          Select a plumber to view full job conversations, message the plumber privately, or send a message visible to the customer.
        </p>
      </div>

      <CommunicationsManagerClient
        messages={messages}
        requests={requests}
        quotations={approvedQuotations}
        plumbers={plumbers}
      />
    </div>
  );
}
