import type { Metadata } from "next";
import Link from "next/link";
import { getMarketplaceSettings } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for FlowGuard Plumbing Enterprises explaining how customer and technician request information is handled.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy Policy | FlowGuard Plumbing Enterprises",
    description:
      "Privacy Policy for FlowGuard Plumbing Enterprises explaining how customer and technician request information is handled.",
    url: "/privacy",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | FlowGuard Plumbing Enterprises",
    description:
      "Privacy Policy for FlowGuard Plumbing Enterprises explaining how customer and technician request information is handled.",
  },
};

export default async function PrivacyPage() {
  const settings = await getMarketplaceSettings();

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Legal
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            How {settings.company_name} collects, uses, and protects your service request and contact information.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[900px] px-4 sm:px-6 lg:px-8">
          <div className="mb-8 rounded-xl border border-slate-200 bg-[#F4F6F9] px-4 py-3 text-sm text-[#0B1F3A]">
            <span className="font-semibold">Effective Legal Notice:</span> FlowGuard Plumbing Enterprises{settings.rc_number ? ` (RC: ${settings.rc_number})` : ""} — Customer &amp; Portal Privacy Policy.
          </div>

          <div className="space-y-8 text-base leading-relaxed text-[#5B6675]">
            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                1. Information We Collect
              </h2>
              <p className="mt-3">
                When you submit a plumbing service request, contact enquiry, customer portal account registration, or technician application on our website, we collect the information you provide such as your name, phone number, email address (if provided), service area, property address, optional GPS coordinates pinned for dispatch accuracy, and description or photos of the plumbing issue.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                2. How We Use Information
              </h2>
              <p className="mt-3">
                We use your information strictly to coordinate plumbing service requests, assign a reviewed technician, deliver itemised inspection quotations, provide live status and arrival updates, process payment receipt verification, and respond to support enquiries.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                3. Sharing Within Service Coordination
              </h2>
              <p className="mt-3">
                Relevant job details (such as your contact name, phone number, and service location) are shared only with authorized coordinators and the assigned technician handling your active request. Live technician GPS tracking is restricted to active assigned jobs and stops automatically once the job is completed. We never sell or rent customer data to third parties.
              </p>
            </section>

            <section>
              <h2 className="font-heading text-2xl font-bold text-[#0B1F3A]">
                4. Data Retention, Access &amp; Questions
              </h2>
              <p className="mt-3">
                We retain service and quotation records only as long as necessary for service history, warranty support, and business compliance. To request a correction or removal of your contact details, or to ask questions about this policy, please contact us:
              </p>
              <ul className="mt-3 space-y-1 text-[#1B2430]">
                {settings.company_email && (
                  <li>
                    Email:{" "}
                    <a
                      href={`mailto:${settings.company_email}`}
                      className="font-semibold text-[#0B1F3A] underline decoration-[#F5B301]"
                    >
                      {settings.company_email}
                    </a>
                  </li>
                )}
                {settings.company_phone && <li>Phone: {settings.company_phone}</li>}
                {settings.company_address && <li>Address: {settings.company_address}</li>}
              </ul>
            </section>

            <div className="border-t border-[#E3E8EF] pt-6">
              <Link
                href="/terms"
                className="text-sm font-semibold text-[#0B1F3A] underline decoration-[#F5B301] underline-offset-4 hover:text-[#E0A200]"
              >
                Read Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
