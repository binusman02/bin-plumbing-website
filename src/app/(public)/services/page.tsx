import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { getAllGalleryItems, getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";
import { resolveServiceImageAlt, resolveSharpServiceImage } from "@/lib/service-images";
import { PublicGalleryClient } from "@/components/public/PublicGalleryClient";

export const metadata: Metadata = {
  title: "Plumbing Services in Kano",
  description:
    "Browse residential and commercial plumbing services in Kano: pipework, leak detection, water pump repair, overhead tank installation, bathrooms, and drainage.",
  alternates: { canonical: "/services" },
  openGraph: {
    title: "Plumbing Services in Kano | FlowGuard Plumbing Enterprises",
    description:
      "Browse residential and commercial plumbing services in Kano including pipework, leak detection, pump setup, tank installation, and drainage repairs.",
    url: "/services",
    type: "website",
  },
};

export default async function ServicesPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "service-categories", "gallery");

  const [settings, dbCategories, publishedGallery] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
    getAllGalleryItems(true),
  ]);
  const activeAreas = settings.active_coverage_locations || [];
  const phone = settings.company_phone;
  const displayedServices = dbCategories
    .filter((c) => c.visible !== false && c.active !== false)
    .sort((a, b) => (a.order ?? a.sort_order ?? 0) - (b.order ?? b.sort_order ?? 0))
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title || c.name || "Plumbing Service",
      description:
        c.description ||
        c.short_description ||
        "Professional inspection and transparent quotation before work begins.",
      image: resolveSharpServiceImage(c.image, c.slug),
      imageAlt: resolveServiceImageAlt(c.slug, c.title || c.name, c.image_alt),
    }));

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://flowguard-ng.vercel.app").replace(/\/+$/, "");

  const servicesJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Services", item: `${baseUrl}/services` },
        ],
      },
      {
        "@type": "ItemList",
        name: "Plumbing Services",
        itemListElement: displayedServices.map((service, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Service",
            name: service.title,
            description: service.description,
            url: `${baseUrl}/services/${service.slug || service.id}`,
            image: {
              "@type": "ImageObject",
              url: service.image.startsWith("http")
                ? service.image
                : `${baseUrl}${service.image}`,
              caption: service.imageAlt,
            },
            provider: {
              "@type": "Plumber",
              name: settings.company_name || "FlowGuard Plumbing Enterprises",
            },
          },
        })),
      },
    ],
  };

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(servicesJsonLd) }}
      />
      {/* Compact Top Banner */}
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Services
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Plumbing Services We Coordinate
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Select a service below to submit a request. Each job starts with an inspection and a transparent quotation before work proceeds.
          </p>
          {activeAreas.length > 0 && (
            <p className="mt-4 text-sm text-[#C9D3E0]">
              Active service areas: <span className="font-semibold text-white">{activeAreas.join(", ")}</span>
            </p>
          )}
        </div>
      </section>

      {/* 3-Column Service Directory Grid */}
      <section className="py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {displayedServices.map((service) => (
              <article
                id={service.id}
                key={service.id}
                className="card-elevated flex flex-col overflow-hidden rounded-xl border border-[#E3E8EF] bg-white"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F4F6F9]">
                  <Image
                    src={service.image}
                    alt={service.imageAlt}
                    title={service.imageAlt}
                    fill
                    quality={85}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 420px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
                    {service.title}
                  </h2>
                  <p className="mt-2 flex-1 text-base leading-relaxed text-[#5B6675]">
                    {service.description}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-2">
                    <Link
                      href={`/services/${service.slug || service.id}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[#5B6675] underline-offset-4 hover:text-[#0B1F3A] hover:underline"
                    >
                      View details
                    </Link>
                    <Link
                      href={`/request?service=${encodeURIComponent(service.title || service.slug)}`}
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
                    >
                      Request This Service
                      <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Completed Work Gallery */}
      {publishedGallery.length > 0 && (
        <section className="border-t border-[#E3E8EF] bg-white py-14 md:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
                  Completed Work
                </p>
                <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[36px]">
                  Recent Plumbing Projects
                </h2>
                <p className="mt-2 text-base text-[#5B6675]">
                  Real installations and repairs completed by our technicians.
                </p>
              </div>
              <Link
                href="/gallery"
                className="inline-flex items-center gap-1.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
              >
                View full gallery
                <ArrowRight className="h-4 w-4 text-[#F5B301]" />
              </Link>
            </div>
            <PublicGalleryClient items={publishedGallery.slice(0, 6)} />
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="bg-[#F4F6F9] py-14 md:py-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl font-bold text-[#0B1F3A] md:text-3xl">
              Not sure which category fits your issue?
            </h2>
            <p className="mt-2 text-base text-[#5B6675]">
              Describe the problem in our request form or call us to discuss your plumbing needs.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/request"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-center leading-snug bg-[#F5B301] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
            >
              <span>Request a Plumber</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-center leading-snug border border-[#0B1F3A] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
              >
                <Phone className="h-4 w-4 shrink-0" />
                <span>{phone}</span>
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
