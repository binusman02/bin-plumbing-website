import { connection } from "next/server";
import {
  getAllQuotations,
  getAllPayments,
  getAllServiceRequests,
  getMarketplaceSettings,
} from "@/lib/marketplace";
import FinancialsManagerClient from "@/components/admin/FinancialsManagerClient";

export const instant = false;

export const metadata = {
  title: "Financial Management & Reconciliation | Admin Portal",
};

export default async function AdminFinancialsPage() {
  await connection();
  const allQuotations = await getAllQuotations();
  const approvedQuotations = allQuotations.filter(
    (q) => q.customer_approval_status === "approved"
  );
  const payments = await getAllPayments();
  const requests = await getAllServiceRequests();
  const settings = await getMarketplaceSettings();

  return (
    <div className="space-y-6">
      <div>
        <span className="text-[#0B1F3A] text-xs font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded border border-slate-200">
          Financial Control & Reconciliation
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] mt-1.5">
          Financial Management & Commission
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Track labour charges, material estimates, platform commission (strictly 20% on labour only), and record reconciled customer payments.
        </p>
      </div>

      <FinancialsManagerClient
        quotations={approvedQuotations}
        payments={payments}
        requests={requests}
        settings={settings}
      />
    </div>
  );
}
