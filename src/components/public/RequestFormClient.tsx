"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  Crosshair,
  Loader2,
  MapPin,
  MessageCircle,
  Trash2,
} from "lucide-react";
import { submitServiceRequest } from "@/app/actions/service-requests";
import { LiveMap } from "@/components/map/LiveMap";
import { ClassicSelect } from "@/components/ui/ClassicSelect";

const NIGERIAN_STATES = [
  "Abuja (FCT)",
  "Bauchi State",
  "Jigawa State",
  "Kaduna State",
  "Kano State",
  "Katsina State",
  "Lagos State",
  "Plateau State",
  "Other State",
];

const STEPS = [
  { id: 1, label: "Service" },
  { id: 2, label: "Location" },
  { id: 3, label: "Details" },
  { id: 4, label: "Photos" },
  { id: 5, label: "Review" },
];

const DRAFT_KEY = "bp_request_form_draft_v1";

export default function RequestFormClient({
  activeLocations = [],
  serviceOptions = [],
  defaultState = "",
}: {
  activeLocations?: string[];
  serviceOptions?: { id: string; title: string }[];
  defaultState?: string;
}) {
  const searchParams = useSearchParams();
  const initialService = searchParams.get("service") || "";

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    state: defaultState,
    cityOrLga: "",
    customCityOrLga: "",
    neighbourhood: "",
    address: "",
    problemType: initialService || serviceOptions[0]?.title || "General Plumbing",
    issueSummary: "",
    urgency: "standard" as "standard" | "urgent",
    preferredDate: "",
    preferredTime: "Morning (8:00 AM – 12:00 PM)",
    consentPrivacy: true,
    website: "",
  });

  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<{
    ticketNumber: string;
    phone: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [customerLocationSource, setCustomerLocationSource] = useState<
    "gps" | "map_pin" | "address_only"
  >("address_only");
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);

  // Restore session draft
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setFormData((prev) => ({
            ...prev,
            ...parsed,
            problemType: initialService || parsed.problemType || prev.problemType,
          }));
        }
      }
    } catch {}
  }, [initialService]);

  // Save session draft
  useEffect(() => {
    if (submittedTicket) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    } catch {}
  }, [formData, submittedTicket]);

  const effectiveCityOrLga =
    activeLocations.length > 0 && formData.cityOrLga !== "__other__"
      ? formData.cityOrLga
      : formData.customCityOrLga;

  const validateStep = (targetStep: number): string | null => {
    if (targetStep === 1 && !formData.problemType.trim()) {
      return "Please choose a plumbing service category.";
    }
    if (targetStep === 2) {
      if (!formData.state.trim()) return "Please select your state.";
      if (!effectiveCityOrLga.trim()) return "Please select or enter your area / LGA.";
      if (!formData.address.trim()) return "Please enter your property address or landmark.";
    }
    if (targetStep === 3) {
      if (!formData.fullName.trim()) return "Please enter your full name.";
      if (!formData.phone.trim() || formData.phone.trim().length < 9) {
        return "Please enter a valid telephone number.";
      }
      if (!formData.issueSummary.trim()) return "Please describe the plumbing issue.";
    }
    return null;
  };

  const handleNext = () => {
    const err = validateStep(step);
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStep((s) => Math.min(5, s + 1));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setPhotoUploading(true);
    setErrorMessage(null);
    try {
      for (const file of files.slice(0, Math.max(0, 5 - photos.length))) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/request-photo", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error || "Could not upload photo.");
          break;
        }
        setPhotos((prev) => [...prev, { url: data.url, name: data.name || file.name }]);
      }
    } catch {
      setErrorMessage("Network error while uploading photo.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const err1 = validateStep(1) || validateStep(2) || validateStep(3);
    if (err1) {
      setErrorMessage(err1);
      return;
    }
    if (!formData.consentPrivacy) {
      setErrorMessage("Please confirm consent to our privacy policy to proceed.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitServiceRequest({
        ...formData,
        cityOrLga: effectiveCityOrLga.trim(),
        photos: photos.map((p) => p.url),
        customerLocationSource: customerCoords
          ? customerLocationSource
          : "address_only",
        ...(customerCoords
          ? { customerLat: customerCoords.lat, customerLng: customerCoords.lng }
          : {}),
      });
      if (res.success && res.ticketNumber) {
        try {
          window.sessionStorage.removeItem(DRAFT_KEY);
        } catch {}
        setSubmittedTicket({
          ticketNumber: res.ticketNumber,
          phone: formData.phone.trim(),
        });
      } else {
        setErrorMessage(res.error || "Unable to submit your request. Please try again.");
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "A network or server error occurred."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copyTicket = () => {
    if (submittedTicket?.ticketNumber) {
      navigator.clipboard.writeText(submittedTicket.ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (submittedTicket) {
    const shareText = encodeURIComponent(
      `Bin Plumbing Service Request\nReference: ${submittedTicket.ticketNumber}\nService: ${formData.problemType}\nLocation: ${effectiveCityOrLga}, ${formData.state}`
    );

    return (
      <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="mt-5 font-heading text-2xl font-bold text-[#0B1F3A]">
          Service Request Confirmed
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#4B5B70]">
          Your request has been logged. Our coordination team will review your details and contact you shortly.
        </p>

        <div className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Your Reference Number
          </p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="font-mono text-2xl font-bold text-[#0B1F3A]">
              {submittedTicket.ticketNumber}
            </span>
            <button
              type="button"
              onClick={copyTicket}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100"
              title="Copy Reference Number"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {copied && (
            <p className="mt-1 text-xs font-medium text-emerald-600">Copied to clipboard</p>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href={`/tracking?ticket=${encodeURIComponent(submittedTicket.ticketNumber)}&phone=${encodeURIComponent(submittedTicket.phone)}`}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0B1F3A] px-6 text-sm font-bold text-white transition hover:bg-[#132E54] sm:w-auto"
          >
            <span>Track This Request</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white transition hover:bg-emerald-700 sm:w-auto"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Share on WhatsApp</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm sm:p-8"
    >
      {/* Honeypot */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={formData.website}
        onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))}
        className="hidden"
        aria-hidden="true"
      />

      {/* Progress Bar & Stepper */}
      <div>
        <div className="mb-3 flex items-center justify-between text-xs font-bold text-[#0B1F3A]">
          <span>
            Step {step} of {STEPS.length}: {STEPS[step - 1].label}
          </span>
          <span className="text-slate-500">{Math.round((step / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-[#F5B301] transition-all duration-300"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5 text-center">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id < step) {
                  setErrorMessage(null);
                  setStep(s.id);
                }
              }}
              className={`rounded-lg py-1.5 text-[11px] font-semibold transition ${
                s.id === step
                  ? "bg-[#0B1F3A] text-white"
                  : s.id < step
                    ? "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    : "bg-slate-50 text-slate-400"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* STEP 1: Service */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
            1. What plumbing service do you need?
          </h2>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Service Category <span className="text-red-500">*</span>
            </label>
            <ClassicSelect
              value={formData.problemType}
              onChange={(val) => setFormData((p) => ({ ...p, problemType: val }))}
              options={[
                ...serviceOptions.map((srv) => ({
                  value: srv.title,
                  label: srv.title,
                })),
                { value: "General Plumbing", label: "General Plumbing / Other" },
              ]}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Urgency Level
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, urgency: "standard" }))}
                className={`h-12 rounded-xl border text-sm font-bold transition ${
                  formData.urgency === "standard"
                    ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                    : "border-[#CBD5E1] bg-white text-[#4B5B70]"
                }`}
              >
                Standard Request
              </button>
              <button
                type="button"
                onClick={() => setFormData((p) => ({ ...p, urgency: "urgent" }))}
                className={`h-12 rounded-xl border text-sm font-bold transition ${
                  formData.urgency === "urgent"
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-[#CBD5E1] bg-white text-[#4B5B70]"
                }`}
              >
                Urgent / Leak Emergency
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Location */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
            2. Where is the property located?
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                State <span className="text-red-500">*</span>
              </label>
              <ClassicSelect
                value={formData.state}
                onChange={(val) => setFormData((p) => ({ ...p, state: val }))}
                placeholder="Select State"
                options={[
                  { value: "", label: "Select State" },
                  ...NIGERIAN_STATES.map((st) => ({ value: st, label: st })),
                ]}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                City / Area / LGA <span className="text-red-500">*</span>
              </label>
              {activeLocations.length > 0 ? (
                <ClassicSelect
                  value={formData.cityOrLga}
                  onChange={(val) => setFormData((p) => ({ ...p, cityOrLga: val }))}
                  placeholder="Select Area"
                  options={[
                    { value: "", label: "Select Area" },
                    ...activeLocations.map((loc) => ({ value: loc, label: loc })),
                    { value: "__other__", label: "Other Area (Specify)" },
                  ]}
                />
              ) : (
                <input
                  type="text"
                  value={formData.customCityOrLga}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, customCityOrLga: e.target.value }))
                  }
                  placeholder="Enter your city or LGA"
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              )}
            </div>
          </div>

          {activeLocations.length > 0 && formData.cityOrLga === "__other__" && (
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                Specify City / Area <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.customCityOrLga}
                onChange={(e) =>
                  setFormData((p) => ({ ...p, customCityOrLga: e.target.value }))
                }
                placeholder="Enter your area name"
                className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Street Address & Nearest Landmark <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
              placeholder="House number, street name, and nearest landmark"
              className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0B1F3A]">
                  Pin Exact Property Location (Optional)
                </p>
                <p className="text-xs text-slate-500">
                  Helps the assigned plumber navigate directly to your property. You can also submit using your street address alone.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={locatingGps}
                  onClick={() => {
                    if (typeof navigator === "undefined" || !navigator.geolocation) {
                      setGpsNotice("GPS is not available on this device. You can pin your property on the map or use your street address.");
                      return;
                    }
                    setLocatingGps(true);
                    setGpsNotice(null);
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setCustomerCoords({
                          lat: pos.coords.latitude,
                          lng: pos.coords.longitude,
                        });
                        setCustomerLocationSource("gps");
                        setShowMapPicker(true);
                        setLocatingGps(false);
                      },
                      (err) => {
                        setLocatingGps(false);
                        setGpsNotice(
                          err.code === 1
                            ? "Location permission was denied. No problem — you can pin your property on the map or continue with your street address."
                            : "Could not detect GPS location. You can pin your property on the map or continue with your street address."
                        );
                      },
                      { enableHighAccuracy: true, timeout: 10000 }
                    );
                  }}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition disabled:opacity-60 ${
                    customerLocationSource === "gps" && customerCoords
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-[#0B1F3A] text-white hover:bg-[#132f57]"
                  }`}
                >
                  {locatingGps ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Crosshair className="h-3.5 w-3.5 text-[#F5B301]" />
                  )}
                  Use My Current GPS
                </button>
                <button
                  type="button"
                  onClick={() => setShowMapPicker((v) => !v)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition ${
                    customerLocationSource === "map_pin" && customerCoords
                      ? "border-[#F5B301] bg-amber-50 text-[#0B1F3A]"
                      : "border-slate-300 bg-white text-[#0B1F3A] hover:bg-slate-100"
                  }`}
                >
                  <MapPin className="h-3.5 w-3.5" />
                  {showMapPicker ? "Hide Map" : "Pin My Property on Map"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomerCoords(null);
                    setCustomerLocationSource("address_only");
                    setShowMapPicker(false);
                    setGpsNotice(null);
                  }}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold transition ${
                    customerLocationSource === "address_only" && !customerCoords
                      ? "border-slate-400 bg-slate-200/70 text-[#0B1F3A]"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  Enter My Address Manually
                </button>
              </div>
            </div>
            {gpsNotice && (
              <p className="text-xs font-medium text-amber-700">{gpsNotice}</p>
            )}
            {customerCoords && (
              <p className="text-xs font-medium text-emerald-700">
                Property pinned ({customerLocationSource === "gps" ? "via GPS" : "on map"}: {customerCoords.lat.toFixed(5)}, {customerCoords.lng.toFixed(5)}). Click the map to adjust if needed.
              </p>
            )}
            {showMapPicker && (
              <div className="space-y-1.5">
                <LiveMap
                  markers={
                    customerCoords
                      ? [
                          {
                            id: "customer-pin",
                            lat: customerCoords.lat,
                            lng: customerCoords.lng,
                            label: "Your Property",
                            kind: "customer",
                          },
                        ]
                      : []
                  }
                  center={customerCoords || undefined}
                  heightClassName="h-56"
                  interactivePicker
                  onPickLocation={(lat, lng) => {
                    setCustomerCoords({ lat, lng });
                    setCustomerLocationSource("map_pin");
                    setGpsNotice(null);
                  }}
                />
                <p className="text-[11px] text-slate-500">
                  Tap anywhere on the map to place or move your property pin.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: Details & Contact */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
            3. Contact & Issue Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData((p) => ({ ...p, fullName: e.target.value }))}
                placeholder="Your full name"
                className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                placeholder="e.g. 0806 329 8575"
                className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                Email (Optional)
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                placeholder="you@example.com"
                className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                Preferred Visit Time
              </label>
              <ClassicSelect
                value={formData.preferredTime}
                onChange={(val) => setFormData((p) => ({ ...p, preferredTime: val }))}
                options={[
                  { value: "Morning (8:00 AM – 12:00 PM)", label: "Morning (8:00 AM – 12:00 PM)" },
                  { value: "Afternoon (12:00 PM – 4:00 PM)", label: "Afternoon (12:00 PM – 4:00 PM)" },
                  { value: "Evening (4:00 PM – 6:30 PM)", label: "Evening (4:00 PM – 6:30 PM)" },
                  { value: "Anytime Today", label: "Earliest Available" },
                ]}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
              Describe the Plumbing Issue <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={4}
              value={formData.issueSummary}
              onChange={(e) => setFormData((p) => ({ ...p, issueSummary: e.target.value }))}
              placeholder="Explain what happened, where the leak/fault is, and any urgent details..."
              className="w-full rounded-xl border border-[#CBD5E1] p-3.5 text-base text-[#0B1F3A]"
            />
          </div>
        </div>
      )}

      {/* STEP 4: Photos */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
            4. Add Photos (Optional)
          </h2>
          <p className="text-sm text-[#4B5B70]">
            Photos help our plumber bring the right fittings and give a faster quotation. Up to 5 photos (JPG, PNG, WebP, max 5 MB each).
          </p>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center transition hover:border-[#F5B301] hover:bg-amber-50/20">
            {photoUploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-[#0B1F3A]" />
            ) : (
              <Camera className="h-8 w-8 text-[#0B1F3A]" />
            )}
            <span className="mt-2 text-sm font-bold text-[#0B1F3A]">
              {photoUploading ? "Uploading..." : "Tap to Take Photo or Choose Images"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={photoUploading || photos.length >= 5}
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </label>

          {photos.length > 0 && (
            <div className="space-y-2">
              {photos.map((ph, idx) => (
                <div
                  key={ph.url}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm"
                >
                  <span className="truncate font-medium text-[#0B1F3A]">
                    Photo {idx + 1}: {ph.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((p) => p.url !== ph.url))}
                    className="rounded-lg p-1 text-red-600 hover:bg-red-50"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 5: Review & Consent */}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
            5. Review & Submit
          </h2>
          <div className="space-y-2 rounded-xl border border-slate-200 bg-[#F4F6F9] p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold text-[#0B1F3A]">Service:</span> {formData.problemType} (
              {formData.urgency === "urgent" ? "Urgent" : "Standard"})
            </p>
            <p>
              <span className="font-semibold text-[#0B1F3A]">Location:</span> {formData.address},{" "}
              {effectiveCityOrLga}, {formData.state}
            </p>
            <p>
              <span className="font-semibold text-[#0B1F3A]">Customer:</span> {formData.fullName} •{" "}
              {formData.phone}
            </p>
            <p>
              <span className="font-semibold text-[#0B1F3A]">Issue:</span> {formData.issueSummary}
            </p>
            <p>
              <span className="font-semibold text-[#0B1F3A]">Photos attached:</span> {photos.length}
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-[#4B5B70]">
            <input
              type="checkbox"
              checked={formData.consentPrivacy}
              onChange={(e) => setFormData((p) => ({ ...p, consentPrivacy: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
            />
            <span>
              I agree to the{" "}
              <Link href="/privacy" className="font-semibold text-[#0B1F3A] underline">
                Privacy Policy
              </Link>{" "}
              and consent to Bin Plumbing Services Ltd contacting me regarding this request.
            </span>
          </label>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {step > 1 ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setStep((s) => Math.max(1, s - 1));
            }}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-[#0B1F3A] hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
        ) : (
          <div />
        )}

        {step < 5 ? (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#0B1F3A] px-6 text-sm font-bold text-white hover:bg-[#132E54]"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#F5B301] px-6 text-sm font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{submitting ? "Submitting..." : "Submit Service Request"}</span>
          </button>
        )}
      </div>
    </form>
  );
}
