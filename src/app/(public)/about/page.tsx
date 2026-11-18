import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Phone, Mail } from "lucide-react";
import { getMarketplaceSettings } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "About Us | Kano Plumbing Company",
  description:
    "Learn how FlowGuard Plumbing Enterprises coordinates residential and commercial plumbing work in Kano State with reviewed technicians, transparent quotes, and live tracking.",
  alternates: { canonical: "/about" },
  openGraph: {
    title: "About FlowGuard Plumbing Enterprises | Kano Plumbing Company",
    description:
      "How FlowGuard Plumbing Enterprises coordinates reviewed plumbers, itemised quotes, and live tracking across Kano.",
    url: "/about",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About FlowGuard Plumbing Enterprises | Kano Plumbing Company",
    description:
      "How FlowGuard Plumbing Enterprises coordinates reviewed plumbers, itemised quotes, and live tracking across Kano.",
  },
};

const OPERATING_PRINCIPLES = [
  {
    title: "Reviewed Technician Network",
    text: "Plumbers are reviewed by our coordination team before being assigned to customer service requests.",
  },
  {
    title: "Upfront Quotation Review",
    text: "Customers receive a clear labour-and-materials breakdown after inspection before work begins.",
  },
  {
    title: "Structured Job Tracking",
    text: "Every request receives a reference number so customers can follow status updates online.",
  },
  {
    title: "Direct Support Desk",
    text: "Our coordination team remains reachable by phone, email, or WhatsApp if configured in settings.",
  },
];

export default async function AboutPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");

  const settings = await getMarketplaceSettings();
  const activeAreas = settings.active_coverage_locations || [];

  return (
    <div className="bg-white">
      {/* Top Banner */}
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            About
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            How {settings.company_name} Works
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            We provide coordinated residential and commercial plumbing services with clear inspection, quotation approval, and status tracking.
          </p>
        </div>
      </section>

      {/* Main Split Section */}
      <section className="bg-white py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <h2 className="font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                Coordinated Plumbing, Step by Step
              </h2>
              <p className="mt-4 text-base leading-relaxed text-[#5B6675] md:text-lg">
                Today, {settings.company_name} operates as a coordinated plumbing service desk. Instead of leaving homeowners and facility managers to chase informal contacts, we log each request, assign a reviewed plumber, and keep inspection quotes transparent.
              </p>
              <p className="mt-4 text-base leading-relaxed text-[#5B6675] md:text-lg">
                Customers can submit requests online, review quotations before repair or installation starts, and check progress at any time using their reference number and phone number.
              </p>

              {settings.rc_number?.trim() && (
                <p className="mt-4 text-sm font-semibold text-[#0B1F3A]">
                  Registration Number: {settings.rc_number.trim()}
                </p>
              )}

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/request"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-center leading-snug bg-[#F5B301] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
                >
                  <span>Request a Plumber</span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
                <Link
                  href="/how-it-works"
                  className="inline-flex min-h-12 items-center justify-center rounded-lg text-center leading-snug border border-[#0B1F3A] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
                >
                  See How It Works
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F4F6F9]">
                <Image
                  src="/images/about/plumbing-installation-standards.jpg"
                  alt="Plumbing installation and pipework setup"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Operating Principles (Light Grey) */}
      <section className="bg-[#F4F6F9] py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
              Our Approach
            </p>
            <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
              What Customers Can Expect
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {OPERATING_PRINCIPLES.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[#E3E8EF] bg-white p-6"
              >
                <div className="flex items-start gap-3.5">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
                  <div>
                    <h3 className="font-heading text-lg font-bold text-[#0B1F3A]">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-[#5B6675]">
                      {item.text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Office & Service Area Summary (White) */}
      <section className="bg-white py-14 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-6 sm:p-8">
            <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
              Coordination Office & Coverage
            </h2>
            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              {settings.company_address && (
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Address</p>
                    <p className="mt-1 text-base text-[#5B6675]">{settings.company_address}</p>
                  </div>
                </div>
              )}

              {settings.company_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Phone</p>
                    <a
                      href={`tel:${settings.company_phone.replace(/\s+/g, "")}`}
                      className="mt-1 inline-block text-base text-[#1B2430] hover:text-[#0B1F3A]"
                    >
                      {settings.company_phone}
                    </a>
                  </div>
                </div>
              )}

              {settings.company_email && (
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">Email</p>
                    <a
                      href={`mailto:${settings.company_email}`}
                      className="mt-1 inline-block break-all text-base text-[#1B2430] hover:text-[#0B1F3A]"
                    >
                      {settings.company_email}
                    </a>
                  </div>
                </div>
              )}
            </div>

            {activeAreas.length > 0 && (
              <div className="mt-6 border-t border-[#E3E8EF] pt-5">
                <p className="text-sm font-semibold text-[#0B1F3A]">Active Service Areas</p>
                <p className="mt-1 text-base text-[#5B6675]">{activeAreas.join(", ")}</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
