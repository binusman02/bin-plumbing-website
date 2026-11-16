import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { AlertCircle } from "lucide-react";
import { getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";
import RequestFormClient from "@/components/public/RequestFormClient";

export const metadata: Metadata = {
  title: "Request a Plumber in Kano",
  description:
    "Submit your plumbing service request in Kano online. Receive a tracking reference, on-site inspection review, and transparent itemised quotation.",
  alternates: { canonical: "/request" },
  openGraph: {
    title: "Request a Plumber in Kano | Bin Plumbing Services Ltd",
    description:
      "Book a reviewed plumber in Kano with upfront itemised quotation approval and live job tracking.",
    url: "/request",
    type: "website",
  },
};

export default async function RequestPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("settings", "service-categories");

  const [settings, categories] = await Promise.all([
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);
  const activeAreas = settings.active_coverage_locations || [];
  const serviceTitles = categories.map((c) => ({ id: c.id, title: c.title || c.name || "" })).filter((c) => c.title);

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Service Booking
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Request a Plumber
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Tell us about your plumbing issue. Our coordination team reviews every request and assigns a reviewed technician.
          </p>
        </div>
      </section>

      <section className="bg-[#F4F6F9] py-14 md:py-20">
        <div className="mx-auto max-w-[960px] px-4 sm:px-6 lg:px-8">
          {activeAreas.length > 0 && (
            <div className="mb-8 flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-white p-4 text-sm text-[#5B6675]">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B301]" />
              <div>
                <p className="font-semibold text-[#0B1F3A]">Active Service Coverage</p>
                <p className="mt-1">
                  Currently active service areas: <span className="font-medium text-[#1B2430]">{activeAreas.join(", ")}</span>. Requests outside active areas are reviewed for availability.
                </p>
              </div>
            </div>
          )}

          <Suspense
            fallback={
              <div className="rounded-xl border border-[#E3E8EF] bg-white p-12 text-center text-base text-[#5B6675]">
                Loading request form...
              </div>
            }
          >
            <RequestFormClient
              activeLocations={activeAreas}
              serviceOptions={serviceTitles}
              defaultState={settings.default_state || ""}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
