"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { saveMarketplaceSettingsAction } from "@/app/actions/marketplace-actions";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import type { MarketplaceSettings } from "@/lib/marketplace";
import { MAP_CONFIG } from "@/lib/map-config";

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
    const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    setCategories((prev) => [
      ...prev,
      {
        id: slug,
        title: newCatName.trim(),
        slug,
        description: newCatDesc.trim(),
        image: "/images/hero-plumber.jpg",
        visible: true,
        order: prev.length + 1,
      },
    ]);
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

      {/* 2. Service Categories */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-[#0B1F3A]">Service Categories</h2>
        <p className="text-xs text-slate-500">
          Add, edit, hide, or reorder plumbing services shown on the public Services page.
        </p>

        <div className="mt-4 space-y-2.5">
          {categories.map((cat, idx) => (
            <div
              key={cat.id}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center"
            >
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  value={cat.title}
                  onChange={(e) =>
                    setCategories((prev) =>
                      prev.map((c, i) => (i === idx ? { ...c, title: e.target.value } : c))
                    )
                  }
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold"
                />
                <input
                  type="text"
                  value={cat.description || ""}
                  onChange={(e) =>
                    setCategories((prev) =>
                      prev.map((c, i) =>
                        i === idx ? { ...c, description: e.target.value } : c
                      )
                    )
                  }
                  placeholder="Short description"
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={cat.visible}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c, i) =>
                          i === idx ? { ...c, visible: e.target.checked } : c
                        )
                      )
                    }
                  />
                  Visible
                </label>
                <button
                  type="button"
                  onClick={() => moveCategory(idx, -1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCategory(idx, 1)}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCategories((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                  aria-label="Delete category"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New category name"
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <input
            type="text"
            value={newCatDesc}
            onChange={(e) => setNewCatDesc(e.target.value)}
            placeholder="Description (optional)"
            className="h-11 flex-1 rounded-xl border border-slate-200 px-3 text-sm"
          />
          <button
            type="button"
            onClick={addCategory}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" /> Add Category
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
