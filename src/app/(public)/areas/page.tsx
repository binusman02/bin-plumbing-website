import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { getMarketplaceSettings } from "@/lib/marketplace";

function slugifyArea(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getMarketplaceSettings();
  const isReady =
    Boolean(settings.company_address?.trim()) &&
    (settings.active_coverage_locations?.length ?? 0) > 0;

  return {
    title: "Service Areas",
    description:
      "Active service coverage areas for FlowGuard Plumbing Enterprises, matching our verified operating address and dispatch settings.",
    alternates: { canonical: "/areas" },
    ...(isReady ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ServiceAreasPage() {
  const settings = await getMarketplaceSettings();
  const areas = (settings.active_coverage_locations || []).filter((a) => a.trim().length > 0);
  const address = settings.company_address?.trim() || "";
  const phone = settings.company_phone?.trim() || "";
  const hours = settings.working_hours?.trim() || "";

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Coverage
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Active Service Areas
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            We coordinate plumbing inspections and repairs across our active operating areas listed below.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          {areas.length === 0 || !address ? (
            <div className="rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9] p-8 text-center">
              <MapPin className="mx-auto h-8 w-8 text-[#F5B301]" />
              <h2 className="mt-3 font-heading text-xl font-bold text-[#0B1F3A]">
                Service Areas Are Being Finalised
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-[#5B6675]">
                Our dispatch coverage list and office address are being updated in business settings.
                You can still submit a plumbing request and specify your location.
              </p>
              <Link
                href="/request"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
              >
                Request a Plumber
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {areas.map((area) => {
                  const slug = slugifyArea(area);
                  return (
                    <Link
                      key={area}
                      href={`/areas/${slug}`}
                      className="group flex flex-col justify-between rounded-xl border border-[#E3E8EF] bg-white p-6 shadow-sm transition-all hover:border-[#F5B301]"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-[#F5B301]">
                          <MapPin className="h-4 w-4" />
                          <span>Active Coverage</span>
                        </div>
                        <h2 className="mt-2 font-heading text-xl font-bold text-[#0B1F3A] group-hover:text-[#07152B]">
                          {area}
                        </h2>
                        <p className="mt-2 text-sm text-[#5B6675]">
                          Inspection-first plumbing dispatch, itemised quotations, and verified repair coordination in {area}.
                        </p>
                      </div>
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A]">
                        View {area} coverage
                        <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                      </span>
                    </Link>
                  );
                })}
              </div>

              <div className="rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-6">
                <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
                  Verified Business Details
                </h2>
                <div className="mt-3 grid grid-cols-1 gap-4 text-sm text-[#5B6675] md:grid-cols-3">
                  <div>
                    <p className="font-semibold text-[#0B1F3A]">Business Name</p>
                    <p>{settings.company_name || "FlowGuard Plumbing Enterprises"}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#0B1F3A]">Address</p>
                    <p>{address}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-[#0B1F3A]">Phone & Hours</p>
                    <p>{phone || "See contact page"}{hours ? ` • ${hours}` : ""}</p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#E3E8EF] bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#E3E8EF] px-5 py-3.5">
                  <p className="font-heading text-sm font-bold text-[#0B1F3A]">
                    Kano Coverage Map
                  </p>
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
                  title="FlowGuard Plumbing Service Areas Map"
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(
                    address || "Kano, Nigeria"
                  )}&t=&z=12&ie=UTF8&iwloc=&output=embed`}
                  className="h-72 w-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
