import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getMarketplaceSettings } from "@/lib/marketplace";
import { FaqAccordion, type FaqItem } from "@/components/public/FaqAccordion";

export const metadata: Metadata = {
  title: "Plumbing FAQs in Kano",
  description:
    "Answers to common questions about requesting a plumber in Kano, on-site inspection quotations, active coverage areas, and live request tracking.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Plumbing FAQs | FlowGuard Plumbing Enterprises Kano",
    description:
      "Answers to common questions about requesting a plumber, inspection quotes, and tracking in Kano.",
    url: "/faq",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Plumbing FAQs | FlowGuard Plumbing Enterprises Kano",
    description:
      "Answers to common questions about requesting a plumber, inspection quotes, and tracking in Kano.",
  },
};

export default async function FaqPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings");

  const settings = await getMarketplaceSettings();
  const activeAreas = settings.active_coverage_locations || [];

  const faqs: FaqItem[] = [
    {
      q: "How do I request a plumber?",
      a: "Open the Request a Plumber page, select your service category, enter your contact details and location, and describe the issue. You will receive a reference number immediately.",
    },
    {
      q: "How are plumbers selected?",
      a: "Plumbers in our network are reviewed by our coordination team before they are assigned to customer requests.",
    },
    {
      q: "Which areas do you currently serve?",
      a:
        activeAreas.length > 0
          ? `Our currently active service areas are: ${activeAreas.join(", ")}. If your location is not listed, you can still submit an enquiry on our Contact page to check availability.`
          : "Active service areas are managed by our coordination team. Please contact us or submit a request with your location to confirm availability.",
    },
    {
      q: "Do I see the price before work starts?",
      a: "Yes. After the on-site inspection, the assigned plumber submits an itemized quotation separating labour and any required materials. Work proceeds after you approve the quote.",
    },
    {
      q: "How do I track an existing service request?",
      a: "Visit the Track Request page and enter both your Reference Number and the phone number you used when submitting the request.",
    },
    {
      q: "What if I want to apply as a plumber?",
      a: "Use the Join as a Plumber page to submit your contact details, trade experience, and service area. Our team reviews every application before onboarding.",
    },
    {
      q: "How can I contact support directly?",
      a: `You can reach us through the Contact page${settings.company_phone ? `, by phone at ${settings.company_phone}` : ""}${settings.company_email ? `, or by email at ${settings.company_email}` : ""}.`,
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
      {/* Top Banner */}
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            FAQ
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Frequently Asked Questions
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Clear answers about requesting a plumber, inspection quotes, service areas, and job tracking.
          </p>
        </div>
      </section>

      {/* Accordion Section */}
      <section className="bg-[#F4F6F9] py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <FaqAccordion items={faqs} />

          <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-xl bg-[#0B1F3A] p-6 text-white sm:p-8 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-heading text-2xl font-bold text-white">
                Still have a question?
              </h2>
              <p className="mt-2 text-base text-[#C9D3E0]">
                Send us an enquiry or submit a service request directly.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/contact"
                className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-lg border border-white/40 px-6 py-2.5 text-base font-semibold text-white transition-colors hover:border-[#F5B301] hover:text-[#F5B301]"
              >
                Contact Us
              </Link>
              <Link
                href="/request"
                className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#F5B301] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
              >
                <span>Request a Plumber</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
