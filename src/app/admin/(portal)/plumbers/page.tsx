import { connection } from "next/server";
import { getAllPlumbers, getAllServiceRequests } from "@/lib/marketplace";
import PlumbersManagerClient from "@/components/admin/PlumbersManagerClient";

export const instant = false;

export const metadata = {
  title: "Plumbers Directory & Verification | Admin Portal",
};

export default async function AdminPlumbersPage() {
  await connection();
  const plumbers = await getAllPlumbers();
  const requests = await getAllServiceRequests();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-[#0B1F3A] text-xs font-bold uppercase tracking-wider bg-white px-2.5 py-1 rounded border border-slate-200">
            Marketplace Tradespeople
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B1F3A] mt-1.5">
            Plumbers & Onboarding Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Review onboarding applications, verify trade credentials, manage active status, and assign dispatches.
          </p>
        </div>
      </div>

      <PlumbersManagerClient initialPlumbers={plumbers} requests={requests} />
    </div>
  );
}
