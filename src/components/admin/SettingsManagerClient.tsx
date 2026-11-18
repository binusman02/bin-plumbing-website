"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  saveMarketplaceSettingsAction,
  uploadServiceImageAction,
} from "@/app/actions/marketplace-actions";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import type { MarketplaceSettings, ServiceCategorySetting } from "@/lib/marketplace";
import { MAP_CONFIG } from "@/lib/map-config";
import {
  SERVICE_IMAGE_PRESETS,
  resolveServiceImageAlt,
  resolveSharpServiceImage,
} from "@/lib/service-images";

interface SettingsManagerClientProps {
  initialSettings: MarketplaceSettings;
  currentUserEmail?: string;
  isOwner?: boolean;
}

export default function SettingsManagerClient({
  initialSettings,
  currentUserEmail = "",
  isOwner = true,
}: SettingsManagerClientProps) {
  const [companyPhone, setCompanyPhone] = useState(initialSettings.company_phone || "");
  const [companyWhatsapp, setCompanyWhatsapp] = useState(initialSettings.company_whatsapp || "");
  const [companyEmail, setCompanyEmail] = useState(initialSettings.company_email || "");
  const [companyAddress, setCompanyAddress] = useState(initialSettings.company_address || "");
  const [workingHours, setWorkingHours] = useState(initialSettings.working_hours || "");
  const [rcNumber, setRcNumber] = useState(initialSettings.rc_number || "");
  const [notificationEmail, setNotificationEmail] = useState(
    initialSettings.notification_email || ""
  );
  const [timezone, setTimezone] = useState(initialSettings.timezone || "Africa/Lagos");
  const [dispatchStatusText, setDispatchStatusText] = useState(
    initialSettings.dispatch_status_text || ""
  );

  // Commission (Owner only)
  const [commissionRate, setCommissionRate] = useState(
    String(initialSettings.commission_default_rate ?? 20)
  );
  const [smallJobEnabled, setSmallJobEnabled] = useState(
    Boolean(initialSettings.small_job_rule_enabled)
  );
  const [smallJobRate, setSmallJobRate] = useState(
    initialSettings.commission_small_job_rate != null
      ? String(initialSettings.commission_small_job_rate)
      : ""
  );
  const [smallJobThreshold, setSmallJobThreshold] = useState(
    initialSettings.small_job_threshold != null
      ? String(initialSettings.small_job_threshold)
      : ""
  );

  // Service Categories
  const [categories, setCategories] = useState(
    initialSettings.service_categories && initialSettings.service_categories.length > 0
      ? initialSettings.service_categories
      : [
          {
            id: "pipework",
            title: "Pipework & Leaks",
            slug: "pipework-leaks",
            description: "Pipe repairs, leak tracing, and replacements.",
            image: "/images/services/pipework.jpg",
            visible: true,
            order: 1,
          },
          {
            id: "tanks-pumps",
            title: "Water Tanks & Pumps",
            slug: "water-tanks-pumps",
            description: "Overhead tanks, boosters, and pump installation.",
            image: "/images/services/pumps.jpg",
            visible: true,
            order: 2,
          },
        ]
  );
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [expandedCatId, setExpandedCatId] = useState<string | null>(null);
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);

  const updateCategoryField = (
    idx: number,
    patch: Partial<ServiceCategorySetting>
  ) => {
    setCategories((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    );
  };

  const handleServiceImageUpload = async (idx: number, file: File | null) => {
    if (!file) return;
    const cat = categories[idx];
    if (!cat) return;
    setUploadingCatId(cat.id);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.set("image", file);
      const res = await uploadServiceImageAction(fd);
      if (res.success && res.imageUrl) {
        updateCategoryField(idx, { image: res.imageUrl });
        setFeedback({
          type: "success",
          text: `Uploaded photo for "${cat.title}". Click Save Settings to publish.`,
        });
      } else {
        setFeedback({
          type: "error",
          text: res.error || "Could not upload service image.",
        });
      }
    } finally {
      setUploadingCatId(null);
    }
  };

  // Coverage Areas (State / Area / Active)
  const [coverageAreas, setCoverageAreas] = useState(
    initialSettings.coverage_areas && initialSettings.coverage_areas.length > 0
      ? initialSettings.coverage_areas
      : (initialSettings.active_coverage_locations || []).map((loc) => ({
          state: "",
          area: loc,
          active: true,
        }))
  );
  const [newState, setNewState] = useState("");
  const [newArea, setNewArea] = useState("");

  // Users & Access (Owner only)
  const [adminUsers, setAdminUsers] = useState(initialSettings.admin_users || []);
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<"Owner" | "Admin">("Admin");

  // Notification Preferences
  const [notifPrefs, setNotifPrefs] = useState(
    initialSettings.notification_preferences || {
      new_request: true,
      new_application: true,
      quotation_submitted: true,
      payment_recorded: true,
      complaint: true,
    }
  );

  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const moveCategory = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const copy = [...categories];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setCategories(copy.map((c, idx) => ({ ...c, order: idx + 1 })));
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const slug = newCatName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const id = `cat-${slug}`;
    setCategories((prev) => [
      ...prev,
      {
        id,
        name: newCatName.trim(),
        title: newCatName.trim(),
        slug,
        short_description: newCatDesc.trim(),
        description: newCatDesc.trim(),
        image: "/images/services/surface-ppr-pipe-installation-kano.jpg",
        image_alt: `${newCatName.trim()} in Kano — FlowGuard Plumbing Enterprises`,
        common_problems: [],
        quotation_notes: "",
        faqs: [],
        related_slugs: [],
        icon_name: "Wrench",
        visible: true,
        active: true,
        published: true,
        order: prev.length + 1,
        sort_order: prev.length + 1,
      },
    ]);
    setExpandedCatId(id);
    setNewCatName("");
    setNewCatDesc("");
  };

  const addCoverageArea = () => {
    if (!newArea.trim()) return;
    setCoverageAreas((prev) => [
      ...prev,
      { state: newState.trim(), area: newArea.trim(), active: true },
    ]);
    setNewArea("");
  };

  const addAdminUser = () => {
    if (!newAdminEmail.trim()) return;
    setAdminUsers((prev) => [
      ...prev,
      {
        id: `adm-${Date.now().toString(36)}`,
        name: newAdminName.trim() || newAdminEmail.trim(),
        email: newAdminEmail.trim(),
        role: newAdminRole,
        active: true,
        invited_at: new Date().toISOString(),
      },
    ]);
    setNewAdminName("");
    setNewAdminEmail("");
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const payload: Partial<MarketplaceSettings> = {
        company_phone: companyPhone.trim(),
        company_whatsapp: companyWhatsapp.trim(),
        company_email: companyEmail.trim(),
        company_address: companyAddress.trim(),
        working_hours: workingHours.trim(),
        rc_number: rcNumber.trim(),
        notification_email: notificationEmail.trim(),
        timezone,
        dispatch_status_text: dispatchStatusText.trim(),
        service_categories: categories,
        coverage_areas: coverageAreas,
        notification_preferences: notifPrefs,
      };

      if (isOwner) {
        payload.commission_default_rate = Number(commissionRate) || 20;
        payload.small_job_rule_enabled = smallJobEnabled;
        payload.commission_small_job_rate =
          smallJobEnabled && smallJobRate.trim() !== "" ? Number(smallJobRate) : null;
        payload.small_job_threshold =
          smallJobEnabled && smallJobThreshold.trim() !== ""
            ? Number(smallJobThreshold)
            : null;
        payload.admin_users = adminUsers;
      }

      const res = await saveMarketplaceSettingsAction(payload);
      if (res.success) {
        setFeedback({ type: "success", text: "All platform settings saved." });
      } else {
        setFeedback({ type: "error", text: res.error || "Could not save settings." });
      }
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {MAP_CONFIG.isUsingOsmFallback && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 shadow-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-bold">
              Map Vector Style Not Configured (Using Public OSM Raster Fallback)
            </p>
            <p className="mt-1 leading-relaxed text-amber-800">
              <code>NEXT_PUBLIC_MAP_STYLE_URL</code> is currently unset. The public OpenStreetMap
              raster fallback is for development only and has no production SLA. Set{" "}
              <code>NEXT_PUBLIC_MAP_STYLE_URL</code> to a domain-restricted MapTiler or Stadia
              Maps style URL before production traffic. See{" "}
              <code>docs/LIVE-TRACKING.md</code>.
            </p>
          </div>
        </div>
      )}
      {/* 1. Company Contact Details */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-[#0B1F3A]">Company Contact & Identity</h2>
        <p className="text-xs text-slate-500">
          Public pages, header, footer, and customer notifications read from these fields.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Phone Number
            </label>
            <input
              type="text"
              value={companyPhone}
              onChange={(e) => setCompanyPhone(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              WhatsApp Number
            </label>
            <input
              type="text"
              value={companyWhatsapp}
              onChange={(e) => setCompanyWhatsapp(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Public Email
            </label>
            <input
              type="email"
              value={companyEmail}
              onChange={(e) => setCompanyEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Working Hours (blank = hidden publicly)
            </label>
            <input
              type="text"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              placeholder="e.g. Mon – Sat, 8:00 AM – 6:00 PM"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Office Address
            </label>
            <input
              type="text"
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              CAC RC Number (optional, shown only if set)
            </label>
            <input
              type="text"
              value={rcNumber}
              onChange={(e) => setRcNumber(e.target.value)}
              placeholder="Leave blank if not displayed"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Timezone
            </label>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
        </div>
      </section>

      {/* 2. Service Categories (Full Service CMS Editor) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#0B1F3A]">
              Plumbing Services CMS ({categories.length})
            </h2>
            <p className="text-xs text-slate-500">
              Edit everything about each service: title, URL slug, short &amp; full descriptions, photo, SEO alt text, common problems, quotation notes, FAQs, related services, visibility, and order.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {categories.map((cat, idx) => {
            const isExpanded = expandedCatId === cat.id;
            const resolvedImg = resolveSharpServiceImage(cat.image, cat.slug);
            const defaultAlt = resolveServiceImageAlt(cat.slug, cat.title);
            const problems = cat.common_problems || [];
            const faqs = cat.faqs || [];
            const relatedSlugs = cat.related_slugs || [];

            return (
              <div
                key={cat.id}
                className={`rounded-xl border transition-colors ${
                  isExpanded
                    ? "border-[#F5B301] bg-slate-50/70 shadow-sm"
                    : "border-slate-200 bg-white"
                }`}
              >
                {/* Compact Row Header */}
                <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resolvedImg}
                      alt={cat.image_alt || defaultAlt}
                      className="h-14 w-20 shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover"
                    />
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <input
                          type="text"
                          value={cat.title}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              title: e.target.value,
                              name: e.target.value,
                            })
                          }
                          placeholder="Service title"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0B1F3A]"
                        />
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          /services/{cat.slug}
                        </p>
                      </div>
                      <input
                        type="text"
                        value={cat.short_description || cat.description || ""}
                        onChange={(e) =>
                          updateCategoryField(idx, {
                            short_description: e.target.value,
                            ...(cat.description ? {} : { description: e.target.value }),
                          })
                        }
                        placeholder="Short card summary (shown on homepage)"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={cat.visible !== false}
                        onChange={(e) =>
                          updateCategoryField(idx, {
                            visible: e.target.checked,
                            active: e.target.checked,
                          })
                        }
                      />
                      Visible
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedCatId(isExpanded ? null : cat.id)
                      }
                      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors ${
                        isExpanded
                          ? "border-[#0B1F3A] bg-[#0B1F3A] text-[#F5B301]"
                          : "border-slate-200 bg-white text-[#0B1F3A] hover:bg-slate-50"
                      }`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {isExpanded ? "Close Editor" : "Edit Full Service"}
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(idx, -1)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(idx, 1)}
                      className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCategories((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
                      aria-label="Delete category"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Expanded Full Service Detail Editor */}
                {isExpanded && (
                  <div className="border-t border-slate-200 bg-white p-4 sm:p-5 space-y-6 rounded-b-xl">
                    {/* A. Core Identity & URL */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          Service Title
                        </label>
                        <input
                          type="text"
                          value={cat.title}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              title: e.target.value,
                              name: e.target.value,
                            })
                          }
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                        />
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <label className="block text-xs font-semibold uppercase text-slate-500">
                            URL Slug (/services/...)
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              updateCategoryField(idx, {
                                slug: cat.title
                                  .toLowerCase()
                                  .trim()
                                  .replace(/[^a-z0-9]+/g, "-")
                                  .replace(/(^-|-$)/g, ""),
                              })
                            }
                            className="text-[11px] font-semibold text-[#0B1F3A] underline hover:text-[#E0A200]"
                          >
                            Generate from title
                          </button>
                        </div>
                        <input
                          type="text"
                          value={cat.slug}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              slug: e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "-"),
                            })
                          }
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          Icon &amp; Public Page
                        </label>
                        <div className="flex items-center gap-2">
                          <select
                            value={cat.icon_name || "Wrench"}
                            onChange={(e) =>
                              updateCategoryField(idx, { icon_name: e.target.value })
                            }
                            className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                          >
                            {[
                              "Wrench",
                              "Search",
                              "Droplet",
                              "Bath",
                              "Utensils",
                              "Database",
                              "Zap",
                              "Building2",
                              "ShieldCheck",
                            ].map((ic) => (
                              <option key={ic} value={ic}>
                                Icon: {ic}
                              </option>
                            ))}
                          </select>
                          <a
                            href={`/services/${cat.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                          >
                            View <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>

                    {/* B. Descriptions & Quotation Notes */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          Short Card Description (Homepage Card)
                        </label>
                        <textarea
                          rows={2}
                          value={cat.short_description || ""}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              short_description: e.target.value,
                            })
                          }
                          placeholder="Concise 1-2 sentence summary shown on homepage service cards..."
                          className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          Full Service Description (/services &amp; Detail Page)
                        </label>
                        <textarea
                          rows={2}
                          value={cat.description || ""}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              description: e.target.value,
                            })
                          }
                          placeholder="Detailed service description shown on the Services catalog and service detail page..."
                          className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                          How We Handle This Service / Quotation Notes (Shown on Detail Page)
                        </label>
                        <textarea
                          rows={2}
                          value={cat.quotation_notes || ""}
                          onChange={(e) =>
                            updateCategoryField(idx, {
                              quotation_notes: e.target.value,
                            })
                          }
                          placeholder="Every request is logged with a tracking reference number, inspected on site by an assigned technician, and quoted in itemised form before repair or installation starts."
                          className="w-full rounded-lg border border-slate-200 p-3 text-sm"
                        />
                      </div>
                    </div>

                    {/* C. Service Photo & Image SEO */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                        <ImageIcon className="h-4 w-4 text-[#F5B301]" />
                        Service Photo &amp; Image SEO
                      </h3>
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-12">
                        <div className="md:col-span-4">
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={resolvedImg}
                              alt={cat.image_alt || defaultAlt}
                              className="aspect-[4/3] w-full object-cover"
                            />
                          </div>
                        </div>
                        <div className="space-y-3 md:col-span-8">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Choose Preset Kano Plumbing Photo
                              </label>
                              <select
                                value={
                                  SERVICE_IMAGE_PRESETS.some(
                                    (p) => p.url === resolvedImg
                                  )
                                    ? resolvedImg
                                    : ""
                                }
                                onChange={(e) => {
                                  if (e.target.value) {
                                    updateCategoryField(idx, {
                                      image: e.target.value,
                                    });
                                  }
                                }}
                                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium"
                              >
                                <option value="">-- Custom / Uploaded Photo --</option>
                                {SERVICE_IMAGE_PRESETS.map((preset) => (
                                  <option key={preset.url} value={preset.url}>
                                    {preset.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-slate-600">
                                Or Upload New Service Photo (Max 5MB)
                              </label>
                              <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-[#0B1F3A] hover:bg-slate-100">
                                {uploadingCatId === cat.id ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-3.5 w-3.5 text-[#F5B301]" />
                                    Upload Image File
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  disabled={uploadingCatId === cat.id}
                                  onChange={(e) =>
                                    handleServiceImageUpload(
                                      idx,
                                      e.target.files?.[0] || null
                                    )
                                  }
                                />
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              Image Path or URL
                            </label>
                            <input
                              type="text"
                              value={cat.image || resolvedImg}
                              onChange={(e) =>
                                updateCategoryField(idx, { image: e.target.value })
                              }
                              placeholder="/images/services/..."
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-mono"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">
                              SEO Image Alt Text &amp; Schema Caption
                            </label>
                            <input
                              type="text"
                              value={cat.image_alt || ""}
                              onChange={(e) =>
                                updateCategoryField(idx, {
                                  image_alt: e.target.value,
                                })
                              }
                              placeholder={defaultAlt}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* D. Common Problems We Handle */}
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                            Common Problems We Handle ({problems.length})
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Bullet points displayed on /services/{cat.slug} under &ldquo;Common Problems We Handle&rdquo;.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateCategoryField(idx, {
                              common_problems: [...problems, ""],
                            })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add Problem
                        </button>
                      </div>
                      {problems.length === 0 ? (
                        <p className="mt-2 text-xs italic text-slate-400">
                          No custom problems added yet (default problems are shown until you add custom bullets).
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {problems.map((prob, pIdx) => (
                            <div key={pIdx} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={prob}
                                onChange={(e) => {
                                  const next = [...problems];
                                  next[pIdx] = e.target.value;
                                  updateCategoryField(idx, {
                                    common_problems: next,
                                  });
                                }}
                                placeholder="e.g. Leaking concealed PPR or PVC joints causing wall dampness"
                                className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCategoryField(idx, {
                                    common_problems: problems.filter(
                                      (_, i) => i !== pIdx
                                    ),
                                  })
                                }
                                className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                                aria-label="Remove problem"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* E. Service-Specific FAQs (Page + FAQPage JSON-LD) */}
                    <div className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                            Service FAQs &amp; Rich Schema ({faqs.length})
                          </h3>
                          <p className="text-[11px] text-slate-500">
                            Displayed on /services/{cat.slug} and included in Google FAQPage structured data.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateCategoryField(idx, {
                              faqs: [...faqs, { question: "", answer: "" }],
                            })
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" /> Add FAQ
                        </button>
                      </div>
                      {faqs.length === 0 ? (
                        <p className="mt-2 text-xs italic text-slate-400">
                          No custom FAQs added yet (default service FAQs are shown until you add custom Q&amp;As).
                        </p>
                      ) : (
                        <div className="mt-3 space-y-3">
                          {faqs.map((faq, fIdx) => (
                            <div
                              key={fIdx}
                              className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={faq.question}
                                  onChange={(e) => {
                                    const next = [...faqs];
                                    next[fIdx] = {
                                      ...next[fIdx],
                                      question: e.target.value,
                                    };
                                    updateCategoryField(idx, { faqs: next });
                                  }}
                                  placeholder="Question (e.g. How do you quote for pipe installation in Kano?)"
                                  className="h-9 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCategoryField(idx, {
                                      faqs: faqs.filter((_, i) => i !== fIdx),
                                    })
                                  }
                                  className="rounded-lg border border-red-200 bg-white p-1.5 text-red-600 hover:bg-red-50"
                                  aria-label="Remove FAQ"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <textarea
                                rows={2}
                                value={faq.answer}
                                onChange={(e) => {
                                  const next = [...faqs];
                                  next[fIdx] = {
                                    ...next[fIdx],
                                    answer: e.target.value,
                                  };
                                  updateCategoryField(idx, { faqs: next });
                                }}
                                placeholder="Answer..."
                                className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* F. Related Services Cross-Linking */}
                    <div className="rounded-xl border border-slate-200 p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                        Related Services Linked on /services/{cat.slug}
                      </h3>
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {categories
                          .filter((_, i) => i !== idx)
                          .map((other) => {
                            const selected = relatedSlugs.includes(other.slug);
                            return (
                              <button
                                key={other.id}
                                type="button"
                                onClick={() => {
                                  const next = selected
                                    ? relatedSlugs.filter((s) => s !== other.slug)
                                    : [...relatedSlugs, other.slug];
                                  updateCategoryField(idx, {
                                    related_slugs: next,
                                  });
                                }}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                                  selected
                                    ? "border-[#0B1F3A] bg-[#0B1F3A] text-[#F5B301]"
                                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                }`}
                              >
                                {selected ? "✓ " : "+ "}
                                {other.title}
                              </button>
                            );
                          })}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedCatId(null)}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Done Editing {cat.title}
                      </button>
                      <button
                        type="submit"
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#F5B301] px-4 py-2 text-xs font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-50"
                      >
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save All Services
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New service name (e.g. Borehole & Submersible Pump Servicing)"
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <input
            type="text"
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            placeholder="Short summary (optional)"
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button
            type="button"
            onClick={addCategory}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" /> Add New Service
          </button>
        </div>
      </section>

      {/* 3. Coverage Areas (State / Area / Active) */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-[#0B1F3A]">Service Coverage Areas</h2>
        <p className="text-xs text-slate-500">
          Only active areas are listed publicly and in the plumber application form.
        </p>

        <div className="mt-4 space-y-2">
          {coverageAreas.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3"
            >
              <input
                type="text"
                value={item.state}
                onChange={(e) =>
                  setCoverageAreas((prev) =>
                    prev.map((a, i) => (i === idx ? { ...a, state: e.target.value } : a))
                  )
                }
                placeholder="State"
                className="h-10 w-36 rounded-lg border border-slate-200 px-3 text-sm"
              />
              <input
                type="text"
                value={item.area}
                onChange={(e) =>
                  setCoverageAreas((prev) =>
                    prev.map((a, i) => (i === idx ? { ...a, area: e.target.value } : a))
                  )
                }
                placeholder="Area / District"
                className="h-10 flex-1 min-w-[160px] rounded-lg border border-slate-200 px-3 text-sm"
              />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={item.active}
                  onChange={(e) =>
                    setCoverageAreas((prev) =>
                      prev.map((a, i) => (i === idx ? { ...a, active: e.target.checked } : a))
                    )
                  }
                />
                Active
              </label>
              <button
                type="button"
                onClick={() =>
                  setCoverageAreas((prev) => prev.filter((_, i) => i !== idx))
                }
                className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newState}
            onChange={(e) => setNewState(e.target.value)}
            placeholder="State"
            className="h-11 rounded-xl border border-slate-200 px-3 text-sm sm:w-44"
          />
          <input
            type="text"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
            placeholder="Area name"
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button
            type="button"
            onClick={addCoverageArea}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" /> Add Area
          </button>
        </div>
      </section>

      {/* 4. Commission Rules (Owner Only) */}
      {isOwner && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1F3A]">
            Commission Policy (Owner Only)
          </h2>
          <p className="text-xs text-slate-500">
            Applies to labour charges only. Materials are excluded.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Standard Commission Rate (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
              />
            </div>

            <div className="sm:col-span-2 flex items-end">
              <label className="flex h-11 items-center gap-2.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-[#0B1F3A]">
                <input
                  type="checkbox"
                  checked={smallJobEnabled}
                  onChange={(e) => setSmallJobEnabled(e.target.checked)}
                />
                Enable optional small-job commission rule
              </label>
            </div>

            {smallJobEnabled && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Small-Job Rate (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={smallJobRate}
                    onChange={(e) => setSmallJobRate(e.target.value)}
                    placeholder="Enter rate"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Small-Job Threshold (₦)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={smallJobThreshold}
                    onChange={(e) => setSmallJobThreshold(e.target.value)}
                    placeholder="Enter threshold"
                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
                  />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* 5. Users & Access (Owner Only) */}
      {isOwner && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0B1F3A]">
            Users & Access Control (Owner Only)
          </h2>
          <p className="text-xs text-slate-500">
            Manage Owner and Admin access roles. Signed in as {currentUserEmail || "Owner"}.
          </p>

          <div className="mt-4 space-y-2">
            {adminUsers.map((u, idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-[#0B1F3A]">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <ClassicSelect
                    size="sm"
                    value={u.role}
                    onChange={(val) =>
                      setAdminUsers((prev) =>
                        prev.map((item, i) =>
                          i === idx
                            ? { ...item, role: val as "Owner" | "Admin" }
                            : item
                        )
                      )
                    }
                    className="min-w-[100px]"
                    options={[
                      { value: "Owner", label: "Owner" },
                      { value: "Admin", label: "Admin" },
                    ]}
                  />
                  <label className="flex items-center gap-1.5 text-xs font-semibold">
                    <input
                      type="checkbox"
                      checked={u.active}
                      onChange={(e) =>
                        setAdminUsers((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, active: e.target.checked } : item
                          )
                        )
                      }
                    />
                    Active
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={newAdminName}
              onChange={(e) => setNewAdminName(e.target.value)}
              placeholder="Staff name"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm sm:w-44"
            />
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="Staff email"
              className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <ClassicSelect
              value={newAdminRole}
              onChange={(val) => setNewAdminRole(val as "Owner" | "Admin")}
              className="sm:w-32"
              options={[
                { value: "Admin", label: "Admin" },
                { value: "Owner", label: "Owner" },
              ]}
            />
            <button
              type="button"
              onClick={addAdminUser}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
            >
              <Plus className="h-4 w-4" /> Add Staff
            </button>
          </div>
        </section>
      )}

      {/* 6. Notification Preferences */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-[#0B1F3A]">Notification Preferences</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Operations Notification Email
            </label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Dispatch Status Label (optional)
            </label>
            <input
              type="text"
              value={dispatchStatusText}
              onChange={(e) => setDispatchStatusText(e.target.value)}
              placeholder="e.g. Dispatch Desk Open"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={notifPrefs.new_request}
              onChange={(e) =>
                setNotifPrefs((p) => ({ ...p, new_request: e.target.checked }))
              }
            />
            Notify when a new customer service request is submitted
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={notifPrefs.new_application}
              onChange={(e) =>
                setNotifPrefs((p) => ({
                  ...p,
                  new_application: e.target.checked,
                }))
              }
            />
            Notify when a new plumber application is submitted
          </label>
          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={notifPrefs.complaint}
              onChange={(e) =>
                setNotifPrefs((p) => ({ ...p, complaint: e.target.checked }))
              }
            />
            Notify when a customer submits a complaint or feedback
          </label>
        </div>
      </section>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F5B301] px-6 text-sm font-bold text-[#07152B] transition hover:bg-[#e5a700] disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span>{isPending ? "Saving..." : "Save Platform Settings"}</span>
        </button>
      </div>
    </form>
  );
}
