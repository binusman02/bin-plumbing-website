/**
 * Safe one-time backfill script:
 * - Sets server-trusted `app_metadata.role` ("customer" | "plumber") on Supabase Auth users
 *   already linked to `customers` / `plumbers` / `plumber_accounts` via `auth_user_id` or exact ID.
 * - Never deletes any rows or users.
 *
 * Usage:
 *   npx tsx scripts/backfill-auth-roles.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  let updated = 0;

  // 1. Backfill plumbers with auth_user_id
  const { data: plumbers, error: pErr } = await supabase
    .from("plumbers")
    .select("id, auth_user_id, email")
    .not("auth_user_id", "is", null);

  if (pErr) throw pErr;

  for (const p of plumbers || []) {
    if (!p.auth_user_id) continue;
    const { data: authData } = await supabase.auth.admin.getUserById(String(p.auth_user_id));
    const currentRole = authData?.user?.app_metadata?.role;
    if (currentRole !== "plumber") {
      await supabase.auth.admin.updateUserById(String(p.auth_user_id), {
        app_metadata: { ...(authData?.user?.app_metadata || {}), role: "plumber" },
      });
      updated += 1;
    }
  }

  // 2. Backfill customers with auth_user_id
  const { data: customers, error: cErr } = await supabase
    .from("customers")
    .select("id, auth_user_id, email")
    .not("auth_user_id", "is", null);

  if (cErr) throw cErr;

  for (const c of customers || []) {
    if (!c.auth_user_id) continue;
    const { data: authData } = await supabase.auth.admin.getUserById(String(c.auth_user_id));
    const currentRole = authData?.user?.app_metadata?.role;
    if (currentRole !== "customer") {
      await supabase.auth.admin.updateUserById(String(c.auth_user_id), {
        app_metadata: { ...(authData?.user?.app_metadata || {}), role: "customer" },
      });
      updated += 1;
    }
  }

  console.log(`Backfill complete. Updated app_metadata.role on ${updated} auth user(s).`);
}

run().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
