"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security";

export async function loginAdmin(formData: FormData) {
  const email = (formData.get("email") as string)?.trim() || "";
  const password = (formData.get("password") as string) || "";

  if (!email || !password) {
    return { error: "Please enter both email and password." };
  }

  const rate = await checkRateLimit("admin_login", 5, 15 * 60 * 1000, email);
  if (!rate.allowed) {
    const minutesLeft = Math.ceil(rate.retryAfterSeconds / 60);
    return {
      error: `Too many failed sign-in attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: "Invalid sign-in details." };
  }

  // Strictly verify admin access from public.admin_users table
  const adminSupabase = getServiceSupabase();
  const { data: adminRow } = await adminSupabase
    .from("admin_users")
    .select("id, is_active, role")
    .eq("auth_user_id", data.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRow) {
    await supabase.auth.signOut();
    return { error: "This account is not authorised for admin access." };
  }

  return { success: true };
}

export async function logoutAdmin() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
