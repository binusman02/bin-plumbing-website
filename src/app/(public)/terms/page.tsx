import type { Metadata } from "next";
import Link from "next/link";
import { getMarketplaceSettings } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service governing service requests, on-site inspections, quotation approvals, and plumbing coordination.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Service | FlowGuard Plumbing Enterprises",
    description:
      "Terms of Service governing service requests, on-site inspections, quotation approvals, and plumbing coordination.",
    url: "/terms",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service | FlowGuard Plumbing Enterprises",
    description:
      "Terms of Service governing service requests, on-site inspections, quotation approvals, and plumbing coordination.",
  },
};

export default async function TermsPage() {
  const settings = await getMarketplaceSettings();

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Legal
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            General terms for using the {settings.company_name} website and service request system.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[900px] px-4 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-xl border border-[#F5B301]/50 bg-[#F4F6F9] p-4 text-sm font-medium text-[#0B1F3A]">
            Notice: Draft pending professional legal review.
          </div>

          <div className="space-y-8 text-base leading-relaxed text-[#5B6675]">
            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                1. Service Requests & Coverage
              </h2>
              <p className="mt-3">
                Submitting a request logs your plumbing issue for coordination. Availability depends on technician scheduling and active service areas configured in our system.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                2. Inspections & Quotations
              </h2>
              <p className="mt-3">
                Assigned plumbers inspect the work on site and submit a quotation separating labour and required materials. Repair or installation work proceeds only after the customer reviews and approves the quotation.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                3. Customer Responsibilities
              </h2>
              <p className="mt-3">
                Customers agree to provide accurate contact information, safe access to the property at the agreed inspection or work time, and timely communication regarding quotation approvals or changes.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                4. Contact Information
              </h2>
              <p className="mt-3">
                Questions regarding these terms may be sent to{" "}
                {settings.company_email ? (
                  <a
                    href={`mailto:${settings.company_email}`}
                    className="font-semibold text-[#0B1F3A] underline decoration-[#F5B301]"
                  >
                    {settings.company_email}
                  </a>
                ) : (
                  "our coordination office"
                )}
                .
              </p>
            </section>

            <div className="border-t border-[#E3E8EF] pt-6">
              <Link
                href="/privacy"
                className="text-sm font-semibold text-[#0B1F3A] underline decoration-[#F5B301] underline-offset-4 hover:text-[#E0A200]"
              >
                Read Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
