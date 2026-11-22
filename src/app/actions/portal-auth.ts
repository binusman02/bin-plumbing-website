"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { getVerifiedAppRole } from "@/lib/auth-role";
import { checkRateLimit } from "@/lib/security";
import {
  getAllCustomers,
  getAllPlumberAccounts,
  getAllPlumbers,
  registerCustomer,
  registerPlumberAccount,
} from "@/lib/marketplace";
import {
  CUSTOMER_SESSION_COOKIE,
  PLUMBER_SESSION_COOKIE,
  hashCustomerPassword,
  signCustomerSessionToken,
  signPlumberSessionToken,
  verifyCustomerPassword,
} from "@/lib/customer-session";

async function setCustomerSessionCookie(customerId: string) {
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, signCustomerSessionToken(customerId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

async function setPlumberSessionCookie(accountId: string) {
  const cookieStore = await cookies();
  cookieStore.set(PLUMBER_SESSION_COOKIE, signPlumberSessionToken(accountId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

async function clearCustomerSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("bin_customer_session_phone");
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

async function clearPlumberSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete("bin_plumber_session_id");
  cookieStore.delete(PLUMBER_SESSION_COOKIE);
}

function normalizeNigerianPhoneDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  if (digits.length === 10 && !digits.startsWith("0")) {
    return `234${digits}`;
  }
  return digits;
}

function isValidNigerianPhone(phone: string): boolean {
  const compact = phone.replace(/[\s()-]/g, "");
  return /^(?:\+?234|0)[789][01]\d{8}$/.test(compact);
}

function getUserRole(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}): string | undefined {
  return getVerifiedAppRole(user);
}

async function setServerAppRole(authUserId: string | undefined, role: "customer" | "plumber") {
  if (!authUserId) return;
  try {
    await getServiceSupabase().auth.admin.updateUserById(authUserId, {
      app_metadata: { role },
    });
  } catch (err) {
    console.error("[setServerAppRole]", err instanceof Error ? err.message : err);
  }
}

export async function loginCustomerWithPasswordAction(
  identifier: string,
  password: string
) {
  try {
    const rawId = identifier?.trim() || "";
    if (!rawId || !password) {
      return { success: false, error: "Invalid sign-in details." };
    }

    const rate = await checkRateLimit("customer_login", 8, 15 * 60 * 1000, rawId);
    if (!rate.allowed) {
      return {
        success: false,
        error: `Too many sign-in attempts. Please wait ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s) and try again.`,
      };
    }

    let emailToUse = rawId;
    if (!rawId.includes("@")) {
      const normalized = normalizeNigerianPhoneDigits(rawId);
      const customers = await getAllCustomers();
      const matched = customers.find(
        (c) => normalizeNigerianPhoneDigits(c.phone) === normalized
      );
      emailToUse =
        matched?.email?.trim() || `c_${normalized}@customer.binplumbing.local`;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse.toLowerCase(),
      password,
    });

    if (error || !data.user) {
      // Fallback to local salted-scrypt password verification (used when Supabase rate-limits or awaits email confirmation)
      const customers = await getAllCustomers();
      const rawLower = rawId.toLowerCase();
      const normalized = !rawId.includes("@") ? normalizeNigerianPhoneDigits(rawId) : "";
      const matchedLocal = customers.find((c) => {
        if (rawId.includes("@") && c.email?.toLowerCase() === rawLower) return true;
        if (normalized && normalizeNigerianPhoneDigits(c.phone) === normalized) return true;
        return false;
      });

      if (
        matchedLocal?.password_hash &&
        verifyCustomerPassword(password, matchedLocal.password_hash)
      ) {
        await clearPlumberSessionCookie();
        await setCustomerSessionCookie(matchedLocal.id);
        revalidatePath("/customer");
        return { success: true };
      }

      if (error?.message?.toLowerCase().includes("email not confirmed")) {
        return {
          success: false,
          needsConfirmation: true,
          emailForResend: emailToUse.toLowerCase(),
          error:
            "Your email address has not been confirmed yet. Please check your inbox (and spam folder) for the confirmation link.",
        };
      }
      return { success: false, error: "Invalid sign-in details." };
    }

    let role = getUserRole(data.user);
    if (role !== "customer") {
      // Backfill app_metadata.role = "customer" if this verified auth user is a customer and not admin/plumber
      const adminSupabase = getServiceSupabase();
      const userEmail = (data.user.email || "").toLowerCase().trim();
      const [{ data: adminRow }, { data: plumberRow }, { data: custRow }] = await Promise.all([
        adminSupabase
          .from("admin_users")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .limit(1)
          .maybeSingle(),
        adminSupabase
          .from("plumbers")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .limit(1)
          .maybeSingle(),
        adminSupabase
          .from("customers")
          .select("id")
          .or(`auth_user_id.eq.${data.user.id},email.eq.${userEmail}`)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!adminRow && !plumberRow && (custRow || !role)) {
        await setServerAppRole(data.user.id, "customer");
        role = "customer";
      }
    }

    if (role !== "customer") {
      await supabase.auth.signOut();
      return { success: false, error: "Invalid sign-in details." };
    }

    await clearPlumberSessionCookie();

    // Ensure local customer profile exists and is linked to auth_user_id
    const meta = data.user.user_metadata || {};
    const phoneFromMeta = (meta.phone as string) || (!rawId.includes("@") ? rawId : "");
    if (phoneFromMeta) {
      await registerCustomer({
        fullName: (meta.full_name as string) || data.user.email || "Customer",
        phone: phoneFromMeta,
        email: data.user.email || undefined,
        authUserId: data.user.id,
        address: (meta.address as string) || "On file",
        cityLga: (meta.city_lga as string) || undefined,
        neighbourhood: (meta.neighbourhood as string) || undefined,
        propertyType: (meta.property_type as string) || undefined,
      });
    }

    revalidatePath("/customer");
    return { success: true };
  } catch {
    return { success: false, error: "Invalid sign-in details." };
  }
}

export async function registerCustomerWithPasswordAction(input: {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  address: string;
  state: string;
  cityLga: string;
  neighbourhood?: string;
  propertyType?: string;
  consentPrivacy: boolean;
}) {
  try {
    const fullName = input.fullName?.trim() || "";
    const phone = input.phone?.trim() || "";
    const email = input.email?.trim() || "";
    const address = input.address?.trim() || "";
    const state = input.state?.trim() || "";
    const cityLga = input.cityLga?.trim() || "";

    if (!fullName || fullName.length < 2) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!isValidNigerianPhone(phone)) {
      return {
        success: false,
        error: "Please enter a valid Nigerian phone number (e.g. 0806 329 8575 or +234 806 329 8575).",
      };
    }
    if (!email || !email.includes("@")) {
      return {
        success: false,
        error: "Please enter a valid email address so we can confirm your account.",
      };
    }
    if (!input.password || input.password.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters long.",
      };
    }
    if (!address) {
      return { success: false, error: "Please enter your property address." };
    }
    if (!state || !cityLga) {
      return { success: false, error: "Please select your state and service area." };
    }
    if (!input.consentPrivacy) {
      return {
        success: false,
        error: "Please accept the Privacy Policy to create an account.",
      };
    }

    const normalizedDigits = normalizeNigerianPhoneDigits(phone);
    const existingCustomers = await getAllCustomers();
    const existingAccount = existingCustomers.find(
      (c) =>
        (c.email && c.email.toLowerCase() === email.toLowerCase()) ||
        normalizeNigerianPhoneDigits(c.phone) === normalizedDigits
    );
    if (existingAccount) {
      const existingRaw = existingAccount as typeof existingAccount & { auth_user_id?: string | null };
      if (existingAccount.password_hash || existingRaw.auth_user_id) {
        return {
          success: false,
          error: "An account with this email or phone number already exists. Please sign in instead.",
        };
      }
      if (
        existingAccount.email &&
        existingAccount.email.trim().toLowerCase() !== email.toLowerCase()
      ) {
        return {
          success: false,
          error: "This phone number is already associated with a different email address. Please sign in or contact support.",
        };
      }
    }

    const authEmail =
      email.toLowerCase() || `c_${normalizedDigits}@customer.binplumbing.local`;

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: input.password,
      options: {
        emailRedirectTo: `${siteUrl}/customer`,
        data: {
          full_name: fullName,
          phone,
          address,
          state,
          city_lga: cityLga,
          neighbourhood: input.neighbourhood?.trim() || "",
          property_type: input.propertyType || "Residential / Villa",
        },
      },
    });

    const isRateLimited =
      Boolean(error) &&
      (error?.status === 429 || (error?.message || "").toLowerCase().includes("rate limit"));

    if (error && !isRateLimited) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        return {
          success: false,
          error: "An account with this email already exists. Please sign in instead.",
        };
      }
      return {
        success: false,
        error:
          error.message ||
          "Unable to create account with those details. Please check your entries or try signing in.",
      };
    }

    if (data?.user?.id) {
      await setServerAppRole(data.user.id, "customer");
    }

    const passwordHash = hashCustomerPassword(input.password);
    const savedCustomer = await registerCustomer({
      fullName,
      phone,
      email: email || undefined,
      passwordHash,
      authUserId: data?.user?.id,
      address,
      cityLga: `${cityLga}, ${state}`,
      neighbourhood: input.neighbourhood?.trim() || undefined,
      propertyType: input.propertyType || "Residential / Villa",
    });

    await clearPlumberSessionCookie();

    // If Supabase rate-limited signup email or requires email verification without a session,
    // sign the customer in immediately using the signed httpOnly session cookie + scrypt password hash.
    if (isRateLimited || !data?.session) {
      await setCustomerSessionCookie(savedCustomer.id);
    }

    revalidatePath("/customer");

    return {
      success: true,
      requiresEmailVerification: false,
      message: "Account created successfully.",
    };
  } catch {
    return {
      success: false,
      error: "An unexpected error occurred while creating your account.",
    };
  }
}

export async function resendCustomerConfirmationAction(email: string) {
  try {
    const cleanEmail = email?.trim().toLowerCase() || "";
    if (!cleanEmail || !cleanEmail.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: {
        emailRedirectTo: `${siteUrl}/customer`,
      },
    });
    if (error) {
      return { success: false, error: error.message || "Could not resend confirmation email." };
    }
    return {
      success: true,
      message: "Confirmation email sent. Please check your inbox and spam folder.",
    };
  } catch {
    return { success: false, error: "Could not resend confirmation email." };
  }
}

export async function registerPlumberAccountAction(input: {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  consentPrivacy: boolean;
}) {
  try {
    const fullName = input.fullName?.trim() || "";
    const phone = input.phone?.trim() || "";
    const email = input.email?.trim().toLowerCase() || "";

    if (!fullName || fullName.length < 2) {
      return { success: false, error: "Please enter your full name." };
    }
    if (!isValidNigerianPhone(phone)) {
      return {
        success: false,
        error: "Please enter a valid Nigerian phone number (e.g. 0806 329 8575).",
      };
    }
    if (!email || !email.includes("@")) {
      return { success: false, error: "Please enter a valid email address." };
    }
    if (!input.password || input.password.length < 8) {
      return {
        success: false,
        error: "Password must be at least 8 characters long.",
      };
    }
    if (!input.consentPrivacy) {
      return {
        success: false,
        error: "Please accept the Privacy Notice before creating your account.",
      };
    }

    const normalizedDigits = normalizeNigerianPhoneDigits(phone);
    const existingAccounts = await getAllPlumberAccounts();
    const existing = existingAccounts.find(
      (a) =>
        a.email.toLowerCase() === email ||
        normalizeNigerianPhoneDigits(a.phone) === normalizedDigits
    );
    if (existing) {
      return {
        success: false,
        error: "A plumber account with this email or phone already exists. Please sign in instead.",
      };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: input.password,
      options: {
        emailRedirectTo: `${siteUrl}/join-as-plumber`,
        data: {
          full_name: fullName,
          phone,
        },
      },
    });

    const isRateLimited =
      Boolean(error) &&
      (error?.status === 429 || (error?.message || "").toLowerCase().includes("rate limit"));

    if (error && !isRateLimited) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists")) {
        return {
          success: false,
          error: "An account with this email already exists. Please sign in instead.",
        };
      }
      return {
        success: false,
        error: error.message || "Unable to create plumber account.",
      };
    }

    if (data?.user?.id) {
      await setServerAppRole(data.user.id, "plumber");
    }

    const passwordHash = hashCustomerPassword(input.password);
    const account = await registerPlumberAccount({
      fullName,
      phone,
      email,
      passwordHash,
      authUserId: data?.user?.id,
    });

    await clearCustomerSessionCookie();

    if (isRateLimited || !data?.session) {
      await setPlumberSessionCookie(account.id);
    }

    revalidatePath("/join-as-plumber");
    revalidatePath("/plumber");

    return {
      success: true,
      message: "Plumber account created. You can now complete your application.",
    };
  } catch {
    return {
      success: false,
      error: "An unexpected error occurred while creating your plumber account.",
    };
  }
}

export async function loginPlumberWithPasswordAction(
  identifier: string,
  password: string
) {
  try {
    const rawId = identifier?.trim() || "";
    if (!rawId || !password) {
      return { success: false, error: "Invalid sign-in details." };
    }

    const rate = await checkRateLimit("plumber_login", 8, 15 * 60 * 1000, rawId);
    if (!rate.allowed) {
      return {
        success: false,
        error: `Too many sign-in attempts. Please wait ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s) and try again.`,
      };
    }

    let emailToUse = rawId;
    if (!rawId.includes("@")) {
      const normalized = normalizeNigerianPhoneDigits(rawId);
      const accounts = await getAllPlumberAccounts();
      const matchedAcc = accounts.find(
        (a) => normalizeNigerianPhoneDigits(a.phone) === normalized
      );
      if (matchedAcc?.email) {
        emailToUse = matchedAcc.email;
      } else {
        const plumbers = await getAllPlumbers();
        const matched = plumbers.find(
          (p) => normalizeNigerianPhoneDigits(p.phone) === normalized
        );
        if (!matched?.email) {
          return { success: false, error: "Invalid sign-in details." };
        }
        emailToUse = matched.email;
      }
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse.toLowerCase(),
      password,
    });

    if (error || !data.user) {
      const accounts = await getAllPlumberAccounts();
      const rawLower = rawId.toLowerCase();
      const normalized = !rawId.includes("@") ? normalizeNigerianPhoneDigits(rawId) : "";
      const matchedLocal = accounts.find((a) => {
        if (rawId.includes("@") && a.email.toLowerCase() === rawLower) return true;
        if (normalized && normalizeNigerianPhoneDigits(a.phone) === normalized) return true;
        return false;
      });
      if (
        matchedLocal?.password_hash &&
        verifyCustomerPassword(password, matchedLocal.password_hash)
      ) {
        await clearCustomerSessionCookie();
        await setPlumberSessionCookie(matchedLocal.id);
        revalidatePath("/join-as-plumber");
        revalidatePath("/plumber");
        return { success: true };
      }

      if (error?.message?.toLowerCase().includes("email not confirmed")) {
        return {
          success: false,
          needsConfirmation: true,
          emailForResend: emailToUse.toLowerCase(),
          error:
            "Your email address has not been confirmed yet. Please check your inbox (and spam folder) for the confirmation link.",
        };
      }
      return { success: false, error: "Invalid sign-in details." };
    }

    let role = getUserRole(data.user);
    if (role !== "plumber") {
      // Backfill app_metadata.role = "plumber" if this verified auth user is linked to a plumber account/profile
      const adminSupabase = getServiceSupabase();
      const userEmail = (data.user.email || "").toLowerCase().trim();
      const [{ data: accByAuth }, { data: profByAuth }, { data: adminRow }] = await Promise.all([
        adminSupabase
          .from("plumber_accounts")
          .select("id")
          .or(`auth_user_id.eq.${data.user.id},email.eq.${userEmail}`)
          .limit(1)
          .maybeSingle(),
        adminSupabase
          .from("plumbers")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .limit(1)
          .maybeSingle(),
        adminSupabase
          .from("admin_users")
          .select("id")
          .eq("auth_user_id", data.user.id)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!adminRow && (accByAuth || profByAuth)) {
        await setServerAppRole(data.user.id, "plumber");
        role = "plumber";
      }
    }

    if (role !== "plumber") {
      await supabase.auth.signOut();
      return { success: false, error: "Invalid sign-in details." };
    }

    await clearCustomerSessionCookie();

    revalidatePath("/plumber");
    return { success: true };
  } catch {
    return { success: false, error: "Invalid sign-in details." };
  }
}

export async function requestPasswordResetAction(email: string) {
  const cleanEmail = email?.trim();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      success: false,
      error: "Please enter a valid email address to receive a reset link.",
    };
  }

  try {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(cleanEmail);
  } catch {
    // Intentionally swallow to prevent account enumeration
  }

  return {
    success: true,
    message:
      "If an account is registered with that email address, a password reset link has been sent.",
  };
}

export async function logoutCustomerAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("bin_customer_session_phone");
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  redirect("/customer");
}

export async function logoutPlumberAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete("bin_plumber_session_id");
  cookieStore.delete(PLUMBER_SESSION_COOKIE);
  redirect("/plumber");
}
