import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Phone, ShieldCheck, Star } from "lucide-react";
import { getAllGalleryItems, getApprovedReviews, getMarketplaceSettings } from "@/lib/marketplace";
import { resolveServiceImageAlt, resolveSharpServiceImage } from "@/lib/service-images";
import { FaqAccordion, type FaqItem } from "@/components/public/FaqAccordion";
import { PublicGalleryClient } from "@/components/public/PublicGalleryClient";

export const metadata: Metadata = {
  title: {
    absolute: "Plumber in Kano | FlowGuard Plumbing Enterprises",
  },
  description:
    "Need a reliable plumber in Kano? FlowGuard Plumbing Enterprises coordinates residential and commercial plumbing repairs, water pump servicing, leak detection, and installations with upfront itemised quotes.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Plumber in Kano | FlowGuard Plumbing Enterprises",
    description:
      "Request residential and commercial plumbing inspections, water pump repairs, and leak detection in Kano with transparent quotation approval and live job tracking.",
    url: "/",
    type: "website",
  },
};

const HOW_IT_WORKS_HIGHLIGHTS = [
  {
    step: "01",
    title: "Submit Your Request",
    text: "Describe the plumbing issue, your area, and preferred time to receive a unique tracking reference.",
  },
  {
    step: "02",
    title: "Plumber Assignment",
    text: "A coordinator reviews your request and assigns an available plumber from our reviewed network.",
  },
  {
    step: "03",
    title: "On-Site Inspection & Quote",
    text: "The plumber inspects the job and submits a clear labour-and-materials breakdown for your approval.",
  },
  {
    step: "04",
    title: "Approval & Work Delivery",
    text: "Once you approve the quote, work proceeds and you can follow progress through your tracking page.",
  },
];

const WHY_CHOOSE_POINTS = [
  {
    title: "Plumbers Reviewed Before Assignment",
    text: "Every technician in our network is reviewed by our coordination team before being assigned to customer jobs.",
  },
  {
    title: "Upfront Quotation Approval",
    text: "After inspection, you receive an itemized quote to review and approve before repair or installation work begins.",
  },
  {
    title: "Live Reference Tracking",
    text: "Follow your request status, assigned technician, and quotation updates using your reference number and phone.",
  },
  {
    title: "Clear Service Coordination",
    text: "One structured channel from initial inspection to completion, with support available if you have questions.",
  },
];

export default async function HomePage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "reviews", "gallery");

  const [settings, approvedReviews, publishedGallery] = await Promise.all([
    getMarketplaceSettings(),
    getApprovedReviews(),
    getAllGalleryItems(true),
  ]);
  const activeAreas = settings.active_coverage_locations || [];
  const phone = settings.company_phone;

  const faqs: FaqItem[] = [
    {
      q: "How do I request a plumber?",
      a: "Click 'Request a Plumber', fill in your contact details, area, and a short description of the issue. You will receive a reference number immediately to track progress.",
    },
    {
      q: "How does pricing and quotation work?",
      a: "The assigned plumber conducts an on-site inspection and submits a quotation separating labour and any required materials. Work starts after you review and approve the quote.",
    },
    {
      q: "Which areas do you currently cover?",
      a:
        activeAreas.length > 0
          ? `Our active service areas currently include: ${activeAreas.join(", ")}. If your location is not listed, you can still submit an enquiry and our coordinator will confirm availability.`
          : "Service coverage is configured by our coordination team. Submit your request or contact us with your location to confirm availability.",
    },
    {
      q: "How can I track my service request?",
      a: "Visit the Track Request page and enter both your Reference Number and the phone number used when submitting the request.",
    },
  ];

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      {/* 1. Full-Width Hero */}
      <section className="relative overflow-hidden bg-[#07152B] text-white">
        <Image
          src="/images/plumberz/carousel-1.jpg"
          alt="Professional plumber inspecting and installing residential pipework"
          fill
          priority
          fetchPriority="high"
          sizes="(max-width: 768px) 100vw, 1360px"
          quality={75}
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#07152B]/75" aria-hidden="true" />

        <div className="relative mx-auto max-w-[1200px] px-4 py-20 sm:px-6 md:py-28 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
              {settings.company_name}
            </p>
            <h1 className="mt-4 font-heading text-[34px] font-bold leading-[1.12] tracking-tight text-white sm:text-5xl lg:text-[56px]">
              Reliable Plumbing Services, Coordinated Clearly.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[#C9D3E0] sm:text-lg">
              Book residential or commercial plumbing work across Kano State with structured inspection, upfront quotation approval, and live request tracking from start to finish.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Link
                href="/request"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F5B301] px-6 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
              >
                Request a Plumber
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/tracking"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-white/40 bg-transparent px-6 text-base font-semibold text-white transition-colors hover:border-[#F5B301] hover:text-[#F5B301]"
              >
                Track Request
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 1B. Trust Strip (True Operational Guarantees Only) */}
      <section className="border-b border-[#E3E8EF] bg-[#F4F6F9]">
        <div className="mx-auto grid max-w-[1200px] grid-cols-1 divide-y divide-[#E3E8EF] px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-8">
          <div className="flex items-center gap-3 py-4 md:pr-6">
            <ShieldCheck className="h-5 w-5 shrink-0 text-[#0B1F3A]" />
            <div>
              <p className="text-sm font-bold text-[#0B1F3A]">Itemised Quotations</p>
              <p className="text-xs text-[#5B6675]">Labour and materials separated clearly</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-4 md:px-6">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />
            <div>
              <p className="text-sm font-bold text-[#0B1F3A]">Customer Approval Before Work</p>
              <p className="text-xs text-[#5B6675]">No repairs start until you approve the quote</p>
            </div>
          </div>
          <div className="flex items-center gap-3 py-4 md:pl-6">
            <ArrowRight className="h-5 w-5 shrink-0 text-[#F5B301]" />
            <div>
              <p className="text-sm font-bold text-[#0B1F3A]">Tracking by Reference</p>
              <p className="text-xs text-[#5B6675]">Follow every step using your ticket number</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Services Section (White) */}
      <section className="bg-white py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                Our Services
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                Core Plumbing Solutions
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#5B6675] md:text-lg">
                From urgent leak repairs to complete building pipework, select a service to submit a request.
              </p>
            </div>
            <Link
              href="/services"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
            >
              View all services
              <ArrowRight className="h-4 w-4 text-[#F5B301]" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {((settings.service_categories || []).filter((c) => c.visible !== false).slice(0, 6)).map((service) => (
              <article
                key={service.id}
                className="card-elevated flex flex-col overflow-hidden rounded-xl border border-[#E3E8EF] bg-white"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#F4F6F9]">
                  <Image
                    src={resolveSharpServiceImage(service.image, service.slug)}
                    alt={resolveServiceImageAlt(service.slug, service.title || service.name, service.image_alt)}
                    title={resolveServiceImageAlt(service.slug, service.title || service.name, service.image_alt)}
                    fill
                    quality={85}
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 420px"
                    className="object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="font-heading text-xl font-bold text-[#0B1F3A]">
                    {service.title || service.name}
                  </h3>
                  <p className="mt-2 flex-1 text-base leading-relaxed text-[#5B6675] line-clamp-2">
                    {service.short_description || service.description}
                  </p>
                  <div className="mt-5 pt-2">
                    <Link
                      href={`/request?service=${encodeURIComponent(service.title)}`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
                    >
                      Request this service
                      <span className="sr-only"> — {service.title || service.name}</span>
                      <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. How It Works Timeline (Light Grey) */}
      <section className="bg-[#F4F6F9] py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                Process
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                How It Works
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#5B6675] md:text-lg">
                A straightforward workflow designed to keep pricing, scheduling, and job status clear.
              </p>
            </div>
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
            >
              See full 10-step guide
              <ArrowRight className="h-4 w-4 text-[#F5B301]" />
            </Link>
          </div>

          <div className="relative mt-12">
            <div
              className="absolute left-0 right-0 top-6 hidden h-[2px] bg-[#F5B301]/50 lg:block"
              aria-hidden="true"
            />
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              {HOW_IT_WORKS_HIGHLIGHTS.map((item) => (
                <div key={item.step} className="relative flex flex-col">
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-[#F5B301] font-heading text-base font-bold text-[#0B1F3A]">
                    {item.step}
                  </div>
                  <h3 className="mt-5 font-heading text-lg font-bold text-[#0B1F3A]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-base leading-relaxed text-[#5B6675]">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. Why Choose Us Split Section (White) */}
      <section className="bg-white py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F4F6F9]">
                <Image
                  src="/images/about/plumbing-installation-standards.jpg"
                  alt="Organized plumbing installation and pipework assembly"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>

            <div className="lg:col-span-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                Why Choose Us
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                Built for Transparency and Accountability
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#5B6675] md:text-lg">
                We coordinate every stage of the job so homeowners and businesses know what is happening before work begins.
              </p>

              <ul className="mt-8 space-y-5">
                {WHY_CHOOSE_POINTS.map((point) => (
                  <li key={point.title} className="flex items-start gap-3.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
                    <div>
                      <h3 className="font-heading text-base font-bold text-[#0B1F3A]">
                        {point.title}
                      </h3>
                      <p className="mt-1 text-base leading-relaxed text-[#5B6675]">
                        {point.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 4B. Recent Work Gallery Preview (only when published photos exist) */}
      {publishedGallery.length > 0 && (
        <section className="border-t border-[#E3E8EF] bg-white py-14 md:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                  Completed Work
                </p>
                <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                  Recent Project Gallery
                </h2>
                <p className="mt-2 text-base leading-relaxed text-[#5B6675] md:text-lg">
                  Photos from completed residential and commercial plumbing jobs.
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
            <PublicGalleryClient items={publishedGallery.slice(0, 3)} />
          </div>
        </section>
      )}

      {/* 5. FAQ Accordion Section (Light Grey) */}
      <section className="bg-[#F4F6F9] py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                Common Questions
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                Frequently Asked Questions
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#5B6675] md:text-lg">
                Quick answers about booking, quotations, and tracking your request.
              </p>
            </div>
            <Link
              href="/faq"
              className="inline-flex items-center gap-1.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:text-[#E0A200]"
            >
              Read all FAQs
              <ArrowRight className="h-4 w-4 text-[#F5B301]" />
            </Link>
          </div>

          <div className="mt-10">
            <FaqAccordion items={faqs} />
          </div>
        </div>
      </section>

      {/* 5B. Verified Customer Reviews (Only rendered when real approved reviews exist) */}
      {approvedReviews.length > 0 && (
        <section className="bg-[#F4F6F9] py-14 md:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-[#7A5400]">
                Customer Feedback
              </p>
              <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0B1F3A] md:text-[38px]">
                Verified Customer Reviews
              </h2>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
              {approvedReviews.slice(0, 6).map((rev) => (
                <article
                  key={rev.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E3E8EF] bg-white p-6"
                >
                  <div>
                    <div className="flex items-center gap-1 text-[#F5B301]">
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star key={idx} className="h-4 w-4 fill-[#F5B301]" />
                      ))}
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-[#4B5B70]">
                      &ldquo;{rev.comment}&rdquo;
                    </p>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3 text-xs">
                    <p className="font-bold text-[#0B1F3A]">{rev.customer_name}</p>
                    <p className="text-[#5B6675]">
                      {[rev.service_category, rev.area].filter(Boolean).join(" • ")}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Helpful Guides & Local Coverage Strip */}
      <section className="border-t border-[#E3E8EF] bg-[#F4F6F9] py-10">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-4 px-4 sm:px-6 md:flex-row md:items-center lg:px-8">
          <div>
            <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
              Plumbing Guides &amp; Kano Service Coverage
            </h2>
            <p className="mt-1 text-sm text-[#5B6675]">
              Explore practical maintenance tips in English or Hausa, or check the areas we currently serve in Kano.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/en/blog"
              className="inline-flex h-10 items-center rounded-lg border border-[#0B1F3A] bg-white px-4 text-xs font-semibold text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white"
            >
              Guides (English)
            </Link>
            <Link
              href="/ha/blog"
              className="inline-flex h-10 items-center rounded-lg border border-[#0B1F3A] bg-white px-4 text-xs font-semibold text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white"
            >
              Labaran Famfo (Hausa)
            </Link>
            <Link
              href="/areas"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-[#0B1F3A] hover:border-[#F5B301]"
            >
              Kano Service Areas
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Full-Width Navy CTA Banner */}
      <section className="relative overflow-hidden bg-[#07152B] py-16 text-white md:py-24">
        <Image
          src="/images/gallery/real-work-tools-equipment.jpg"
          alt="Plumbing tools and fittings ready for site dispatch"
          fill
          sizes="(max-width: 768px) 100vw, 1200px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[#07152B]/85" aria-hidden="true" />

        <div className="relative mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-white md:text-4xl">
              Need Plumbing Assistance Today?
            </h2>
            <p className="mt-3 text-base leading-relaxed text-[#C9D3E0] md:text-lg">
              Submit a service request online to get a tracking reference, or speak directly with our coordination desk.
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <Link
              href="/request"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg py-2.5 text-center leading-snug bg-[#F5B301] px-6 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200] sm:w-auto"
            >
              Request a Plumber
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            {phone && (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg py-2.5 text-center leading-snug border border-white/50 bg-[#07152B]/60 px-6 text-base font-semibold text-white transition-colors hover:border-[#F5B301] hover:text-[#F5B301] sm:w-auto"
              >
                <Phone className="h-4 w-4 shrink-0 text-[#F5B301]" />
                {phone}
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
