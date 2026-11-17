import { connection } from "next/server";
import {
  getAllMessages,
  getAllPayments,
  getAllPlumbers,
  getAllQuotations,
  getAllServiceRequests,
} from "@/lib/marketplace";
import { RequestsManagerClient } from "@/components/admin/RequestsManagerClient";

export const instant = false;

export const metadata = {
  title: "Service Requests | FlowGuard Plumbing Admin",
};

export default async function RequestsAdminPage() {
  await connection();
  const [requests, plumbers, quotations, messages, payments] = await Promise.all([
    getAllServiceRequests(),
    getAllPlumbers(),
    getAllQuotations(),
    getAllMessages(),
    getAllPayments(),
  ]);

  return (
    <RequestsManagerClient
      initialRequests={requests || []}
      vettedPlumbers={plumbers}
      initialQuotations={quotations || []}
      initialMessages={messages || []}
      initialPayments={payments || []}
    />
  );
}
