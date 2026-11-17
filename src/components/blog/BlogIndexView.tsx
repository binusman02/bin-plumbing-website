import Link from "next/link";
import { ArrowRight, BookOpen, Globe } from "lucide-react";
import type { BlogLanguage, GuideRecord } from "@/lib/marketplace";
import type { BlogEngagementMap } from "@/lib/blog-engagement";
import { buildBreadcrumbJsonLd } from "@/lib/seo";
import { BlogIndexClient } from "@/components/blog/BlogIndexClient";

interface BlogIndexViewProps {
  lang: BlogLanguage;
  posts: GuideRecord[];
  engagementMap?: BlogEngagementMap;
}

export function BlogIndexView({
  lang,
  posts,
  engagementMap = {},
}: BlogIndexViewProps) {
  const isHausa = lang === "ha";
  const otherLangHref = isHausa ? "/en/blog" : "/ha/blog";
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: isHausa ? "Shafin Farko" : "Home", path: "/" },
    {
      name: isHausa ? "Shawarwari da Labarai (Hausa)" : "Plumbing Guides & Blog",
      path: isHausa ? "/ha/blog" : "/en/blog",
    },
  ]);

  return (
    <div lang={isHausa ? "ha" : "en-NG"} className="bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <section className="bg-gradient-to-b from-[#07152B] to-[#0B1F3A] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
              {isHausa ? "Ilimin Gyaran Famfo • Kano" : "Plumbing Knowledge Base • Kano"}
            </p>
            <Link
              href={otherLangHref}
              hrefLang={isHausa ? "en-NG" : "ha"}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-[#F5B301] hover:text-[#F5B301]"
            >
              <Globe className="h-3.5 w-3.5 text-[#F5B301]" />
              {isHausa ? "Read Guides in English" : "Karanta a Hausa"}
            </Link>
          </div>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            {isHausa
              ? "Shawarwarin Gyaran Famfo da Injin Ruwa a Kano"
              : "Plumbing Guides & Maintenance Tips for Kano Homes"}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            {isHausa
              ? "Bayani mai saukin fahimta kan gyaran injin famfo, bututun ruwa, tankin sama, bandaki, da magudanar ruwa daga FlowGuard Plumbing Enterprises."
              : "Clear, practical advice on water pumps, leak prevention, overhead tanks, toilets, and drainage from FlowGuard Plumbing Enterprises in Kano."}
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-[#E3E8EF] bg-[#F4F6F9] p-10 text-center">
              <BookOpen className="mx-auto h-9 w-9 text-[#F5B301]" />
              <h2 className="mt-3 font-heading text-2xl font-bold text-[#0B1F3A]">
                {isHausa
                  ? "Ana Shirya Sabbin Labaran Hausa"
                  : "New Guides Are Being Reviewed"}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm text-[#5B6675]">
                {isHausa
                  ? "Tawagarmu tana tantance sabbin shawarwarin gyaran famfo kafin wallafawa. Kuna iya neman mai aikin famfo nan take idan kuna bukatar gyara."
                  : "Our technical team is reviewing plumbing guides before publication. Need help right away? Submit a request and an assigned plumber will inspect on site."}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  href="/request"
                  className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
                >
                  {isHausa ? "Nemi Mai Aikin Famfo" : "Request a Plumber"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={otherLangHref}
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#0B1F3A] bg-white px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-slate-50"
                >
                  {isHausa ? "View English Guides" : "Duba Shafin Hausa"}
                </Link>
              </div>
            </div>
          ) : (
            <BlogIndexClient
              lang={lang}
              posts={posts}
              engagementMap={engagementMap}
            />
          )}
        </div>
      </section>
    </div>
  );
}
