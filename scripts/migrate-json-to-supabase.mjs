/**
 * One-time idempotent migration script:
 * Moves data from src/data/marketplace-data.json (and legacy marketplace_store if present)
 * into normalized Supabase tables, keeping a timestamped backup in backups/.
 *
 * Usage:
 *   node scripts/migrate-json-to-supabase.mjs
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function ensureUuid(raw) {
  const s = String(raw || "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    return s;
  }
  const hash = crypto.createHash("sha256").update(s || String(Math.random())).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local or environment variables."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_CATEGORIES = [
  {
    id: "cat-pipe-installation-repairs",
    slug: "pipe-installation-repairs",
    name: "Pipe Installation & Repairs",
    short_description: "Concealed and surface pipe routing using durable PPR, PVC, and copper pipework.",
    long_description: "Concealed and surface pipe routing using durable PPR, PVC, and copper pipework. Proper pressure testing before closure prevents hidden leakages.",
    common_problems: [
      "PPR hot & cold water piping",
      "Burst pipe isolation & repair",
      "Pressure testing and joint sealing",
      "New build rough-in pipework",
    ],
    icon_name: "Wrench",
    sort_order: 1,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-leak-detection-repairs",
    slug: "leak-detection-repairs",
    name: "Leak Detection & Repairs",
    short_description: "Systematic diagnostics for hidden wall moisture, underground seepages, and dripping valves.",
    long_description: "Systematic diagnostics for hidden wall moisture, underground seepages, dripping valves, and sudden water pressure drops.",
    common_problems: [
      "Concealed wall leak diagnosis",
      "Valve and joint replacements",
      "Slab and subfloor inspections",
      "Pressure balance adjustments",
    ],
    icon_name: "Search",
    sort_order: 2,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-drainage-blockage-issues",
    slug: "drainage-blockage-issues",
    name: "Drainage & Blockage Issues",
    short_description: "Clearing blocked waste lines, foul-smelling sewer traps, and clogged sinks.",
    long_description: "Clearing blocked waste lines, inspecting foul-smelling sewer traps, unclogging sinks, and ensuring correct falls on gravity-flow drains.",
    common_problems: [
      "Sink and kitchen waste clearing",
      "P-trap and floor drain servicing",
      "Inspection chamber maintenance",
      "Odour and backflow rectification",
    ],
    icon_name: "Droplet",
    sort_order: 3,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-bathroom-toilet-plumbing",
    slug: "bathroom-toilet-plumbing",
    name: "Bathroom & Toilet Plumbing",
    short_description: "Installation and maintenance for WCs, cistern mechanisms, basins, and shower mixers.",
    long_description: "Precision installation and maintenance for water closets (WC), cistern mechanisms, wash hand basins, shower valves, and mixer taps.",
    common_problems: [
      "WC cistern valve replacements",
      "Basin & mixer tap installations",
      "Shower heads and thermostatic valves",
      "Flexible connector & angle valve swaps",
    ],
    icon_name: "Bath",
    sort_order: 4,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-kitchen-plumbing",
    slug: "kitchen-plumbing",
    name: "Kitchen Plumbing",
    short_description: "Installation and repairs for kitchen sinks, spray taps, grease traps, and waste pipes.",
    long_description: "Installation and repairs for double and single kitchen sinks, flexible spray taps, grease traps, dishwasher inlets, and waste pipes.",
    common_problems: [
      "Kitchen sink tap installation",
      "Under-sink waste trap alignment",
      "Appliance water feed connection",
      "Grease blockage management",
    ],
    icon_name: "Utensils",
    sort_order: 5,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-water-storage-supply-systems",
    slug: "water-storage-supply-systems",
    name: "Water Storage & Supply Systems",
    short_description: "Overhead and surface tank connections, float switches, and distribution manifolds.",
    long_description: "Overhead and surface poly tank connections, float switch installations, overflow control, and distribution manifold plumbing.",
    common_problems: [
      "Overhead water tank installation",
      "Automatic float valve wiring & fitting",
      "Tank wash-out and drain plumbing",
      "Inlet/outlet manifold construction",
    ],
    icon_name: "Database",
    sort_order: 6,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-pump-installation-repairs",
    slug: "pump-installation-repairs",
    name: "Pump Installation & Repairs",
    short_description: "Booster, surface transfer, and submersible pumps with non-return valves and pressure controls.",
    long_description: "Booster pumps, surface transfer pumps, and submersible pumps connected with proper non-return valves and electrical pressure controls.",
    common_problems: [
      "Automatic pressure booster pumps",
      "Surface transfer pumps",
      "Non-return check valves",
      "Dry-run protection switches",
    ],
    icon_name: "Zap",
    sort_order: 7,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-commercial-plumbing",
    slug: "commercial-plumbing",
    name: "Commercial & Facility Plumbing",
    short_description: "Coordinated plumbing for offices, schools, plazas, hotels, and workshops.",
    long_description: "Plumbing coordination for office complexes, schools, plazas, hotels, and workshops requiring structured multi-point installations.",
    common_problems: [
      "Multi-restroom commercial fit-outs",
      "Central water distribution risers",
      "Scheduled facility maintenance",
      "Code-compliant pipe sizing",
    ],
    icon_name: "Building2",
    sort_order: 8,
    is_active: true,
    is_published: false,
  },
  {
    id: "cat-plumbing-maintenance",
    slug: "plumbing-maintenance",
    name: "Preventative Plumbing Maintenance",
    short_description: "Scheduled audits and servicing to catch joint leaks, pressure faults, and pipe wear early.",
    long_description: "Scheduled audits and preventative servicing to catch slight joint leaks, calcification, pressure faults, and pipe degradation early.",
    common_problems: [
      "Quarterly valve inspections",
      "Water pressure audits",
      "Sediment flush and trap cleaning",
      "Detailed facility health reports",
    ],
    icon_name: "ShieldCheck",
    sort_order: 9,
    is_active: true,
    is_published: false,
  },
];

function toSlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function main() {
  const localPath = path.join(process.cwd(), "src", "data", "marketplace-data.json");
  let store = null;

  if (fs.existsSync(localPath)) {
    store = JSON.parse(fs.readFileSync(localPath, "utf8"));
    console.log("Loaded local marketplace-data.json");
  }

  // Also check legacy marketplace_store in Supabase
  const { data: cloudRow } = await supabase
    .from("marketplace_store")
    .select("data")
    .eq("id", "main")
    .maybeSingle();

  if (cloudRow?.data && typeof cloudRow.data === "object") {
    console.log("Found legacy marketplace_store row in Supabase; merging.");
    store = { ...(store || {}), ...cloudRow.data };
  }

  if (!store) {
    console.log("No local JSON or cloud marketplace_store found. Seeding default categories only.");
    store = {};
  }

  // 1. Save timestamped backup
  const backupDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `marketplace-data-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(store, null, 2), "utf8");
  console.log(`Backup saved to ${backupPath}`);

  // 2. Seed service_categories
  const { error: catErr } = await supabase
    .from("service_categories")
    .upsert(DEFAULT_CATEGORIES, { onConflict: "slug" });
  if (catErr) throw new Error(`service_categories upsert failed: ${catErr.message}`);
  console.log(`Upserted ${DEFAULT_CATEGORIES.length} service_categories`);

  // 3. Seed service_areas from settings
  const coverageAreas = store.settings?.coverage_areas || [];
  const activeNames = store.settings?.active_coverage_locations || [];
  const areaRecords = (
    coverageAreas.length > 0
      ? coverageAreas.map((a) => ({ name: a.area, is_active: Boolean(a.active) }))
      : activeNames.map((name) => ({ name, is_active: true }))
  )
    .filter((a) => a.name && toSlug(a.name))
    .map((a) => ({
      id: `area-${toSlug(a.name)}`,
      slug: toSlug(a.name),
      name: a.name,
      state: store.settings?.default_state || "Kano State",
      city: store.settings?.default_city || "Kano",
      is_active: a.is_active,
      is_published: false,
    }));

  if (areaRecords.length > 0) {
    const { error: areaErr } = await supabase
      .from("service_areas")
      .upsert(areaRecords, { onConflict: "slug" });
    if (areaErr) throw new Error(`service_areas upsert failed: ${areaErr.message}`);
    console.log(`Upserted ${areaRecords.length} service_areas`);
  }

  // 4. Upsert customers
  const customers = (store.customers || []).map((c) => ({
    id: ensureUuid(c.id),
    full_name: c.full_name || "Customer",
    phone: c.phone,
    email: c.email || null,
    password_hash: c.password_hash || null,
    address: c.address_in_kano || c.address || "",
    state: store.settings?.default_state || "Kano State",
    city_lga: c.city_lga || "",
    neighbourhood: c.neighbourhood || "",
    property_type: c.property_type || "Residential",
    notes: c.notes || null,
    created_at: c.created_at || new Date().toISOString(),
    updated_at: c.updated_at || new Date().toISOString(),
  }));

  if (customers.length > 0) {
    let { error } = await supabase.from("customers").upsert(customers, { onConflict: "phone" });
    if (error && error.message.includes("area_in_kano")) {
      const legacyCustomers = customers.map((c) => ({
        ...c,
        area_in_kano: c.city_lga || c.address || "N/A",
      }));
      ({ error } = await supabase.from("customers").upsert(legacyCustomers, { onConflict: "phone" }));
    }
    if (error) throw new Error(`customers upsert failed: ${error.message}`);
    console.log(`Upserted ${customers.length} customers`);
  }

  // 5. Upsert plumbers (merge password_hash from plumber_accounts)
  const accountByPhone = new Map();
  for (const acc of store.plumber_accounts || []) {
    if (acc.phone) accountByPhone.set(String(acc.phone).replace(/\D/g, ""), acc);
  }

  const plumbers = (store.plumbers || []).map((p) => {
    const digits = String(p.phone || "").replace(/\D/g, "");
    const acc = accountByPhone.get(digits);
    return {
      id: p.id,
      application_ref: p.application_ref || null,
      full_name: p.full_name,
      phone: p.phone,
      email: p.email || acc?.email || null,
      password_hash: acc?.password_hash || null,
      residential_location: p.residential_location || "",
      preferred_locations: p.preferred_locations || [],
      skills: p.skills || [],
      experience_years: Number(p.experience_years || 1),
      experience_details: p.experience_details || null,
      references_info: p.references_info || null,
      verification_status: p.verification_status || "submitted",
      is_available: p.is_available !== false,
      is_online: Boolean(p.is_online),
      rating: Number(p.rating || 5.0),
      total_jobs: Number(p.total_jobs || 0),
      notes: p.notes || null,
      created_at: p.created_at || new Date().toISOString(),
      updated_at: p.updated_at || new Date().toISOString(),
    };
  });

  if (plumbers.length > 0) {
    const { error } = await supabase.from("plumbers").upsert(plumbers, { onConflict: "phone" });
    if (error) throw new Error(`plumbers upsert failed: ${error.message}`);
    console.log(`Upserted ${plumbers.length} plumbers`);
  }

  // 6. Upsert service_requests + request_history
  const { data: dbCustomers } = await supabase.from("customers").select("id, phone");
  const { data: dbPlumbers } = await supabase.from("plumbers").select("id, phone");
  const custIdByDigits = new Map(
    (dbCustomers || []).map((c) => [String(c.phone || "").replace(/\D/g, ""), c.id])
  );
  const plumberIdSet = new Set((dbPlumbers || []).map((p) => p.id));

  const requestRows = [];
  const historyRows = [];

  for (const r of store.requests || []) {
    const custDigits = String(r.customer_phone || "").replace(/\D/g, "");
    const customerId = custIdByDigits.get(custDigits) || null;
    const assignedPlumberId =
      r.assigned_plumber_id && plumberIdSet.has(r.assigned_plumber_id)
        ? r.assigned_plumber_id
        : null;

    requestRows.push({
      id: ensureUuid(r.id),
      ticket_number: r.ticket_number,
      customer_id: customerId,
      priority: r.priority === "urgent" ? "urgent" : "standard",
      status: r.status || "new",
      property_type: r.property_type || "Residential / Home",
      address: r.address_in_kano || r.address || "",
      state: r.state || store.settings?.default_state || "Kano State",
      city_lga: r.city_lga || "",
      neighbourhood: r.neighbourhood || "",
      preferred_timing: r.preferred_timing || "As soon as possible",
      preferred_date: r.preferred_date || null,
      problem_category: r.problem_category || "General Plumbing",
      issue_description: r.issue_description || "",
      photos: r.photos || [],
      customer_name: r.customer_name || null,
      customer_phone: r.customer_phone || null,
      customer_email: r.customer_email || null,
      assigned_technician: r.assigned_technician || null,
      assigned_plumber_id: assignedPlumberId,
      quoted_amount: r.quoted_amount ?? null,
      internal_notes: r.internal_notes || null,
      created_at: r.created_at || new Date().toISOString(),
      updated_at: r.updated_at || new Date().toISOString(),
    });

    for (const h of r.history || []) {
      historyRows.push({
        id: h.id || `hist-${r.id}-${historyRows.length}`,
        request_id: ensureUuid(r.id),
        ticket_number: r.ticket_number,
        actor: h.actor || "System",
        actor_role: "system",
        action: h.action || "Update",
        details: h.details || null,
        created_at: h.timestamp || r.created_at || new Date().toISOString(),
      });
    }
  }

  if (requestRows.length > 0) {
    let { error } = await supabase
      .from("service_requests")
      .upsert(requestRows, { onConflict: "ticket_number" });
    if (error && (error.message.includes("'address'") || error.message.includes("'problem_category'"))) {
      const legacyReqRows = requestRows.map((r) => {
        const copy = { ...r, address_in_kano: r.address || "" };
        delete copy.address;
        delete copy.problem_category;
        return copy;
      });
      ({ error } = await supabase
        .from("service_requests")
        .upsert(legacyReqRows, { onConflict: "ticket_number" }));
    }
    if (error) throw new Error(`service_requests upsert failed: ${error.message}`);
    console.log(`Upserted ${requestRows.length} service_requests`);
  }

  if (historyRows.length > 0) {
    const { error } = await supabase
      .from("request_history")
      .upsert(historyRows, { onConflict: "id" });
    if (error) throw new Error(`request_history upsert failed: ${error.message}`);
    console.log(`Upserted ${historyRows.length} request_history rows`);
  }

  // 7. Quotations
  const reqIdSet = new Set(requestRows.map((r) => r.id));
  const quotationRows = (store.quotations || []).map((q) => ({
    id: q.id,
    request_id: reqIdSet.has(q.request_id) ? q.request_id : null,
    ticket_number: q.ticket_number,
    plumber_id: q.plumber_id && plumberIdSet.has(q.plumber_id) ? q.plumber_id : null,
    plumber_name: q.plumber_name || "Plumber",
    labour_charge: Number(q.labour_charge || 0),
    materials_cost: Number(q.materials_cost || 0),
    transport_charge: Number(q.transport_charge || 0),
    other_charges: Number(q.other_charges || 0),
    total_amount: Number(q.total_amount || 0),
    company_commission_rate: Number(q.company_commission_rate || 20),
    company_commission: Number(q.company_commission || 0),
    plumber_payable: Number(q.plumber_payable || 0),
    is_small_job: Boolean(q.is_small_job),
    small_job_reason: q.small_job_reason || null,
    customer_approval_status: q.customer_approval_status || "pending",
    customer_approved_at: q.customer_approved_at || null,
    admin_approved: q.admin_approved !== false,
    revision_number: Number(q.revision_number || 1),
    notes: q.notes || null,
    created_at: q.created_at || new Date().toISOString(),
    updated_at: q.updated_at || new Date().toISOString(),
  }));

  if (quotationRows.length > 0) {
    const { error } = await supabase.from("quotations").upsert(quotationRows, { onConflict: "id" });
    if (error) throw new Error(`quotations upsert failed: ${error.message}`);
    console.log(`Upserted ${quotationRows.length} quotations`);
  }

  // 8. Messages
  const messageRows = (store.messages || []).map((m) => ({
    id: m.id,
    request_id: reqIdSet.has(m.request_id) ? m.request_id : null,
    ticket_number: m.ticket_number,
    sender_role: m.sender_role,
    sender_name: m.sender_name,
    recipient_role: m.recipient_role,
    message: m.message || "",
    attachment: m.attachment || null,
    is_internal: Boolean(m.is_internal),
    admin_read: m.admin_read !== false,
    read_by: m.read_by || [],
    created_at: m.created_at || new Date().toISOString(),
  }));

  if (messageRows.length > 0) {
    const { error } = await supabase.from("messages").upsert(messageRows, { onConflict: "id" });
    if (error) throw new Error(`messages upsert failed: ${error.message}`);
    console.log(`Upserted ${messageRows.length} messages`);
  }

  // 9. Payments
  const paymentRows = (store.payments || []).map((p) => ({
    id: p.id,
    request_id: reqIdSet.has(p.request_id) ? p.request_id : null,
    ticket_number: p.ticket_number,
    customer_name: p.customer_name,
    total_payment: Number(p.total_payment || 0),
    labour_portion: Number(p.labour_portion || 0),
    materials_portion: Number(p.materials_portion || 0),
    company_commission: Number(p.company_commission || 0),
    plumber_payable: Number(p.plumber_payable || 0),
    payment_method: p.payment_method || "bank_transfer",
    transaction_ref: p.transaction_ref || null,
    verification_status: p.verification_status || "pending",
    verified_by: p.verified_by || null,
    verified_at: p.verified_at || null,
    notes: p.notes || null,
    created_at: p.created_at || new Date().toISOString(),
  }));

  if (paymentRows.length > 0) {
    const { error } = await supabase.from("payments").upsert(paymentRows, { onConflict: "id" });
    if (error) throw new Error(`payments upsert failed: ${error.message}`);
    console.log(`Upserted ${paymentRows.length} payments`);
  }

  // 10. Complaints
  const complaintRows = (store.complaints || []).map((c) => ({
    id: c.id,
    ticket_number: c.ticket_number || "",
    customer_name: c.customer_name,
    customer_phone: c.customer_phone || "",
    subject: c.subject,
    description: c.description,
    status: c.status || "new",
    admin_note: c.admin_note || null,
    created_at: c.created_at || new Date().toISOString(),
    updated_at: c.updated_at || new Date().toISOString(),
  }));

  if (complaintRows.length > 0) {
    const { error } = await supabase.from("complaints").upsert(complaintRows, { onConflict: "id" });
    if (error) throw new Error(`complaints upsert failed: ${error.message}`);
    console.log(`Upserted ${complaintRows.length} complaints`);
  }

  // 11. Gallery items (including existing real-work-* photos as drafts if not already present)
  const existingGallery = store.gallery_items || [];
  const galleryDir = path.join(process.cwd(), "public", "images", "gallery");
  const draftGalleryRows = [...existingGallery];
  const seenUrls = new Set(draftGalleryRows.map((g) => g.image_url));

  if (fs.existsSync(galleryDir)) {
    const files = fs.readdirSync(galleryDir).filter((f) => f.startsWith("real-work-"));
    for (const file of files) {
      const imageUrl = `/images/gallery/${file}`;
      if (!seenUrls.has(imageUrl)) {
        const cleanTitle = file
          .replace(/^real-work-/, "")
          .replace(/\.[^.]+$/, "")
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (ch) => ch.toUpperCase());
        draftGalleryRows.push({
          id: `gal-${toSlug(file)}`,
          title: cleanTitle,
          category: "General Plumbing",
          location: "",
          caption: "Real field work photograph — pending owner review and details before publishing.",
          image_url: imageUrl,
          alt_text: cleanTitle,
          published: false,
          sort_order: draftGalleryRows.length + 1,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  if (draftGalleryRows.length > 0) {
    const { error } = await supabase
      .from("gallery_items")
      .upsert(draftGalleryRows, { onConflict: "id" });
    if (error) throw new Error(`gallery_items upsert failed: ${error.message}`);
    console.log(`Upserted ${draftGalleryRows.length} gallery_items (real-work photos added as drafts)`);
  }

  // 12. Settings
  if (store.settings) {
    const { error } = await supabase.from("settings").upsert(
      {
        key: "marketplace_settings",
        value: store.settings,
        description: "Global marketplace and business settings",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );
    if (error) throw new Error(`settings upsert failed: ${error.message}`);
    console.log("Upserted marketplace_settings");
  }

  // 13. Audit logs
  const auditRows = (store.audit_logs || []).map((a) => ({
    id: a.id,
    actor: a.actor || "Admin",
    action: a.action,
    entity_type: a.entity_type,
    entity_id: a.entity_id,
    old_value: a.old_value || null,
    new_value: a.new_value || null,
    created_at: a.timestamp || new Date().toISOString(),
  }));

  if (auditRows.length > 0) {
    const { error } = await supabase.from("audit_log").upsert(auditRows, { onConflict: "id" });
    if (error) throw new Error(`audit_log upsert failed: ${error.message}`);
    console.log(`Upserted ${auditRows.length} audit_log rows`);
  }

  console.log("Migration completed successfully.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
