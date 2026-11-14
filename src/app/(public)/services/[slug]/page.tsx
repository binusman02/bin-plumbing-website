import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Phone } from "lucide-react";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";

export const instant = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getServiceCategories(true);
  const service = categories.find(
    (c) => (c.slug === slug || c.id === slug) && c.visible !== false && c.active !== false
  );
  if (!service) {
    return {
      title: "Service Not Found",
      robots: { index: false, follow: false },
    };
  }
  const title = service.title || service.name || "Plumbing Service";
  const rawDesc =
    service.description ||
    service.short_description ||
    `Professional ${title} with on-site inspection and itemised quotation before work begins.`;
  const description = rawDesc.length > 158 ? `${rawDesc.slice(0, 155)}...` : rawDesc;
  const canonicalSlug = service.slug || service.id;

  return {
    title,
    description,
    alternates: { canonical: `/services/${canonicalSlug}` },
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const [settings, categories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);

  const service = categories.find(
    (c) => (c.slug === slug || c.id === slug) && c.visible !== false && c.active !== false
  );

  if (!service) {
    notFound();
  }

  const title = service.title || service.name || "Plumbing Service";
  const description =
    service.description ||
    service.short_description ||
    "Professional inspection and transparent itemised quotation before work begins.";
  const image = service.image || "/images/services/pipework-roughin.jpg";
  const canonicalSlug = service.slug || service.id;
  const activeAreas = settings.active_coverage_locations || [];
  const phone = settings.company_phone;
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com").replace(/\/+$/, "");

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Services", item: `${baseUrl}/services` },
          { "@type": "ListItem", position: 3, name: title, item: `${baseUrl}/services/${canonicalSlug}` },
        ],
      },
      {
        "@type": "Service",
        name: title,
        description,
        url: `${baseUrl}/services/${canonicalSlug}`,
        provider: {
          "@type": "Plumber",
          name: settings.company_name || "Bin Plumbing Services Ltd",
          ...(phone ? { telephone: phone } : {}),
          ...(settings.company_address
            ? {
                address: {
                  "@type": "PostalAddress",
                  streetAddress: settings.company_address,
                  addressCountry: "NG",
                },
              }
            : {}),
        },
        ...(activeAreas.length > 0 ? { areaServed: activeAreas } : {}),
      },
    ],
  };

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceJsonLd) }}
      />

      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <Link
            href="/services"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C9D3E0] hover:text-[#F5B301]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Plumbing Services
          </Link>
          <h1 className="mt-4 font-heading text-3xl font-bold tracking-tight text-white md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            {description}
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-6">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9]">
              <Image
                src={image}
                alt={`${title} by ${settings.company_name || "Bin Plumbing Services Ltd"}`}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-6 lg:col-span-6">
            <div>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                How We Handle {title}
              </h2>
              <p className="mt-2 text-base leading-relaxed text-[#5B6675]">
                Every request is logged with a tracking reference number, inspected on site by an
                assigned technician, and quoted in itemised form before repair or installation starts.
              </p>
            </div>

            <ul className="space-y-3">
              {[
                "Itemised quotation separating labour, materials, and transport",
                "Customer approval required before work proceeds",
                "Real-time request tracking via reference number and portal",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-[#0B1F3A]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B301]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            {activeAreas.length > 0 && (
              <div className="rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6675]">
                  Active Service Areas
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeAreas.map((area) => (
                    <span
                      key={area}
                      className="rounded-full border border-[#E3E8EF] bg-white px-3 py-1 text-xs font-medium text-[#0B1F3A]"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                href={`/request?service=${encodeURIComponent(title)}`}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5B301] px-6 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
              >
                Request {title}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#0B1F3A] px-6 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
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
