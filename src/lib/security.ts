import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function requireAdminUser(): Promise<{
  userId: string;
  email: string;
  fullName: string;
  role: string;
} | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const adminSupabase = getServiceSupabase();
    const { data: adminRow } = await adminSupabase
      .from("admin_users")
      .select("id, email, full_name, role, is_active")
      .eq("auth_user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminRow) return null;
    return {
      userId: user.id,
      email: String(adminRow.email || user.email || ""),
      fullName: String(adminRow.full_name || "Admin"),
      role: String(adminRow.role || "admin"),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. DATABASE-BACKED SLIDING-WINDOW RATE LIMITER (Server Actions & API Routes)
// ---------------------------------------------------------------------------
export function evaluateSlidingWindow(
  timestampsMs: number[],
  maxRequests: number,
  windowMs: number,
  nowMs: number
): { allowed: boolean; retryAfterSeconds: number } {
  const cutoff = nowMs - windowMs;
  const recent = timestampsMs.filter((ts) => ts > cutoff).sort((a, b) => a - b);
  if (recent.length >= maxRequests) {
    const oldest = recent[0] ?? nowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - nowMs) / 1000));
    return { allowed: false, retryAfterSeconds };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function getClientIp(): Promise<string> {
  try {
    const hdrs = await headers();
    return (
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip")?.trim() ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}

export async function checkRateLimit(
  scope: string,
  maxRequests: number,
  windowMs: number,
  extraKey = ""
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const ip = await getClientIp();
  const key = `${scope}:${ip}${extraKey ? `:${extraKey.toLowerCase().trim()}` : ""}`;
  const now = Date.now();
  const cutoffIso = new Date(now - windowMs).toISOString();

  try {
    const supabase = getServiceSupabase();

    // Automatic cleanup of expired entries for this bucket (and occasional global sweep)
    await supabase
      .from("rate_limits")
      .delete()
      .eq("bucket_key", key)
      .lt("created_at", cutoffIso);

    if (Math.random() < 0.05) {
      const globalCutoffIso = new Date(now - 60 * 60 * 1000).toISOString();
      void supabase.from("rate_limits").delete().lt("created_at", globalCutoffIso);
    }

    const { data: rows, error } = await supabase
      .from("rate_limits")
      .select("created_at")
      .eq("bucket_key", key)
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[checkRateLimit] DB error:", error.message);
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const timestamps = (rows || [])
      .map((r) => Date.parse(String(r.created_at)))
      .filter((ts) => Number.isFinite(ts));

    const verdict = evaluateSlidingWindow(timestamps, maxRequests, windowMs, now);
    if (!verdict.allowed) {
      return verdict;
    }

    await supabase.from("rate_limits").insert({
      bucket_key: key,
      created_at: new Date(now).toISOString(),
    });

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (err) {
    console.error("[checkRateLimit]", err instanceof Error ? err.message : err);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

// ---------------------------------------------------------------------------
// 2. HONEYPOT & CLOUDFLARE TURNSTILE SPAM PROTECTION
// ---------------------------------------------------------------------------
export function isHoneypotTriggered(honeypotValue: unknown): boolean {
  return typeof honeypotValue === "string" && honeypotValue.trim().length > 0;
}

export async function verifyTurnstileToken(token?: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    // Turnstile not configured; rely on honeypot + rate limiting
    return true;
  }

  if (!token || !token.trim()) {
    return false;
  }

  try {
    const ip = await getClientIp();
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token.trim());
    if (ip !== "unknown") form.set("remoteip", ip);

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 3. FILE TYPE & SIZE VALIDATION
// ---------------------------------------------------------------------------
const ALLOWED_CHAT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4",
  "video/quicktime",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "application/octet-stream",
]);

const ALLOWED_CHAT_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".txt",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".mp4",
  ".mov",
  ".m4a",
  ".aac",
  ".mp3",
  ".wav",
  ".ogg",
  ".webm",
]);

const ALLOWED_DOC_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "application/octet-stream",
]);

const ALLOWED_DOC_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".m4a",
  ".aac",
  ".mp3",
  ".wav",
  ".ogg",
  ".webm",
]);

export function validateUploadFile(
  file: File,
  kind: "chat" | "plumber_document" | "request_photo"
): { valid: boolean; error?: string } {
  const maxBytes = kind === "chat" ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size <= 0) {
    return { valid: false, error: "Selected file is empty." };
  }
  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return { valid: false, error: `File size must not exceed ${maxMb} MB.` };
  }

  const name = file.name.toLowerCase();
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const mime = (file.type || "").toLowerCase();

  if (kind === "chat") {
    if (!ALLOWED_CHAT_EXTENSIONS.has(ext)) {
      return { valid: false, error: "Unsupported file extension for chat upload." };
    }
    if (mime && !ALLOWED_CHAT_MIME_TYPES.has(mime)) {
      return { valid: false, error: "Unsupported file type for chat upload." };
    }
    return { valid: true };
  }

  if (!ALLOWED_DOC_EXTENSIONS.has(ext)) {
    return { valid: false, error: "Only JPG, PNG, WebP, or PDF files are allowed." };
  }
  if (mime && !ALLOWED_DOC_MIME_TYPES.has(mime)) {
    return { valid: false, error: "Only JPG, PNG, WebP, or PDF files are allowed." };
  }
  return { valid: true };
}
