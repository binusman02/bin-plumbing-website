"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  LogOut,
  Send,
  ShieldCheck,
} from "lucide-react";
import { submitPlumberApplicationAction } from "@/app/actions/marketplace-actions";
import { logoutPlumberAction } from "@/app/actions/portal-auth";
import { ApplicationAuthGate } from "@/components/public/plumber-application/ApplicationAuthGate";
import { getStatusMeta } from "@/lib/status-styles";
import type { PlumberProfile } from "@/lib/marketplace";

const SKILL_OPTIONS = [
  "PPR Hot & Cold Pipe Welding",
  "PVC Drainage & Soil Stacks",
  "Leak Diagnosis & Pressure Testing",
  "Bathroom Sanitaryware & Taps",
  "Water Booster Pump Installation",
  "Overhead Poly Tank Fitting",
  "Commercial Restroom Fit-Outs",
  "Kitchen Sinks & Grease Traps",
  "Emergency Unblocking & Snaking",
];

const AVAILABILITY_OPTIONS = [
  "Full-time (Monday – Saturday)",
  "Part-time / Flexible Hours",
  "Weekdays Only",
  "Weekends & Emergency Callouts",
];

const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface PlumberApplicationClientProps {
  activeLocations?: string[];
  plumberAccount?: { fullName: string; phone: string; email: string } | null;
  existingApplication?: PlumberProfile | null;
}

export default function PlumberApplicationClient({
  activeLocations = [],
  plumberAccount = null,
  existingApplication = null,
}: PlumberApplicationClientProps) {
  const [formLoadedAt, setFormLoadedAt] = useState<number>(0);
  useEffect(() => {
    setFormLoadedAt(Date.now());
  }, []);

  // Step 2: Application Form states (pre-filled from plumberAccount)
  const [fullName, setFullName] = useState(plumberAccount?.fullName || "");
  const [phone, setPhone] = useState(plumberAccount?.phone || "");
  const [email, setEmail] = useState(plumberAccount?.email || "");
  const [residentialLocation, setResidentialLocation] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [customLocationsText, setCustomLocationsText] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([
    "PPR Hot & Cold Pipe Welding",
    "Bathroom Sanitaryware & Taps",
  ]);
  const [availability, setAvailability] = useState(AVAILABILITY_OPTIONS[0]);
  const [experienceYears, setExperienceYears] = useState("3");
  const [experienceDetails, setExperienceDetails] = useState("");
  const [referencesInfo, setReferencesInfo] = useState("");
  const [consentPrivacy, setConsentPrivacy] = useState(true);
  const [honeypot, setHoneypot] = useState("");

  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [tradeCertificate, setTradeCertificate] = useState<File | null>(null);
  const [workPhotos, setWorkPhotos] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationRef, setApplicationRef] = useState<string | null>(null);

  const toggleLocation = (loc: string) => {
    setSelectedLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const validateFileSize = (file: File | null, label: string) => {
    if (file && file.size > MAX_FILE_BYTES) {
      return `${label} exceeds the 5MB limit.`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setError("Please enter your full name as it appears on your ID.");
      return;
    }

    const compactPhone = phone.replace(/[\s()-]/g, "");
    if (!/^(?:\+?234|0)[789][01]\d{8}$/.test(compactPhone)) {
      setError("Please enter a valid Nigerian phone number (e.g. 0806 329 8575).");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setError("A valid email address is required for onboarding and portal access.");
      return;
    }

    if (!residentialLocation.trim()) {
      setError("Please enter your residential address or area.");
      return;
    }

    if (selectedSkills.length === 0) {
      setError("Please select at least one plumbing skill.");
      return;
    }

    if (!consentPrivacy) {
      setError("Please agree to the Privacy Notice before submitting your application.");
      return;
    }

    const idErr = validateFileSize(idDocument, "Government ID");
    if (idErr) return setError(idErr);
    const certErr = validateFileSize(tradeCertificate, "Trade Certificate");
    if (certErr) return setError(certErr);
    for (const p of workPhotos) {
      const pErr = validateFileSize(p, `Work photo (${p.name})`);
      if (pErr) return setError(pErr);
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.set("website", honeypot);
      formData.set("formLoadedAt", String(formLoadedAt));
      formData.set("fullName", fullName.trim());
      formData.set("phone", phone.trim());
      formData.set("email", email.trim());
      formData.set("residentialLocation", residentialLocation.trim());

      const combinedLocations = [
        ...selectedLocations,
        ...customLocationsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ];
      formData.set("preferredLocations", combinedLocations.join(", "));
      formData.set("skills", selectedSkills.join(", "));
      formData.set("availability", availability);
      formData.set("experienceYears", experienceYears);
      formData.set("experienceDetails", experienceDetails.trim());
      formData.set("referencesInfo", referencesInfo.trim());
      formData.set("consentPrivacy", String(consentPrivacy));

      if (idDocument) formData.set("idDocument", idDocument);
      if (tradeCertificate) formData.set("tradeCertificate", tradeCertificate);
      for (const photo of workPhotos) {
        formData.append("workPhotos", photo);
      }

      const res = await submitPlumberApplicationAction(formData);
      if (res.success) {
        setApplicationRef(res.applicationRef || "SUBMITTED");
      } else {
        setError(res.error || "Failed to submit application. Please check your entries.");
      }
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // STEP 1: Require Plumber Account before applying
  if (!plumberAccount) {
    return <ApplicationAuthGate />;
  }

  // Already submitted application -> show status card
  if (existingApplication) {
    const badge = getStatusMeta(existingApplication.verification_status);
    return (
      <div className="rounded-2xl border border-[#E3E8EF] bg-white p-8 text-center shadow-sm sm:p-10">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
        <h2 className="mt-4 font-heading text-2xl font-bold text-[#0B1F3A]">
          Application Already Submitted
        </h2>
        <p className="mt-2 text-base text-[#4B5B70]">
          Signed in as <strong>{plumberAccount.fullName}</strong> ({plumberAccount.email}).
        </p>
        {existingApplication.application_ref && (
          <div className="mx-auto mt-4 inline-block rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] px-5 py-3 font-mono text-lg font-bold text-[#0B1F3A]">
            {existingApplication.application_ref}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/plumber"
            className="inline-flex h-11 items-center rounded-xl bg-[#F5B301] px-5 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
          >
            Open Technician Portal
          </Link>
          <button
            type="button"
            onClick={() => logoutPlumberAction()}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" /> Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (applicationRef) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-heading text-2xl font-bold text-[#0B1F3A]">
          Application Received
        </h2>
        <p className="mt-2 text-base text-[#4B5B70]">
          Thank you for applying to join Bin Plumbing Services Ltd. Keep your application reference for follow-up:
        </p>
        <div className="mx-auto mt-4 inline-block rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] px-5 py-3 font-mono text-lg font-bold text-[#0B1F3A]">
          {applicationRef}
        </div>
        <p className="mt-4 text-sm text-[#5B6675]">
          Our coordination team will review your application, documents, and references before enabling job dispatch on your Technician Portal.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/plumber"
            className="inline-flex h-11 items-center rounded-xl bg-[#F5B301] px-5 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
          >
            Check Status in Technician Portal
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-xl bg-[#0B1F3A] px-5 text-sm font-semibold text-white hover:bg-[#132f57]"
          >
            Back to Website
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm sm:p-8"
      >
        <div className="hidden" aria-hidden="true">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3E8EF] pb-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#F5B301]">
              Step 2 of 2
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-[#0B1F3A]">
              Technician Onboarding Application
            </h2>
            <p className="mt-1 text-sm text-[#5B6675]">
              Signed in as <strong>{plumberAccount.email}</strong>. Uploaded documents are stored privately for admin review only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => logoutPlumberAction()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
        </div>

        {/* Basic Contact */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Full Name (as on ID) *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Phone Number (WhatsApp / Call) *
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0806 329 8575"
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Residential Area / Location *
            </label>
            <input
              type="text"
              required
              value={residentialLocation}
              onChange={(e) => setResidentialLocation(e.target.value)}
              placeholder="Your area and city"
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Years of Practical Experience *
            </label>
            <input
              type="number"
              min="0"
              max="50"
              required
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Work Availability *
            </label>
            <select
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              className="h-12 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            >
              {AVAILABILITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Preferred Coverage Areas */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[#0B1F3A]">
            Preferred Service Areas
          </label>
          {activeLocations.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {activeLocations.map((loc) => {
                const active = selectedLocations.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => toggleLocation(loc)}
                    className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-[#0B1F3A] text-white"
                        : "border border-[#CBD5E1] bg-white text-[#0B1F3A] hover:bg-slate-50"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          )}
          <input
            type="text"
            value={customLocationsText}
            onChange={(e) => setCustomLocationsText(e.target.value)}
            placeholder="Other areas you can cover (comma-separated, optional)"
            className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
          />
        </div>

        {/* Core Skills */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-[#0B1F3A]">
            Plumbing Specialties *
          </label>
          <div className="flex flex-wrap gap-2">
            {SKILL_OPTIONS.map((skill) => {
              const active = selectedSkills.includes(skill);
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-[#F5B301] text-[#07152B]"
                      : "border border-[#CBD5E1] bg-white text-[#0B1F3A] hover:bg-slate-50"
                  }`}
                >
                  {skill}
                </button>
              );
            })}
          </div>
        </div>

        {/* Experience & References */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Summary of Work Experience
            </label>
            <textarea
              rows={3}
              value={experienceDetails}
              onChange={(e) => setExperienceDetails(e.target.value)}
              placeholder="Types of buildings, pipework, pumps, or installations handled..."
              className="w-full rounded-xl border border-[#CBD5E1] p-3 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Trade References / Past Sites
            </label>
            <textarea
              rows={3}
              value={referencesInfo}
              onChange={(e) => setReferencesInfo(e.target.value)}
              placeholder="Names or contacts of past supervisors, builders, or clients..."
              className="w-full rounded-xl border border-[#CBD5E1] p-3 text-base text-[#0B1F3A] focus:border-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>
        </div>

        {/* Document Uploads */}
        <div className="space-y-4 rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
            <FileUp className="h-4 w-4 text-[#F5B301]" />
            Verification Documents (Max 5MB per file)
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">
                Government ID (JPG, PNG, PDF)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
                className="block w-full rounded-xl border border-[#CBD5E1] bg-white p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">
                Trade Certificate (Optional)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => setTradeCertificate(e.target.files?.[0] || null)}
                className="block w-full rounded-xl border border-[#CBD5E1] bg-white p-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">
                Previous Work Photos (Optional)
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                multiple
                onChange={(e) => setWorkPhotos(Array.from(e.target.files || []))}
                className="block w-full rounded-xl border border-[#CBD5E1] bg-white p-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Privacy Notice Consent */}
        <label className="flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-slate-50 p-4 text-sm text-[#4B5B70]">
          <input
            type="checkbox"
            checked={consentPrivacy}
            onChange={(e) => setConsentPrivacy(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
          />
          <span>
            I confirm the information provided is accurate and agree to the{" "}
            <Link href="/privacy" className="font-semibold text-[#0B1F3A] underline">
              Privacy Notice
            </Link>{" "}
            and onboarding verification checks.
          </span>
        </label>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-6 text-base font-bold text-[#07152B] transition hover:bg-[#e5a700] disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
          <span>{submitting ? "Submitting Application..." : "Submit Application"}</span>
        </button>
      </form>

      {/* What Happens Next & Onboarding Policy */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm">
          <h3 className="font-heading text-lg font-bold text-[#0B1F3A]">What Happens Next</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#4B5B70]">
            <li>Your application is logged with a unique reference number.</li>
            <li>Our team reviews your plumbing specialties, experience, and uploaded documents.</li>
            <li>We contact your references and invite shortlisted applicants for an ID and trade check.</li>
            <li>Approved plumbers sign the contractor agreement and unlock job dispatch in the Technician Portal.</li>
          </ol>
        </div>

        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#F5B301]" />
            <h3 className="font-heading text-lg font-bold text-[#0B1F3A]">Onboarding Policy</h3>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#4B5B70]">
            <li>Submitting an application does not guarantee immediate approval or job dispatch.</li>
            <li>Job access in the Technician Portal is enabled only after admin approval.</li>
            <li>Commission applies to agreed labour charges only; materials are separate.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
