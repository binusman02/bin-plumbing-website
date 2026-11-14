import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { resolvePortalActor } from "@/lib/portal-auth";
import {
  getMarketplaceSettings,
  getMessagesForAuthorizedTicket,
  mapMessageRow,
  mapPaymentRow,
  mapQuotationRow,
  mapServiceRequestRow,
  type CustomerProfile,
  type ServiceRequestRecord,
  type StructuredQuotation,
  type PaymentRecord,
  type JobMessage,
} from "@/lib/marketplace";
import CustomerPortalClient from "@/components/customer/CustomerPortalClient";

export const instant = false;

export const metadata = {
  title: "Customer Portal",
  description:
    "Sign in to track your plumbing service requests, review itemised quotations, and message your assigned plumber.",
  robots: { index: false, follow: false },
};

export default async function CustomerPortalPage() {
  await connection();
  const settings = await getMarketplaceSettings();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user
    ? ((user.app_metadata?.role as string | undefined) ||
        (user.user_metadata?.role as string | undefined))
    : undefined;

  if (user && role === "plumber") {
    redirect("/plumber");
  }
  if (user && role !== "customer") {
    redirect("/admin");
  }

  const actor = await resolvePortalActor("customer");
  const adminSupabase = getServiceSupabase();

  let targetCustomer: CustomerProfile | null = null;
  let isolatedRequests: ServiceRequestRecord[] = [];
  let isolatedQuotations: StructuredQuotation[] = [];
  let isolatedPayments: PaymentRecord[] = [];
  let isolatedMessages: JobMessage[] = [];

  if (actor && actor.role === "customer") {
    const { data: custRow } = await adminSupabase
      .from("customers")
      .select("*")
      .eq("id", actor.id)
      .maybeSingle();

    if (custRow && !custRow.deleted_at) {
      targetCustomer = custRow as CustomerProfile;
      // Ensure auth_user_id is linked when signed in with Supabase Auth
      if (user && !custRow.auth_user_id) {
        await adminSupabase
          .from("customers")
          .update({ auth_user_id: user.id })
          .eq("id", actor.id)
          .then(() => {}, () => {});
      }

      // Query only this customer's service requests by exact customer_id
      const { data: reqRows } = await adminSupabase
        .from("service_requests")
        .select("*")
        .eq("customer_id", actor.id)
        .order("created_at", { ascending: false });

      isolatedRequests = (reqRows || [])
        .filter((r) => !r.deleted_at)
        .map((r) => mapServiceRequestRow(r));
      const ticketNumbers = isolatedRequests.map((r) => r.ticket_number);

      if (ticketNumbers.length > 0) {
        const [quoteRes, payRes, msgRes] = await Promise.all([
          adminSupabase
            .from("quotations")
            .select("*")
            .in("ticket_number", ticketNumbers)
            .order("created_at", { ascending: false }),
          adminSupabase
            .from("payments")
            .select("*")
            .in("ticket_number", ticketNumbers)
            .order("created_at", { ascending: false }),
          adminSupabase
            .from("messages")
            .select("*")
            .in("ticket_number", ticketNumbers)
            .eq("is_internal", false)
            .order("created_at", { ascending: true }),
        ]);

        isolatedQuotations = (quoteRes.data || []).map((q) => mapQuotationRow(q));
        isolatedPayments = (payRes.data || []).map((p) => mapPaymentRow(p));

        const rawMsgs = (msgRes.data || []).map((m) => mapMessageRow(m));
        isolatedMessages = rawMsgs.filter((m) => {
          if (m.sender_role === "admin" && m.recipient_role === "plumber") return false;
          if (m.sender_role === "plumber" && m.recipient_role === "admin") return false;
          return true;
        });

        // Compute receipt status cleanly if receipts exist
        void getMessagesForAuthorizedTicket;
      }
    }
  }

  return (
    <CustomerPortalClient
      initialCustomerId={targetCustomer?.id || null}
      customers={targetCustomer ? [targetCustomer] : []}
      requests={isolatedRequests}
      quotations={isolatedQuotations}
      payments={isolatedPayments}
      messages={isolatedMessages}
      activeLocations={settings.active_coverage_locations || []}
      bankDetails={{
        bankName: settings.bank_name,
        bankAccountName: settings.bank_account_name,
        bankAccountNumber: settings.bank_account_number,
      }}
    />
  );
}
