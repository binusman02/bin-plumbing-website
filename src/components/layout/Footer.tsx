import Image from "next/image";
import Link from "next/link";
import { Phone, MessageCircle, MapPin, Mail, Clock, ArrowRight } from "lucide-react";
import type { MarketplaceSettings } from "@/lib/marketplace";
import CurrentYear from "@/components/ui/CurrentYear";

interface FooterProps {
  settings: MarketplaceSettings;
}

export default function Footer({ settings }: FooterProps) {
  const rawCompanyName = settings.company_name || "FlowGuard Plumbing";
  const companyName =
    rawCompanyName.replace(/\s+Enterprises?\b/i, "").trim() || "FlowGuard Plumbing";
  const address = settings.company_address;
  const phone = settings.company_phone;
  const whatsapp = settings.company_whatsapp;
  const email = settings.company_email;
  const workingHours = settings.working_hours;
  const rcNumber = settings.rc_number;
  const activeAreas = settings.active_coverage_locations || [];

  return (
    <footer className="bg-[#07152B] text-[#C9D3E0] pt-16 pb-10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 pb-12">
          {/* Column 1: Company Profile (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <Link href="/" aria-label={companyName} className="inline-flex items-center overflow-hidden rounded-xl bg-white px-3 py-1.5 shadow-sm">
              <Image
                src="/images/logo/flowguard-logo.jpg"
                alt={companyName}
                width={260}
                height={78}
                className="h-16 w-auto scale-[1.06] object-contain sm:h-[72px]"
              />
            </Link>
            <p className="text-sm text-[#C9D3E0] leading-relaxed max-w-sm">
              Coordinated plumbing services, sanitaryware installations, water storage systems, and pipework repairs with transparent itemised quotations.
            </p>
            {activeAreas.length > 0 && (
              <p className="text-sm text-[#C9D3E0]">
                <span className="text-[#F5B301] font-semibold">Active Service Areas:</span>{" "}
                {activeAreas.join(", ")}
              </p>
            )}
          </div>

          {/* Column 2: Services (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Plumbing Services
            </h3>
            <ul className="space-y-2.5 text-sm">
              {(settings.service_categories || [])
                .filter((c) => c.visible !== false && c.active !== false)
                .slice(0, 6)
                .map((service) => (
                  <li key={service.id}>
                    <Link
                      href={`/services/${service.slug}`}
                      className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors"
                    >
                      {service.title || service.name}
                    </Link>
                  </li>
                ))}
              <li className="pt-1">
                <Link
                  href="/services"
                  className="text-[#F5B301] hover:text-[#E0A200] font-semibold inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>All Services</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Platform & Links (2 cols) */}
          <div className="lg:col-span-2 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Navigation
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link href="/request" className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors">
                  Request a Plumber
                </Link>
              </li>
              <li>
                <Link href="/tracking" className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors">
                  Track Request
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/join-as-plumber" className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors">
                  Join as a Plumber
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact Details from Settings (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Contact Details
            </h3>
            <div className="space-y-3 text-sm">
              {address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-[#F5B301] shrink-0 mt-1" />
                  <span className="text-[#C9D3E0]">{address}</span>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-[#F5B301] shrink-0" />
                  <a
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="text-white hover:text-[#F5B301] transition-colors"
                  >
                    {phone}
                  </a>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-[#F5B301] shrink-0" />
                  <a
                    href={`mailto:${email}`}
                    className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors break-all"
                  >
                    {email}
                  </a>
                </div>
              )}
              {whatsapp && (
                <div className="flex items-center gap-2.5">
                  <MessageCircle className="w-4 h-4 text-[#F5B301] shrink-0" />
                  <a
                    href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Hello%20${encodeURIComponent(companyName)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#C9D3E0] hover:text-[#F5B301] transition-colors"
                  >
                    WhatsApp Support
                  </a>
                </div>
              )}
              {workingHours && (
                <div className="flex items-start gap-2.5 pt-1">
                  <Clock className="w-4 h-4 text-[#F5B301] shrink-0 mt-1" />
                  <span className="text-[#C9D3E0]">{workingHours}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Thin line before copyright row */}
        <div className="pt-8 border-t border-white/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs text-[#C9D3E0]">
          <p>
            © <CurrentYear fallback={2026} /> {companyName}. All rights reserved.
            {rcNumber ? ` RC: ${rcNumber}.` : ""}
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-[#F5B301] transition-colors">
              Privacy Policy (Draft)
            </Link>
            <span>•</span>
            <Link href="/terms" className="hover:text-[#F5B301] transition-colors">
              Terms & Conditions (Draft)
            </Link>
            <span>•</span>
            <span>
              Template reference & visual assets:{" "}
              <a
                href="https://htmlcodex.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:text-[#F5B301] underline transition-colors"
              >
                HTML Codex (CC-BY 4.0)
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
