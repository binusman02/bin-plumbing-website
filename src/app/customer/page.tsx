import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getVerifiedAppRole } from "@/lib/auth-role";
import { resolvePortalActor } from "@/lib/portal-auth";
import {
  getMarketplaceSettings,
  getServiceCategories,
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
  const [settings, serviceCategories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = getVerifiedAppRole(user);

  if (user && role === "plumber") {
    redirect("/plumber");
  }
  if (user && role === "admin") {
    redirect("/admin");
  }

  const actor = await resolvePortalActor("customer");
  const adminSupabase = getServiceSupabase();

  let targetCustomer: CustomerProfile | null = null;
  let isolatedRequests: ServiceRequestRecord[] = [];
  let isolatedQuotations: StructuredQuotation[] = [];
  let isolatedPayments: PaymentRecord[] = [];
  let isolatedMessages: JobMessage[] = [];
  const plumberAvatars: Record<string, string> = {};
  const plumberLocations: Record<string, { lat: number; lng: number; updatedAt?: string }> = {};

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

      const activeReqRows = (reqRows || []).filter((r) => !r.deleted_at);
      const ticketNumbers = activeReqRows.map((r) => String(r.ticket_number));
      const requestIds = activeReqRows.map((r) => String(r.id));

      if (ticketNumbers.length > 0) {
        const [histRes, quoteRes, payRes, msgRes] = await Promise.all([
          adminSupabase
            .from("request_history")
            .select("*")
            .in("request_id", requestIds)
            .order("created_at", { ascending: true }),
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

        const histRows = histRes.data || [];
        isolatedRequests = activeReqRows.map((r) => mapServiceRequestRow(r, histRows));
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

        const activePlumberIdSet = new Set(
          isolatedRequests
            .filter((r) => !["completed", "cancelled"].includes(r.status))
            .map((r) => r.assigned_plumber_id)
            .filter((id): id is string => Boolean(id))
        );
        const plumberIds = Array.from(
          new Set(
            isolatedRequests
              .map((r) => r.assigned_plumber_id)
              .filter((id): id is string => Boolean(id))
          )
        );
        if (plumberIds.length > 0) {
          const { data: plumberRows, error: plumberErr } = await adminSupabase
            .from("plumbers")
            .select("id, full_name, avatar_url, current_lat, current_lng, location_updated_at")
            .in("id", plumberIds);
          const rows = plumberErr
            ? (
                await adminSupabase
                  .from("plumbers")
                  .select("id, full_name, avatar_url")
                  .in("id", plumberIds)
              ).data
            : plumberRows;
          for (const p of (rows || []) as Record<string, unknown>[]) {
            if (p.avatar_url) {
              plumberAvatars[String(p.id)] = String(p.avatar_url);
              if (p.full_name) {
                plumberAvatars[String(p.full_name).trim().toLowerCase()] = String(p.avatar_url);
              }
            }
            if (
              activePlumberIdSet.has(String(p.id)) &&
              p.current_lat != null &&
              p.current_lng != null
            ) {
              const loc = {
                lat: Number(p.current_lat),
                lng: Number(p.current_lng),
                updatedAt: p.location_updated_at ? String(p.location_updated_at) : undefined,
              };
              plumberLocations[String(p.id)] = loc;
              if (p.full_name) {
                plumberLocations[String(p.full_name).trim().toLowerCase()] = loc;
              }
            }
          }
        }
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
      plumberAvatars={plumberAvatars}
      plumberLocations={plumberLocations}
      activeLocations={settings.active_coverage_locations || []}
      serviceCategories={serviceCategories}
      bankDetails={{
        bankName: settings.bank_name,
        bankAccountName: settings.bank_account_name,
        bankAccountNumber: settings.bank_account_number,
      }}
    />
  );
}
