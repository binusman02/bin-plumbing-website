import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ requests: [], customers: [], plumbers: [] });
  }

  const supabase = getServiceSupabase();
  const safe = q.replace(/[%_,]/g, "");
  const pattern = `%${safe}%`;

  const [reqRes, custRes, plumbRes] = await Promise.all([
    supabase
      .from("service_requests")
      .select("id, ticket_number, customer_name, customer_phone, status")
      .or(`ticket_number.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern}`)
      .limit(6),
    supabase
      .from("customers")
      .select("id, full_name, phone, email")
      .or(`full_name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .limit(6),
    supabase
      .from("plumbers")
      .select("id, full_name, phone, application_ref, verification_status")
      .or(`full_name.ilike.${pattern},phone.ilike.${pattern},application_ref.ilike.${pattern}`)
      .limit(6),
  ]);

  return NextResponse.json({
    requests: reqRes.data || [],
    customers: custRes.data || [],
    plumbers: plumbRes.data || [],
  });
}
