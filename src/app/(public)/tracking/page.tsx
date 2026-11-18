import type { Metadata } from "next";
import { Suspense } from "react";
import TrackingClient from "@/components/public/TrackingClient";

export const metadata: Metadata = {
  title: "Track Your Request",
  description:
    "Check the live status of your plumbing service request, review itemized quotations, approve estimates, and message your assigned coordinator or technician.",
  alternates: { canonical: "/tracking" },
  robots: { index: false, follow: false },
  openGraph: {
    title: "Track Your Request | FlowGuard Plumbing Enterprises",
    description:
      "Check the live status of your plumbing service request, review itemized quotations, and message your assigned coordinator.",
    url: "/tracking",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Track Your Request | FlowGuard Plumbing Enterprises",
    description:
      "Check the live status of your plumbing service request, review itemized quotations, and message your assigned coordinator.",
  },
};

export default function TrackingPage() {
  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Live Status
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Track Your Plumbing Request
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Enter both your Reference Number and the phone number used when submitting your request to view status updates, quotations, and assigned technician details.
          </p>
        </div>
      </section>

      <section className="bg-[#F4F6F9] py-14 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <Suspense
            fallback={
              <div className="rounded-xl border border-[#E3E8EF] bg-white p-12 text-center text-base text-[#5B6675]">
                Loading tracking portal...
              </div>
            }
          >
            <TrackingClient />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
