"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Download,
  FileCheck2,
  HardHat,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  updatePlumberOnboardingAction,
  updatePlumberStatusAction,
} from "@/app/actions/marketplace-actions";
import { adminUpdatePlumberProfileAction } from "@/app/actions/profile-actions";
import { Avatar } from "@/components/ui";
import { formatDateTime } from "@/lib/currency";
import { getStatusMeta } from "@/lib/status-styles";
import type {
  PlumberProfile,
  PlumberVerificationStatus,
  ServiceRequestRecord,
} from "@/lib/marketplace";

interface PlumbersManagerClientProps {
  initialPlumbers: PlumberProfile[];
  requests?: ServiceRequestRecord[];
}

const STATUS_TABS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "under_review", label: "Under Review" },
  { id: "documents_required", label: "Documents Required" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "suspended", label: "Suspended" },
];

function normalizeStatus(status: string) {
  return status === "pending" ? "submitted" : status;
}

function buildDocumentHref(rawPath: string) {
  if (!rawPath) return "";
  if (rawPath.startsWith("/api/") || rawPath.startsWith("http")) return rawPath;
  const parts = rawPath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2) {
    const file = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    return `/api/admin/plumber-file?folder=${encodeURIComponent(folder)}&file=${encodeURIComponent(file)}`;
  }
  return rawPath;
}

export default function PlumbersManagerClient({
  initialPlumbers,
  requests = [],
}: PlumbersManagerClientProps) {
  const router = useRouter();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [plumbers, setPlumbers] = useState<PlumberProfile[]>(initialPlumbers);
  useEffect(() => {
    setPlumbers(initialPlumbers);
  }, [initialPlumbers]);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editResidentialLocation, setEditResidentialLocation] = useState("");
  const [editPreferredLocations, setEditPreferredLocations] = useState("");
  const [editSkills, setEditSkills] = useState("");
  const [editAvailability, setEditAvailability] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PlumberProfile | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [idChecked, setIdChecked] = useState(false);
  const [referencesChecked, setReferencesChecked] = useState(false);
  const [agreementSigned, setAgreementSigned] = useState(false);
  const [onboardingNotes, setOnboardingNotes] = useState("");
  const [agreementUrl, setAgreementUrl] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const filtered = useMemo(() => {
    return plumbers.filter((p) => {
      const normalized = normalizeStatus(p.verification_status);
      const matchesStatus = statusFilter === "all" || normalized === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        p.full_name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.application_ref || "").toLowerCase().includes(q) ||
        p.preferred_locations.join(" ").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [plumbers, statusFilter, search]);

  const openDetail = (plumber: PlumberProfile) => {
    setSelected(plumber);
    setEditName(plumber.full_name || "");
    setEditPhone(plumber.phone || "");
    setEditEmail(plumber.email || "");
    setEditResidentialLocation(plumber.residential_location || "");
    setEditPreferredLocations((plumber.preferred_locations || []).join(", "));
    setEditSkills((plumber.skills || []).join(", "));
    setEditAvailability(plumber.availability || "Standard");
    setIdChecked(Boolean(plumber.verification_checklist?.id_checked?.checked));
    setReferencesChecked(Boolean(plumber.verification_checklist?.references_checked?.checked));
    setAgreementSigned(Boolean(plumber.verification_checklist?.agreement_signed?.checked));
    setOnboardingNotes(plumber.onboarding_notes || "");
    setAgreementUrl(plumber.agreement_url || "");
    setRejectionReason(plumber.rejection_reason || "");
    setFeedback(null);
  };

  const handleUploadPlumberPhoto = async (file: File) => {
    if (!selected) return;
    setFeedback(null);
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("role", "admin");
      fd.append("targetPlumberId", selected.id);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Could not upload plumber photo." });
      } else {
        const updated: PlumberProfile = { ...selected, avatar_url: data.avatarUrl };
        setPlumbers((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
        setSelected(updated);
        setFeedback({ type: "success", text: "Plumber photo updated." });
        router.refresh();
      }
    } catch {
      setFeedback({ type: "error", text: "Photo upload failed. Please try again." });
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePlumberProfile = () => {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const preferredArr = editPreferredLocations
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const skillsArr = editSkills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await adminUpdatePlumberProfileAction({
        plumberId: selected.id,
        fullName: editName,
        phone: editPhone,
        email: editEmail,
        residentialLocation: editResidentialLocation,
        preferredLocations: preferredArr,
        skills: skillsArr,
        availability: editAvailability,
      });
      if (res.success) {
        const updated: PlumberProfile = {
          ...selected,
          full_name: editName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim() || undefined,
          residential_location: editResidentialLocation.trim(),
          preferred_locations: preferredArr,
          skills: skillsArr,
          availability: editAvailability.trim() || "Standard",
        };
        setPlumbers((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
        setSelected(updated);
        setFeedback({ type: "success", text: "Plumber profile updated." });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "Could not update plumber profile." });
      }
    });
  };

  const handleSaveOnboarding = () => {
    if (!selected) return;
    setFeedback(null);
    startTransition(async () => {
      const now = new Date().toISOString();
      const checklist: NonNullable<PlumberProfile["verification_checklist"]> = {
        id_checked: { checked: idChecked, date: idChecked ? now : undefined },
        references_checked: { checked: referencesChecked, date: referencesChecked ? now : undefined },
        agreement_signed: { checked: agreementSigned, date: agreementSigned ? now : undefined },
      };
      const res = await updatePlumberOnboardingAction({
        plumberId: selected.id,
        checklist,
        onboardingNotes,
        agreementUrl,
        rejectionReason,
      });
      if (res.success) {
        const updated: PlumberProfile = {
          ...selected,
          verification_checklist: checklist,
          onboarding_notes: onboardingNotes,
          agreement_url: agreementUrl,
          rejection_reason: rejectionReason,
        };
        setPlumbers((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
        setSelected(updated);
        setFeedback({ type: "success", text: "Verification checklist and notes saved." });
      } else {
        setFeedback({ type: "error", text: res.error || "Could not save onboarding notes." });
      }
    });
  };

  const handleStatusTransition = (nextStatus: PlumberVerificationStatus) => {
    if (!selected) return;
    if (nextStatus === "rejected" && !rejectionReason.trim()) {
      setFeedback({ type: "error", text: "Please enter a rejection reason before rejecting." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      const now = new Date().toISOString();
      const checklist: NonNullable<PlumberProfile["verification_checklist"]> = {
        id_checked: { checked: idChecked, date: idChecked ? now : undefined },
        references_checked: { checked: referencesChecked, date: referencesChecked ? now : undefined },
        agreement_signed: { checked: agreementSigned, date: agreementSigned ? now : undefined },
      };
      await updatePlumberOnboardingAction({
        plumberId: selected.id,
        checklist,
        rejectionReason,
        onboardingNotes,
        agreementUrl,
      });
      const res = await updatePlumberStatusAction(
        selected.id,
        nextStatus,
        nextStatus === "rejected" ? rejectionReason : onboardingNotes
      );
      if (res.success) {
        const updated: PlumberProfile = {
          ...selected,
          verification_status: nextStatus,
          verification_checklist: checklist,
          agreement_url: agreementUrl,
          rejection_reason: nextStatus === "rejected" ? rejectionReason : selected.rejection_reason,
          onboarding_notes: onboardingNotes,
        };
        setPlumbers((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
        setSelected(updated);
        setFeedback({
          type: "success",
          text: `Plumber status updated to ${getStatusMeta(nextStatus).label}.`,
        });
        router.refresh();
      } else {
        setFeedback({ type: "error", text: res.error || "Status update failed." });
      }
    });
  };

  return (
    <div className="space-y-3 pb-20 lg:pb-4">
      {/* Bigin-Style Command Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.id === "all"
                ? plumbers.length
                : plumbers.filter((p) => normalizeStatus(p.verification_status) === tab.id).length;
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                  active
                    ? "bg-[#0B1F3A] text-white shadow-2xs"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-56 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plumber, phone, ref, area..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-xs">
          <HardHat className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">No plumbers match this filter</p>
          <p className="mt-1 text-sm text-slate-500">
            New applications submitted through /join-as-plumber will appear here.
          </p>
        </div>
      ) : (
        <>
          {/* PC & Tablet Table */}
          <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs md:block">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50/90 text-[11px] font-semibold text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Technician Name</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Phone / Ref</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Coverage Locations & Skills</th>
                  <th className="hidden whitespace-nowrap px-3.5 py-2.5 lg:table-cell">Experience & Jobs</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Rating</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Verification Stage</th>
                  <th className="whitespace-nowrap px-3.5 py-2.5">Applied Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const badge = getStatusMeta(p.verification_status);
                  const assignedCount = requests.filter(
                    (r) => r.assigned_plumber_id === p.id
                  ).length;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => openDetail(p)}
                      className="group cursor-pointer transition-colors hover:bg-slate-50/90"
                    >
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <div className="inline-flex items-center gap-2">
                          <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                          <span className="font-semibold text-[#0B1F3A] group-hover:underline">
                            {p.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-600">
                        {p.phone} {p.application_ref ? `• ${p.application_ref}` : ""}
                      </td>
                      <td className="px-3.5 py-2.5">
                        <p className="flex items-center gap-1 text-xs text-slate-700">
                          <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                          <span className="truncate max-w-[200px]">
                            {p.preferred_locations.join(", ") || p.residential_location || "Not specified"}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate max-w-[220px] text-[11px] text-slate-500">
                          {p.skills.join(", ") || "General Plumbing"}
                        </p>
                      </td>
                      <td className="hidden whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-700 lg:table-cell">
                        <span>{p.experience_years} yrs exp</span>
                        <span className="ml-2 text-slate-400">
                          • {p.total_jobs} done • {assignedCount} active
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-700">
                        {p.total_jobs > 0 && p.rating != null ? `${p.rating.toFixed(1)} / 5` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-slate-500">
                        {new Date(p.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/90 px-4 py-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <span>
                  Total Plumbers <strong className="ml-1 font-bold text-slate-900">{plumbers.length}</strong>
                </span>
                <span>
                  Approved Network{" "}
                  <strong className="ml-1 font-bold text-emerald-700">
                    {plumbers.filter((p) => p.verification_status === "approved").length}
                  </strong>
                </span>
              </div>
              <span className="font-semibold text-slate-700">1 to {filtered.length}</span>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((p) => {
              const badge = getStatusMeta(p.verification_status);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDetail(p)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[#0B1F3A]">{p.full_name}</p>
                      <p className="text-xs text-slate-500">
                        {p.application_ref || p.phone}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-600">
                    {p.preferred_locations.join(", ") || p.residential_location || "Location not specified"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {p.total_jobs > 0 && p.rating != null
                      ? `Rating: ${p.rating.toFixed(1)} / 5`
                      : "No ratings yet"}{" "}
                    • {formatDateTime(p.created_at)}
                  </p>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Detail Drawer / Mobile Full Screen */}
      {selected && (() => {
        const badge = getStatusMeta(selected.verification_status);
        const cleanPhone = selected.phone.replace(/[^0-9+]/g, "");
        const waPhone = cleanPhone.replace(/^0/, "234").replace(/^\+/, "");
        const docLinks = (selected.documents || []).map((doc) => ({
          label: doc.name || doc.type,
          href: buildDocumentHref(doc.url),
        }));

        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[1px]">
            <div className="flex h-full w-full flex-col bg-white shadow-2xl md:w-[70%] md:max-w-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
                    aria-label="Back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#0B1F3A]">
                        {selected.application_ref || selected.id}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#0B1F3A] sm:text-lg">
                      {selected.full_name}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 md:flex"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-28 sm:p-6 md:pb-6">
                {/* Plumber Photo & Profile Edit */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={selected.full_name} src={selected.avatar_url} size="lg" />
                      <div>
                        <p className="text-sm font-bold text-[#0B1F3A]">{selected.full_name}</p>
                        <p className="text-xs text-slate-500">JPG, PNG, or WebP up to 5 MB</p>
                      </div>
                    </div>
                    <div>
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadPlumberPhoto(f);
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        disabled={uploadingPhoto}
                        onClick={() => photoInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
                      >
                        {uploadingPhoto ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
                        {uploadingPhoto ? "Uploading..." : "Upload Photo"}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Full Name</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
                      <input
                        type="text"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Availability</label>
                      <input
                        type="text"
                        value={editAvailability}
                        onChange={(e) => setEditAvailability(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Preferred Service Locations (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={editPreferredLocations}
                        onChange={(e) => setEditPreferredLocations(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Skills (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={editSkills}
                        onChange={(e) => setEditSkills(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-[#0B1F3A]"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={handleSavePlumberProfile}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#132f57] disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Profile Details
                    </button>
                  </div>
                </div>

                {/* Profile Summary */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-slate-500">Phone</p>
                      <p className="font-semibold text-[#0B1F3A]">{selected.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Email</p>
                      <p className="font-semibold text-[#0B1F3A]">
                        {selected.email || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Experience</p>
                      <p className="font-semibold text-[#0B1F3A]">
                        {selected.experience_years} year(s)
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Availability</p>
                      <p className="font-semibold text-[#0B1F3A]">
                        {selected.availability || "Standard"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500">Service Locations</p>
                      <p className="font-medium text-slate-800">
                        {selected.preferred_locations.join(", ") || selected.residential_location || "Not specified"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500">Skills</p>
                      <p className="font-medium text-slate-800">
                        {selected.skills.join(", ") || "General Plumbing"}
                      </p>
                    </div>
                    {selected.references_info && (
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-500">References / Applicant Notes</p>
                        <p className="font-medium text-slate-800 whitespace-pre-wrap">
                          {selected.references_info}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Private Uploaded Documents */}
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
                    <FileCheck2 className="h-4 w-4" />
                    Uploaded Verification Documents
                  </h4>
                  {docLinks.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No documents uploaded with this application yet.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {docLinks.map((doc, idx) => (
                        <a
                          key={idx}
                          href={doc.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
                        >
                          <Download className="h-4 w-4" />
                          <span>{doc.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* Verification Checklist & Onboarding Notes */}
                <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-sm font-bold text-[#0B1F3A]">Verification Checklist</h4>
                  <div className="space-y-2.5 text-sm">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={idChecked}
                        onChange={(e) => setIdChecked(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
                      />
                      <span className="font-medium text-slate-800">Government ID checked</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={referencesChecked}
                        onChange={(e) => setReferencesChecked(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
                      />
                      <span className="font-medium text-slate-800">
                        Trade experience & references checked
                      </span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={agreementSigned}
                        onChange={(e) => setAgreementSigned(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
                      />
                      <span className="font-medium text-slate-800">
                        Signed contractor agreement recorded
                      </span>
                    </label>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Signed Agreement Reference / URL
                    </label>
                    <input
                      type="text"
                      value={agreementUrl}
                      onChange={(e) => setAgreementUrl(e.target.value)}
                      placeholder="Agreement reference ID or link"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Onboarding Notes
                    </label>
                    <textarea
                      rows={3}
                      value={onboardingNotes}
                      onChange={(e) => setOnboardingNotes(e.target.value)}
                      placeholder="Internal notes on verification checks, interview, or missing documents..."
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Rejection / Document Request Reason
                    </label>
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Required if rejecting application"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveOnboarding}
                    disabled={isPending}
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-100"
                  >
                    Save Checklist & Notes
                  </button>
                </div>

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
              </div>

              {/* Action Bar */}
              <div className="border-t border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {cleanPhone && (
                    <>
                      <a
                        href={`tel:${cleanPhone}`}
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-[#0B1F3A]"
                      >
                        <Phone className="h-4 w-4" /> Call
                      </a>
                      <a
                        href={`https://wa.me/${waPhone}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-emerald-700"
                      >
                        <MessageCircle className="h-4 w-4" /> WhatsApp
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleStatusTransition("documents_required")}
                    className="h-11 rounded-xl border border-amber-300 bg-amber-50 px-3.5 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Request Docs
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleStatusTransition("rejected")}
                    className="h-11 rounded-xl border border-red-200 bg-red-50 px-3.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                  >
                    Reject
                  </button>
                  {selected.verification_status === "approved" ? (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleStatusTransition("suspended")}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700"
                    >
                      <ShieldAlert className="h-4 w-4" /> Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleStatusTransition("approved")}
                      className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F5B301] px-4 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      <span>
                        {selected.verification_status === "suspended" ? "Reactivate Plumber" : "Approve Plumber"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
