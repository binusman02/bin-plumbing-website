import { getServiceSupabase } from "@/lib/supabase/admin";
import type { ToolGateway } from "@/lib/ai-workforce/tool-gateway";

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  leadId?: string;
}

export interface EmailProviderAdapter {
  readonly providerName: string;
  sendApprovedEmail(draft: EmailDraft): Promise<{ ok: boolean; messageId?: string; error?: string }>;
}

export class UnconfiguredEmailAdapter implements EmailProviderAdapter {
  public readonly providerName = "unconfigured";

  async sendApprovedEmail(): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    return {
      ok: false,
      error: "Company email provider OAuth is not configured yet. Connect your email provider first.",
    };
  }
}

export interface RawEnquiryRecord {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  service_category?: string | null;
  area_in_kano?: string | null;
  status?: string | null;
  created_at?: string | null;
}

export function deduplicateEnquiries<T extends RawEnquiryRecord>(rows: T[]): {
  unique: T[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;

  for (const row of rows) {
    const phone = (row.phone || "").replace(/\D+/g, "");
    const email = (row.email || "").trim().toLowerCase();
    const key = phone || email || row.id;
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }
  return { unique, duplicateCount };
}

export function registerSalesTools(
  gateway: ToolGateway,
  emailAdapter: EmailProviderAdapter = new UnconfiguredEmailAdapter()
): void {
  gateway.registerTool({
    name: "sales_read_enquiries",
    description: "Read and deduplicate recent website enquiries for lead qualification",
    tier: "green",
    requiredScope: "sales:enquiries:read",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const limit = typeof obj.limit === "number" ? Math.min(Math.max(1, obj.limit), 50) : 20;
      return { ok: true, data: { limit } };
    },
    async execute(input) {
      const supabase = getServiceSupabase();
      const { data } = await supabase
        .from("enquiries")
        .select("id, full_name, phone, email, service_category, area_in_kano, status, created_at")
        .order("created_at", { ascending: false })
        .limit(input.limit);
      const { unique, duplicateCount } = deduplicateEnquiries((data || []) as RawEnquiryRecord[]);
      return { leads: unique, duplicateCount };
    },
  });

  gateway.registerTool({
    name: "sales_draft_followup",
    description: "Prepare a personalised follow-up email draft without sending it",
    tier: "green",
    requiredScope: "sales:draft:create",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const to = typeof obj.to === "string" ? obj.to.trim() : "";
      const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
      const body = typeof obj.body === "string" ? obj.body.trim() : "";
      if (!to || !subject || !body) {
        return { ok: false, error: "to, subject, and body are required." };
      }
      return { ok: true, data: { to, subject, body, sent: false } };
    },
    async execute(input) {
      return { draftOnly: true, ...input };
    },
  });

  gateway.registerTool({
    name: "sales_send_email",
    description: "Send an outbound sales email (Amber: requires explicit Owner approval)",
    tier: "amber",
    requiredScope: "sales:email:send",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      const to = typeof obj.to === "string" ? obj.to.trim() : "";
      const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
      const body = typeof obj.body === "string" ? obj.body.trim() : "";
      if (!to || !subject || !body) {
        return { ok: false, error: "to, subject, and body are required." };
      }
      return { ok: true, data: { to, subject, body } };
    },
    async execute(input) {
      const res = await emailAdapter.sendApprovedEmail(input);
      if (!res.ok) throw new Error(res.error || "Email send failed.");
      return res;
    },
  });
}
