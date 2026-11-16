import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { Phone, Mail, MapPin, Clock, MessageSquare, ArrowRight } from "lucide-react";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";
import { ContactFormClient } from "./ContactFormClient";

export const metadata: Metadata = {
  title: "Contact Bin Plumbing Services Ltd in Kano",
  description:
    "Contact Bin Plumbing Services Ltd in Kano State for plumbing enquiries, service requests, quotations, and customer support.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact Bin Plumbing Services Ltd in Kano",
    description:
      "Speak with our coordination team in Kano for plumbing enquiries, quotations, and support.",
    url: "/contact",
    type: "website",
  },
};

export default async function ContactPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "service-categories");

  const [settings, categories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);
  const serviceOptions = categories.map((c) => ({ id: c.id, title: c.title || c.name || "" })).filter((c) => c.title);
  const phone = settings.company_phone;
  const email = settings.company_email;
  const address = settings.company_address;
  const whatsapp = settings.company_whatsapp;
  const workingHours = settings.working_hours?.trim();
  const activeLocations = settings.active_coverage_locations || [];
  const whatsappHref = whatsapp ? `https://wa.me/${whatsapp.replace(/[^0-9]/g, "")}` : null;

  return (
    <div className="bg-white">
      {/* Top Banner */}
      <section className="bg-[#07152B] py-16 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Contact
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Get in Touch
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Reach our coordination team for general plumbing enquiries, project discussions, or help with an existing request.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            {/* Left: Contact Information */}
            <div className="space-y-8 lg:col-span-5">
              <div>
                <h2 className="font-heading text-2xl font-bold text-[#0B1F3A] md:text-3xl">
                  Contact Details
                </h2>
                <p className="mt-3 text-base leading-relaxed text-[#5B6675]">
                  For an urgent plumbing dispatch or scheduled inspection, you can submit a service request directly online or reach us using the details below.
                </p>
              </div>

              <div className="space-y-5 border-t border-[#E3E8EF] pt-6">
                {phone && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#0B1F3A]">
                      <Phone className="h-5 w-5 text-[#F5B301]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">Phone</p>
                      <a
                        href={`tel:${phone.replace(/\s+/g, "")}`}
                        className="mt-0.5 inline-block text-base font-medium text-[#1B2430] transition-colors hover:text-[#0B1F3A]"
                      >
                        {phone}
                      </a>
                    </div>
                  </div>
                )}

                {email && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#0B1F3A]">
                      <Mail className="h-5 w-5 text-[#F5B301]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">Email</p>
                      <a
                        href={`mailto:${email}`}
                        className="mt-0.5 inline-block break-all text-base font-medium text-[#1B2430] transition-colors hover:text-[#0B1F3A]"
                      >
                        {email}
                      </a>
                    </div>
                  </div>
                )}

                {address && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#0B1F3A]">
                      <MapPin className="h-5 w-5 text-[#F5B301]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">Office Address</p>
                      <p className="mt-0.5 text-base text-[#5B6675]">{address}</p>
                    </div>
                  </div>
                )}

                {workingHours && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#0B1F3A]">
                      <Clock className="h-5 w-5 text-[#F5B301]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">Working Hours</p>
                      <p className="mt-0.5 text-base text-[#5B6675]">{workingHours}</p>
                    </div>
                  </div>
                )}

                {whatsappHref && (
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#0B1F3A]">
                      <MessageSquare className="h-5 w-5 text-[#F5B301]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0B1F3A]">WhatsApp</p>
                      <a
                        href={whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1.5 text-base font-medium text-[#0B1F3A] underline decoration-[#F5B301] underline-offset-4 hover:text-[#E0A200]"
                      >
                        Chat on WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {activeLocations.length > 0 && (
                <div className="rounded-xl bg-[#F4F6F9] p-6">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Active Service Areas</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5B6675]">
                    {activeLocations.join(", ")}
                  </p>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-[#E3E8EF] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#E3E8EF] px-4 py-3">
                  <p className="text-sm font-semibold text-[#0B1F3A]">Service Location Map</p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      address || "Kano, Nigeria"
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#0B1F3A] underline decoration-[#F5B301] underline-offset-4 hover:text-[#E0A200]"
                  >
                    Open in Google Maps
                  </a>
                </div>
                <iframe
                  title="Bin Plumbing Services Ltd Location Map"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(
                    address || "Kano, Nigeria"
                  )}&t=&z=13&ie=UTF8&iwloc=&output=embed`}
                  className="h-64 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>

              <div className="rounded-xl bg-[#0B1F3A] p-6 text-white">
                <p className="font-heading text-lg font-bold text-white">
                  Need a plumber dispatched?
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#C9D3E0]">
                  Use our service request form to get a tracking reference number and schedule an inspection.
                </p>
                <Link
                  href="/request"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#F5B301] px-5 py-2.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
                >
                  Request a Plumber
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Right: Enquiry Form */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-[#E3E8EF] bg-white p-6 shadow-[0_8px_24px_rgba(11,31,58,0.06)] sm:p-8">
                <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                  Send an Enquiry
                </h2>
                <p className="mt-2 text-base text-[#5B6675]">
                  Share your question or project details and our team will respond shortly.
                </p>
                <div className="mt-6">
                  <ContactFormClient activeLocations={activeLocations} serviceOptions={serviceOptions} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
