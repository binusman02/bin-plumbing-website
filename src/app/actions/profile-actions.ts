"use server";

import { revalidatePath } from "next/cache";
import { resolvePortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { appendAuditLog } from "@/lib/marketplace";
import {
  hashCustomerPassword as hashPassword,
  verifyCustomerPassword as verifyPassword,
} from "@/lib/customer-session";

export async function updateProfileAction(input: {
  role: "admin" | "customer" | "plumber";
  fullName: string;
  phone?: string;
  email?: string;
  cityLga?: string;
  address?: string;
  state?: string;
  residentialLocation?: string;
  preferredLocations?: string[];
  skills?: string[];
  availability?: string;
}) {
  try {
    const actor = await resolvePortalActor(input.role);
    if (!actor || actor.role !== input.role) {
      return { success: false, error: "Unauthorized" };
    }

    const cleanName = input.fullName.trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "Full name must be at least 2 characters." };
    }

    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();

    if (actor.role === "admin") {
      const { error } = await supabase
        .from("admin_users")
        .update({
          full_name: cleanName,
          phone: input.phone?.trim() || null,
          updated_at: nowIso,
        })
        .eq("id", actor.id);
      if (error && !error.message.includes("updated_at")) {
        return { success: false, error: error.message };
      }
      await appendAuditLog({
        actor: actor.email || cleanName,
        action: "Updated Admin Profile",
        entity_type: "admin_user",
        entity_id: actor.id,
      });
      revalidatePath("/admin");
      revalidatePath("/admin/profile");
      return { success: true };
    }

    if (actor.role === "customer") {
      const updates: Record<string, unknown> = {
        full_name: cleanName,
        phone: input.phone?.trim() || actor.phone,
        email: input.email?.trim() || null,
        city_lga: input.cityLga?.trim() || null,
        area_in_kano: input.cityLga?.trim() || "Kano Municipal",
        address: input.address?.trim() || null,
        state: input.state?.trim() || null,
        updated_at: nowIso,
      };
      const { error } = await supabase.from("customers").update(updates).eq("id", actor.id);
      if (error) {
        return { success: false, error: error.message };
      }
      revalidatePath("/customer");
      return { success: true };
    }

    // Plumber role — strictly disallow verification_status, rating, total_jobs changes
    const plumberUpdates: Record<string, unknown> = {
      full_name: cleanName,
      phone: input.phone?.trim() || actor.phone,
      residential_location: input.residentialLocation?.trim() || undefined,
      preferred_locations: Array.isArray(input.preferredLocations) ? input.preferredLocations : undefined,
      skills: Array.isArray(input.skills) ? input.skills : undefined,
      availability: input.availability?.trim() || undefined,
      updated_at: nowIso,
    };
    const { error } = await supabase.from("plumbers").update(plumberUpdates).eq("id", actor.id);
    if (error) {
      return { success: false, error: error.message };
    }
    revalidatePath("/plumber");
    revalidatePath("/admin/plumbers");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update profile." };
  }
}

export async function changePortalPasswordAction(input: {
  role: "admin" | "customer" | "plumber";
  currentPassword: string;
  newPassword: string;
}) {
  try {
    const actor = await resolvePortalActor(input.role);
    if (!actor || actor.role !== input.role) {
      return { success: false, error: "Unauthorized" };
    }
    if (!input.newPassword || input.newPassword.length < 8) {
      return { success: false, error: "New password must be at least 8 characters." };
    }

    if (actor.role === "admin") {
      const sb = await createClient();
      const { error } = await sb.auth.updateUser({ password: input.newPassword });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    const supabase = getServiceSupabase();
    if (actor.role === "customer") {
      const { data: cust } = await supabase
        .from("customers")
        .select("password_hash")
        .eq("id", actor.id)
        .maybeSingle();
      if (!cust) return { success: false, error: "Customer account not found." };
      if (cust.password_hash && !verifyPassword(input.currentPassword, String(cust.password_hash))) {
        return { success: false, error: "Current password is incorrect." };
      }
      await supabase
        .from("customers")
        .update({ password_hash: hashPassword(input.newPassword), updated_at: new Date().toISOString() })
        .eq("id", actor.id);
      return { success: true };
    }

    // Plumber account (update Supabase Auth user if linked, and plumber_accounts if present)
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      const { error } = await sb.auth.updateUser({ password: input.newPassword });
      if (error) return { success: false, error: error.message };
      return { success: true };
    }

    const { data: acc } = await supabase
      .from("plumber_accounts")
      .select("id, password_hash")
      .eq("plumber_id", actor.id)
      .maybeSingle();
    if (!acc) return { success: false, error: "Plumber login record not found." };
    if (acc.password_hash && !verifyPassword(input.currentPassword, String(acc.password_hash))) {
      return { success: false, error: "Current password is incorrect." };
    }
    await supabase
      .from("plumber_accounts")
      .update({ password_hash: hashPassword(input.newPassword) })
      .eq("id", acc.id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update password." };
  }
}

export async function adminUpdatePlumberProfileAction(input: {
  plumberId: string;
  fullName: string;
  phone: string;
  email?: string;
  residentialLocation?: string;
  preferredLocations?: string[];
  skills?: string[];
  availability?: string;
}) {
  try {
    const admin = await resolvePortalActor("admin");
    if (!admin || admin.role !== "admin") {
      return { success: false, error: "Admin authorisation required." };
    }

    const cleanName = input.fullName.trim();
    const cleanPhone = input.phone.trim();
    if (!cleanName || cleanName.length < 2) {
      return { success: false, error: "Full name must be at least 2 characters." };
    }
    if (!cleanPhone) {
      return { success: false, error: "Phone number is required." };
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("plumbers")
      .update({
        full_name: cleanName,
        phone: cleanPhone,
        email: input.email?.trim() || null,
        residential_location: input.residentialLocation?.trim() || "",
        preferred_locations: Array.isArray(input.preferredLocations) ? input.preferredLocations : [],
        skills: Array.isArray(input.skills) ? input.skills : [],
        availability: input.availability?.trim() || "Standard",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.plumberId);

    if (error) {
      return { success: false, error: error.message };
    }

    await appendAuditLog({
      actor: admin.email || admin.name || "Admin",
      action: "Updated Plumber Profile",
      entity_type: "plumber",
      entity_id: input.plumberId,
      new_value: cleanName,
    });

    revalidatePath("/admin/plumbers");
    revalidatePath("/plumber");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/communications");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update plumber profile." };
  }
}
