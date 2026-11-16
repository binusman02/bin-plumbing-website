import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "How Our Kano Plumbing Service Works",
  description:
    "See how Bin Plumbing Services Ltd works in Kano—from submitting your request and on-site inspection to itemised quote approval and completion.",
  alternates: { canonical: "/how-it-works" },
  openGraph: {
    title: "How Our Kano Plumbing Service Works | Bin Plumbing Services Ltd",
    description:
      "Step-by-step overview from request submission and inspection to quotation approval and live tracking.",
    url: "/how-it-works",
    type: "website",
  },
};

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Submit Your Request",
    text: "Complete the online request form with your contact details, area, service type, and issue description.",
  },
  {
    step: "02",
    title: "Receive a Tracking Reference",
    text: "Your request is logged immediately and assigned a unique reference number so you can monitor status updates.",
  },
  {
    step: "03",
    title: "Plumber Assignment",
    text: "Our coordinator reviews your request and assigns an available plumber from our reviewed technician network.",
  },
  {
    step: "04",
    title: "Inspection & Confirmation",
    text: "The assigned plumber visits your property to inspect the issue and confirm the exact scope of work.",
  },
  {
    step: "05",
    title: "Upfront Quotation",
    text: "A clear quotation separating labour and any required materials is submitted for your review before work begins.",
  },
  {
    step: "06",
    title: "Customer Approval",
    text: "You review and approve the quotation so there are no unexpected costs during the job.",
  },
  {
    step: "07",
    title: "Work Execution",
    text: "Once approved, the plumber carries out the repair or installation according to the agreed scope.",
  },
  {
    step: "08",
    title: "Progress Updates",
    text: "Track job milestones from assignment through completion using your reference number and phone number.",
  },
  {
    step: "09",
    title: "Completion Check",
    text: "The finished work is tested on site and marked complete once everything functions properly.",
  },
  {
    step: "10",
    title: "Post-Job Record",
    text: "Your completed request remains recorded under your reference for future follow-up or support.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="bg-white">
      {/* Top Banner */}
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Workflow
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            How It Works
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Every service request follows a clear 10-step process from initial booking to completion.
          </p>
        </div>
      </section>

      {/* Numbered Timeline */}
      <section className="py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="relative">
            {/* Vertical gold connector line on mobile/tablet, hidden on 2-col desktop */}
            <div
              className="absolute bottom-6 left-6 top-6 w-[2px] bg-[#F5B301]/50 md:hidden"
              aria-hidden="true"
            />

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-x-12 md:gap-y-10">
              {WORKFLOW_STEPS.map((item) => (
                <div key={item.step} className="relative flex items-start gap-5">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F5B301] font-heading text-base font-bold text-[#0B1F3A]">
                    {item.step}
                  </div>
                  <div className="pt-1">
                    <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-base leading-relaxed text-[#5B6675]">
                      {item.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-[#F4F6F9] py-14 md:py-20">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-6 px-4 sm:px-6 lg:flex-row lg:items-center lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-heading text-2xl font-bold text-[#0B1F3A] md:text-3xl">
              Ready to get started?
            </h2>
            <p className="mt-2 text-base text-[#5B6675]">
              Submit a service request in a couple of minutes or track an existing ticket.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Link
              href="/request"
              className="inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#F5B301] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#E0A200]"
            >
              <span>Request a Plumber</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            <Link
              href="/tracking"
              className="inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-lg border border-[#0B1F3A] px-6 py-2.5 text-base font-semibold text-[#0B1F3A] transition-colors hover:bg-[#0B1F3A] hover:text-white"
            >
              Track Request
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
