import { getServiceSupabase } from "@/lib/supabase/admin";

export function normalizeNigerianDigits(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("234") && digits.length === 13) return digits;
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  if (digits.length === 10 && !digits.startsWith("0")) return `234${digits}`;
  return digits;
}

function buildPhoneVariants(raw: string): { variants: string[]; tail10: string; normalized: string } {
  const normalized = normalizeNigerianDigits(raw);
  const tail10 = normalized.slice(-10);
  const variants = Array.from(
    new Set(
      [
        raw.trim(),
        normalized,
        tail10 ? `0${tail10}` : "",
        tail10 ? `+234${tail10}` : "",
        tail10,
      ].filter(Boolean)
    )
  );
  return { variants, tail10, normalized };
}

export async function findCustomerByIdentifier(identifier: string): Promise<{
  id: string;
  email: string | null;
  phone: string;
  password_hash: string | null;
  auth_user_id: string | null;
} | null> {
  const raw = identifier.trim();
  if (!raw) return null;
  const supabase = getServiceSupabase();

  if (raw.includes("@")) {
    const { data } = await supabase
      .from("customers")
      .select("id, email, phone, password_hash, auth_user_id")
      .ilike("email", raw.toLowerCase())
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  const { variants, tail10, normalized } = buildPhoneVariants(raw);
  const { data: exactRows } = await supabase
    .from("customers")
    .select("id, email, phone, password_hash, auth_user_id")
    .in("phone", variants)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5);

  const exactMatch = (exactRows || []).find(
    (c) => normalizeNigerianDigits(String(c.phone || "")) === normalized
  );
  if (exactMatch) return exactMatch;

  if (tail10.length === 10) {
    const { data: tailRows } = await supabase
      .from("customers")
      .select("id, email, phone, password_hash, auth_user_id")
      .ilike("phone", `%${tail10}`)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(5);
    return (
      (tailRows || []).find(
        (c) => normalizeNigerianDigits(String(c.phone || "")) === normalized
      ) ?? null
    );
  }

  return null;
}

export async function findPlumberByIdentifier(identifier: string): Promise<{
  id: string;
  email: string | null;
  phone: string;
  verification_status: string | null;
  auth_user_id: string | null;
} | null> {
  const raw = identifier.trim();
  if (!raw) return null;
  const supabase = getServiceSupabase();

  if (raw.includes("@")) {
    const { data } = await supabase
      .from("plumbers")
      .select("id, email, phone, verification_status, auth_user_id")
      .ilike("email", raw.toLowerCase())
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  }

  const { variants, tail10, normalized } = buildPhoneVariants(raw);
  const { data: exactRows } = await supabase
    .from("plumbers")
    .select("id, email, phone, verification_status, auth_user_id")
    .in("phone", variants)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(5);

  const exactMatch = (exactRows || []).find(
    (p) => normalizeNigerianDigits(String(p.phone || "")) === normalized
  );
  if (exactMatch) return exactMatch;

  if (tail10.length === 10) {
    const { data: tailRows } = await supabase
      .from("plumbers")
      .select("id, email, phone, verification_status, auth_user_id")
      .ilike("phone", `%${tail10}`)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(5);
    return (
      (tailRows || []).find(
        (p) => normalizeNigerianDigits(String(p.phone || "")) === normalized
      ) ?? null
    );
  }

  return null;
}
