import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getVerifiedAppRole } from "@/lib/auth-role";
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
      status?: string;
      isApproved?: boolean;
    };

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
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const headerStore = await headers();
      const authHeader = headerStore.get("authorization") || "";
      if (authHeader.toLowerCase().startsWith("bearer ")) {
        const bearerToken = authHeader.slice(7).trim();
        if (bearerToken) {
          const { data: tokenData } = await adminSupabase.auth.getUser(bearerToken);
          user = tokenData.user ?? null;
        }
      }
    }

    if (user) {
      // 1. Admin check via admin_users table (always check first so admins are never auto-healed as customers)
      const { data: adminRow } = await adminSupabase
        .from("admin_users")
        .select("id, email, full_name, role, is_active")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (adminRow) {
        if (preferredRole && preferredRole !== "admin") {
          return null;
        }
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

      const metaRole = getVerifiedAppRole(user);

      // 2. Plumber via Supabase Auth (linked strictly by auth_user_id)
      if ((!preferredRole || preferredRole === "plumber") && (metaRole === "plumber" || !metaRole)) {
        const userEmail = (user.email || "").toLowerCase().trim();
        const { data: byAuthRows } = await adminSupabase
          .from("plumbers")
          .select("*")
          .eq("auth_user_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(1);

        const match = byAuthRows?.[0] ?? null;
        if (match) {
          const plumberStatus = String(match.verification_status || match.status || "pending_review");
          if (plumberStatus === "suspended") {
            return null;
          }
          return {
            role: "plumber",
            id: String(match.id),
            authUserId: user.id,
            email: match.email ? String(match.email) : userEmail || undefined,
            phone: String(match.phone || ""),
            name: String(match.full_name || "Plumber"),
            status: plumberStatus,
            isApproved: plumberStatus === "approved" || match.is_approved === true,
          };
        }
        if (preferredRole === "plumber") return null;
      }

      // 3. Customer via Supabase Auth (linked by auth_user_id, with auto-heal for mobile signups)
      if (
        (!preferredRole || preferredRole === "customer") &&
        (metaRole === "customer" || (!metaRole && preferredRole === "customer"))
      ) {
        const userEmail = (user.email || "").toLowerCase().trim();
        const { data: byAuthRows } = await adminSupabase
          .from("customers")
          .select("*")
          .eq("auth_user_id", user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: true })
          .limit(1);
        let byAuth = byAuthRows?.[0] ?? null;

        // Auto-heal mobile/OAuth signups that didn't go through web server action
        if (!byAuth) {
          const { data: plumberRows } = await adminSupabase
            .from("plumbers")
            .select("id")
            .eq("auth_user_id", user.id)
            .is("deleted_at", null)
            .limit(1);
          const isPlumber = plumberRows?.[0] ?? null;
          if (!isPlumber) {
            if (userEmail) {
              const { data: byEmailRows } = await adminSupabase
                .from("customers")
                .select("*")
                .ilike("email", userEmail)
                .is("deleted_at", null)
                .order("created_at", { ascending: true })
                .limit(1);
              const byEmail = byEmailRows?.[0] ?? null;
              if (byEmail) {
                await adminSupabase
                  .from("customers")
                  .update({ auth_user_id: user.id })
                  .eq("id", byEmail.id);
                byAuth = { ...byEmail, auth_user_id: user.id };
              }
            }
            if (!byAuth) {
              const newId = crypto.randomUUID();
              const fullName =
                String(user.user_metadata?.full_name || userEmail.split("@")[0] || "Customer");
              const rawPhone = String(user.user_metadata?.phone || user.phone || "").trim();
              const phone = rawPhone || `g-${user.id.slice(0, 12)}`;
              const { data: created } = await adminSupabase
                .from("customers")
                .insert({
                  id: newId,
                  auth_user_id: user.id,
                  full_name: fullName,
                  email: userEmail || null,
                  phone,
                  area_in_kano: "Kano Municipal",
                  address: "",
                })
                .select("*")
                .maybeSingle();
              byAuth = created ?? null;
            }
            if (!metaRole) {
              await adminSupabase.auth.admin
                .updateUserById(user.id, {
                  app_metadata: { ...user.app_metadata, role: "customer" },
                })
                .catch(() => {});
            }
          }
        }

        const match = byAuth && !byAuth.deleted_at ? byAuth : null;
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

      let plumber: Record<string, unknown> | null = null;
      if (accountRow?.plumber_id) {
        const { data: byPlumberId } = await adminSupabase
          .from("plumbers")
          .select("*")
          .eq("id", String(accountRow.plumber_id))
          .maybeSingle();
        if (byPlumberId && !byPlumberId.deleted_at) plumber = byPlumberId;
      } else if (accountRow?.auth_user_id) {
        const { data: byAuthId } = await adminSupabase
          .from("plumbers")
          .select("*")
          .eq("auth_user_id", String(accountRow.auth_user_id))
          .maybeSingle();
        if (byAuthId && !byAuthId.deleted_at) plumber = byAuthId;
      } else {
        const { data: byDirectId } = await adminSupabase
          .from("plumbers")
          .select("*")
          .eq("id", plumberSession.accountId)
          .maybeSingle();
        if (byDirectId && !byDirectId.deleted_at) plumber = byDirectId;
      }

      const accEmail = String(accountRow?.email || "").toLowerCase().trim();

      if (plumber) {
        const plumberStatus = String(plumber.verification_status || plumber.status || "pending_review");
        if (plumberStatus === "suspended") {
          return null;
        }
        return {
          role: "plumber",
          id: String(plumber.id),
          email: plumber.email ? String(plumber.email) : accEmail || undefined,
          phone: String(plumber.phone || ""),
          name: String(plumber.full_name || "Plumber"),
          status: plumberStatus,
          isApproved: plumberStatus === "approved" || plumber.is_approved === true,
        };
      }
    }
  }

  return null;
}

export async function requireApprovedPlumberActor(): Promise<
  Extract<PortalActor, { role: "plumber" }> | null
> {
  const actor = await resolvePortalActor("plumber");
  if (!actor || actor.role !== "plumber" || !actor.isApproved) {
    return null;
  }
  return actor;
}
