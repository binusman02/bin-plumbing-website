import { createClient } from "@/lib/supabase/server";
import { connection } from "next/server";
import { getEnquiryNotesMap } from "@/lib/marketplace";
import { EnquiriesManagerClient } from "@/components/admin/EnquiriesManagerClient";

export const instant = false;

export const metadata = {
  title: "Direct Enquiries | Flow Guard Plumbing Admin",
};

export default async function EnquiriesAdminPage() {
  await connection();
  const supabase = await createClient();

  const [{ data: enquiries }, notesMap] = await Promise.all([
    supabase.from("enquiries").select("*").order("created_at", { ascending: false }),
    getEnquiryNotesMap(),
  ]);

  return (
    <EnquiriesManagerClient
      initialEnquiries={enquiries || []}
      initialNotesMap={notesMap}
    />
  );
}
