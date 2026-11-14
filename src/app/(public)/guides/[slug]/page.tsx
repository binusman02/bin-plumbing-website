import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getGuides, getMarketplaceSettings } from "@/lib/marketplace";

export const instant = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guides = await getGuides(true);
  const guide = guides.find((g) => g.slug === slug);

  if (!guide) {
    return {
      title: "Guide Not Found",
      robots: { index: false, follow: false },
    };
  }

  const desc = guide.summary || guide.title;
  return {
    title: guide.title.length > 58 ? `${guide.title.slice(0, 55)}...` : guide.title,
    description: desc.length > 158 ? `${desc.slice(0, 155)}...` : desc,
    alternates: { canonical: `/guides/${guide.slug}` },
  };
}

export default async function GuideDetailPage({ params }: Props) {
  const { slug } = await params;
  const [guides, settings] = await Promise.all([
    getGuides(true),
    getMarketplaceSettings(),
  ]);
  const guide = guides.find((g) => g.slug === slug);

  if (!guide) {
    notFound();
  }

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com").replace(/\/+$/, "");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: baseUrl },
          { "@type": "ListItem", position: 2, name: "Guides", item: `${baseUrl}/guides` },
          { "@type": "ListItem", position: 3, name: guide.title, item: `${baseUrl}/guides/${guide.slug}` },
        ],
      },
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.summary,
        datePublished: guide.created_at,
        dateModified: guide.updated_at,
        publisher: {
          "@type": "Organization",
          name: settings.company_name || "Bin Plumbing Services Ltd",
        },
      },
    ],
  };

  const paragraphs = guide.content
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean);

  return (
    <div className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[900px] px-4 sm:px-6 lg:px-8">
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C9D3E0] hover:text-[#F5B301]"
          >
            <ArrowLeft className="h-4 w-4" />
            All Guides
          </Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-[#F5B301]">
            {guide.category || "Plumbing Guide"}
          </p>
          <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-white md:text-4xl">
            {guide.title}
          </h1>
          {guide.summary && (
            <p className="mt-4 text-base leading-relaxed text-[#C9D3E0]">{guide.summary}</p>
          )}
        </div>
      </section>

      <article className="py-14 md:py-20">
        <div className="mx-auto max-w-[900px] space-y-5 px-4 text-base leading-relaxed text-[#2C3A4B] sm:px-6 lg:px-8">
          {paragraphs.map((block: string, idx: number) =>
            block.startsWith("## ") ? (
              <h2 key={idx} className="pt-4 font-heading text-2xl font-bold text-[#0B1F3A]">
                {block.replace(/^##\s+/, "")}
              </h2>
            ) : (
              <p key={idx}>{block}</p>
            )
          )}

          <div className="mt-10 rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9] p-6">
            <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
              Need an On-Site Plumbing Inspection?
            </h2>
            <p className="mt-2 text-sm text-[#5B6675]">
              Log your plumbing issue to get a reference number and an itemised quotation before repair work starts.
            </p>
            <Link
              href="/request"
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
            >
              Request a Plumber
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
