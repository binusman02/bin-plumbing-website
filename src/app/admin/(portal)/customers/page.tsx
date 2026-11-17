import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import {
  getAllComplaints,
  getAllCustomers,
  getAllMessages,
  getAllPayments,
  getAllServiceRequests,
} from "@/lib/marketplace";
import {
  CustomersManagerClient,
  type CustomerDirectoryEntry,
} from "@/components/admin/CustomersManagerClient";

export const instant = false;

export const metadata = {
  title: "Customers Directory | FlowGuard Plumbing Admin",
};

export default async function CustomersAdminPage() {
  await connection();
  const supabase = await createClient();

  const [localCustomers, requests, messages, payments, complaints, dbCustRes, dbEnqRes] =
    await Promise.all([
      getAllCustomers(),
      getAllServiceRequests(),
      getAllMessages(),
      getAllPayments(),
      getAllComplaints(),
      supabase.from("customers").select("*").order("created_at", { ascending: false }),
      supabase.from("enquiries").select("*").order("created_at", { ascending: false }),
    ]);

  const map = new Map<string, CustomerDirectoryEntry>();

  const ensureEntry = (
    phone: string,
    defaults: { id: string; name: string; area: string; source: string; createdAt: string }
  ) => {
    const key = phone.replace(/\s+/g, "").trim();
    if (!map.has(key)) {
      map.set(key, {
        id: defaults.id,
        name: defaults.name,
        phone: phone.trim(),
        area: defaults.area || "Not specified",
        source: defaults.source,
        createdAt: defaults.createdAt,
        requests: [],
        payments: [],
        complaints: [],
        messagesCount: 0,
      });
    }
    return map.get(key)!;
  };

  for (const c of localCustomers) {
    ensureEntry(c.phone, {
      id: c.id,
      name: c.full_name,
      area: c.city_lga || c.address_in_kano || "Not specified",
      source: "Registered Customer",
      createdAt: c.created_at,
    });
  }

  for (const c of dbCustRes.data || []) {
    ensureEntry(c.phone, {
      id: c.id,
      name: c.full_name,
      area: c.area_in_kano || "Not specified",
      source: "Registered Customer",
      createdAt: c.created_at,
    });
  }

  for (const e of dbEnqRes.data || []) {
    ensureEntry(e.phone, {
      id: e.id,
      name: e.full_name,
      area: e.area_in_kano || "Not specified",
      source: "Direct Enquiry",
      createdAt: e.created_at,
    });
  }

  for (const r of requests) {
    let name = r.customer_name || "";
    let phone = r.customer_phone || "";
    if ((!name || !phone) && r.issue_description) {
      const m = r.issue_description.match(/Customer:\s*(.*?)\s*\|\s*Tel:\s*(.*?)(?:\n|$)/);
      if (m) {
        if (!name) name = m[1]?.trim() || "";
        if (!phone) phone = m[2]?.trim() || "";
      }
    }
    if (!phone) continue;
    const entry = ensureEntry(phone, {
      id: r.id,
      name: name || "Customer",
      area: r.address_in_kano || "Not specified",
      source: "Service Request",
      createdAt: r.created_at,
    });
    entry.requests.push(r);
    entry.messagesCount += messages.filter((msg) => msg.ticket_number === r.ticket_number).length;
    for (const p of payments.filter((pm) => pm.ticket_number === r.ticket_number)) {
      entry.payments.push(p);
    }
  }

  for (const cp of complaints) {
    if (!cp.customer_phone) continue;
    const key = cp.customer_phone.replace(/\s+/g, "").trim();
    const existing = map.get(key);
    if (existing) {
      existing.complaints.push(cp);
    }
  }

  return <CustomersManagerClient initialCustomers={Array.from(map.values())} />;
}
