import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { getGuides } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Plumbing Guides & Tips",
  description:
    "Practical plumbing maintenance guides, leak prevention tips, and inspection checklists from Bin Plumbing Services Ltd.",
  alternates: { canonical: "/guides" },
};

export default async function GuidesPage() {
  const guides = await getGuides(true);

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Knowledge Base
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Plumbing Guides & Maintenance Tips
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Clear, practical guides to help homeowners and facility managers spot plumbing issues early and prepare for inspections.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          {guides.length === 0 ? (
            <div className="rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9] p-10 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-[#F5B301]" />
              <h2 className="mt-3 font-heading text-2xl font-bold text-[#0B1F3A]">
                Guides Coming Soon
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-[#5B6675]">
                Our technical team is reviewing new plumbing maintenance guides before publication. Need help right away? Submit a request and an assigned plumber will inspect on site.
              </p>
              <Link
                href="/request"
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
              >
                Request a Plumber
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {guides.map((guide) => (
                <article
                  key={guide.id}
                  className="flex flex-col justify-between rounded-xl border border-[#E3E8EF] bg-white p-6 shadow-sm"
                >
                  <div>
                    <span className="inline-block rounded-full bg-[#F4F6F9] px-3 py-1 text-xs font-semibold text-[#0B1F3A]">
                      {guide.category || "Plumbing Guide"}
                    </span>
                    <h2 className="mt-3 font-heading text-xl font-bold text-[#0B1F3A]">
                      {guide.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#5B6675]">
                      {guide.summary}
                    </p>
                  </div>
                  <Link
                    href={`/guides/${guide.slug}`}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-[#E0A200]"
                  >
                    Read guide
                    <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
