import crypto from "crypto";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { getRequiredAnonKey, getRequiredSupabaseUrl, getServiceSupabase } from "@/lib/supabase/admin";
import { createNotification } from "@/lib/notifications";
import {
  triggerWorkforceOnComplaint,
  triggerWorkforceOnPaymentSubmitted,
  triggerWorkforceOnServiceRequest,
} from "@/lib/ai-workforce/auto-triggers";
import { reconcilePlumberSharing, reconcileSharingForRequest } from "@/lib/live-location-server";
import {
  decodeQuotationNotes,
  encodeQuotationNotes,
  type QuotationLineItem,
} from "@/lib/quotation-items";
import { BILINGUAL_BLOG_STARTER_ARTICLES } from "@/data/bilingual-blog-starter";
export type { QuotationLineItem };

// ---------------------------------------------------------------------------
// TYPES & INTERFACES
// ---------------------------------------------------------------------------
export type UrgencyLevel = "standard" | "urgent";

export type RequestStatus =
  | "new"
  | "contacted"
  | "scheduled"
  | "inspection_required"
  | "quotation_submitted"
  | "awaiting_approval"
  | "approved"
  | "in_progress"
  | "work_completed"
  | "awaiting_final_payment"
  | "completed"
  | "cancelled";

export type PlumberVerificationStatus =
  | "submitted"
  | "under_review"
  | "documents_required"
  | "approved"
  | "rejected"
  | "suspended";

export interface RequestHistoryEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
}

export interface ServiceRequestRecord {
  id: string;
  ticket_number: string;
  priority: UrgencyLevel;
  status: RequestStatus;
  property_type: string;
  address_in_kano: string;
  state?: string;
  city_lga: string;
  neighbourhood?: string;
  preferred_timing: string;
  preferred_date?: string;
  problem_category: string;
  category_slug?: string;
  issue_description: string;
  photos?: string[];
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  customer_id?: string;
  assigned_technician?: string | null;
  assigned_plumber_id?: string;
  quoted_amount?: number;
  internal_notes?: string;
  history: RequestHistoryEntry[];
  customer_lat?: number;
  customer_lng?: number;
  archived_at?: string | null;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlumberAccountRecord {
  id: string;
  full_name: string;
  phone: string;
  email: string;
  password_hash: string;
  plumber_id?: string;
  created_at: string;
}

export interface CustomerProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  password_hash?: string;
  address_in_kano: string;
  state?: string;
  city_lga: string;
  neighbourhood?: string;
  property_type?: string;
  notes?: string;
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface VerificationCheckItem {
  id: string;
  label: string;
  verified: boolean;
}

export interface PlumberDocument {
  name: string;
  type: string;
  size?: number;
  storage_path?: string;
  url: string;
  uploaded_at?: string;
}

export interface PlumberProfile {
  id: string;
  application_ref?: string;
  full_name: string;
  phone: string;
  email?: string;
  password_hash?: string;
  residential_location: string;
  preferred_locations: string[];
  skills: string[];
  experience_years: number;
  experience_details?: string;
  references_info?: string;
  availability?: string;
  verification_status: PlumberVerificationStatus;
  is_available: boolean;
  is_online?: boolean;
  rating: number;
  total_jobs: number;
  notes?: string;
  avatar_url?: string;
  current_lat?: number;
  current_lng?: number;
  location_updated_at?: string;
  admin_notes?: string;
  onboarding_notes?: string;
  agreement_url?: string;
  rejection_reason?: string;
  verification_checklist?: {
    id_checked?: { checked: boolean; date?: string };
    references_checked?: { checked: boolean; date?: string };
    agreement_signed?: { checked: boolean; date?: string };
  };
  checklist?: VerificationCheckItem[];
  documents?: PlumberDocument[];
  created_at: string;
  updated_at?: string;
}

export interface StructuredQuotation {
  id: string;
  request_id: string;
  ticket_number: string;
  plumber_id: string;
  plumber_name: string;
  labour_charge: number;
  materials_cost: number;
  transport_charge: number;
  other_charges: number;
  total_amount: number;
  company_commission_rate: number;
  company_commission: number;
  plumber_payable: number;
  is_small_job: boolean;
  small_job_reason?: string;
  customer_approval_status: "pending" | "approved" | "rejected";
  customer_approved_at?: string;
  customer_feedback?: string;
  admin_approved: boolean;
  revision_number: number;
  parent_quotation_id?: string;
  notes?: string;
  items?: QuotationLineItem[];
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface PaymentRecord {
  id: string;
  request_id: string;
  ticket_number: string;
  plumber_id?: string;
  customer_name: string;
  total_payment: number;
  labour_portion: number;
  materials_portion: number;
  company_commission: number;
  plumber_payable: number;
  payment_method: "bank_transfer" | "cash" | "pos";
  transaction_ref?: string;
  proof_storage_path?: string;
  verification_status: "pending" | "verified" | "rejected";
  payment_status?: string;
  verified_by?: string;
  verified_at?: string;
  payment_date?: string;
  notes?: string;
  avatar_url?: string;
  created_at: string;
}

export interface ChatAttachment {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface JobMessage {
  id: string;
  request_id: string;
  ticket_number: string;
  sender_role: "customer" | "plumber" | "admin";
  sender_name: string;
  sender_id?: string | null;
  recipient_role: "customer" | "plumber" | "admin";
  recipient_id?: string | null;
  message: string;
  attachment?: ChatAttachment;
  is_internal: boolean;
  admin_read?: boolean;
  read_by?: ("admin" | "plumber" | "customer")[];
  delivered_at?: string | null;
  read_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reply_to_id?: string | null;
  deleted_for_everyone?: boolean;
  deleted_by_ids?: string[];
  receipt_status?: "sent" | "delivered" | "read";
  created_at: string;
}

export interface ServiceCategorySetting {
  id: string;
  slug: string;
  name?: string;
  title: string;
  description: string;
  short_description?: string;
  image?: string;
  image_alt?: string;
  common_problems?: string[];
  quotation_notes?: string;
  faqs?: { question: string; answer: string }[];
  related_slugs?: string[];
  icon_name?: string;
  sort_order?: number;
  order: number;
  active?: boolean;
  visible: boolean;
  published?: boolean;
}

export interface CoverageAreaSetting {
  id?: string;
  slug?: string;
  area: string;
  state?: string;
  city?: string;
  active: boolean;
  published?: boolean;
}

export interface AdminUserSetting {
  id: string;
  name: string;
  email: string;
  role: "Super Admin" | "Operations Manager" | "Dispatcher" | "Owner" | "Admin";
  active: boolean;
  added_at?: string;
  invited_at?: string;
}

export interface NotificationPreferences {
  notify_new_request: boolean;
  notify_new_plumber: boolean;
  notify_payment_submitted: boolean;
  notify_new_complaint: boolean;
  alert_email: string;
}

export interface ComplaintRecord {
  id: string;
  ticket_number: string;
  customer_name: string;
  customer_phone: string;
  plumber_name?: string;
  rating?: number;
  subject: string;
  category: string;
  description: string;
  message: string;
  status: "new" | "under_review" | "investigating" | "resolved";
  admin_note?: string;
  created_at: string;
  updated_at?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  old_value?: string;
  new_value?: string;
}

export interface GalleryItemRecord {
  id: string;
  title: string;
  category: string;
  service_category?: string;
  location?: string;
  caption: string;
  image_url: string;
  alt_text?: string;
  service_slug?: string;
  area_slug?: string;
  published: boolean;
  created_at: string;
}

export interface MarketplaceSettings {
  company_name: string;
  company_short_name?: string;
  rc_number?: string;
  company_phone: string;
  company_whatsapp: string;
  company_email: string;
  company_address: string;
  default_state?: string;
  default_city?: string;
  business_hours?: string;
  working_hours?: string;
  timezone?: string;
  dispatch_status_text?: string;
  notification_email?: string;
  google_profile_url?: string;
  google_review_url?: string;
  google_maps_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  geo_lat?: string;
  geo_lng?: string;
  google_site_verification?: string;
  bing_site_verification?: string;
  commission_default_rate: number;
  small_job_rule_enabled?: boolean;
  commission_small_job_rate: number | null;
  small_job_threshold: number | null;
  bank_name: string;
  bank_account_name: string;
  bank_account_number: string;
  active_coverage_locations: string[];
  coverage_areas?: CoverageAreaSetting[];
  service_categories?: ServiceCategorySetting[];
  admin_users?: AdminUserSetting[];
  notifications?: NotificationPreferences;
  notification_preferences?: {
    new_request?: boolean;
    new_application?: boolean;
    payment_submitted?: boolean;
    new_complaint?: boolean;
    [key: string]: boolean | undefined;
  };
  auto_approve_plumbers: boolean;
}

const DEFAULT_COVERAGE_AREAS: CoverageAreaSetting[] = [];

const DEFAULT_SERVICE_CATEGORIES: ServiceCategorySetting[] = [
  {
    id: "cat-pipe-installation-repairs",
    slug: "pipe-installation-repairs",
    name: "Pipe Installation & Repairs",
    title: "Pipe Installation & Repairs",
    short_description: "Concealed and surface pipe routing using durable PPR, PVC, and pressure-tested fittings.",
    description: "Concealed and surface pipe routing using durable PPR and PVC pipework. Proper pressure testing before closure prevents hidden leakages.",
    image: "/images/services/surface-ppr-pipe-installation-kano.jpg",
    icon_name: "Wrench",
    sort_order: 1,
    order: 1,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-leak-detection-repairs",
    slug: "leak-detection-repairs",
    name: "Leak Detection & Repairs",
    title: "Leak Detection & Repairs",
    short_description: "Systematic diagnostics for hidden wall moisture, underground seepages, and dripping valves.",
    description: "Systematic diagnostics for hidden wall moisture, underground seepages, dripping valves, and sudden water pressure drops.",
    image: "/images/services/real-work-pipe-repair.png",
    icon_name: "Search",
    sort_order: 2,
    order: 2,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-drainage-blockage-issues",
    slug: "drainage-blockage-issues",
    name: "Drainage & Blockage Issues",
    title: "Drainage & Blockage Issues",
    short_description: "Clearing blocked waste lines, inspection chambers, foul-smelling sewer traps, and clogged sinks.",
    description: "Clearing blocked waste lines, installing and inspecting underground drainage chambers and sewer traps, unclogging sinks, and ensuring correct falls on gravity-flow drains.",
    image: "/images/services/underground-drainage-chamber-installation-kano.jpg",
    icon_name: "Droplet",
    sort_order: 3,
    order: 3,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-bathroom-toilet-plumbing",
    slug: "bathroom-toilet-plumbing",
    name: "Bathroom & Toilet Plumbing",
    title: "Bathroom & Toilet Plumbing",
    short_description: "Installation and maintenance for WCs, cistern mechanisms, basins, water heaters, and shower mixers.",
    description: "Precision installation and maintenance for water closets (WC), cistern mechanisms, wash hand basins, electric water heaters, shower valves, and mixer taps.",
    image: "/images/services/bathroom-shower-water-heater-installation-kano.jpg",
    icon_name: "Bath",
    sort_order: 4,
    order: 4,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-kitchen-plumbing",
    slug: "kitchen-plumbing",
    name: "Kitchen Plumbing",
    title: "Kitchen Plumbing",
    short_description: "Installation and repairs for kitchen sinks, spray taps, grease traps, and waste pipes.",
    description: "Installation and repairs for double and single kitchen sinks, flexible spray taps, grease traps, dishwasher inlets, and waste pipes.",
    image: "/images/services/kitchen-sink-tap-installation-kano.jpg",
    icon_name: "Utensils",
    sort_order: 5,
    order: 5,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-water-storage-supply-systems",
    slug: "water-storage-supply-systems",
    name: "Water Storage & Supply Systems",
    title: "Water Storage & Supply Systems",
    short_description: "Overhead and surface tank connections, float switches, and distribution manifolds.",
    description: "Overhead and surface poly tank connections, float switch installations, overflow control, and distribution manifold plumbing.",
    image: "/images/services/overhead-water-tank-installation-kano.png",
    icon_name: "Database",
    sort_order: 6,
    order: 6,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-pump-installation-repairs",
    slug: "pump-installation-repairs",
    name: "Pump Installation & Repairs",
    title: "Pump Installation & Repairs",
    short_description: "Booster, surface transfer, and submersible pumps with non-return valves and pressure controls.",
    description: "Booster pumps, surface transfer pumps, and submersible pumps connected with proper non-return valves and electrical pressure controls.",
    image: "/images/services/water-pump-pressure-controller-setup-kano.jpg",
    icon_name: "Zap",
    sort_order: 7,
    order: 7,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-commercial-plumbing",
    slug: "commercial-plumbing",
    name: "Commercial & Facility Plumbing",
    title: "Commercial & Facility Plumbing",
    short_description: "Coordinated plumbing for offices, schools, plazas, hotels, and multi-storey buildings.",
    description: "Plumbing coordination for office complexes, schools, plazas, hotels, and multi-storey buildings requiring structured PPR riser and waste stack installations.",
    image: "/images/services/multi-storey-ppr-riser-piping-kano.jpg",
    icon_name: "Building2",
    sort_order: 8,
    order: 8,
    active: true,
    visible: true,
    published: true,
  },
  {
    id: "cat-plumbing-maintenance",
    slug: "plumbing-maintenance",
    name: "Preventative Plumbing Maintenance",
    title: "Preventative Plumbing Maintenance",
    short_description: "Scheduled audits and servicing to catch joint leaks, pressure faults, and valve wear early.",
    description: "Scheduled audits and preventative servicing to catch slight joint leaks, valve wear, pressure faults, and pipe degradation early.",
    image: "/images/services/ppr-valve-fitting-maintenance-kano.png",
    icon_name: "ShieldCheck",
    sort_order: 9,
    order: 9,
    active: true,
    visible: true,
    published: true,
  },
];

const DEFAULT_SETTINGS: MarketplaceSettings = {
  company_name: "FlowGuard Plumbing Enterprises",
  company_short_name: "FlowGuard Plumbing",
  rc_number: "",
  company_phone: "",
  company_whatsapp: "",
  company_email: "",
  company_address: "",
  default_state: "",
  default_city: "",
  business_hours: "",
  commission_default_rate: 20,
  small_job_rule_enabled: true,
  commission_small_job_rate: 5,
  small_job_threshold: 25000,
  bank_name: "Opay",
  bank_account_name: "Mustapha Aminu Usman",
  bank_account_number: "8063298575",
  active_coverage_locations: DEFAULT_COVERAGE_AREAS.map((a) => a.area),
  coverage_areas: DEFAULT_COVERAGE_AREAS,
  service_categories: [],
  admin_users: [],
  notifications: {
    notify_new_request: true,
    notify_new_plumber: true,
    notify_payment_submitted: true,
    notify_new_complaint: true,
    alert_email: "binplumbingservices@gmail.com",
  },
  auto_approve_plumbers: false,
};

function isBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  );
}

function normalizePhoneDigits(phone: string): string {
  return String(phone || "").replace(/\D/g, "");
}

function toSlug(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// ROW MAPPERS
// ---------------------------------------------------------------------------
export function mapRequestRow(
  row: Record<string, unknown>,
  historyRows: Record<string, unknown>[] = []
): ServiceRequestRecord {
  const reqHistory = historyRows
    .filter((h) => h.request_id === row.id)
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
    .map((h) => ({
      id: String(h.id),
      timestamp: String(h.created_at),
      actor: String(h.actor || "System"),
      action: String(h.action || ""),
      details: h.details ? String(h.details) : undefined,
    }));

  const slugStr = row.category_slug ? String(row.category_slug) : "";
  const matchedCat = slugStr
    ? DEFAULT_SERVICE_CATEGORIES.find((c) => c.slug === slugStr)
    : undefined;
  const formattedSlug = slugStr
    ? slugStr
        .split("-")
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
        .join(" ")
    : "";

  return {
    id: String(row.id),
    ticket_number: String(row.ticket_number),
    priority: row.priority === "urgent" ? "urgent" : "standard",
    status: (row.status as RequestStatus) || "new",
    property_type: String(row.property_type || "Residential / Home"),
    address_in_kano: String(row.address || row.address_in_kano || ""),
    state: row.state ? String(row.state) : undefined,
    city_lga: String(row.city_lga || ""),
    neighbourhood: row.neighbourhood ? String(row.neighbourhood) : "",
    preferred_timing: String(row.preferred_timing || "As soon as possible"),
    preferred_date: row.preferred_date ? String(row.preferred_date) : undefined,
    problem_category: String(
      row.problem_category || matchedCat?.name || formattedSlug || "General Plumbing"
    ),
    category_slug: slugStr || undefined,
    issue_description: String(row.issue_description || ""),
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : [],
    customer_name: String(row.customer_name || ""),
    customer_phone: String(row.customer_phone || ""),
    customer_email: row.customer_email ? String(row.customer_email) : undefined,
    customer_id: row.customer_id ? String(row.customer_id) : undefined,
    assigned_technician: row.assigned_technician ? String(row.assigned_technician) : undefined,
    assigned_plumber_id: row.assigned_plumber_id ? String(row.assigned_plumber_id) : undefined,
    quoted_amount: row.quoted_amount != null ? Number(row.quoted_amount) : undefined,
    internal_notes: row.internal_notes ? String(row.internal_notes) : undefined,
    history: reqHistory,
    customer_lat: row.customer_lat != null ? Number(row.customer_lat) : undefined,
    customer_lng: row.customer_lng != null ? Number(row.customer_lng) : undefined,
    archived_at: row.archived_at ? String(row.archived_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at || row.created_at),
  };
}

export const mapServiceRequestRow = mapRequestRow;

export interface PlumberOnboardingMeta {
  availability?: string;
  onboardingNotes?: string;
  agreementUrl?: string;
  rejectionReason?: string;
  checklist?: PlumberProfile["verification_checklist"];
}

/** Extract structured availability and onboarding metadata safely stored in plumbers.notes. */
export function parsePlumberMetaFromNotes(notes: unknown): PlumberOnboardingMeta {
  const raw = typeof notes === "string" ? notes : "";
  const out: PlumberOnboardingMeta = {};

  const availTag = raw.match(/\[AVAILABILITY:([^\]]+)\]/);
  if (availTag?.[1]) {
    out.availability = availTag[1].trim();
  } else {
    const legacyAvail = raw.match(/^Availability:\s*([^\n\[]+)/im);
    if (legacyAvail?.[1]) {
      out.availability = legacyAvail[1].trim();
    }
  }

  const onboardMatch = raw.match(/\[ONBOARDING_JSON:([^\n]*?)\]/);
  if (onboardMatch?.[1]) {
    try {
      const parsed = JSON.parse(onboardMatch[1]) as Record<string, unknown>;
      if (typeof parsed.onboardingNotes === "string") {
        out.onboardingNotes = parsed.onboardingNotes;
      }
      if (typeof parsed.agreementUrl === "string") {
        out.agreementUrl = parsed.agreementUrl;
      }
      if (typeof parsed.rejectionReason === "string") {
        out.rejectionReason = parsed.rejectionReason;
      }
      if (parsed.checklist && typeof parsed.checklist === "object") {
        out.checklist = parsed.checklist as PlumberProfile["verification_checklist"];
      }
    } catch {
      // Ignore malformed legacy metadata
    }
  }
  return out;
}

/** Merge availability and onboarding metadata into plumbers.notes without disturbing [BANK_JSON:...]. */
export function embedPlumberMetaInNotes(
  existingNotes: unknown,
  patch: PlumberOnboardingMeta
): string {
  const current = parsePlumberMetaFromNotes(existingNotes);
  let clean = (typeof existingNotes === "string" ? existingNotes : "")
    .replace(/\s*\[AVAILABILITY:[^\]]*\]/g, "")
    .replace(/\s*\[ONBOARDING_JSON:[^\n]*?\]/g, "")
    .trim();

  const nextAvailability = patch.availability !== undefined ? patch.availability.trim() : current.availability;
  if (nextAvailability) {
    clean = clean.replace(/^Availability:\s*[^\n\[]+\s*/im, "").trim();
  }

  const mergedOnboarding: PlumberOnboardingMeta = {
    onboardingNotes:
      patch.onboardingNotes !== undefined ? patch.onboardingNotes : current.onboardingNotes,
    agreementUrl:
      patch.agreementUrl !== undefined ? patch.agreementUrl : current.agreementUrl,
    rejectionReason:
      patch.rejectionReason !== undefined ? patch.rejectionReason : current.rejectionReason,
    checklist: patch.checklist !== undefined ? patch.checklist : current.checklist,
  };

  const tags: string[] = [];
  if (nextAvailability) {
    tags.push(`[AVAILABILITY:${nextAvailability.replace(/[\[\]]/g, "")}]`);
  }
  if (
    mergedOnboarding.onboardingNotes ||
    mergedOnboarding.agreementUrl ||
    mergedOnboarding.rejectionReason ||
    mergedOnboarding.checklist
  ) {
    tags.push(`[ONBOARDING_JSON:${JSON.stringify(mergedOnboarding)}]`);
  }

  return [clean, ...tags].filter(Boolean).join(" ").trim();
}

export function mapPlumberRow(
  row: Record<string, unknown>,
  docs: Record<string, unknown>[] = []
): PlumberProfile {
  const plumberDocs = docs.filter((d) => d.plumber_id === row.id);
  const meta = parsePlumberMetaFromNotes(row.notes);

  const toDocObj = (d: Record<string, unknown>): PlumberDocument => ({
    name: String(d.file_name || "document"),
    type: String(d.document_type || d.mime_type || "other"),
    size: Number(d.file_size || 0),
    storage_path: String(d.storage_path || ""),
    url: `/api/admin/plumber-file?path=${encodeURIComponent(String(d.storage_path || ""))}`,
    uploaded_at: d.created_at ? String(d.created_at) : undefined,
  });

  const cleanVisibleNotes = row.notes
    ? String(row.notes)
        .replace(/\s*\[BANK_JSON:[^\n]*?\]/g, "")
        .replace(/\s*\[AVAILABILITY:[^\]]*\]/g, "")
        .replace(/\s*\[ONBOARDING_JSON:[^\n]*?\]/g, "")
        .trim()
    : "";

  return {
    id: String(row.id),
    application_ref: row.application_ref ? String(row.application_ref) : undefined,
    full_name: String(row.full_name),
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    password_hash: row.password_hash ? String(row.password_hash) : undefined,
    residential_location: String(row.residential_location || ""),
    preferred_locations: Array.isArray(row.preferred_locations)
      ? (row.preferred_locations as string[])
      : [],
    skills: Array.isArray(row.skills) ? (row.skills as string[]) : [],
    experience_years: Number(row.experience_years || 1),
    experience_details: row.experience_details ? String(row.experience_details) : undefined,
    references_info: row.references_info ? String(row.references_info) : undefined,
    availability: row.availability ? String(row.availability) : meta.availability || "Standard",
    verification_status: (row.verification_status as PlumberVerificationStatus) || "submitted",
    is_available: row.is_available !== false,
    is_online: Boolean(row.is_online),
    rating: Number(row.rating || 5.0),
    total_jobs: Number(row.total_jobs || 0),
    notes: cleanVisibleNotes || undefined,
    avatar_url: row.avatar_url ? String(row.avatar_url) : undefined,
    current_lat: row.current_lat != null ? Number(row.current_lat) : undefined,
    current_lng: row.current_lng != null ? Number(row.current_lng) : undefined,
    location_updated_at: row.location_updated_at ? String(row.location_updated_at) : undefined,
    onboarding_notes: row.onboarding_notes
      ? String(row.onboarding_notes)
      : meta.onboardingNotes || undefined,
    agreement_url: row.agreement_url ? String(row.agreement_url) : meta.agreementUrl || undefined,
    rejection_reason: row.rejection_reason
      ? String(row.rejection_reason)
      : meta.rejectionReason || undefined,
    verification_checklist:
      row.verification_checklist && typeof row.verification_checklist === "object"
        ? (row.verification_checklist as PlumberProfile["verification_checklist"])
        : meta.checklist,
    documents: plumberDocs.map(toDocObj),
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function mapCustomerRow(row: Record<string, unknown>): CustomerProfile {
  return {
    id: String(row.id),
    full_name: String(row.full_name || "Customer"),
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    password_hash: row.password_hash ? String(row.password_hash) : undefined,
    address_in_kano: String(row.address || ""),
    state: row.state ? String(row.state) : undefined,
    city_lga: String(row.city_lga || ""),
    neighbourhood: row.neighbourhood ? String(row.neighbourhood) : undefined,
    property_type: row.property_type ? String(row.property_type) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    avatar_url: row.avatar_url ? String(row.avatar_url) : undefined,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function mapQuotationRow(row: Record<string, unknown>): StructuredQuotation {
  const decoded = decodeQuotationNotes(row.notes ? String(row.notes) : null);
  const directItems = Array.isArray(row.items)
    ? (row.items as QuotationLineItem[])
    : decoded.items;
  return {
    id: String(row.id),
    request_id: String(row.request_id || ""),
    ticket_number: String(row.ticket_number),
    plumber_id: String(row.plumber_id || ""),
    plumber_name: String(row.plumber_name || "Plumber"),
    labour_charge: Number(row.labour_charge || 0),
    materials_cost: Number(row.materials_cost || 0),
    transport_charge: Number(row.transport_charge || 0),
    other_charges: Number(row.other_charges || 0),
    total_amount: Number(row.total_amount || 0),
    company_commission_rate: Number(row.company_commission_rate || 20),
    company_commission: Number(row.company_commission || 0),
    plumber_payable: Number(row.plumber_payable || 0),
    is_small_job: Boolean(row.is_small_job),
    small_job_reason: row.small_job_reason ? String(row.small_job_reason) : undefined,
    customer_approval_status:
      (row.customer_approval_status as "pending" | "approved" | "rejected") || "pending",
    customer_approved_at: row.customer_approved_at ? String(row.customer_approved_at) : undefined,
    customer_feedback: row.customer_feedback ? String(row.customer_feedback) : undefined,
    admin_approved: row.admin_approved !== false,
    revision_number: Number(row.revision_number || 1),
    parent_quotation_id: row.parent_quotation_id ? String(row.parent_quotation_id) : undefined,
    notes: decoded.notes || undefined,
    items: directItems.length > 0 ? directItems : undefined,
    avatar_url: row.avatar_url ? String(row.avatar_url) : undefined,
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function mapMessageRow(row: Record<string, unknown>): JobMessage {
  return {
    id: String(row.id),
    request_id: String(row.request_id || ""),
    ticket_number: String(row.ticket_number),
    sender_role: row.sender_role as "customer" | "plumber" | "admin",
    sender_name: String(row.sender_name || ""),
    sender_id: row.sender_id ? String(row.sender_id) : null,
    recipient_role: row.recipient_role as "customer" | "plumber" | "admin",
    recipient_id: row.recipient_id ? String(row.recipient_id) : null,
    message: String(row.message || ""),
    attachment: (row.attachment as ChatAttachment) || undefined,
    is_internal: Boolean(row.is_internal),
    admin_read: row.admin_read !== false,
    read_by: Array.isArray(row.read_by)
      ? (row.read_by as ("admin" | "plumber" | "customer")[])
      : [],
    delivered_at: row.delivered_at ? String(row.delivered_at) : null,
    read_at: row.read_at ? String(row.read_at) : null,
    edited_at: row.edited_at ? String(row.edited_at) : null,
    deleted_at: row.deleted_at ? String(row.deleted_at) : null,
    reply_to_id: row.reply_to_id ? String(row.reply_to_id) : null,
    deleted_for_everyone: Boolean(row.deleted_for_everyone),
    deleted_by_ids: Array.isArray(row.deleted_by_ids) ? (row.deleted_by_ids as string[]) : [],
    created_at: String(row.created_at),
  };
}

export function mapPaymentRow(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    request_id: String(row.request_id || ""),
    ticket_number: String(row.ticket_number),
    customer_name: String(row.customer_name),
    total_payment: Number(row.total_payment || 0),
    labour_portion: Number(row.labour_portion || 0),
    materials_portion: Number(row.materials_portion || 0),
    company_commission: Number(row.company_commission || 0),
    plumber_payable: Number(row.plumber_payable || 0),
    payment_method: (row.payment_method as "bank_transfer" | "cash" | "pos") || "bank_transfer",
    transaction_ref: row.transaction_ref ? String(row.transaction_ref) : undefined,
    proof_storage_path: row.proof_storage_path ? String(row.proof_storage_path) : undefined,
    verification_status:
      (row.verification_status as "pending" | "verified" | "rejected") || "pending",
    payment_status: String(row.verification_status || "pending"),
    verified_by: row.verified_by ? String(row.verified_by) : undefined,
    verified_at: row.verified_at ? String(row.verified_at) : undefined,
    payment_date: String(row.created_at),
    notes: row.notes ? String(row.notes) : undefined,
    avatar_url: row.avatar_url ? String(row.avatar_url) : undefined,
    created_at: String(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// SERVICE CATEGORIES & COVERAGE AREAS (Normalized tables)
// ---------------------------------------------------------------------------
function getPublicReadClient() {
  return createClient(getRequiredSupabaseUrl(), getRequiredAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function getServiceCategories(onlyActive = false): Promise<ServiceCategorySetting[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("service-categories");
  if (isBuildPhase()) return DEFAULT_SERVICE_CATEGORIES;
  try {
    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? getServiceSupabase()
      : getPublicReadClient();
    let query = supabase
      .from("service_categories")
      .select("*")
      .order("sort_order", { ascending: true });
    if (onlyActive) query = query.eq("is_active", true);
    const [{ data, error }, { data: settingRow }] = await Promise.all([
      query,
      supabase
        .from("settings")
        .select("value")
        .eq("key", "marketplace_settings")
        .maybeSingle(),
    ]);
    const storedCats =
      ((settingRow?.value as Partial<MarketplaceSettings> | undefined)
        ?.service_categories as ServiceCategorySetting[] | undefined) || [];
    if (error || !data || data.length === 0) {
      if (storedCats.length > 0) {
        return onlyActive ? storedCats.filter((c) => c.visible !== false && c.active !== false) : storedCats;
      }
      return DEFAULT_SERVICE_CATEGORIES;
    }
    return data.map((c) => {
      const slug = String(c.slug);
      const fallback = DEFAULT_SERVICE_CATEGORIES.find((d) => d.slug === slug);
      const storedMatch = storedCats.find(
        (s) => s.slug === slug || s.id === String(c.id)
      );
      return {
        id: String(c.id),
        slug,
        name: String(c.name),
        title: storedMatch?.title || String(c.name),
        description: String(c.long_description || c.short_description || storedMatch?.description || ""),
        short_description: String(c.short_description || storedMatch?.short_description || ""),
        image:
          storedMatch?.image ||
          fallback?.image ||
          "/images/services/surface-ppr-pipe-installation-kano.jpg",
        image_alt: storedMatch?.image_alt || "",
        common_problems:
          Array.isArray(c.common_problems) && c.common_problems.length > 0
            ? c.common_problems
            : storedMatch?.common_problems || [],
        quotation_notes: c.quotation_notes
          ? String(c.quotation_notes)
          : storedMatch?.quotation_notes || "",
        faqs:
          Array.isArray(c.faqs) && c.faqs.length > 0
            ? c.faqs
            : storedMatch?.faqs || [],
        related_slugs:
          Array.isArray(c.related_slugs) && c.related_slugs.length > 0
            ? c.related_slugs
            : storedMatch?.related_slugs || [],
        icon_name: c.icon_name
          ? String(c.icon_name)
          : storedMatch?.icon_name || "Wrench",
        sort_order: Number(c.sort_order || 0),
        order: Number(c.sort_order || 0),
        active: Boolean(c.is_active),
        visible: Boolean(c.is_active),
        published: Boolean(c.is_published),
      };
    });
  } catch {
    if (process.env.NODE_ENV === "production") throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in production.");
    return DEFAULT_SERVICE_CATEGORIES;
  }
}

export async function getServiceAreas(onlyActive = false): Promise<CoverageAreaSetting[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("service-areas");
  if (isBuildPhase()) return DEFAULT_COVERAGE_AREAS;
  try {
    const supabase = getServiceSupabase();
    let query = supabase.from("service_areas").select("*").order("name", { ascending: true });
    if (onlyActive) query = query.eq("is_active", true);
    const { data, error } = await query;
    if (error || !data || data.length === 0) return DEFAULT_COVERAGE_AREAS;
    return data.map((a) => ({
      id: String(a.id),
      slug: String(a.slug),
      area: String(a.name),
      state: a.state ? String(a.state) : undefined,
      city: a.city ? String(a.city) : undefined,
      active: Boolean(a.is_active),
      published: Boolean(a.is_published),
    }));
  } catch {
    if (process.env.NODE_ENV === "production") throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in production.");
    return DEFAULT_COVERAGE_AREAS;
  }
}

// ---------------------------------------------------------------------------
// SERVICE REQUESTS
// ---------------------------------------------------------------------------
export async function createUniversalServiceRequest(data: {
  priority?: UrgencyLevel;
  propertyType?: string;
  address?: string;
  addressInKano?: string;
  state?: string;
  cityLga?: string;
  cityOrLga?: string;
  neighbourhood?: string;
  preferredTiming?: string;
  preferredDate?: string;
  problemCategory?: string;
  issueDescription: string;
  photos?: string[];
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  createdByRole?: "admin" | "customer" | "plumber";
}): Promise<ServiceRequestRecord> {
  const resolvedAddress = (data.address || data.addressInKano || "").trim();
  const resolvedCity = (data.cityLga || data.cityOrLga || "").trim();
  const supabase = getServiceSupabase();
  const settings = await getMarketplaceSettings();
  const resolvedState = (data.state || settings.default_state || "").trim();
  const now = new Date();
  const datePart = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const ticketNumber = `BP-${datePart}-${randomSuffix}`;
  const nowIso = now.toISOString();

  // Upsert / link customer by normalized phone
  const cleanPhone = data.customerPhone.trim();
  const cleanDigits = normalizePhoneDigits(cleanPhone);
  const { data: allCustomers } = await supabase.from("customers").select("id, phone");
  const existingCustomer = (allCustomers || []).find(
    (c) => normalizePhoneDigits(String(c.phone)) === cleanDigits
  );

  let customerId = data.customerId || (existingCustomer?.id as string | undefined);
  if (!customerId && cleanPhone) {
    const newCustId = crypto.randomUUID();
    const baseCust = {
      id: newCustId,
      full_name: data.customerName.trim() || "Customer",
      phone: cleanPhone,
      email: data.customerEmail?.trim() || null,
      address: resolvedAddress,
      state: resolvedState,
      city_lga: resolvedCity || settings.default_city || "",
      neighbourhood: data.neighbourhood || "",
      property_type: data.propertyType || "Residential / Home",
      created_at: nowIso,
      updated_at: nowIso,
    };
    const { data: firstCust, error: custErr } = await supabase
      .from("customers")
      .upsert(baseCust, { onConflict: "phone" })
      .select("id")
      .single();
    let insertedCust = firstCust;
    if (custErr && custErr.message.includes("area_in_kano")) {
      ({ data: insertedCust } = await supabase
        .from("customers")
        .upsert(
          { ...baseCust, area_in_kano: resolvedCity || resolvedAddress || "N/A" },
          { onConflict: "phone" }
        )
        .select("id")
        .single());
    }
    customerId = insertedCust?.id || newCustId;
  }

  const reqId = crypto.randomUUID();
  const recordPayload = {
    id: reqId,
    ticket_number: ticketNumber,
    customer_id: customerId || null,
    priority: data.priority || "standard",
    status: "new",
    property_type: data.propertyType || "Residential / Home",
    address: resolvedAddress,
    state: resolvedState,
    city_lga: resolvedCity || settings.default_city || "",
    neighbourhood: data.neighbourhood || "",
    preferred_timing: data.preferredTiming || "As soon as possible",
    preferred_date: data.preferredDate || null,
    problem_category: data.problemCategory || "General Plumbing",
    category_slug: toSlug(data.problemCategory || ""),
    issue_description: data.issueDescription,
    photos: data.photos || [],
    customer_name: data.customerName,
    customer_phone: cleanPhone,
    customer_email: data.customerEmail || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  let { data: insertedReq, error } = await supabase
    .from("service_requests")
    .insert(recordPayload)
    .select("*")
    .single();

  if (error && (error.message.includes("'address'") || error.message.includes("'problem_category'"))) {
    const legacyPayload: Record<string, unknown> = {
      ...recordPayload,
      address_in_kano: resolvedAddress,
    };
    delete legacyPayload.address;
    delete legacyPayload.problem_category;
    ({ data: insertedReq, error } = await supabase
      .from("service_requests")
      .insert(legacyPayload)
      .select("*")
      .single());
  }

  if (error || !insertedReq) {
    throw new Error(`Failed to create service request: ${error?.message || "Unknown error"}`);
  }

  const historyPayload = {
    id: `hist-${Date.now().toString(36)}`,
    request_id: reqId,
    ticket_number: ticketNumber,
    actor: data.customerName || "Customer",
    actor_role: "customer",
    action: "Request Submitted",
    details: `Submitted online (${data.problemCategory || "General Plumbing"})`,
    created_at: nowIso,
  };
  await supabase.from("request_history").insert(historyPayload);

  const creatorRole = data.createdByRole || "customer";

  await createNotification({
    recipientId: "admin",
    recipientRole: "admin",
    actorRole: creatorRole,
    type: "new_request",
    title: `New Service Request: ${ticketNumber}`,
    body: `${data.customerName || "Customer"} • ${data.problemCategory || "Plumbing"} (${data.cityLga || "Kano"})`,
    entityType: "service_request",
    entityId: reqId,
    destination: `/admin/requests?ticket=${ticketNumber}`,
  });

  if (customerId) {
    await createNotification({
      recipientId: customerId,
      recipientRole: "customer",
      actorRole: creatorRole,
      actorId: creatorRole === "customer" ? customerId : undefined,
      type: "request_submitted",
      title: `Request Received: ${ticketNumber}`,
      body: `We have received your ${data.problemCategory || "plumbing"} request and will coordinate inspection shortly.`,
      entityType: "service_request",
      entityId: reqId,
      destination: `/customer?tab=requests&ticket=${ticketNumber}`,
    });
  }

  await triggerWorkforceOnServiceRequest({
    ticketNumber,
    customerName: data.customerName || "Customer",
    problemCategory: data.problemCategory || "General Plumbing",
    cityLga: data.cityLga || "Kano",
    issueDescription: data.issueDescription || "",
    urgency: data.priority,
  });

  return mapRequestRow(insertedReq, [historyPayload]);
}

export async function getAllServiceRequests(): Promise<ServiceRequestRecord[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const [{ data: reqRows }, { data: histRows }] = await Promise.all([
    supabase.from("service_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("request_history").select("*").order("created_at", { ascending: true }),
  ]);

  if (!reqRows) return [];
  return reqRows.map((r) => mapRequestRow(r, histRows || []));
}

export async function getServiceRequestByTicket(
  ticketNumber: string,
  phone?: string
): Promise<ServiceRequestRecord | null> {
  if (isBuildPhase()) return null;
  const supabase = getServiceSupabase();
  const cleanTicket = ticketNumber.trim().toUpperCase();
  const { data: row } = await supabase
    .from("service_requests")
    .select("*")
    .ilike("ticket_number", cleanTicket)
    .maybeSingle();

  if (!row) return null;

  if (phone !== undefined) {
    const cleanPhone = normalizePhoneDigits(phone).slice(-10);
    const reqPhone = normalizePhoneDigits(String(row.customer_phone || "")).slice(-10);
    if (cleanPhone.length < 10 || reqPhone.length < 10 || cleanPhone !== reqPhone) {
      return null;
    }
  }

  const { data: histRows } = await supabase
    .from("request_history")
    .select("*")
    .eq("request_id", row.id)
    .order("created_at", { ascending: true });

  return mapRequestRow(row, histRows || []);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export async function updateServiceRequest(
  idOrTicket: string,
  updates: {
    status?: RequestStatus;
    assigned_plumber_id?: string | null;
    assigned_technician?: string | null;
    quoted_amount?: number | null;
    internal_notes?: string | null;
    priority?: UrgencyLevel;
    preferred_date?: string | null;
    archived_at?: string | null;
    deleted_at?: string | null;
  },
  historyEntry?: Omit<RequestHistoryEntry, "id" | "timestamp">
): Promise<ServiceRequestRecord | null> {
  const supabase = getServiceSupabase();
  const cleanKey = idOrTicket.trim();
  const existingQuery = supabase.from("service_requests").select("*");
  const { data: existing, error: findErr } = await (
    isUuid(cleanKey)
      ? existingQuery.or(`id.eq.${cleanKey},ticket_number.eq.${cleanKey}`)
      : existingQuery.eq("ticket_number", cleanKey)
  ).maybeSingle();

  if (findErr || !existing) return null;
  const nowIso = new Date().toISOString();

  const payload: Record<string, unknown> = { updated_at: nowIso };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.assigned_plumber_id !== undefined) payload.assigned_plumber_id = updates.assigned_plumber_id;
  if (updates.assigned_technician !== undefined) payload.assigned_technician = updates.assigned_technician;
  if (updates.quoted_amount !== undefined) payload.quoted_amount = updates.quoted_amount;
  if (updates.internal_notes !== undefined) payload.internal_notes = updates.internal_notes;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.preferred_date !== undefined) payload.preferred_date = updates.preferred_date;
  if (updates.archived_at !== undefined) payload.archived_at = updates.archived_at;
  if (updates.deleted_at !== undefined) payload.deleted_at = updates.deleted_at;

  const { data: initialUpdated, error } = await supabase
    .from("service_requests")
    .update(payload)
    .eq("id", existing.id)
    .select("*")
    .single();
  let updated = initialUpdated;

  if (error && (error.message.includes("archived_at") || error.message.includes("deleted_at"))) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.archived_at;
    delete fallbackPayload.deleted_at;
    const retry = await supabase
      .from("service_requests")
      .update(fallbackPayload)
      .eq("id", existing.id)
      .select("*")
      .single();
    updated = retry.data;
    if (retry.error) {
      throw new Error(`Failed to update service request: ${retry.error.message}`);
    }
  } else if (error) {
    throw new Error(`Failed to update service request: ${error.message}`);
  }

  if (historyEntry) {
    await appendRequestHistoryEntry(String(existing.id), historyEntry);
  }

  // Tracking lifecycle: when a job ends or changes hands, stop sharing for any
  // plumber who is Off Duty and has no other active job.
  if (updates.status !== undefined || updates.assigned_plumber_id !== undefined) {
    const affected = new Set<string>();
    if (existing.assigned_plumber_id) affected.add(String(existing.assigned_plumber_id));
    if (updated?.assigned_plumber_id) affected.add(String(updated.assigned_plumber_id));
    for (const pid of affected) {
      await reconcilePlumberSharing(pid);
    }
  }

  const { data: histRows } = await supabase
    .from("request_history")
    .select("*")
    .eq("request_id", existing.id)
    .order("created_at", { ascending: true });

  return updated ? mapRequestRow(updated, histRows || []) : null;
}

export async function appendRequestHistoryEntry(
  ticketOrId: string,
  entry: Omit<RequestHistoryEntry, "id" | "timestamp">
): Promise<void> {
  const supabase = getServiceSupabase();
  const cleanKey = ticketOrId.trim();
  const reqQuery = supabase.from("service_requests").select("id, ticket_number");
  const { data: req } = await (
    isUuid(cleanKey)
      ? reqQuery.or(`id.eq.${cleanKey},ticket_number.eq.${cleanKey}`)
      : reqQuery.eq("ticket_number", cleanKey)
  ).maybeSingle();

  if (!req) return;
  const nowIso = new Date().toISOString();

  await supabase.from("request_history").insert({
    id: `hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    request_id: req.id,
    ticket_number: req.ticket_number,
    actor: entry.actor,
    action: entry.action,
    details: entry.details || null,
    created_at: nowIso,
  });

  await supabase
    .from("service_requests")
    .update({ updated_at: nowIso })
    .eq("id", req.id);
}

// ---------------------------------------------------------------------------
// QUOTATIONS & COMMISSION ENGINE
// ---------------------------------------------------------------------------
export function computeQuotationBreakdown(params: {
  labourCharge: number;
  materialsCost: number;
  transportCharge?: number;
  otherCharges?: number;
  isSmallJob?: boolean;
  commissionDefaultRate?: number;
  commissionSmallJobRate?: number;
  smallJobThreshold?: number;
  smallJobRuleEnabled?: boolean;
}) {
  const labour = Math.max(0, Number(params.labourCharge) || 0);
  const materials = Math.max(0, Number(params.materialsCost) || 0);
  const transport = Math.max(0, Number(params.transportCharge) || 0);
  const other = Math.max(0, Number(params.otherCharges) || 0);
  const totalAmount = labour + materials + transport + other;

  const defaultRate = params.commissionDefaultRate ?? 20;
  const smallRate = params.commissionSmallJobRate ?? 5;
  const threshold = params.smallJobThreshold ?? 25000;
  const smallEnabled = params.smallJobRuleEnabled !== false;

  const isSmall = smallEnabled && (Boolean(params.isSmallJob) || totalAmount <= threshold);
  const commissionRate = isSmall ? smallRate : defaultRate;
  const companyCommission = Math.round((labour * commissionRate) / 100);
  const plumberPayable = totalAmount - companyCommission;

  return {
    labourCharge: labour,
    materialsCost: materials,
    transportCharge: transport,
    otherCharges: other,
    totalAmount,
    isSmallJob: isSmall,
    commissionRate,
    companyCommission,
    plumberPayable,
  };
}

export async function getQuotationsForRequest(
  requestIdOrTicket: string
): Promise<StructuredQuotation[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const cleanKey = requestIdOrTicket.trim();
  const q = supabase.from("quotations").select("*");
  const { data } = await (
    isUuid(cleanKey)
      ? q.or(`request_id.eq.${cleanKey},ticket_number.eq.${cleanKey}`)
      : q.eq("ticket_number", cleanKey)
  ).order("revision_number", { ascending: false });
  return (data || []).map(mapQuotationRow);
}

export async function getAllQuotations(): Promise<StructuredQuotation[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("quotations")
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []).map(mapQuotationRow);
}

export async function submitStructuredQuotation(params: {
  requestId: string;
  ticketNumber: string;
  plumberId: string;
  plumberName: string;
  labourCharge: number;
  materialsCost: number;
  transportCharge?: number;
  otherCharges?: number;
  isSmallJob?: boolean;
  smallJobReason?: string;
  notes?: string;
  items?: QuotationLineItem[];
  actorRole?: "admin" | "plumber";
}): Promise<StructuredQuotation> {
  const supabase = getServiceSupabase();
  const settings = await getMarketplaceSettings();
  const validItems = (params.items || []).filter((it) => it.name.trim().length > 0);
  const computedItemsTotal = validItems.reduce(
    (sum, it) => sum + Math.max(1, Number(it.quantity) || 1) * Math.max(0, Number(it.unitPrice) || 0),
    0
  );
  const effectiveMaterialsCost =
    validItems.length > 0 ? computedItemsTotal : params.materialsCost;

  const breakdown = computeQuotationBreakdown({
    labourCharge: params.labourCharge,
    materialsCost: effectiveMaterialsCost,
    transportCharge: params.transportCharge,
    otherCharges: params.otherCharges,
    isSmallJob: params.isSmallJob,
    commissionDefaultRate: settings.commission_default_rate,
    commissionSmallJobRate: settings.commission_small_job_rate ?? 5,
    smallJobThreshold: settings.small_job_threshold ?? 25000,
    smallJobRuleEnabled: settings.small_job_rule_enabled,
  });

  const existing = await getQuotationsForRequest(params.ticketNumber);
  const nextRevision = existing.length + 1;
  const parentId = existing[0]?.id || null;
  const nowIso = new Date().toISOString();

  const rowPayload = {
    id: `qt-${Date.now().toString(36)}`,
    request_id: params.requestId || null,
    ticket_number: params.ticketNumber,
    plumber_id: params.plumberId || null,
    plumber_name: params.plumberName,
    labour_charge: breakdown.labourCharge,
    materials_cost: breakdown.materialsCost,
    transport_charge: breakdown.transportCharge,
    other_charges: breakdown.otherCharges,
    total_amount: breakdown.totalAmount,
    company_commission_rate: breakdown.commissionRate,
    company_commission: breakdown.companyCommission,
    plumber_payable: breakdown.plumberPayable,
    is_small_job: breakdown.isSmallJob,
    small_job_reason: params.smallJobReason || null,
    customer_approval_status: "pending",
    admin_approved: true,
    revision_number: nextRevision,
    parent_quotation_id: parentId,
    notes: encodeQuotationNotes(params.notes, validItems),
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: inserted, error } = await supabase
    .from("quotations")
    .insert(rowPayload)
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to submit quotation: ${error?.message || "Unknown error"}`);
  }

  if (params.requestId) {
    const { error: statusErr } = await supabase
      .from("service_requests")
      .update({
        status: "awaiting_approval",
        quoted_amount: breakdown.totalAmount,
        updated_at: nowIso,
      })
      .eq("id", params.requestId);
    if (statusErr) {
      throw new Error(`Quotation saved but request status update failed: ${statusErr.message}`);
    }

    await appendRequestHistoryEntry(params.requestId, {
      actor: params.plumberName,
      action: `Submitted Quotation (Rev #${nextRevision})`,
      details: `Total ₦${breakdown.totalAmount.toLocaleString()} (Labour ₦${breakdown.labourCharge.toLocaleString()}, Materials ₦${breakdown.materialsCost.toLocaleString()})`,
    });

    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id")
      .eq("id", params.requestId)
      .maybeSingle();

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: params.actorRole || "plumber",
        type: "quotation_ready",
        title: `Quotation Ready: ${params.ticketNumber}`,
        body: `₦${breakdown.totalAmount.toLocaleString()} submitted by ${params.plumberName}. Review & approve to proceed.`,
        entityType: "quotation",
        entityId: String(inserted.id),
        destination: `/customer?tab=quotations&ticket=${params.ticketNumber}`,
      });
    }
  }

  await createNotification({
    recipientId: "admin",
    recipientRole: "admin",
    actorRole: params.actorRole || "plumber",
    type: "quotation_submitted",
    title: `Quotation Submitted: ${params.ticketNumber}`,
    body: `${params.plumberName} submitted Rev #${nextRevision} (₦${breakdown.totalAmount.toLocaleString()}).`,
    entityType: "quotation",
    entityId: String(inserted.id),
    destination: `/admin/requests?ticket=${params.ticketNumber}`,
  });

  return mapQuotationRow(inserted);
}

export async function setCustomerQuotationApproval(
  quotationId: string,
  decision: "approved" | "rejected",
  customerName = "Customer",
  feedback?: string,
  actorRole: "admin" | "customer" = "customer"
): Promise<StructuredQuotation | null> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from("quotations")
    .update({
      customer_approval_status: decision,
      customer_approved_at: decision === "approved" ? nowIso : null,
      customer_feedback: feedback || null,
      updated_at: nowIso,
    })
    .eq("id", quotationId)
    .select("*")
    .single();

  if (error || !updated) return null;

  if (updated.request_id) {
    const { error: decisionStatusErr } = await supabase
      .from("service_requests")
      .update({
        status: decision === "approved" ? "approved" : "quotation_submitted",
        updated_at: nowIso,
      })
      .eq("id", updated.request_id);
    if (decisionStatusErr) {
      throw new Error(`Decision saved but request status update failed: ${decisionStatusErr.message}`);
    }

    await appendRequestHistoryEntry(String(updated.request_id), {
      actor: customerName,
      action: decision === "approved" ? "Approved Quotation" : "Requested Quotation Changes",
      details:
        feedback ||
        `Quotation Rev #${updated.revision_number} (${Number(updated.total_amount).toLocaleString()} NGN)`,
    });
  }

  await createNotification({
    recipientId: "admin",
    recipientRole: "admin",
    actorRole,
    type: "quotation_decision",
    title:
      decision === "approved"
        ? `Quotation Approved: ${updated.ticket_number}`
        : `Quotation Revision Requested: ${updated.ticket_number}`,
    body: `${customerName} ${decision === "approved" ? "approved" : "requested changes on"} Rev #${updated.revision_number}.`,
    entityType: "quotation",
    entityId: String(updated.id),
    destination: `/admin/requests?ticket=${updated.ticket_number}`,
  });

  if (updated.plumber_id) {
    await createNotification({
      recipientId: String(updated.plumber_id),
      recipientRole: "plumber",
      actorRole,
      type: "quotation_decision",
      title:
        decision === "approved"
          ? `Quotation Approved: ${updated.ticket_number}`
          : `Quotation Changes Requested: ${updated.ticket_number}`,
      body: feedback || `${customerName} ${decision === "approved" ? "approved your quotation." : "requested a revision."}`,
      entityType: "quotation",
      entityId: String(updated.id),
      destination: `/plumber?tab=jobs&ticket=${updated.ticket_number}`,
    });
  }

  return mapQuotationRow(updated);
}

// ---------------------------------------------------------------------------
// PLUMBERS
// ---------------------------------------------------------------------------
export async function getAllPlumbers(): Promise<PlumberProfile[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const [{ data: plumberRows }, { data: docRows }] = await Promise.all([
    supabase.from("plumbers").select("*").order("created_at", { ascending: false }),
    supabase.from("plumber_documents").select("*"),
  ]);
  if (!plumberRows) return [];
  return plumberRows.map((p) => mapPlumberRow(p, docRows || []));
}

export async function getPlumberById(id: string): Promise<PlumberProfile | null> {
  if (isBuildPhase()) return null;
  const supabase = getServiceSupabase();
  const [{ data: row }, { data: docs }] = await Promise.all([
    supabase.from("plumbers").select("*").eq("id", id).maybeSingle(),
    supabase.from("plumber_documents").select("*").eq("plumber_id", id),
  ]);
  if (!row) return null;
  return mapPlumberRow(row, docs || []);
}

export async function getPlumberByPhone(phone: string): Promise<PlumberProfile | null> {
  const cleanDigits = normalizePhoneDigits(phone).slice(-10);
  if (!cleanDigits) return null;
  const plumbers = await getAllPlumbers();
  return (
    plumbers.find((p) => {
      const pDigits = normalizePhoneDigits(p.phone).slice(-10);
      return pDigits && (pDigits === cleanDigits || pDigits.endsWith(cleanDigits));
    }) || null
  );
}

export async function createPlumberApplication(
  data: Omit<PlumberProfile, "id" | "verification_status" | "rating" | "total_jobs" | "created_at">
): Promise<PlumberProfile> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const id = `plumber-${Date.now().toString(36)}`;
  const appRef = data.application_ref || `PLM-${Date.now().toString().slice(-6)}`;

  const payload = {
    id,
    application_ref: appRef,
    full_name: data.full_name,
    phone: data.phone,
    email: data.email || null,
    residential_location: data.residential_location || "",
    preferred_locations: data.preferred_locations || [],
    skills: data.skills || [],
    experience_years: Number(data.experience_years || 1),
    experience_details: data.experience_details || null,
    references_info: data.references_info || null,
    verification_status: "submitted",
    is_available: true,
    is_online: false,
    rating: 5.0,
    total_jobs: 0,
    notes: data.notes || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: inserted, error } = await supabase
    .from("plumbers")
    .upsert(payload, { onConflict: "phone" })
    .select("*")
    .single();

  if (error || !inserted) {
    throw new Error(`Failed to save plumber application: ${error?.message || "Unknown error"}`);
  }

  // Persist private document references if provided
  const docInserts: Record<string, unknown>[] = [];
  for (const doc of data.documents || []) {
    if (doc.storage_path) {
      docInserts.push({
        plumber_id: inserted.id,
        document_type:
          doc.type === "id_card" || doc.type === "certificate" || doc.type === "photo"
            ? doc.type
            : "other",
        file_name: doc.name,
        storage_bucket: "plumber-documents",
        storage_path: doc.storage_path,
        mime_type: doc.type,
        file_size: doc.size || 0,
      });
    }
  }
  if (docInserts.length > 0) {
    await supabase.from("plumber_documents").insert(docInserts);
  }

  return mapPlumberRow(inserted);
}

export async function updatePlumberVerification(
  id: string,
  status: PlumberVerificationStatus,
  notes?: string
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const updatePayload: Record<string, unknown> = {
    verification_status: status,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) {
    const { data: existing } = await supabase
      .from("plumbers")
      .select("notes")
      .eq("id", id)
      .maybeSingle();
    const existingRaw = typeof existing?.notes === "string" ? existing.notes : "";
    const bankTag = existingRaw.match(/\[BANK_JSON:[^\n]*?\]/)?.[0] || "";
    const meta = parsePlumberMetaFromNotes(existingRaw);
    const cleanedNote = notes.trim();
    const mergedMeta = embedPlumberMetaInNotes(cleanedNote, {
      availability: meta.availability,
      onboardingNotes: cleanedNote || meta.onboardingNotes,
      agreementUrl: meta.agreementUrl,
      rejectionReason: status === "rejected" && cleanedNote ? cleanedNote : meta.rejectionReason,
      checklist: meta.checklist,
    });
    updatePayload.notes = [mergedMeta, bankTag].filter(Boolean).join(" ").trim() || null;
  }
  const { error } = await supabase.from("plumbers").update(updatePayload).eq("id", id);
  return !error;
}

export async function updatePlumberAvailability(
  id: string,
  isAvailable: boolean
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("plumbers")
    .update({
      is_available: isAvailable,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

function isMissingPlumberColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("schema cache") ||
    lower.includes("could not find the") ||
    (lower.includes("column") && lower.includes("does not exist"))
  );
}

/** Update plumber profile fields while safely persisting availability even if the DB lacks that column yet. */
export async function updatePlumberProfileFields(
  plumberId: string,
  fields: {
    full_name: string;
    phone: string;
    email?: string | null;
    residential_location?: string;
    preferred_locations?: string[];
    skills?: string[];
    availability?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServiceSupabase();
  const { data: current } = await supabase
    .from("plumbers")
    .select("notes")
    .eq("id", plumberId)
    .maybeSingle();

  const basePayload: Record<string, unknown> = {
    full_name: fields.full_name,
    phone: fields.phone,
    updated_at: new Date().toISOString(),
  };
  if (fields.email !== undefined) basePayload.email = fields.email;
  if (fields.residential_location !== undefined) {
    basePayload.residential_location = fields.residential_location;
  }
  if (fields.preferred_locations !== undefined) {
    basePayload.preferred_locations = fields.preferred_locations;
  }
  if (fields.skills !== undefined) basePayload.skills = fields.skills;
  if (fields.availability !== undefined) {
    basePayload.notes = embedPlumberMetaInNotes(current?.notes, {
      availability: fields.availability,
    });
  }

  const withOptionalCol =
    fields.availability !== undefined
      ? { ...basePayload, availability: fields.availability }
      : basePayload;

  const { error } = await supabase.from("plumbers").update(withOptionalCol).eq("id", plumberId);
  if (!error) return { success: true };

  if (fields.availability !== undefined && isMissingPlumberColumnError(error.message)) {
    const retry = await supabase.from("plumbers").update(basePayload).eq("id", plumberId);
    if (!retry.error) return { success: true };
    return { success: false, error: retry.error.message };
  }

  return { success: false, error: error.message };
}

export async function updatePlumberChecklistAndNotes(params: {
  id?: string;
  plumberId?: string;
  checklist?: unknown;
  onboardingNotes?: string;
  agreementUrl?: string;
  rejectionReason?: string;
  adminNotes?: string;
  actor?: string;
}): Promise<boolean> {
  const targetId = params.id || params.plumberId;
  if (!targetId) return false;
  const supabase = getServiceSupabase();
  const { data: current } = await supabase
    .from("plumbers")
    .select("notes")
    .eq("id", targetId)
    .maybeSingle();

  const mergedNotes = embedPlumberMetaInNotes(
    params.adminNotes ?? current?.notes ?? "",
    {
      checklist:
        params.checklist && typeof params.checklist === "object"
          ? (params.checklist as PlumberProfile["verification_checklist"])
          : undefined,
      onboardingNotes: params.onboardingNotes,
      agreementUrl: params.agreementUrl,
      rejectionReason: params.rejectionReason,
    }
  );

  const nowIso = new Date().toISOString();
  const fullPayload: Record<string, unknown> = {
    notes: mergedNotes || null,
    updated_at: nowIso,
  };
  if (params.onboardingNotes !== undefined) fullPayload.onboarding_notes = params.onboardingNotes;
  if (params.agreementUrl !== undefined) fullPayload.agreement_url = params.agreementUrl;
  if (params.rejectionReason !== undefined) fullPayload.rejection_reason = params.rejectionReason;
  if (params.checklist !== undefined) fullPayload.verification_checklist = params.checklist;

  const { error } = await supabase.from("plumbers").update(fullPayload).eq("id", targetId);
  if (!error) return true;

  if (isMissingPlumberColumnError(error.message)) {
    const fallback = await supabase
      .from("plumbers")
      .update({ notes: mergedNotes || null, updated_at: nowIso })
      .eq("id", targetId);
    return !fallback.error;
  }

  return false;
}

// ---------------------------------------------------------------------------
// CUSTOMERS & ACCOUNTS
// ---------------------------------------------------------------------------
export async function getAllCustomers(): Promise<CustomerProfile[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("customers")
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []).map(mapCustomerRow);
}

export async function getCustomerByPhoneOrId(query: string): Promise<CustomerProfile | null> {
  const customers = await getAllCustomers();
  const q = query.trim().toLowerCase();
  const cleanDigits = q.replace(/\D/g, "");
  return (
    customers.find((c) => {
      if (c.id.toLowerCase() === q) return true;
      if (c.phone.toLowerCase() === q) return true;
      if (cleanDigits.length >= 7 && normalizePhoneDigits(c.phone).includes(cleanDigits)) return true;
      if (cleanDigits.length >= 7 && cleanDigits.includes(normalizePhoneDigits(c.phone))) return true;
      if (c.email && c.email.toLowerCase() === q) return true;
      return false;
    }) || null
  );
}

export async function getAllPlumberAccounts(): Promise<PlumberAccountRecord[]> {
  const plumbers = await getAllPlumbers();
  return plumbers
    .filter((p) => Boolean(p.password_hash || p.email))
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      email: p.email || "",
      password_hash: p.password_hash || "",
      plumber_id: p.id,
      created_at: p.created_at,
    }));
}

export async function registerPlumberAccount(data: {
  fullName: string;
  phone: string;
  email: string;
  passwordHash: string;
  authUserId?: string;
}): Promise<PlumberAccountRecord> {
  const supabase = getServiceSupabase();
  const cleanPhone = data.phone.trim();
  const cleanEmail = data.email.trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const existing = await getPlumberByPhone(cleanPhone);

  if (existing) {
    const { error: updateErr } = await supabase
      .from("plumbers")
      .update({
        email: cleanEmail,
        password_hash: data.passwordHash,
        ...(data.authUserId ? { auth_user_id: data.authUserId } : {}),
        updated_at: nowIso,
      })
      .eq("id", existing.id);

    if (updateErr) {
      throw new Error(`Failed to update plumber account: ${updateErr.message}`);
    }

    return {
      id: existing.id,
      full_name: existing.full_name,
      phone: existing.phone,
      email: cleanEmail,
      password_hash: data.passwordHash,
      plumber_id: existing.id,
      created_at: existing.created_at,
    };
  }

  const newId = `plumber-${Date.now().toString(36)}`;
  const { error: insertErr } = await supabase.from("plumbers").insert({
    id: newId,
    full_name: data.fullName.trim(),
    phone: cleanPhone,
    email: cleanEmail,
    password_hash: data.passwordHash,
    ...(data.authUserId ? { auth_user_id: data.authUserId } : {}),
    residential_location: "",
    verification_status: "submitted",
    created_at: nowIso,
    updated_at: nowIso,
  });

  if (insertErr) {
    throw new Error(`Failed to register plumber account: ${insertErr.message}`);
  }

  return {
    id: newId,
    full_name: data.fullName.trim(),
    phone: cleanPhone,
    email: cleanEmail,
    password_hash: data.passwordHash,
    plumber_id: newId,
    created_at: nowIso,
  };
}

export async function claimUnlinkedCustomerRequests(params: {
  customerId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<number> {
  const cleanEmail = params.email?.trim().toLowerCase() || "";
  const normalizedPhone = normalizePhoneDigits(params.phone || "");
  if (!cleanEmail && normalizedPhone.length < 7) return 0;

  try {
    const supabase = getServiceSupabase();
    const { data: unlinkedRows } = await supabase
      .from("service_requests")
      .select("id, customer_email, customer_phone")
      .is("customer_id", null)
      .is("deleted_at", null)
      .limit(100);

    const matchedIds: string[] = [];
    for (const row of unlinkedRows || []) {
      const rowEmail = row.customer_email ? String(row.customer_email).trim().toLowerCase() : "";
      const rowDigits = normalizePhoneDigits(String(row.customer_phone || ""));
      const emailMatches = Boolean(cleanEmail && rowEmail && rowEmail === cleanEmail);
      const phoneMatches = Boolean(
        normalizedPhone.length >= 7 &&
          rowDigits.length >= 7 &&
          (rowDigits === normalizedPhone ||
            rowDigits.endsWith(normalizedPhone.slice(-10)) ||
            normalizedPhone.endsWith(rowDigits.slice(-10)))
      );
      if (emailMatches || phoneMatches) {
        matchedIds.push(String(row.id));
      }
    }

    if (matchedIds.length > 0) {
      await supabase
        .from("service_requests")
        .update({
          customer_id: params.customerId,
          updated_at: new Date().toISOString(),
        })
        .in("id", matchedIds);
    }
    return matchedIds.length;
  } catch {
    return 0;
  }
}

export async function registerCustomer(data: {
  fullName: string;
  phone: string;
  email?: string;
  passwordHash?: string;
  authUserId?: string;
  address?: string;
  cityLga?: string;
  neighbourhood?: string;
  propertyType?: string;
}): Promise<CustomerProfile> {
  const supabase = getServiceSupabase();
  const cleanPhone = data.phone.trim();
  const cleanEmail = data.email?.trim() || "";
  const existing =
    (await getCustomerByPhoneOrId(cleanPhone)) ||
    (cleanEmail ? await getCustomerByPhoneOrId(cleanEmail) : null);
  const nowIso = new Date().toISOString();

  if (existing) {
    const existingRaw = existing as CustomerProfile & { auth_user_id?: string | null };
    if (existing.password_hash || existingRaw.auth_user_id) {
      throw new Error("An account with this phone number already exists. Please sign in instead.");
    }
    if (
      existing.email &&
      data.email &&
      existing.email.trim().toLowerCase() !== data.email.trim().toLowerCase()
    ) {
      throw new Error("This phone number is already linked to another email address.");
    }
    const { data: updated, error: updateErr } = await supabase
      .from("customers")
      .update({
        full_name: data.fullName.trim() || existing.full_name,
        email: data.email?.trim() || existing.email || null,
        ...(data.passwordHash ? { password_hash: data.passwordHash } : {}),
        ...(data.authUserId ? { auth_user_id: data.authUserId } : {}),
        address: data.address?.trim() || existing.address_in_kano,
        city_lga: data.cityLga || existing.city_lga,
        neighbourhood: data.neighbourhood ?? existing.neighbourhood ?? "",
        property_type: data.propertyType || existing.property_type || "Residential",
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateErr) {
      throw new Error(`Failed to update customer: ${updateErr.message}`);
    }
    return updated ? mapCustomerRow(updated) : existing;
  }

  const newId = crypto.randomUUID();
  const baseInsert = {
    id: newId,
    full_name: data.fullName.trim(),
    phone: cleanPhone,
    email: data.email?.trim() || null,
    password_hash: data.passwordHash || null,
    ...(data.authUserId ? { auth_user_id: data.authUserId } : {}),
    address: data.address?.trim() || "",
    city_lga: data.cityLga || "",
    neighbourhood: data.neighbourhood || "",
    property_type: data.propertyType || "Residential",
    created_at: nowIso,
    updated_at: nowIso,
  };
  let { data: inserted, error } = await supabase
    .from("customers")
    .insert(baseInsert)
    .select("*")
    .single();

  if (error && error.message.includes("area_in_kano")) {
    ({ data: inserted, error } = await supabase
      .from("customers")
      .insert({
        ...baseInsert,
        area_in_kano: data.cityLga || data.address?.trim() || "N/A",
      })
      .select("*")
      .single());
  }

  if (error || !inserted) {
    throw new Error(`Failed to register customer: ${error?.message || "Unknown error"}`);
  }
  return mapCustomerRow(inserted);
}

export async function updateCustomerProfile(
  customerId: string,
  updates: Partial<Pick<CustomerProfile, "full_name" | "email" | "address_in_kano" | "city_lga" | "neighbourhood" | "property_type">>
): Promise<CustomerProfile | null> {
  const supabase = getServiceSupabase();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.full_name !== undefined) payload.full_name = updates.full_name;
  if (updates.email !== undefined) payload.email = updates.email;
  if (updates.address_in_kano !== undefined) payload.address = updates.address_in_kano;
  if (updates.city_lga !== undefined) payload.city_lga = updates.city_lga;
  if (updates.neighbourhood !== undefined) payload.neighbourhood = updates.neighbourhood;
  if (updates.property_type !== undefined) payload.property_type = updates.property_type;

  const { data, error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", customerId)
    .select("*")
    .single();

  if (error || !data) return null;
  return mapCustomerRow(data);
}

export async function deleteCustomerById(customerId: string, actor = "Admin"): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("customers")
    .select("full_name, phone")
    .eq("id", customerId)
    .maybeSingle();

  const { error } = await supabase.from("customers").delete().eq("id", customerId);
  if (error) return false;

  await appendAuditLog({
    actor,
    action: "Deleted Customer Account",
    entity_type: "customer",
    entity_id: customerId,
    old_value: existing ? `${existing.full_name} (${existing.phone})` : customerId,
  });
  return true;
}

// ---------------------------------------------------------------------------
// PAYMENTS
// ---------------------------------------------------------------------------
export async function getAllPayments(): Promise<PaymentRecord[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []).map(mapPaymentRow);
}

export async function recordPayment(params: {
  requestId: string;
  ticketNumber: string;
  customerName: string;
  totalPayment: number;
  labourPortion: number;
  materialsPortion: number;
  companyCommission: number;
  plumberPayable: number;
  paymentMethod: "bank_transfer" | "cash" | "pos";
  transactionRef?: string;
  proofStoragePath?: string;
  notes?: string;
}): Promise<PaymentRecord> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const rowPayload = {
    id: `pay-${Date.now().toString(36)}`,
    request_id: params.requestId || null,
    ticket_number: params.ticketNumber,
    customer_name: params.customerName,
    total_payment: params.totalPayment,
    labour_portion: params.labourPortion,
    materials_portion: params.materialsPortion,
    company_commission: params.companyCommission,
    plumber_payable: params.plumberPayable,
    payment_method: params.paymentMethod,
    transaction_ref: params.transactionRef || null,
    proof_storage_path: params.proofStoragePath || null,
    verification_status: "pending",
    notes: params.notes || null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: inserted, error } = await supabase
    .from("payments")
    .insert(rowPayload)
    .select("*")
    .single();
  if (error || !inserted) {
    throw new Error(`Failed to record payment: ${error?.message || "Unknown error"}`);
  }
  await triggerWorkforceOnPaymentSubmitted({
    ticketNumber: params.ticketNumber,
    customerName: params.customerName || "Customer",
    amount: params.totalPayment,
  });

  return mapPaymentRow(inserted);
}

export async function verifyPaymentById(
  paymentId: string,
  status: "verified" | "rejected",
  actor = "Admin"
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("payments")
    .update({
      verification_status: status,
      verified_by: actor,
      verified_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", paymentId)
    .select("*")
    .single();

  if (error || !updated) return false;

  if (status === "verified" && updated.request_id) {
    const [{ data: quoteRow }, { data: verifiedRows }] = await Promise.all([
      supabase
        .from("quotations")
        .select("total_amount")
        .eq("ticket_number", updated.ticket_number)
        .eq("customer_approval_status", "approved")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("total_payment")
        .eq("ticket_number", updated.ticket_number)
        .eq("verification_status", "verified"),
    ]);

    const approvedTotal = Number(quoteRow?.total_amount) || 0;
    const verifiedPaidTotal = (verifiedRows || []).reduce(
      (sum, row) => sum + (Number(row.total_payment) || 0),
      0
    );
    const fullyPaid = approvedTotal > 0 ? verifiedPaidTotal + 0.01 >= approvedTotal : verifiedPaidTotal > 0;

    if (fullyPaid) {
      const { error: completeErr } = await supabase
        .from("service_requests")
        .update({ status: "completed", updated_at: nowIso })
        .eq("id", updated.request_id);
      if (completeErr) return false;
      await reconcileSharingForRequest(String(updated.request_id));
    }

    await appendRequestHistoryEntry(String(updated.request_id), {
      actor,
      action: fullyPaid ? "Verified Final Payment" : "Verified Partial Payment",
      details: `Confirmed ₦${Number(updated.total_payment).toLocaleString()} (${updated.payment_method})`,
    });
  }

  await appendAuditLog({
    actor,
    action: status === "verified" ? "Verified Payment" : "Rejected Payment",
    entity_type: "payment",
    entity_id: paymentId,
    new_value: `${status} (${updated.ticket_number})`,
  });

  if (updated.request_id) {
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id, assigned_plumber_id")
      .eq("id", updated.request_id)
      .maybeSingle();

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: "admin",
        type: status === "verified" ? "payment_verified" : "payment_rejected",
        title:
          status === "verified"
            ? `Payment Confirmed: ${updated.ticket_number}`
            : `Payment Needs Review: ${updated.ticket_number}`,
        body: `₦${Number(updated.total_payment).toLocaleString()} (${updated.payment_method}) was ${status}.`,
        entityType: "payment",
        entityId: paymentId,
        destination: `/customer?tab=payments&ticket=${updated.ticket_number}`,
      });
    }

    if (reqRow?.assigned_plumber_id && status === "verified") {
      await createNotification({
        recipientId: String(reqRow.assigned_plumber_id),
        recipientRole: "plumber",
        actorRole: "admin",
        type: "payment_verified",
        title: `Job Payment Verified: ${updated.ticket_number}`,
        body: `Customer payment of ₦${Number(updated.total_payment).toLocaleString()} has been verified.`,
        entityType: "payment",
        entityId: paymentId,
        destination: `/plumber?tab=earnings&ticket=${updated.ticket_number}`,
      });
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// MESSAGES & REALTIME PRESENCE
// ---------------------------------------------------------------------------
export async function getMessagesForRequest(
  requestIdOrTicket: string,
  includeInternal = true
): Promise<JobMessage[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const cleanKey = requestIdOrTicket.trim();
  let query = supabase.from("messages").select("*");
  query = isUuid(cleanKey)
    ? query.or(`request_id.eq.${cleanKey},ticket_number.eq.${cleanKey}`)
    : query.eq("ticket_number", cleanKey);
  query = query.order("created_at", { ascending: true });
  if (!includeInternal) {
    query = query.eq("is_internal", false);
  }
  const { data } = await query;
  return (data || []).map(mapMessageRow);
}

export async function getAllMessages(): Promise<JobMessage[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true });
  return (data || []).map(mapMessageRow);
}

export async function postJobMessage(params: {
  requestId: string;
  ticketNumber: string;
  senderRole: "customer" | "plumber" | "admin";
  senderName: string;
  senderId?: string | null;
  recipientRole: "customer" | "plumber" | "admin";
  recipientId?: string | null;
  recipients?: { recipientId: string; recipientRole: "customer" | "plumber" | "admin" }[];
  message: string;
  attachment?: ChatAttachment;
  isInternal?: boolean;
  replyToId?: string | null;
}): Promise<JobMessage> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const isFromAdmin = params.senderRole === "admin";

  // Always resolve the canonical UUID request_id from service_requests
  let resolvedRequestId: string | null = null;
  let reqCustomerId: string | null = null;
  let reqPlumberId: string | null = null;

  if (params.ticketNumber || params.requestId) {
    const lookupKey = (params.ticketNumber || params.requestId).trim();
    const reqLookup = supabase
      .from("service_requests")
      .select("id, customer_id, assigned_plumber_id");
    const { data: reqRow } = await (
      isUuid(lookupKey)
        ? reqLookup.or(`ticket_number.eq.${lookupKey},id.eq.${lookupKey}`)
        : reqLookup.eq("ticket_number", lookupKey)
    ).maybeSingle();
    if (reqRow) {
      resolvedRequestId = String(reqRow.id);
      reqCustomerId = reqRow.customer_id ? String(reqRow.customer_id) : null;
      reqPlumberId = reqRow.assigned_plumber_id ? String(reqRow.assigned_plumber_id) : null;
    }
  }

  const msgId = `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const payload = {
    id: msgId,
    request_id: resolvedRequestId || null,
    ticket_number: params.ticketNumber,
    sender_role: params.senderRole,
    sender_name: params.senderName,
    sender_id: params.senderId || null,
    recipient_role: params.recipientRole,
    recipient_id: params.recipientId || null,
    message: params.message,
    attachment: params.attachment || null,
    is_internal: Boolean(params.isInternal),
    admin_read: isFromAdmin,
    read_by: [params.senderRole],
    reply_to_id: params.replyToId || null,
    created_at: nowIso,
  };

  let { data: inserted, error } = await supabase
    .from("messages")
    .insert(payload)
    .select("*")
    .single();
  if (
    error &&
    (error.message.includes("reply_to_id") ||
      error.message.includes("sender_id") ||
      error.message.includes("recipient_id"))
  ) {
    const fallbackPayload = { ...payload } as Record<string, unknown>;
    delete fallbackPayload.reply_to_id;
    delete fallbackPayload.sender_id;
    delete fallbackPayload.recipient_id;
    ({ data: inserted, error } = await supabase
      .from("messages")
      .insert(fallbackPayload)
      .select("*")
      .single());
  }
  if (error || !inserted) {
    throw new Error(`Failed to send message: ${error?.message || "Unknown error"}`);
  }

  // Insert per-recipient receipt rows (delivered_at = null, read_at = null)
  const recipientTargets =
    params.recipients && params.recipients.length > 0
      ? params.recipients
      : (() => {
          const list: { recipientId: string; recipientRole: "admin" | "customer" | "plumber" }[] = [];
          if (params.senderRole !== "admin") {
            list.push({ recipientId: "admin", recipientRole: "admin" });
          }
          if (!params.isInternal && params.senderRole !== "customer" && reqCustomerId) {
            list.push({ recipientId: reqCustomerId, recipientRole: "customer" });
          }
          if (params.senderRole !== "plumber" && reqPlumberId) {
            list.push({ recipientId: reqPlumberId, recipientRole: "plumber" });
          }
          return list;
        })();

  if (recipientTargets.length > 0) {
    try {
      const receiptRows = recipientTargets.map((r) => ({
        id: `rcpt-${crypto.randomUUID()}`,
        message_id: msgId,
        recipient_id: r.recipientId,
        recipient_role: r.recipientRole,
        delivered_at: null,
        read_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      }));
      await supabase.from("message_receipts").insert(receiptRows);
    } catch {
      // Ignore if message_receipts table is not yet migrated
    }
  }

  if (params.ticketNumber) {
    const exactMessageId = String(inserted.id);
    const encodedTicket = encodeURIComponent(params.ticketNumber);
    const encodedMessageId = encodeURIComponent(exactMessageId);
    const preview = params.message?.trim()
      ? params.message.trim().slice(0, 90)
      : "Sent an attachment";

    const notifiedKeys = new Set<string>();
    for (const target of recipientTargets) {
      if (target.recipientRole === params.senderRole) continue;
      if (params.isInternal && target.recipientRole === "customer") continue;

      const key = `${target.recipientRole}:${target.recipientId}`;
      if (notifiedKeys.has(key)) continue;
      notifiedKeys.add(key);

      if (target.recipientRole === "admin") {
        await createNotification({
          recipientId: "admin",
          recipientRole: "admin",
          actorRole: params.senderRole,
          actorId: params.senderId || undefined,
          type: "new_message",
          title: `Message on ${params.ticketNumber}`,
          body: `${params.senderName}: ${preview}`,
          entityType: "message",
          entityId: exactMessageId,
          destination: `/admin/communications?ticket=${encodedTicket}&message=${encodedMessageId}`,
        });
      } else if (target.recipientRole === "customer" && target.recipientId) {
        await createNotification({
          recipientId: String(target.recipientId),
          recipientRole: "customer",
          actorRole: params.senderRole,
          actorId: params.senderId || undefined,
          type: "new_message",
          title: `New Message: ${params.ticketNumber}`,
          body: `${params.senderName}: ${preview}`,
          entityType: "message",
          entityId: exactMessageId,
          destination: `/customer?tab=messages&ticket=${encodedTicket}&message=${encodedMessageId}`,
        });
      } else if (target.recipientRole === "plumber" && target.recipientId) {
        await createNotification({
          recipientId: String(target.recipientId),
          recipientRole: "plumber",
          actorRole: params.senderRole,
          actorId: params.senderId || undefined,
          type: "new_message",
          title: `New Message: ${params.ticketNumber}`,
          body: `${params.senderName}: ${preview}`,
          entityType: "message",
          entityId: exactMessageId,
          destination: `/plumber?tab=messages&ticket=${encodedTicket}&message=${encodedMessageId}`,
        });
      }
    }
  }

  return mapMessageRow(inserted);
}

export function countUnrepliedMessagesForAdmin(messages: JobMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (m.sender_role === "admin") continue;
    const isReadByAdmin =
      m.admin_read === true ||
      (Array.isArray(m.read_by) && m.read_by.includes("admin"));
    if (!isReadByAdmin) {
      total += 1;
    }
  }
  return total;
}

export async function updateChatPresence(
  role: "admin" | "plumber" | "customer",
  id?: string
): Promise<void> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "chat_presence")
    .maybeSingle();

  const current = (data?.value as Record<string, string>) || {};
  const nowIso = new Date().toISOString();
  current[role] = nowIso;
  if (id) current[`${role}:${id}`] = nowIso;

  await supabase.from("settings").upsert(
    {
      key: "chat_presence",
      value: current,
      description: "Live chat presence heartbeats",
      updated_at: nowIso,
    },
    { onConflict: "key" }
  );
}

export async function getChatPresenceStatus(): Promise<{
  adminOnline: boolean;
  plumberOnline: boolean;
  customerOnline: boolean;
  onlinePlumberIds: string[];
  onlineCustomerIds: string[];
  lastSeenMap?: Record<string, string>;
}> {
  if (isBuildPhase()) {
    return {
      adminOnline: false,
      plumberOnline: false,
      customerOnline: false,
      onlinePlumberIds: [],
      onlineCustomerIds: [],
      lastSeenMap: {},
    };
  }
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "chat_presence")
    .maybeSingle();

  const presence = (data?.value as Record<string, string>) || {};
  const now = Date.now();
  const isFresh = (iso?: string) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && now - t < 45_000;
  };

  const onlinePlumberIds: string[] = [];
  const onlineCustomerIds: string[] = [];
  for (const [k, v] of Object.entries(presence)) {
    if (k.startsWith("plumber:") && isFresh(v)) {
      onlinePlumberIds.push(k.replace("plumber:", ""));
    }
    if (k.startsWith("customer:") && isFresh(v)) {
      onlineCustomerIds.push(k.replace("customer:", ""));
    }
  }

  return {
    adminOnline: isFresh(presence.admin),
    plumberOnline: isFresh(presence.plumber) || onlinePlumberIds.length > 0,
    customerOnline: isFresh(presence.customer) || onlineCustomerIds.length > 0,
    onlinePlumberIds,
    onlineCustomerIds,
    lastSeenMap: presence,
  };
}

export async function clearChatPresence(
  role: "admin" | "plumber" | "customer",
  id?: string
): Promise<void> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "chat_presence")
    .maybeSingle();

  const current = (data?.value as Record<string, string>) || {};
  const expiredIso = new Date(Date.now() - 120_000).toISOString();
  current[role] = expiredIso;
  if (id) current[`${role}:${id}`] = expiredIso;

  await supabase.from("settings").upsert(
    {
      key: "chat_presence",
      value: current,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

export async function acknowledgeMessageDeliveryForActor(params: {
  actorId: string;
  actorRole: "admin" | "customer" | "plumber";
  ticketNumber?: string;
}): Promise<number> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const recipientId = params.actorRole === "admin" ? "admin" : params.actorId;
  let updated = 0;

  try {
    let query = supabase
      .from("message_receipts")
      .select("id, message_id")
      .eq("recipient_role", params.actorRole)
      .eq("recipient_id", recipientId)
      .is("delivered_at", null);

    if (params.ticketNumber) {
      const { data: ticketMsgs } = await supabase
        .from("messages")
        .select("id")
        .eq("ticket_number", params.ticketNumber);
      const ids = (ticketMsgs || []).map((m) => String(m.id));
      if (ids.length === 0) return 0;
      query = query.in("message_id", ids);
    }

    const { data: pendingReceipts } = await query;
    if (pendingReceipts && pendingReceipts.length > 0) {
      const receiptIds = pendingReceipts.map((r) => r.id);
      await supabase
        .from("message_receipts")
        .update({ delivered_at: nowIso, updated_at: nowIso })
        .in("id", receiptIds);
      updated = receiptIds.length;
    }
  } catch {
    // Fallback if message_receipts not yet migrated
  }

  // Also stamp legacy messages.delivered_at if null for incoming messages
  if (params.ticketNumber) {
    await supabase
      .from("messages")
      .update({ delivered_at: nowIso })
      .eq("ticket_number", params.ticketNumber)
      .neq("sender_role", params.actorRole)
      .is("delivered_at", null);
  }

  return updated;
}

export async function markTicketMessagesReadForActor(params: {
  actorId: string;
  actorRole: "admin" | "customer" | "plumber";
  ticketNumber: string;
  peerRole?: "admin" | "customer" | "plumber";
}): Promise<number> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const recipientId = params.actorRole === "admin" ? "admin" : params.actorId;
  let updated = 0;

  const { data: rows } = await supabase
    .from("messages")
    .select("id, sender_role, is_internal, read_by, admin_read, delivered_at")
    .eq("ticket_number", params.ticketNumber);

  const eligibleRows = (rows || []).filter((m) => {
    if (params.actorRole === "customer" && m.is_internal) return false;
    if (m.sender_role === params.actorRole) return false;
    if (params.peerRole && m.sender_role !== params.peerRole) return false;
    return true;
  });

  const eligibleIds = eligibleRows.map((m) => String(m.id));
  if (eligibleIds.length === 0) return 0;

  // 1. Batch-update per-recipient receipts in message_receipts
  try {
    const { data: unreadReceipts } = await supabase
      .from("message_receipts")
      .select("id, delivered_at")
      .in("message_id", eligibleIds)
      .eq("recipient_role", params.actorRole)
      .eq("recipient_id", recipientId)
      .is("read_at", null);

    if (unreadReceipts && unreadReceipts.length > 0) {
      const undeliveredIds = unreadReceipts
        .filter((r) => !r.delivered_at)
        .map((r) => String(r.id));
      const alreadyDeliveredIds = unreadReceipts
        .filter((r) => Boolean(r.delivered_at))
        .map((r) => String(r.id));

      if (undeliveredIds.length > 0) {
        await supabase
          .from("message_receipts")
          .update({ read_at: nowIso, delivered_at: nowIso, updated_at: nowIso })
          .in("id", undeliveredIds);
      }
      if (alreadyDeliveredIds.length > 0) {
        await supabase
          .from("message_receipts")
          .update({ read_at: nowIso, updated_at: nowIso })
          .in("id", alreadyDeliveredIds);
      }
      updated += unreadReceipts.length;
    }
  } catch {
    // Fallback to legacy messages table below
  }

  // 2. Keep legacy messages.read_by / admin_read synced for this viewerRole only
  const updatePromises: PromiseLike<unknown>[] = [];
  for (const m of eligibleRows) {
    const readBy: string[] = Array.isArray(m.read_by) ? [...m.read_by] : [];
    const needsAdminRead = params.actorRole === "admin" && m.admin_read === false;
    if (!readBy.includes(params.actorRole) || needsAdminRead) {
      if (!readBy.includes(params.actorRole)) readBy.push(params.actorRole);
      updatePromises.push(
        supabase
          .from("messages")
          .update({
            read_by: readBy,
            read_at: nowIso,
            delivered_at: m.delivered_at || nowIso,
            ...(params.actorRole === "admin" ? { admin_read: true } : {}),
          })
          .eq("id", m.id)
      );
      if (updated === 0) updated += 1;
    }
  }
  if (updatePromises.length > 0) {
    await Promise.all(updatePromises);
  }

  return updated;
}

export async function getMessagesForAuthorizedTicket(params: {
  ticketNumber: string;
  actorId: string;
  actorRole: "admin" | "customer" | "plumber";
}): Promise<JobMessage[]> {
  const supabase = getServiceSupabase();
  let query = supabase
    .from("messages")
    .select("*")
    .eq("ticket_number", params.ticketNumber)
    .order("created_at", { ascending: true });

  if (params.actorRole === "customer") {
    query = query.eq("is_internal", false);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  const msgIds = rows.map((r) => String(r.id));
  const receiptsByMsg = new Map<
    string,
    { recipient_id: string; recipient_role: string; delivered_at: string | null; read_at: string | null }[]
  >();

  try {
    const { data: receiptRows } = await supabase
      .from("message_receipts")
      .select("message_id, recipient_id, recipient_role, delivered_at, read_at")
      .in("message_id", msgIds);

    for (const rr of receiptRows || []) {
      const k = String(rr.message_id);
      const list = receiptsByMsg.get(k) || [];
      list.push({
        recipient_id: String(rr.recipient_id),
        recipient_role: String(rr.recipient_role),
        delivered_at: rr.delivered_at ? String(rr.delivered_at) : null,
        read_at: rr.read_at ? String(rr.read_at) : null,
      });
      receiptsByMsg.set(k, list);
    }
  } catch {
    // Ignore if message_receipts not yet migrated
  }

  return rows
    .filter((r) => !(Array.isArray(r.deleted_by_ids) && r.deleted_by_ids.includes(params.actorId)))
    .map((r) => {
      const mapped = mapMessageRow(r);
      const rcpts = receiptsByMsg.get(mapped.id);
      if (rcpts && rcpts.length > 0) {
        // For outgoing messages, compute status strictly from intended recipients' receipts
        if (mapped.sender_role === params.actorRole) {
          const relevant = rcpts.filter((x) => x.recipient_role !== params.actorRole);
          if (relevant.some((x) => Boolean(x.read_at))) {
            mapped.receipt_status = "read";
            mapped.read_at = relevant.find((x) => x.read_at)?.read_at || mapped.read_at;
          } else if (relevant.some((x) => Boolean(x.delivered_at))) {
            mapped.receipt_status = "delivered";
            mapped.delivered_at = relevant.find((x) => x.delivered_at)?.delivered_at || mapped.delivered_at;
          } else {
            mapped.receipt_status = "sent";
          }
        } else {
          // For incoming messages, attach THIS actor's own read_at/delivered_at
          const myRcpt = rcpts.find(
            (x) =>
              x.recipient_role === params.actorRole &&
              (params.actorRole === "admin" || x.recipient_id === params.actorId)
          );
          if (myRcpt) {
            mapped.delivered_at = myRcpt.delivered_at;
            mapped.read_at = myRcpt.read_at;
          }
        }
      } else {
        // Legacy fallback when message_receipts row doesn't exist
        const readBy = mapped.read_by || [];
        const otherRead = readBy.some((role) => role !== mapped.sender_role);
        if (mapped.read_at || otherRead) mapped.receipt_status = "read";
        else if (mapped.delivered_at) mapped.receipt_status = "delivered";
        else mapped.receipt_status = "sent";
      }
      return mapped;
    });
}

export async function editJobMessageById(params: {
  messageId: string;
  actorId: string;
  actorRole: "admin" | "customer" | "plumber";
  newMessage: string;
}): Promise<JobMessage | null> {
  const supabase = getServiceSupabase();
  const { data: msg } = await supabase
    .from("messages")
    .select("*")
    .eq("id", params.messageId)
    .maybeSingle();
  if (!msg || msg.deleted_for_everyone) return null;

  const ownsMessage =
    msg.sender_id
      ? String(msg.sender_id) === params.actorId && msg.sender_role === params.actorRole
      : msg.sender_role === params.actorRole;

  if (!ownsMessage && params.actorRole !== "admin") return null;

  const nowIso = new Date().toISOString();
  let { data: updated, error } = await supabase
    .from("messages")
    .update({ message: params.newMessage.trim(), edited_at: nowIso })
    .eq("id", params.messageId)
    .select("*")
    .single();
  if (error && error.message.includes("edited_at")) {
    ({ data: updated, error } = await supabase
      .from("messages")
      .update({ message: params.newMessage.trim() })
      .eq("id", params.messageId)
      .select("*")
      .single());
  }
  if (error || !updated) return null;
  return mapMessageRow(updated);
}

export async function markTicketMessagesRead(
  ticketNumber: string,
  viewerRole: "admin" | "plumber" | "customer"
): Promise<number> {
  const supabase = getServiceSupabase();
  const { data: rows } = await supabase
    .from("messages")
    .select("id, sender_role, read_by, admin_read")
    .eq("ticket_number", ticketNumber);

  if (!rows) return 0;
  let updated = 0;

  for (const m of rows) {
    if (m.sender_role === viewerRole) continue;
    const readBy: string[] = Array.isArray(m.read_by) ? [...m.read_by] : [];
    const needsAdminRead = viewerRole === "admin" && m.admin_read === false;
    if (!readBy.includes(viewerRole) || needsAdminRead) {
      if (!readBy.includes(viewerRole)) readBy.push(viewerRole);
      await supabase
        .from("messages")
        .update({
          read_by: readBy,
          read_at: new Date().toISOString(),
          ...(viewerRole === "admin" ? { admin_read: true } : {}),
        })
        .eq("id", m.id);
      updated += 1;
    }
  }

  return updated;
}

export async function markTicketMessagesDelivered(
  ticketNumber: string,
  viewerRole: "admin" | "plumber" | "customer"
): Promise<number> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("messages")
    .update({ delivered_at: nowIso })
    .eq("ticket_number", ticketNumber)
    .neq("sender_role", viewerRole)
    .is("delivered_at", null)
    .select("id");
  return data?.length || 0;
}

export async function deleteJobMessageById(params: {
  messageId: string;
  actorId: string;
  actorRole: "admin" | "customer" | "plumber";
  mode: "for_me" | "for_everyone";
}): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data: msg } = await supabase
    .from("messages")
    .select("*")
    .eq("id", params.messageId)
    .maybeSingle();
  if (!msg) return false;

  if (params.mode === "for_everyone") {
    if (msg.sender_role !== params.actorRole && params.actorRole !== "admin") {
      return false;
    }
    const { error } = await supabase
      .from("messages")
      .update({
        deleted_for_everyone: true,
        message: "This message was deleted",
        attachment: null,
      })
      .eq("id", params.messageId);
    if (error && error.message.includes("deleted_for_everyone")) {
      await supabase
        .from("messages")
        .update({
          message: "This message was deleted",
          attachment: null,
        })
        .eq("id", params.messageId);
    }
    return true;
  }

  const deletedBy: string[] = Array.isArray(msg.deleted_by_ids) ? [...msg.deleted_by_ids] : [];
  if (!deletedBy.includes(params.actorId)) {
    deletedBy.push(params.actorId);
    const { error } = await supabase
      .from("messages")
      .update({ deleted_by_ids: deletedBy })
      .eq("id", params.messageId);
    if (error && error.message.includes("deleted_by_ids")) {
      await supabase.from("messages").delete().eq("id", params.messageId);
    }
  }
  return true;
}

export async function markAllAdminCommunicationsRead(): Promise<number> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("messages")
    .update({ admin_read: true })
    .eq("admin_read", false)
    .neq("sender_role", "admin")
    .select("id");
  return data?.length || 0;
}

// ---------------------------------------------------------------------------
// SETTINGS
// ---------------------------------------------------------------------------
export async function getMarketplaceSettings(): Promise<MarketplaceSettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");
  if (isBuildPhase()) return DEFAULT_SETTINGS;
  try {
    const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? getServiceSupabase()
      : getPublicReadClient();
    const [{ data: settingRow }, categories, areas] = await Promise.all([
      supabase
        .from("settings")
        .select("value")
        .eq("key", "marketplace_settings")
        .maybeSingle(),
      getServiceCategories(false),
      getServiceAreas(false),
    ]);

    const stored = (settingRow?.value as Partial<MarketplaceSettings>) || {};
    const merged: MarketplaceSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      service_categories: categories.length > 0 ? categories : stored.service_categories || [],
      coverage_areas: areas.length > 0 ? areas : stored.coverage_areas || DEFAULT_COVERAGE_AREAS,
      active_coverage_locations:
        areas.length > 0
          ? areas.filter((a) => a.active).map((a) => a.area)
          : stored.active_coverage_locations || DEFAULT_SETTINGS.active_coverage_locations,
    };

    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function updateMarketplaceSettings(
  settings: Partial<MarketplaceSettings>,
  actor = "Admin"
): Promise<MarketplaceSettings> {
  const supabase = getServiceSupabase();
  const oldSettings = await getMarketplaceSettings();
  const nextSettings: MarketplaceSettings = {
    ...oldSettings,
    ...settings,
  };

  if (nextSettings.coverage_areas && nextSettings.coverage_areas.length > 0) {
    nextSettings.active_coverage_locations = nextSettings.coverage_areas
      .filter((a) => a.active)
      .map((a) => a.area);
  }

  const nowIso = new Date().toISOString();
  await supabase.from("settings").upsert(
    {
      key: "marketplace_settings",
      value: nextSettings,
      description: "Global marketplace and business settings",
      updated_at: nowIso,
    },
    { onConflict: "key" }
  );

  // Sync coverage_areas into service_areas table when updated
  if (settings.coverage_areas && settings.coverage_areas.length > 0) {
    const areaRows = settings.coverage_areas
      .filter((a) => a.area?.trim())
      .map((a) => ({
        id: a.id || `area-${toSlug(a.area)}`,
        slug: a.slug || toSlug(a.area),
        name: a.area.trim(),
        state: a.state || nextSettings.default_state || "",
        city: a.city || nextSettings.default_city || "",
        is_active: Boolean(a.active),
        updated_at: nowIso,
      }));
    if (areaRows.length > 0) {
      await supabase.from("service_areas").upsert(areaRows, { onConflict: "slug" });
    }
  }

  // Sync service_categories into service_categories table when updated
  if (settings.service_categories && settings.service_categories.length > 0) {
    const catRows = settings.service_categories
      .filter((c) => (c.name || c.title)?.trim())
      .map((c, idx) => {
        const catName = (c.name || c.title || "").trim();
        return {
          id: c.id || `cat-${toSlug(catName)}`,
          slug: c.slug || toSlug(catName),
          name: catName,
          short_description: c.short_description || c.description || "",
          long_description: c.description || c.short_description || "",
          common_problems: c.common_problems || [],
          quotation_notes: c.quotation_notes || "",
          faqs: c.faqs || [],
          related_slugs: c.related_slugs || [],
          icon_name: c.icon_name || "Wrench",
          sort_order: c.sort_order ?? c.order ?? idx + 1,
          is_active: Boolean(c.active ?? c.visible ?? true),
          is_published: Boolean(c.published),
          updated_at: nowIso,
        };
      });
    if (catRows.length > 0) {
      await supabase.from("service_categories").upsert(catRows, { onConflict: "slug" });
      const activeSlugs = catRows.map((r) => r.slug);
      const { data: existingRows } = await supabase
        .from("service_categories")
        .select("slug");
      const removedSlugs = (existingRows || [])
        .map((r) => String(r.slug))
        .filter((s) => !activeSlugs.includes(s));
      if (removedSlugs.length > 0) {
        await supabase.from("service_categories").delete().in("slug", removedSlugs);
      }
    }
  }

  await appendAuditLog({
    actor,
    action: "Updated Marketplace Settings",
    entity_type: "settings",
    entity_id: "global",
    old_value: JSON.stringify({
      commission_default_rate: oldSettings.commission_default_rate,
      company_email: oldSettings.company_email,
      company_phone: oldSettings.company_phone,
    }),
    new_value: JSON.stringify({
      commission_default_rate: nextSettings.commission_default_rate,
      company_email: nextSettings.company_email,
      company_phone: nextSettings.company_phone,
    }),
  });

  try {
    revalidateTag("settings", { expire: 0 });
  } catch {
    // Non-Next test contexts do not have an active incremental cache store.
  }

  return nextSettings;
}

// ---------------------------------------------------------------------------
// AUDIT LOGS
// ---------------------------------------------------------------------------
export async function getAllAuditLogs(): Promise<AuditLogEntry[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return (data || []).map((a) => ({
    id: String(a.id),
    timestamp: String(a.created_at),
    actor: String(a.actor || "System"),
    action: String(a.action || ""),
    entity_type: String(a.entity_type || ""),
    entity_id: String(a.entity_id || ""),
    old_value: a.old_value ? String(a.old_value) : undefined,
    new_value: a.new_value ? String(a.new_value) : undefined,
  }));
}

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, "id" | "timestamp">
): Promise<AuditLogEntry> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const id = `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  await supabase.from("audit_log").insert({
    id,
    actor: entry.actor,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    old_value: entry.old_value || null,
    new_value: entry.new_value || null,
    created_at: nowIso,
  });
  return { id, timestamp: nowIso, ...entry };
}

// ---------------------------------------------------------------------------
// COMPLAINTS & FEEDBACK
// ---------------------------------------------------------------------------
export async function getAllComplaints(): Promise<ComplaintRecord[]> {
  if (isBuildPhase()) return [];
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("complaints")
    .select("*")
    .order("created_at", { ascending: false });
  return (data || []).map((c) => ({
    id: String(c.id),
    ticket_number: String(c.ticket_number || ""),
    customer_name: String(c.customer_name),
    customer_phone: String(c.customer_phone || ""),
    subject: String(c.subject),
    category: String(c.subject),
    description: String(c.description),
    message: String(c.description),
    status: (c.status as ComplaintRecord["status"]) || "new",
    admin_note: c.admin_note ? String(c.admin_note) : undefined,
    created_at: String(c.created_at),
    updated_at: c.updated_at ? String(c.updated_at) : undefined,
  }));
}

export async function createComplaint(
  data: Omit<ComplaintRecord, "id" | "status" | "created_at" | "subject" | "description"> & {
    subject?: string;
    description?: string;
  }
): Promise<ComplaintRecord> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const id = `cmp-${Date.now().toString(36)}`;
  const subj = data.subject || data.category || "General";
  const desc = data.description || data.message || "";
  const payload = {
    id,
    ticket_number: data.ticket_number || "",
    customer_name: data.customer_name,
    customer_phone: data.customer_phone || "",
    subject: subj,
    description: desc,
    status: "new" as const,
    admin_note: data.admin_note || null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const { error: complaintErr } = await supabase.from("complaints").insert(payload);
  if (complaintErr) {
    throw new Error(`Failed to save complaint: ${complaintErr.message}`);
  }
  await triggerWorkforceOnComplaint({
    complaintId: id,
    ticketNumber: payload.ticket_number,
    customerName: payload.customer_name,
    message: desc,
  });

  return {
    id,
    ticket_number: payload.ticket_number,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    plumber_name: data.plumber_name,
    rating: data.rating,
    subject: subj,
    category: subj,
    description: desc,
    message: desc,
    status: "new",
    admin_note: payload.admin_note || undefined,
    created_at: nowIso,
  };
}

export async function updateComplaintStatus(
  id: string,
  status: ComplaintRecord["status"],
  adminNote?: string,
  actor = "Admin"
): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { data: existing } = await supabase
    .from("complaints")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return false;

  const { error } = await supabase
    .from("complaints")
    .update({
      status,
      ...(adminNote !== undefined ? { admin_note: adminNote } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return false;

  await appendAuditLog({
    actor,
    action: "Updated Complaint/Feedback Status",
    entity_type: "complaint",
    entity_id: id,
    old_value: String(existing.status),
    new_value: status,
  });
  return true;
}

// ---------------------------------------------------------------------------
// GALLERY CMS
// ---------------------------------------------------------------------------
export async function getAllGalleryItems(onlyPublished = false): Promise<GalleryItemRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("gallery");
  if (isBuildPhase()) return [];
  try {
    const supabase = getServiceSupabase();
    let query = supabase
      .from("gallery_items")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (onlyPublished) query = query.eq("published", true);
    const { data } = await query;
    return (data || []).map((g) => ({
      id: String(g.id),
      title: String(g.title),
      category: String(g.category || "General Plumbing"),
      service_category: String(g.category || "General Plumbing"),
      location: g.location ? String(g.location) : undefined,
      caption: String(g.caption || ""),
      image_url: String(g.image_url),
      alt_text: g.alt_text ? String(g.alt_text) : undefined,
      service_slug: g.service_slug ? String(g.service_slug) : undefined,
      area_slug: g.area_slug ? String(g.area_slug) : undefined,
      published: Boolean(g.published),
      created_at: String(g.created_at),
    }));
  } catch {
    if (process.env.NODE_ENV === "production") throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in production.");
    return [];
  }
}

export async function addGalleryItem(
  data: Omit<GalleryItemRecord, "id" | "created_at">
): Promise<GalleryItemRecord> {
  const supabase = getServiceSupabase();
  const nowIso = new Date().toISOString();
  const id = `gal-${Date.now().toString(36)}`;
  const payload = {
    id,
    title: data.title,
    category: data.category,
    location: data.location || "",
    caption: data.caption || "",
    image_url: data.image_url,
    alt_text: data.alt_text || data.title,
    service_slug: data.service_slug || null,
    area_slug: data.area_slug || null,
    published: Boolean(data.published),
    created_at: nowIso,
    updated_at: nowIso,
  };
  const { error } = await supabase.from("gallery_items").insert(payload);
  if (error) {
    throw new Error(`Failed to save gallery item: ${error.message}`);
  }
  return { ...data, id, created_at: nowIso };
}

export async function toggleGalleryPublish(id: string, published: boolean): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("gallery_items")
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteGalleryItem(id: string): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("gallery_items").delete().eq("id", id);
  return !error;
}

// ---------------------------------------------------------------------------
// ENQUIRIES HELPERS
// ---------------------------------------------------------------------------
export async function getEnquiryNotesMap(): Promise<
  Record<string, { status: "new" | "contacted" | "closed"; note: string }>
> {
  if (isBuildPhase()) return {};
  const supabase = getServiceSupabase();
  const { data } = await supabase.from("enquiries").select("id, status, admin_note");
  const result: Record<string, { status: "new" | "contacted" | "closed"; note: string }> = {};
  for (const row of data || []) {
    result[String(row.id)] = {
      status: (row.status === "unread" ? "new" : row.status) as "new" | "contacted" | "closed",
      note: String(row.admin_note || ""),
    };
  }
  return result;
}

export async function saveEnquiryNoteAndStatus(
  id: string,
  status: "new" | "contacted" | "closed",
  note: string,
  actor = "Admin"
): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("enquiries")
    .update({
      status,
      admin_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await appendAuditLog({
    actor,
    action: "Updated Enquiry Status/Note",
    entity_type: "enquiry",
    entity_id: id,
    new_value: `${status}${note ? `: ${note.slice(0, 60)}` : ""}`,
  });
}


export interface ReviewRecord {
  id: string;
  ticket_number: string;
  customer_name: string;
  area: string;
  service_category: string;
  rating: number;
  comment: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export async function getReviews(statusFilter?: "pending" | "approved" | "rejected"): Promise<ReviewRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("reviews");
  if (isBuildPhase()) return [];
  try {
    const supabase = getServiceSupabase();
    let q = supabase.from("reviews").select("*").order("created_at", { ascending: false });
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) return [];
    return (data || []) as ReviewRecord[];
  } catch {
    return [];
  }
}

export async function getApprovedReviews(): Promise<ReviewRecord[]> {
  return getReviews("approved");
}

export async function submitReview(input: {
  ticketNumber: string;
  customerName: string;
  area?: string;
  serviceCategory?: string;
  rating: number;
  comment: string;
}): Promise<ReviewRecord | null> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const id = `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const row: ReviewRecord = {
    id,
    ticket_number: input.ticketNumber.trim().toUpperCase(),
    customer_name: input.customerName.trim(),
    area: (input.area || "").trim(),
    service_category: (input.serviceCategory || "").trim(),
    rating: Math.max(1, Math.min(5, Math.round(input.rating))),
    comment: input.comment.trim(),
    status: "pending",
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from("reviews").insert(row).select("*").single();
  if (error) return null;
  return data as ReviewRecord;
}

export async function moderateReview(
  id: string,
  status: "approved" | "rejected",
  actor = "Admin"
): Promise<void> {
  const supabase = getServiceSupabase();
  await supabase
    .from("reviews")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  await appendAuditLog({
    actor,
    action: "Moderated Review",
    entity_type: "review",
    entity_id: id,
    new_value: status,
  });
}

export type GuideArticleStatus = "draft" | "review" | "published";
export type BlogLanguage = "en" | "ha";

export interface GuideRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: GuideArticleStatus;
  needs_owner_review: boolean;
  created_at: string;
  updated_at: string;
  // Bilingual English fields
  en_title: string;
  en_slug: string;
  en_summary: string;
  en_content: string;
  en_seo_title: string;
  en_meta_description: string;
  en_image_alt: string;
  en_status: GuideArticleStatus;
  // Bilingual Hausa fields
  ha_title: string;
  ha_slug: string;
  ha_summary: string;
  ha_content: string;
  ha_seo_title: string;
  ha_meta_description: string;
  ha_image_alt: string;
  ha_status: GuideArticleStatus;
  // Shared editorial & SEO metadata
  featured_image: string;
  image_attribution: string;
  target_service_slug: string;
  main_keyword: string;
  supporting_keywords: string[];
  author_name: string;
  published_at: string | null;
}

function normalizeGuideStatus(val: unknown): GuideArticleStatus {
  if (val === "published" || val === "review") return val;
  return "draft";
}

function normalizeGuideRecord(raw: Record<string, unknown>): GuideRecord {
  const legacySlug = String(raw.slug || "");
  const starterMatch = legacySlug
    ? BILINGUAL_BLOG_STARTER_ARTICLES.find(
        (s) => s.slug === legacySlug || s.en_slug === legacySlug
      )
    : undefined;
  const hasBilingualCols = raw.en_title !== undefined || raw.ha_title !== undefined;

  const legacyTitle = String(raw.title || "");
  const legacySummary = String(raw.summary || "");
  const legacyContent = String(raw.content || "");
  const legacyStatus = normalizeGuideStatus(raw.status);

  const enTitle = String(raw.en_title || "") || starterMatch?.en_title || legacyTitle;
  const enSlug = String(raw.en_slug || "") || starterMatch?.en_slug || legacySlug;
  const enSummary = String(raw.en_summary || "") || starterMatch?.en_summary || legacySummary;
  const enContent = String(raw.en_content || "") || starterMatch?.en_content || legacyContent;
  const enStatus = raw.en_status
    ? normalizeGuideStatus(raw.en_status)
    : legacyStatus;

  const haTitle = String(raw.ha_title || "") || (!hasBilingualCols ? starterMatch?.ha_title || "" : "");
  const haSlug = String(raw.ha_slug || "") || (!hasBilingualCols ? starterMatch?.ha_slug || "" : "");
  const haSummary = String(raw.ha_summary || "") || (!hasBilingualCols ? starterMatch?.ha_summary || "" : "");
  const haContent = String(raw.ha_content || "") || (!hasBilingualCols ? starterMatch?.ha_content || "" : "");
  const haStatus = raw.ha_status
    ? normalizeGuideStatus(raw.ha_status)
    : !hasBilingualCols && starterMatch?.ha_slug
    ? legacyStatus
    : "draft";

  return {
    id: String(raw.id || ""),
    slug: legacySlug || enSlug || haSlug,
    title: legacyTitle || enTitle || haTitle,
    summary: legacySummary || enSummary,
    content: legacyContent || enContent,
    category: String(raw.category || starterMatch?.category || "Plumbing Tips"),
    status:
      enStatus === "published" || haStatus === "published"
        ? "published"
        : legacyStatus,
    needs_owner_review: raw.needs_owner_review !== false,
    created_at: String(raw.created_at || new Date().toISOString()),
    updated_at: String(raw.updated_at || raw.created_at || new Date().toISOString()),
    en_title: enTitle,
    en_slug: enSlug,
    en_summary: enSummary,
    en_content: enContent,
    en_seo_title: String(raw.en_seo_title || "") || starterMatch?.en_seo_title || "",
    en_meta_description:
      String(raw.en_meta_description || "") || starterMatch?.en_meta_description || "",
    en_image_alt: String(raw.en_image_alt || "") || starterMatch?.en_image_alt || "",
    en_status: enStatus,
    ha_title: haTitle,
    ha_slug: haSlug,
    ha_summary: haSummary,
    ha_content: haContent,
    ha_seo_title: String(raw.ha_seo_title || "") || starterMatch?.ha_seo_title || "",
    ha_meta_description:
      String(raw.ha_meta_description || "") || starterMatch?.ha_meta_description || "",
    ha_image_alt: String(raw.ha_image_alt || "") || starterMatch?.ha_image_alt || "",
    ha_status: haStatus,
    featured_image: String(raw.featured_image || "") || starterMatch?.featured_image || "",
    image_attribution:
      String(raw.image_attribution || "") || starterMatch?.image_attribution || "",
    target_service_slug:
      String(raw.target_service_slug || "") || starterMatch?.target_service_slug || "",
    main_keyword: String(raw.main_keyword || "") || starterMatch?.main_keyword || "",
    supporting_keywords:
      Array.isArray(raw.supporting_keywords) && raw.supporting_keywords.length > 0
        ? raw.supporting_keywords.map(String).filter(Boolean)
        : starterMatch?.supporting_keywords || [],
    author_name: String(raw.author_name || starterMatch?.author_name || "FlowGuard Plumbing Editorial Team"),
    published_at: raw.published_at
      ? String(raw.published_at)
      : legacyStatus === "published"
      ? String(raw.updated_at || raw.created_at || new Date().toISOString())
      : null,
  };
}

function getStarterGuidesFallback(publishedOnly = false): GuideRecord[] {
  const ts = "2026-11-15T08:00:00.000Z";
  const normalized = BILINGUAL_BLOG_STARTER_ARTICLES.map((item) =>
    normalizeGuideRecord({
      ...item,
      created_at: ts,
      updated_at: ts,
      published_at: item.status === "published" ? ts : null,
    } as Record<string, unknown>)
  );
  if (!publishedOnly) return normalized;
  return normalized.filter(
    (g) =>
      g.status === "published" ||
      g.en_status === "published" ||
      g.ha_status === "published"
  );
}

export async function getGuides(publishedOnly = false): Promise<GuideRecord[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("guides");
  if (isBuildPhase()) return getStarterGuidesFallback(publishedOnly);
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("guides")
      .select("*")
      .order("created_at", { ascending: false });
    if (error || !data || data.length === 0) {
      return getStarterGuidesFallback(publishedOnly);
    }
    const normalized = data.map((row) =>
      normalizeGuideRecord(row as Record<string, unknown>)
    );
    if (!publishedOnly) return normalized;
    return normalized.filter(
      (g) =>
        g.status === "published" ||
        g.en_status === "published" ||
        g.ha_status === "published"
    );
  } catch {
    return getStarterGuidesFallback(publishedOnly);
  }
}

export async function getPublishedBlogPosts(lang: BlogLanguage): Promise<GuideRecord[]> {
  const all = await getGuides(true);
  return all.filter((g) =>
    lang === "en"
      ? g.en_status === "published" && Boolean(g.en_slug.trim())
      : g.ha_status === "published" && Boolean(g.ha_slug.trim())
  );
}

export async function getBlogPostBySlug(
  lang: BlogLanguage,
  slug: string
): Promise<GuideRecord | null> {
  const clean = slug.trim().toLowerCase();
  if (!clean) return null;
  const posts = await getPublishedBlogPosts(lang);
  return (
    posts.find((g) =>
      lang === "en" ? g.en_slug.toLowerCase() === clean : g.ha_slug.toLowerCase() === clean
    ) || null
  );
}

export async function upsertGuide(
  guide: Partial<GuideRecord> & { slug?: string; title?: string },
  actor = "Admin"
): Promise<GuideRecord | null> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();

  const enTitle = (guide.en_title ?? guide.title ?? "").trim();
  const enSlug = (guide.en_slug ?? guide.slug ?? "").trim().toLowerCase();
  const enSummary = (guide.en_summary ?? guide.summary ?? "").trim();
  const enContent = guide.en_content ?? guide.content ?? "";
  const enStatus = normalizeGuideStatus(guide.en_status ?? guide.status);

  const haTitle = (guide.ha_title ?? "").trim();
  const haSlug = (guide.ha_slug ?? "").trim().toLowerCase();
  const haSummary = (guide.ha_summary ?? "").trim();
  const haContent = guide.ha_content ?? "";
  const haStatus = normalizeGuideStatus(guide.ha_status ?? "draft");

  const anyPublished = enStatus === "published" || haStatus === "published";
  const overallStatus: GuideArticleStatus = anyPublished
    ? "published"
    : enStatus === "review" || haStatus === "review"
    ? "review"
    : "draft";

  let resolvedId = (guide.id || "").trim();
  const lookupSlug = enSlug || haSlug;
  if (!resolvedId && lookupSlug) {
    const { data: existing } = await supabase
      .from("guides")
      .select("id")
      .eq("slug", lookupSlug)
      .maybeSingle();
    if (existing?.id) {
      resolvedId = String(existing.id);
    }
  }
  const id =
    resolvedId ||
    `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const canonicalLegacySlug = enSlug || haSlug || id;
  const canonicalLegacyTitle = enTitle || haTitle || "Untitled Guide";

  const fullRow = {
    id,
    slug: canonicalLegacySlug,
    title: canonicalLegacyTitle,
    summary: enSummary || haSummary,
    content: enContent || haContent,
    category: (guide.category || "Plumbing Tips").trim(),
    status: overallStatus,
    needs_owner_review: guide.needs_owner_review ?? true,
    updated_at: now,
    en_title: enTitle,
    en_slug: enSlug,
    en_summary: enSummary,
    en_content: enContent,
    en_seo_title: (guide.en_seo_title || "").trim(),
    en_meta_description: (guide.en_meta_description || "").trim(),
    en_image_alt: (guide.en_image_alt || "").trim(),
    en_status: enStatus,
    ha_title: haTitle,
    ha_slug: haSlug,
    ha_summary: haSummary,
    ha_content: haContent,
    ha_seo_title: (guide.ha_seo_title || "").trim(),
    ha_meta_description: (guide.ha_meta_description || "").trim(),
    ha_image_alt: (guide.ha_image_alt || "").trim(),
    ha_status: haStatus,
    featured_image: (guide.featured_image || "").trim(),
    image_attribution: (guide.image_attribution || "").trim(),
    target_service_slug: (guide.target_service_slug || "").trim(),
    main_keyword: (guide.main_keyword || "").trim(),
    supporting_keywords: Array.isArray(guide.supporting_keywords)
      ? guide.supporting_keywords.map((k) => k.trim()).filter(Boolean)
      : [],
    author_name: (guide.author_name || "FlowGuard Plumbing Editorial Team").trim(),
    published_at: anyPublished ? guide.published_at || now : guide.published_at || null,
  };

  let { data, error } = await supabase
    .from("guides")
    .upsert(fullRow, { onConflict: "id" })
    .select("*")
    .single();

  if (error && /en_title|ha_title|featured_image|column/i.test(error.message)) {
    // Fallback if migration 20261115_bilingual_blog_seo.sql has not yet been applied
    const legacyRow = {
      id,
      slug: canonicalLegacySlug,
      title: canonicalLegacyTitle,
      summary: enSummary || haSummary,
      content: enContent || haContent,
      category: (guide.category || "Plumbing Tips").trim(),
      status: overallStatus === "published" ? "published" : "draft",
      needs_owner_review: guide.needs_owner_review ?? true,
      updated_at: now,
    };
    ({ data, error } = await supabase
      .from("guides")
      .upsert(legacyRow, { onConflict: "id" })
      .select("*")
      .single());
  }

  if (error || !data) return null;

  await appendAuditLog({
    actor,
    action: "Saved Guide",
    entity_type: "guide",
    entity_id: id,
    new_value: `${canonicalLegacyTitle} (EN:${enStatus} / HA:${haStatus})`,
  });
  return normalizeGuideRecord(data as Record<string, unknown>);
}
