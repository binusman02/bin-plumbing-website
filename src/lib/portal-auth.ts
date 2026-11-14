import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  CUSTOMER_SESSION_COOKIE,
  PLUMBER_SESSION_COOKIE,
  verifyCustomerSessionToken,
  verifyPlumberSessionToken,
} from "@/lib/customer-session";

export type PortalActor =
  | {
      role: "admin";
      id: string;
      authUserId: string;
      email: string;
      name: string;
      adminRole: string;
    }
  | {
      role: "customer";
      id: string;
      authUserId?: string;
      email?: string;
      phone: string;
      name: string;
    }
  | {
      role: "plumber";
      id: string;
      authUserId?: string;
      email?: string;
      phone: string;
      name: string;
    };

function normalizeDigits(v: string): string {
  return (v || "").replace(/\D/g, "").slice(-10);
}

/**
 * Resolves the verified server-side actor for Admin, Customer, or Plumber.
 * Never trusts client-supplied IDs or roles.
 */
export async function resolvePortalActor(
  preferredRole?: "admin" | "customer" | "plumber"
): Promise<PortalActor | null> {
  const adminSupabase = getServiceSupabase();

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // 1. Admin check via admin_users table
      if (!preferredRole || preferredRole === "admin") {
        const { data: adminRow } = await adminSupabase
          .from("admin_users")
          .select("id, email, full_name, role, is_active")
          .eq("auth_user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (adminRow) {
          return {
            role: "admin",
            id: String(adminRow.id),
            authUserId: user.id,
            email: String(adminRow.email || user.email || ""),
            name: String(adminRow.full_name || "Administrator"),
            adminRole: String(adminRow.role || "admin"),
          };
        }
        if (preferredRole === "admin") return null;
      }

      const metaRole =
        (user.app_metadata?.role as string | undefined) ||
        (user.user_metadata?.role as string | undefined);

      // 2. Plumber via Supabase Auth
      if ((!preferredRole || preferredRole === "plumber") && metaRole === "plumber") {
        const userEmail = (user.email || "").toLowerCase().trim();
        const userPhone = normalizeDigits(String(user.user_metadata?.phone || ""));
        const { data: plumbers } = await adminSupabase
          .from("plumbers")
          .select("*");

        const match = (plumbers || []).find(
          (p) =>
            !p.deleted_at &&
            (p.auth_user_id === user.id ||
              (userEmail && String(p.email || "").toLowerCase().trim() === userEmail) ||
              (userPhone && normalizeDigits(String(p.phone || "")) === userPhone))
        );

        if (match) {
          return {
            role: "plumber",
            id: String(match.id),
            authUserId: user.id,
            email: match.email ? String(match.email) : userEmail || undefined,
            phone: String(match.phone || ""),
            name: String(match.full_name || "Plumber"),
          };
        }
      }

      // 3. Customer via Supabase Auth
      if ((!preferredRole || preferredRole === "customer") && metaRole === "customer") {
        const userEmail = (user.email || "").toLowerCase().trim();
        const userPhone = normalizeDigits(String(user.user_metadata?.phone || ""));
        const { data: customers } = await adminSupabase
          .from("customers")
          .select("*");

        const match = (customers || []).find(
          (c) =>
            !c.deleted_at &&
            (c.auth_user_id === user.id ||
              (userPhone && normalizeDigits(String(c.phone || "")) === userPhone) ||
              (userEmail && String(c.email || "").toLowerCase().trim() === userEmail))
        );

        if (match) {
          return {
            role: "customer",
            id: String(match.id),
            authUserId: user.id,
            email: match.email ? String(match.email) : userEmail || undefined,
            phone: String(match.phone || ""),
            name: String(match.full_name || "Customer"),
          };
        }
      }
    }
  } catch {
    // Fall through to signed portal session cookies
  }

  // Fallback to signed portal cookies for customer / plumber
  const cookieStore = await cookies();

  if (!preferredRole || preferredRole === "customer") {
    const custToken = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
    const custSession = verifyCustomerSessionToken(custToken);
    if (custSession) {
      const { data: cust } = await adminSupabase
        .from("customers")
        .select("*")
        .eq("id", custSession.customerId)
        .maybeSingle();
      if (cust && !cust.deleted_at) {
        return {
          role: "customer",
          id: String(cust.id),
          email: cust.email ? String(cust.email) : undefined,
          phone: String(cust.phone || ""),
          name: String(cust.full_name || "Customer"),
        };
      }
    }
  }

  if (!preferredRole || preferredRole === "plumber") {
    const plumberToken = cookieStore.get(PLUMBER_SESSION_COOKIE)?.value;
    const plumberSession = verifyPlumberSessionToken(plumberToken);
    if (plumberSession) {
      // First check if session.accountId is a plumber_accounts row (standard fallback login)
      const { data: accountRow } = await adminSupabase
        .from("plumber_accounts")
        .select("*")
        .eq("id", plumberSession.accountId)
        .maybeSingle();

      const { data: allPlumbers } = await adminSupabase.from("plumbers").select("*");
      const accEmail = String(accountRow?.email || "").toLowerCase().trim();
      const accPhone = normalizeDigits(String(accountRow?.phone || ""));

      const plumber = (allPlumbers || []).find(
        (p) =>
          !p.deleted_at &&
          (String(p.id) === plumberSession.accountId ||
            (accEmail && String(p.email || "").toLowerCase().trim() === accEmail) ||
            (accPhone && normalizeDigits(String(p.phone || "")) === accPhone))
      );

      if (plumber) {
        return {
          role: "plumber",
          id: String(plumber.id),
          email: plumber.email ? String(plumber.email) : accEmail || undefined,
          phone: String(plumber.phone || ""),
          name: String(plumber.full_name || "Plumber"),
        };
      }
    }
  }

  return null;
}
