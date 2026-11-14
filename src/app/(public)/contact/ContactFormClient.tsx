"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, CheckCircle2, Send } from "lucide-react";
import { submitContactEnquiry } from "@/app/actions/enquiries";

interface ContactFormClientProps {
  activeLocations: string[];
  serviceOptions?: { id: string; title: string }[];
}

export function ContactFormClient({ activeLocations, serviceOptions = [] }: ContactFormClientProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    location: "",
    customLocation: "",
    serviceType: "",
    message: "",
    website: "",
  });

  const formLoadedAt = useRef<number>(0);

  useEffect(() => {
    formLoadedAt.current = Date.now();
  }, []);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const effectiveLocation =
    activeLocations.length > 0 && formData.location !== "__other__"
      ? formData.location
      : formData.customLocation;

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      errors.fullName = "Please enter your full name.";
    }
    if (!formData.phone.trim() || formData.phone.replace(/[^0-9+]/g, "").length < 7) {
      errors.phone = "Please enter a valid phone number.";
    }
    if (!effectiveLocation.trim()) {
      errors.location = "Please select or enter your location.";
    }
    if (!formData.message.trim() || formData.message.trim().length < 10) {
      errors.message = "Please enter a message of at least 10 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!validate()) return;

    setIsSubmitting(true);

    const res = await submitContactEnquiry({
      fullName: formData.fullName,
      phone: formData.phone,
      location: effectiveLocation,
      serviceType: formData.serviceType || "General Enquiry",
      message: formData.message,
      website: formData.website,
      formLoadedAt: formLoadedAt.current,
    });

    setIsSubmitting(false);

    if (!res.success) {
      setErrorMessage(res.error || "Unable to send your enquiry right now. Please try again.");
      return;
    }

    setSubmitted(true);
  };

  const inputBase =
    "h-12 w-full rounded-xl border border-[#E3E8EF] bg-white px-4 text-base text-[#1B2430] placeholder:text-[#5B6675]/70 transition-colors focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30";

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-heading text-xl font-bold text-[#0B1F3A]">
          Enquiry Received
        </h3>
        <p className="mt-2 text-base text-[#5B6675]">
          Thank you for contacting Bin Plumbing Services Ltd. Our team will review your message and reach out shortly.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setFormData({
              fullName: "",
              phone: "",
              location: "",
              customLocation: "",
              serviceType: "",
              message: "",
              website: "",
            });
            setFieldErrors({});
            formLoadedAt.current = Date.now();
          }}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-[#0B1F3A] px-5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
        >
          Send Another Enquiry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Honeypot field hidden from human users */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input
          id="contact-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
        />
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Full Name <span className="text-red-600">*</span>
          </label>
          <input
            id="contact-name"
            type="text"
            required
            placeholder="Your full name"
            value={formData.fullName}
            onChange={(e) => {
              setFormData({ ...formData, fullName: e.target.value });
              if (fieldErrors.fullName) setFieldErrors({ ...fieldErrors, fullName: "" });
            }}
            className={inputBase}
          />
          {fieldErrors.fullName && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.fullName}</p>
          )}
        </div>

        <div>
          <label htmlFor="contact-phone" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Phone Number <span className="text-red-600">*</span>
          </label>
          <input
            id="contact-phone"
            type="tel"
            required
            placeholder="e.g. 0806 000 0000"
            value={formData.phone}
            onChange={(e) => {
              setFormData({ ...formData, phone: e.target.value });
              if (fieldErrors.phone) setFieldErrors({ ...fieldErrors, phone: "" });
            }}
            className={inputBase}
          />
          {fieldErrors.phone && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-location" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Area / Location <span className="text-red-600">*</span>
          </label>
          {activeLocations.length > 0 ? (
            <select
              id="contact-location"
              required
              value={formData.location}
              onChange={(e) => {
                setFormData({ ...formData, location: e.target.value });
                if (fieldErrors.location) setFieldErrors({ ...fieldErrors, location: "" });
              }}
              className={inputBase}
            >
              <option value="">Select your area...</option>
              {activeLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
              <option value="__other__">Other area</option>
            </select>
          ) : (
            <input
              id="contact-location"
              type="text"
              required
              placeholder="Enter your area or street"
              value={formData.customLocation}
              onChange={(e) => {
                setFormData({ ...formData, customLocation: e.target.value });
                if (fieldErrors.location) setFieldErrors({ ...fieldErrors, location: "" });
              }}
              className={inputBase}
            />
          )}

          {activeLocations.length > 0 && formData.location === "__other__" && (
            <input
              type="text"
              placeholder="Enter your area"
              value={formData.customLocation}
              onChange={(e) => {
                setFormData({ ...formData, customLocation: e.target.value });
                if (fieldErrors.location) setFieldErrors({ ...fieldErrors, location: "" });
              }}
              className={`${inputBase} mt-3`}
            />
          )}

          {fieldErrors.location && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.location}</p>
          )}
        </div>

        <div>
          <label htmlFor="contact-service" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
            Topic / Service
          </label>
          <select
            id="contact-service"
            value={formData.serviceType}
            onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
            className={inputBase}
          >
            <option value="">General Enquiry</option>
            {serviceOptions.map((service) => (
              <option key={service.id} value={service.title}>
                {service.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
          Message <span className="text-red-600">*</span>
        </label>
        <textarea
          id="contact-message"
          rows={5}
          required
          placeholder="Tell us what you need help with..."
          value={formData.message}
          onChange={(e) => {
            setFormData({ ...formData, message: e.target.value });
            if (fieldErrors.message) setFieldErrors({ ...fieldErrors, message: "" });
          }}
          className="w-full rounded-xl border border-[#E3E8EF] bg-white p-4 text-base text-[#1B2430] placeholder:text-[#5B6675]/70 transition-colors focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
        />
        {fieldErrors.message && (
          <p className="mt-1.5 text-sm text-red-600">{fieldErrors.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#F5B301] px-6 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Send Enquiry
          </>
        )}
      </button>
    </form>
  );
}
