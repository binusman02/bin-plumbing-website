import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  Eye,
  Globe,
  Heart,
  ListChecks,
  MessageCircle,
  Wrench,
} from "lucide-react";
import type { BlogLanguage, GuideRecord, ServiceCategorySetting } from "@/lib/marketplace";
import type { GuideEngagement } from "@/lib/blog-engagement";
import { buildBreadcrumbJsonLd, canonicalUrl, SITE_NAME } from "@/lib/seo";
import { BlogReadingProgress } from "@/components/blog/BlogReadingProgress";
import { BlogEngagementPanel } from "@/components/blog/BlogEngagementPanel";

interface BlogArticleViewProps {
  lang: BlogLanguage;
  post: GuideRecord;
  companyName?: string;
  targetService?: ServiceCategorySetting | null;
  initialEngagement?: GuideEngagement;
  relatedPosts?: GuideRecord[];
}

function renderFormattedInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-[#0B1F3A]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part.replace(/\*/g, "");
  });
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export function BlogArticleView({
  lang,
  post,
  companyName = SITE_NAME,
  targetService,
  initialEngagement = { views: 0, likes: 0, comments: [] },
  relatedPosts = [],
}: BlogArticleViewProps) {
  const isHausa = lang === "ha";
  const title = isHausa ? post.ha_title : post.en_title;
  const slug = isHausa ? post.ha_slug : post.en_slug;
  const summary = isHausa ? post.ha_summary : post.en_summary;
  const content = isHausa ? post.ha_content : post.en_content;
  const imageAlt = (isHausa ? post.ha_image_alt : post.en_image_alt) || title;

  const hasTranslation = isHausa
    ? post.en_status === "published" && Boolean(post.en_slug.trim())
    : post.ha_status === "published" && Boolean(post.ha_slug.trim());

  const translationHref = isHausa
    ? `/en/blog/${post.en_slug}`
    : `/ha/blog/${post.ha_slug}`;

  const indexPath = isHausa ? "/ha/blog" : "/en/blog";
  const articlePath = `${indexPath}/${slug}`;
  const fullArticleUrl = canonicalUrl(articlePath);

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(2, Math.round(wordCount / 180));

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: isHausa ? "Shafin Farko" : "Home", path: "/" },
    { name: isHausa ? "Labaran Famfo (Hausa)" : "Plumbing Guides", path: indexPath },
    { name: title, path: articlePath },
  ]);

  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description: summary || title,
    inLanguage: isHausa ? "ha" : "en-NG",
    mainEntityOfPage: fullArticleUrl,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.created_at,
    ...(post.featured_image
      ? { image: [canonicalUrl(post.featured_image)] }
      : {}),
    author: {
      "@type": "Organization",
      name: post.author_name || companyName,
    },
    publisher: {
      "@type": "Organization",
      name: companyName,
      logo: {
        "@type": "ImageObject",
        url: canonicalUrl("/images/logo/flowguard-icon.jpg"),
      },
    },
  };

  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  const headings = blocks
    .filter((b) => b.startsWith("## "))
    .map((b) => {
      const headingText = b.replace(/^##\s+/, "").replace(/\*/g, "").trim();
      return {
        text: headingText,
        id: slugifyHeading(headingText),
      };
    });

  return (
    <div lang={isHausa ? "ha" : "en-NG"} className="bg-[#FAFBFD]">
      <BlogReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([breadcrumbJsonLd, blogPostingJsonLd]),
        }}
      />

      {/* Editorial Hero */}
      <section className="bg-gradient-to-b from-[#07152B] to-[#0B1F3A] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[920px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={indexPath}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C9D3E0] transition hover:text-[#F5B301]"
            >
              <ArrowLeft className="h-4 w-4" />
              {isHausa ? "Duk Labaran Famfo" : "All Plumbing Guides"}
            </Link>
            {hasTranslation && (
              <Link
                href={translationHref}
                hrefLang={isHausa ? "en-NG" : "ha"}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:border-[#F5B301] hover:text-[#F5B301]"
              >
                <Globe className="h-3.5 w-3.5 text-[#F5B301]" />
                {isHausa ? "Read in English" : "Karanta a Hausa"}
              </Link>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[#F5B301]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#F5B301]">
              {post.category || (isHausa ? "Aikin Famfo" : "Plumbing Guide")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-[#C9D3E0]">
              <Clock className="h-3.5 w-3.5 text-[#F5B301]" />
              {isHausa ? `Minti ${readMinutes} na karatu` : `${readMinutes} min read`}
            </span>
          </div>

          <h1 className="mt-4 font-heading text-3xl font-bold leading-tight tracking-tight text-white md:text-5xl">
            {title}
          </h1>

          {summary && (
            <p className="mt-4 text-base leading-relaxed text-[#C9D3E0] md:text-lg">
              {summary}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5 text-xs text-[#9FB0C7]">
            <p>
              {isHausa ? "Marubuci:" : "By"}{" "}
              <span className="font-semibold text-white">
                {post.author_name || companyName}
              </span>{" "}
              •{" "}
              {new Date(post.published_at || post.updated_at || post.created_at).toLocaleDateString(
                "en-NG",
                { year: "numeric", month: "short", day: "numeric" }
              )}
            </p>
            <div className="flex items-center gap-4 text-xs text-[#C9D3E0]">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5 text-[#F5B301]" />
                {initialEngagement.views}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5 text-[#F5B301]" />
                {initialEngagement.likes}
              </span>
              <a href="#comments" className="inline-flex items-center gap-1 hover:text-[#F5B301]">
                <MessageCircle className="h-3.5 w-3.5 text-[#F5B301]" />
                {initialEngagement.comments.length}
              </a>
            </div>
          </div>
        </div>
      </section>

      <article className="py-12 md:py-16">
        <div className="mx-auto max-w-[920px] space-y-6 px-4 text-base leading-relaxed text-[#2C3A4B] sm:px-6 lg:px-8">
          {post.featured_image && (
            <figure className="overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white shadow-sm">
              <div className="relative aspect-[16/9] w-full">
                <Image
                  src={post.featured_image}
                  alt={imageAlt}
                  fill
                  priority
                  sizes="(max-width: 960px) 100vw, 920px"
                  className="object-cover"
                />
              </div>
              {post.image_attribution && (
                <figcaption className="border-t border-[#E3E8EF] bg-[#F8FAFC] px-4 py-2.5 text-xs text-[#5B6675]">
                  {imageAlt} — {post.image_attribution}
                </figcaption>
              )}
            </figure>
          )}

          {/* Table of Contents */}
          {headings.length >= 3 && (
            <nav
              aria-label={isHausa ? "Abubuwan da ke ciki" : "Table of contents"}
              className="rounded-2xl border border-[#E3E8EF] bg-white p-5 shadow-sm"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                <ListChecks className="h-4 w-4 text-[#F5B301]" />
                {isHausa ? "Abubuwan Da Za Ku Karanta" : "In This Guide"}
              </div>
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {headings.map((h) => (
                  <li key={h.id}>
                    <a
                      href={`#${h.id}`}
                      className="text-sm font-medium text-[#2C3A4B] transition hover:text-[#0B1F3A] hover:underline"
                    >
                      • {h.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {/* Formatted Body */}
          <div className="space-y-5 rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm md:p-10">
            {blocks.map((block, idx) => {
              if (block.startsWith("## ")) {
                const headingText = block.replace(/^##\s+/, "").replace(/\*/g, "").trim();
                const isTipHeading =
                  /what to do before|abin da za ku yi kafin/i.test(headingText);
                return (
                  <h2
                    key={idx}
                    id={slugifyHeading(headingText)}
                    className={`scroll-mt-20 pt-4 font-heading text-2xl font-bold text-[#0B1F3A] ${
                      isTipHeading
                        ? "mt-4 border-l-4 border-[#F5B301] pl-3.5"
                        : ""
                    }`}
                  >
                    {headingText}
                  </h2>
                );
              }
              if (block.startsWith("### ")) {
                const subText = block.replace(/^###\s+/, "").replace(/\*/g, "").trim();
                return (
                  <h3 key={idx} className="pt-2 font-heading text-xl font-bold text-[#0B1F3A]">
                    {subText}
                  </h3>
                );
              }
              if (block.startsWith("- ") || block.startsWith("* ")) {
                const items = block
                  .split("\n")
                  .map((l) => l.replace(/^[-*]\s+/, "").trim())
                  .filter(Boolean);
                return (
                  <ul key={idx} className="space-y-2.5 rounded-xl bg-[#F8FAFC] p-4 pl-8 list-disc text-[#2C3A4B]">
                    {items.map((item, i) => (
                      <li key={i} className="leading-relaxed">
                        {renderFormattedInline(item)}
                      </li>
                    ))}
                  </ul>
                );
              }
              if (/^\d+\.\s+/.test(block)) {
                const items = block
                  .split("\n")
                  .map((l) => l.replace(/^\d+\.\s+/, "").trim())
                  .filter(Boolean);
                return (
                  <ol key={idx} className="list-decimal space-y-2.5 pl-6 text-[#2C3A4B]">
                    {items.map((item, i) => (
                      <li key={i} className="leading-relaxed">
                        {renderFormattedInline(item)}
                      </li>
                    ))}
                  </ol>
                );
              }
              return (
                <p key={idx} className="text-[16px] leading-7 text-[#2C3A4B]">
                  {renderFormattedInline(block)}
                </p>
              );
            })}
          </div>

          {targetService && (
            <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A] text-[#F5B301]">
                  <Wrench className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5B6675]">
                    {isHausa ? "Sabis Mai Alaka" : "Related Plumbing Service"}
                  </p>
                  <h2 className="mt-1 font-heading text-xl font-bold text-[#0B1F3A]">
                    {targetService.title || targetService.name}
                  </h2>
                  <p className="mt-1 text-sm text-[#5B6675]">
                    {targetService.short_description || targetService.description}
                  </p>
                  <Link
                    href={`/services/${targetService.slug || targetService.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-[#E0A200]"
                  >
                    {isHausa ? "Duba cikakken sabis" : "Explore this service"}
                    <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* CTA Banner */}
          <div className="rounded-2xl border border-[#E3E8EF] bg-gradient-to-r from-[#0B1F3A] to-[#132E54] p-6 text-white shadow-sm md:p-8">
            <h2 className="font-heading text-2xl font-bold text-white">
              {isHausa
                ? "Kuna Bukatar A Duba Matsalar Famfo a Gida?"
                : "Need an On-Site Plumbing Inspection in Kano?"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#C9D3E0]">
              {isHausa
                ? "Ku tura bukatar gyara domin samun lambar bibiya (reference number) da kiyasin farashi kafin a fara aiki."
                : "Log your plumbing issue to receive a reference number and an itemised quotation for approval before repair work begins."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={
                  targetService
                    ? `/request?service=${encodeURIComponent(targetService.title || targetService.name || "")}`
                    : "/request"
                }
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#F5B301] px-5 text-sm font-semibold text-[#0B1F3A] hover:bg-[#E0A200]"
              >
                {isHausa ? "Nemi Mai Aikin Famfo" : "Request a Plumber"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/areas"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white hover:bg-white/20"
              >
                {isHausa ? "Yankunan Aiki a Kano" : "View Kano Service Areas"}
              </Link>
            </div>
          </div>

          {/* Interactive Likes, Views, Share & Comments */}
          <BlogEngagementPanel
            guideId={post.id}
            lang={lang}
            title={title}
            articleUrl={fullArticleUrl}
            initialEngagement={initialEngagement}
          />

          {/* Related Articles */}
          {relatedPosts.length > 0 && (
            <section className="pt-4">
              <h2 className="font-heading text-xl font-bold text-[#0B1F3A]">
                {isHausa ? "Karin Labaran Famfo" : "More Plumbing Guides"}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedPosts.slice(0, 3).map((rel) => {
                  const rTitle = isHausa ? rel.ha_title : rel.en_title;
                  const rSlug = isHausa ? rel.ha_slug : rel.en_slug;
                  const rHref = isHausa ? `/ha/blog/${rSlug}` : `/en/blog/${rSlug}`;
                  return (
                    <Link
                      key={rel.id}
                      href={rHref}
                      className="group rounded-xl border border-[#E3E8EF] bg-white p-4 shadow-sm transition hover:border-[#F5B301]"
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#F5B301]">
                        {rel.category}
                      </span>
                      <h3 className="mt-1.5 font-heading text-base font-bold text-[#0B1F3A] group-hover:text-[#E0A200]">
                        {rTitle}
                      </h3>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5B6675] group-hover:text-[#0B1F3A]">
                        {isHausa ? "Karanta" : "Read guide"}
                        <ArrowRight className="h-3.5 w-3.5 text-[#F5B301]" />
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
