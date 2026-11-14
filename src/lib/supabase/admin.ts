import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

export function getRequiredSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL environment variable. Configure it in .env.local or your deployment settings."
    );
  }
  return url;
}

export function getRequiredAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable. Configure it in .env.local or your deployment settings."
    );
  }
  return key;
}

/**
 * Server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Never import this file from Client Components.
 */
export function getServiceSupabase(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("getServiceSupabase() must never be called in browser/client code.");
  }

  const url = getRequiredSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceKey) {
    if (process.env.NODE_ENV === "production" && !isBuildPhase()) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY in production. Add it to your server environment variables."
      );
    }
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local so server actions and API routes can access protected tables."
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
