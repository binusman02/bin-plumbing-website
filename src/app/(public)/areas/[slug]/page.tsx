import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, MapPin, Phone } from "lucide-react";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";

export const instant = false;

type Props = {
  params: Promise<{ slug: string }>;
};

function slugifyArea(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const settings = await getMarketplaceSettings();
  const address = settings.company_address?.trim() || "";
  const areas = settings.active_coverage_locations || [];
  const matchedArea = areas.find((a) => slugifyArea(a) === slug);

  if (!matchedArea || !address) {
    return {
      title: "Service Area Not Found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Plumbing Services in ${matchedArea}`,
    description: `Request inspection-first plumbing repairs, leak detection, tank setup, and drainage services in ${matchedArea}.`,
    alternates: { canonical: `/areas/${slug}` },
  };
}

export default async function AreaDetailPage({ params }: Props) {
  const { slug } = await params;
  const [settings, categories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);

  const address = settings.company_address?.trim() || "";
  const areas = settings.active_coverage_locations || [];
  const matchedArea = areas.find((a) => slugifyArea(a) === slug);

  if (!matchedArea || !address) {
    notFound();
  }

  const visibleServices = categories
    .filter((c) => c.visible !== false && c.active !== false)
    .slice(0, 6);
  const phone = settings.company_phone?.trim() || "";
  const companyName = settings.company_name || "Bin Plumbing Services Ltd";
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com").replace(/\/+$/, "");

  const areaJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Service Areas", item: `${baseUrl}/areas` },
          { "@type": "ListItem", position: 3, name: matchedArea, item: `${baseUrl}/areas/${slug}` },
        ],
      },
      {
        "@type": "Plumber",
        name: companyName,
        url: `${baseUrl}/areas/${slug}`,
        areaServed: matchedArea,
        ...(phone ? { telephone: phone } : {}),
        address: {
          "@type": "PostalAddress",
          streetAddress: address,
          addressCountry: "NG",
        },
      },
    ],
  };

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(areaJsonLd) }}
      />

      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <Link
            href="/areas"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C9D3E0] hover:text-[#F5B301]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Service Areas
          </Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#0B1F3A] px-3 py-1 text-xs font-semibold text-[#F5B301]">
            <MapPin className="h-3.5 w-3.5" />
            Active Area: {matchedArea}
          </div>
          <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-white md:text-5xl">
            Plumbing Services in {matchedArea}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Book an on-site plumbing inspection in {matchedArea} with {companyName}. You receive an itemised quotation before repair work begins.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="space-y-6 lg:col-span-7">
            <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
              Available Services in {matchedArea}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleServices.map((svc) => {
                const svcTitle = svc.title || svc.name || "Plumbing Service";
                return (
                  <Link
                    key={svc.id}
                    href={`/services/${svc.slug || svc.id}`}
                    className="flex items-start gap-2.5 rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-4 transition-colors hover:border-[#F5B301]"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B301]" />
                    <span className="text-sm font-semibold text-[#0B1F3A]">{svcTitle}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9] p-6 lg:col-span-5">
            <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
              Book a Technician in {matchedArea}
            </h2>
            <p className="mt-2 text-sm text-[#5B6675]">
              Office address: {address}
            </p>
            {settings.working_hours && (
              <p className="mt-1 text-sm text-[#5B6675]">Hours: {settings.working_hours}</p>
            )}
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href={`/request?area=${encodeURIComponent(matchedArea)}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
              >
                Request Plumber in {matchedArea}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#0B1F3A] bg-white px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white"
                >
                  <Phone className="h-4 w-4" />
                  Call {phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
