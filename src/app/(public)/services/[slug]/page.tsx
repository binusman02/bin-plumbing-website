import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Phone, ShieldAlert } from "lucide-react";
import {
  getMarketplaceSettings,
  getPublishedBlogPosts,
  getServiceCategories,
} from "@/lib/marketplace";
import { SITE_URL, buildBreadcrumbJsonLd } from "@/lib/seo";
import { resolveSharpServiceImage } from "@/lib/service-images";

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
    `Professional ${title} in Kano with on-site inspection and itemised quotation before work begins.`;
  const description = rawDesc.length > 158 ? `${rawDesc.slice(0, 155)}...` : rawDesc;
  const canonicalSlug = service.slug || service.id;

  return {
    title: `${title} in Kano`,
    description,
    alternates: { canonical: `/services/${canonicalSlug}` },
    openGraph: {
      title: `${title} in Kano | FlowGuard Plumbing Enterprises`,
      description,
      url: `/services/${canonicalSlug}`,
      type: "website",
      ...(service.image
        ? {
            images: [
              {
                url: service.image,
                alt: `${title} - FlowGuard Plumbing Enterprises`,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | FlowGuard Plumbing Enterprises`,
      description,
      ...(service.image ? { images: [service.image] } : {}),
    },
  };
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const [settings, categories, blogPosts] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
    getPublishedBlogPosts("en"),
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
  const image = resolveSharpServiceImage(service.image, service.slug);
  const canonicalSlug = service.slug || service.id;
  const activeAreas = settings.active_coverage_locations || [];
  const phone = settings.company_phone;
  const baseUrl = SITE_URL;

  const commonProblems =
    service.common_problems && service.common_problems.length > 0
      ? service.common_problems
      : [
          `Sudden leaks, dripping joints, or pressure loss affecting ${title.toLowerCase()}`,
          "Worn valves, seals, or fittings causing water waste or dampness",
          "Faulty or incomplete previous installations needing clean correction",
        ];

  const serviceFaqs: { question: string; answer: string }[] =
    service.faqs && service.faqs.length > 0
      ? service.faqs.map((item) => ({
          question: item.question,
          answer: item.answer,
        }))
      : [
          {
            question: `How do you quote for ${title} in Kano?`,
            answer:
              "Our assigned technician inspects the issue on site and submits an itemised quotation separating labour, materials, and transport for your approval before work starts.",
          },
          {
            question: "What should I do before the plumber arrives?",
            answer:
              "If water is actively leaking, close the nearest isolation valve or overhead tank outlet valve, keep electrical switches dry, and clear access around the affected pipe or fixture.",
          },
        ];

  const relatedServices = categories
    .filter(
      (c) =>
        c.id !== service.id &&
        c.visible !== false &&
        c.active !== false &&
        (!service.related_slugs?.length || service.related_slugs.includes(c.slug || ""))
    )
    .slice(0, 3);

  const relatedArticles = blogPosts
    .filter((p) => p.target_service_slug === canonicalSlug)
    .slice(0, 2);

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Services", path: "/services" },
    { name: title, path: `/services/${canonicalSlug}` },
  ]);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbJsonLd.itemListElement,
      },
      {
        "@type": "Service",
        name: title,
        description,
        url: `${baseUrl}/services/${canonicalSlug}`,
        provider: {
          "@type": "Plumber",
          name: settings.company_name || "FlowGuard Plumbing Enterprises",
          ...(phone ? { telephone: phone } : {}),
          ...(settings.company_address
            ? {
                address: {
                  "@type": "PostalAddress",
                  streetAddress: settings.company_address,
                  addressLocality: "Kano",
                  addressRegion: "Kano State",
                  addressCountry: "NG",
                },
              }
            : {}),
        },
        ...(activeAreas.length > 0 ? { areaServed: activeAreas } : {}),
      },
      {
        "@type": "FAQPage",
        mainEntity: serviceFaqs.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
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
                alt={`${title} by ${settings.company_name || "FlowGuard Plumbing Enterprises"}`}
                fill
                quality={85}
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

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href={`/request?service=${encodeURIComponent(title)}`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#F5B301] px-6 py-2.5 text-center text-base font-semibold leading-snug text-[#0B1F3A] transition-colors hover:bg-[#E0A200] sm:whitespace-nowrap"
              >
                <span>Request {title}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
              {phone && (
                <a
                  href={`tel:${phone.replace(/\s+/g, "")}`}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg text-center leading-snug border border-[#0B1F3A] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
                >
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>Call {phone}</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#E3E8EF] bg-[#F4F6F9] py-14">
        <div className="mx-auto max-w-[1200px] space-y-12 px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6">
              <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
                Common Problems We Handle
              </h2>
              <ul className="mt-4 space-y-3">
                {commonProblems.map((prob) => (
                  <li key={prob} className="flex items-start gap-2.5 text-sm text-[#2C3A4B]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#F5B301]" />
                    <span>{prob}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6">
              <h2 className="flex items-center gap-2 font-heading text-xl font-bold text-[#0B1F3A]">
                <ShieldAlert className="h-5 w-5 text-[#F5B301]" />
                What to Do Before Your Plumber Arrives
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-[#2C3A4B]">
                <li>1. Close the nearest isolation valve or overhead tank outlet if water is leaking actively.</li>
                <li>2. Switch off nearby water pump or heater breakers if water is near electrical points.</li>
                <li>3. Clear access around the sink, pump stand, or toilet so the technician can inspect cleanly.</li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6">
            <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
              Frequently Asked Questions
            </h2>
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              {serviceFaqs.map((faq) => (
                <div key={faq.question} className="rounded-xl border border-slate-100 bg-[#F4F6F9] p-4">
                  <h3 className="font-heading text-base font-bold text-[#0B1F3A]">{faq.question}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#5B6675]">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>

          {(relatedServices.length > 0 || relatedArticles.length > 0) && (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
              {relatedServices.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
                    Related Plumbing Services
                  </h2>
                  <div className="mt-3 space-y-2.5">
                    {relatedServices.map((rel) => (
                      <Link
                        key={rel.id}
                        href={`/services/${rel.slug || rel.id}`}
                        className="flex items-center justify-between rounded-xl border border-[#E3E8EF] bg-white px-4 py-3 text-sm font-semibold text-[#0B1F3A] hover:border-[#F5B301]"
                      >
                        <span>{rel.title || rel.name}</span>
                        <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {relatedArticles.length > 0 && (
                <div>
                  <h2 className="font-heading text-lg font-bold text-[#0B1F3A]">
                    Helpful Guides for This Service
                  </h2>
                  <div className="mt-3 space-y-2.5">
                    {relatedArticles.map((art) => (
                      <Link
                        key={art.id}
                        href={`/en/blog/${art.en_slug}`}
                        className="flex items-center justify-between rounded-xl border border-[#E3E8EF] bg-white px-4 py-3 text-sm font-semibold text-[#0B1F3A] hover:border-[#F5B301]"
                      >
                        <span className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4 shrink-0 text-[#F5B301]" />
                          {art.en_title}
                        </span>
                        <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
