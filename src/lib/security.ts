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
// 1. SLIDING-WINDOW RATE LIMITER (Server Actions & API Routes)
// ---------------------------------------------------------------------------
interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitStore = new Map<string, RateLimitBucket>();

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
  const cutoff = now - windowMs;

  const existing = rateLimitStore.get(key) || { timestamps: [] };
  const recent = existing.timestamps.filter((ts) => ts > cutoff);

  if (recent.length >= maxRequests) {
    const oldest = recent[0] || now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    rateLimitStore.set(key, { timestamps: recent });
    return { allowed: false, retryAfterSeconds };
  }

  recent.push(now);
  rateLimitStore.set(key, { timestamps: recent });
  return { allowed: true, retryAfterSeconds: 0 };
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
]);

const ALLOWED_DOC_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const ALLOWED_DOC_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".pdf"]);

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
