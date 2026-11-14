import { connection } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  PLUMBER_SESSION_COOKIE,
  verifyPlumberSessionToken,
} from "@/lib/customer-session";
import { resolvePortalActor } from "@/lib/portal-auth";
import {
  getAllPlumberAccounts,
  mapMessageRow,
  mapPaymentRow,
  mapPlumberRow,
  mapQuotationRow,
  mapServiceRequestRow,
  type PlumberProfile,
  type ServiceRequestRecord,
  type StructuredQuotation,
  type PaymentRecord,
  type JobMessage,
} from "@/lib/marketplace";
import PlumberPortalClient from "@/components/plumber/PlumberPortalClient";

export const instant = false;

export const metadata = {
  title: "Technician Portal",
  description:
    "Sign in to manage your assigned plumbing jobs, submit itemised quotations, and update job progress.",
  robots: { index: false, follow: false },
};

export default async function PlumberPortalPage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user
    ? ((user.app_metadata?.role as string | undefined) ||
        (user.user_metadata?.role as string | undefined))
    : undefined;

  if (user && role === "customer") {
    redirect("/customer");
  }
  if (user && role === "admin") {
    redirect("/admin");
  }

  let authenticatedAccount: {
    fullName: string;
    phone: string;
    email: string;
  } | null = null;

  if (user && role === "plumber") {
    authenticatedAccount = {
      fullName:
        (user.user_metadata?.full_name as string) || user.email || "Plumber",
      phone: (user.user_metadata?.phone as string) || "",
      email: (user.email || "").toLowerCase().trim(),
    };
  } else if (!user) {
    const cookieStore = await cookies();
    const token = cookieStore.get(PLUMBER_SESSION_COOKIE)?.value;
    const session = verifyPlumberSessionToken(token);
    if (session) {
      const accounts = await getAllPlumberAccounts();
      const matched = accounts.find((a) => a.id === session.accountId);
      if (matched) {
        authenticatedAccount = {
          fullName: matched.full_name,
          phone: matched.phone,
          email: matched.email.toLowerCase().trim(),
        };
      }
    }
  }

  const actor = await resolvePortalActor("plumber");
  const adminSupabase = getServiceSupabase();

  let targetPlumber: PlumberProfile | null = null;
  let isolatedRequests: ServiceRequestRecord[] = [];
  let isolatedQuotations: StructuredQuotation[] = [];
  let isolatedPayments: PaymentRecord[] = [];
  let isolatedMessages: JobMessage[] = [];

  if (actor && actor.role === "plumber") {
    if (!authenticatedAccount) {
      authenticatedAccount = {
        fullName: actor.name,
        phone: actor.phone,
        email: (actor.email || "").toLowerCase().trim(),
      };
    }

    const { data: plumberRow } = await adminSupabase
      .from("plumbers")
      .select("*")
      .eq("id", actor.id)
      .maybeSingle();

    if (plumberRow && !plumberRow.deleted_at) {
      targetPlumber = mapPlumberRow(plumberRow);
      if (user && !plumberRow.auth_user_id) {
        await adminSupabase
          .from("plumbers")
          .update({ auth_user_id: user.id })
          .eq("id", actor.id)
          .then(() => {}, () => {});
      }

      if (targetPlumber.verification_status === "approved") {
        // Query only jobs assigned to this plumber by exact plumber ID
        const { data: reqRows } = await adminSupabase
          .from("service_requests")
          .select("*")
          .eq("assigned_plumber_id", targetPlumber.id)
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
              .eq("plumber_id", targetPlumber.id)
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
              .order("created_at", { ascending: true }),
          ]);

          isolatedQuotations = (quoteRes.data || [])
            .map((q) => mapQuotationRow(q))
            .filter((q) => q.customer_approval_status === "approved");
          isolatedPayments = (payRes.data || []).map((p) => mapPaymentRow(p));
          isolatedMessages = (msgRes.data || []).map((m) => mapMessageRow(m));
        }
      }
    }
  }

  return (
    <PlumberPortalClient
      initialPlumberId={targetPlumber?.id || null}
      authenticatedAccount={authenticatedAccount}
      plumbers={targetPlumber ? [targetPlumber] : []}
      requests={isolatedRequests}
      quotations={isolatedQuotations}
      payments={isolatedPayments}
      messages={isolatedMessages}
    />
  );
}
