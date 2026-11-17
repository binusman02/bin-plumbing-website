import { connection } from "next/server";
import { ClipboardList } from "lucide-react";
import { getAllAuditLogs } from "@/lib/marketplace";
import { formatDateTime } from "@/lib/currency";

export const instant = false;

export const metadata = {
  title: "Audit Log | FlowGuard Plumbing Admin",
};

export default async function AdminAuditLogPage() {
  await connection();
  const logs = await getAllAuditLogs();

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1F3A]">Audit Log</h2>
        <p className="text-sm text-slate-500">
          Every recorded administrative change: who made it, when, and what changed.
        </p>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No audit entries yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Approvals, rejections, assignments, payment confirmations, and settings updates appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3.5 text-slate-600">
                      {formatDateTime(entry.timestamp)}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-[#0B1F3A]">{entry.actor}</td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800">{entry.action}</td>
                    <td className="px-4 py-3.5 text-slate-600">
                      <span className="capitalize">{entry.entity_type}</span>
                      {entry.entity_id ? (
                        <>
                          {" "}
                          • <span className="font-mono text-xs">{entry.entity_id}</span>
                        </>
                      ) : null}
                    </td>
                    <td className="max-w-md px-4 py-3.5 text-slate-600">
                      {entry.old_value && entry.new_value
                        ? `${entry.old_value} -> ${entry.new_value}`
                        : entry.new_value || entry.old_value || "Recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-[#0B1F3A]">{entry.action}</p>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(entry.timestamp)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700">
                  {entry.old_value && entry.new_value
                    ? `${entry.old_value} -> ${entry.new_value}`
                    : entry.new_value || entry.old_value || "Recorded"}
                </p>
                <p className="mt-1.5 text-xs text-slate-500">
                  By {entry.actor} • {entry.entity_type} ({entry.entity_id})
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
