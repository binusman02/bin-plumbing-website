"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  Eye,
  Heart,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";
import type { BlogLanguage, GuideRecord } from "@/lib/marketplace";
import type { BlogEngagementMap } from "@/lib/blog-engagement";

interface BlogIndexClientProps {
  lang: BlogLanguage;
  posts: GuideRecord[];
  engagementMap: BlogEngagementMap;
}

function estimateReadMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 180));
}

export function BlogIndexClient({
  lang,
  posts,
  engagementMap,
}: BlogIndexClientProps) {
  const isHausa = lang === "ha";
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [liveEngagementMap, setLiveEngagementMap] =
    useState<BlogEngagementMap>(engagementMap);

  useEffect(() => {
    let active = true;
    fetch("/api/blog/engagement")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (active && res?.engagementMap) {
          setLiveEngagementMap(res.engagementMap);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (selectedCategory !== "ALL" && post.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const title = (isHausa ? post.ha_title : post.en_title).toLowerCase();
      const summary = (isHausa ? post.ha_summary : post.en_summary).toLowerCase();
      const cat = (post.category || "").toLowerCase();
      return title.includes(q) || summary.includes(q) || cat.includes(q);
    });
  }, [posts, selectedCategory, query, isHausa]);

  const showSpotlight = selectedCategory === "ALL" && !query.trim() && filteredPosts.length > 0;
  const featuredPost = showSpotlight ? filteredPosts[0] : null;
  const gridPosts = showSpotlight ? filteredPosts.slice(1) : filteredPosts;

  return (
    <div className="space-y-8">
      {/* Search & Category Filter */}
      <div className="flex flex-col gap-4 rounded-2xl border border-[#E3E8EF] bg-[#F8FAFC] p-4 sm:p-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6675]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              isHausa
                ? "Nemo labari (misali: injin ruwa, yoyo, bandaki, tanki)..."
                : "Search plumbing guides (e.g. water pump, leak, toilet, drainage)..."
            }
            className="h-11 w-full rounded-xl border border-[#D4DCE6] bg-white pl-10 pr-4 text-sm text-[#0B1F3A] outline-none focus:border-[#F5B301]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedCategory("ALL")}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedCategory === "ALL"
                ? "bg-[#0B1F3A] text-[#F5B301]"
                : "border border-[#D4DCE6] bg-white text-[#2C3A4B] hover:border-[#F5B301]"
            }`}
          >
            {isHausa ? `Duka (${posts.length})` : `All Guides (${posts.length})`}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedCategory === cat
                  ? "bg-[#0B1F3A] text-[#F5B301]"
                  : "border border-[#D4DCE6] bg-white text-[#2C3A4B] hover:border-[#F5B301]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Featured Spotlight */}
      {featuredPost && (() => {
        const title = isHausa ? featuredPost.ha_title : featuredPost.en_title;
        const slug = isHausa ? featuredPost.ha_slug : featuredPost.en_slug;
        const summary = isHausa ? featuredPost.ha_summary : featuredPost.en_summary;
        const content = isHausa ? featuredPost.ha_content : featuredPost.en_content;
        const alt = (isHausa ? featuredPost.ha_image_alt : featuredPost.en_image_alt) || title;
        const href = isHausa ? `/ha/blog/${slug}` : `/en/blog/${slug}`;
        const eng = liveEngagementMap[featuredPost.id] || { views: 0, likes: 0, comments: [] };
        const readMins = estimateReadMinutes(content);

        return (
          <article className="grid grid-cols-1 overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white shadow-sm transition hover:border-[#F5B301] lg:grid-cols-12">
            {featuredPost.featured_image && (
              <Link
                href={href}
                className="relative block aspect-[16/10] bg-slate-100 lg:col-span-6 lg:aspect-auto lg:min-h-[320px]"
              >
                <Image
                  src={featuredPost.featured_image}
                  alt={alt}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </Link>
            )}
            <div className="flex flex-col justify-between p-6 md:p-8 lg:col-span-6">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#F5B301]/15 px-3 py-1 text-xs font-bold text-[#0B1F3A]">
                    <Sparkles className="h-3.5 w-3.5 text-[#E0A200]" />
                    {isHausa ? "Babban Labari" : "Featured Guide"}
                  </span>
                  <span className="rounded-full bg-[#F4F6F9] px-3 py-1 text-xs font-semibold text-[#0B1F3A]">
                    {featuredPost.category}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-[#5B6675]">
                    <Clock className="h-3.5 w-3.5" />
                    {isHausa ? `Minti ${readMins}` : `${readMins} min read`}
                  </span>
                </div>

                <h2 className="mt-4 font-heading text-2xl font-bold text-[#0B1F3A] md:text-3xl">
                  <Link href={href} className="hover:text-[#E0A200]">
                    {title}
                  </Link>
                </h2>
                {summary && (
                  <p className="mt-3 text-sm leading-relaxed text-[#5B6675] md:text-base">
                    {summary}
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#E3E8EF] pt-4">
                <div className="flex items-center gap-4 text-xs text-[#5B6675]">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {eng.views}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5 text-rose-500" />
                    {eng.likes}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-3.5 w-3.5" />
                    {eng.comments.length}
                  </span>
                </div>
                <Link
                  href={href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B1F3A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#132E54]"
                >
                  {isHausa ? "Karanta labari" : "Read full guide"}
                  <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                </Link>
              </div>
            </div>
          </article>
        );
      })()}

      {/* Articles Grid */}
      {filteredPosts.length === 0 ? (
        <div className="rounded-2xl border border-[#E3E8EF] bg-[#F8FAFC] p-10 text-center">
          <p className="font-heading text-lg font-bold text-[#0B1F3A]">
            {isHausa
              ? "Babu labarin da ya dace da nemanka."
              : "No matching guides found."}
          </p>
          <p className="mt-1 text-sm text-[#5B6675]">
            {isHausa
              ? "Gwada wata kalma ko ka zabi Duka."
              : "Try another keyword or switch back to All Guides."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {gridPosts.map((post) => {
            const title = isHausa ? post.ha_title : post.en_title;
            const slug = isHausa ? post.ha_slug : post.en_slug;
            const summary = isHausa ? post.ha_summary : post.en_summary;
            const content = isHausa ? post.ha_content : post.en_content;
            const alt = (isHausa ? post.ha_image_alt : post.en_image_alt) || title;
            const href = isHausa ? `/ha/blog/${slug}` : `/en/blog/${slug}`;
            const eng = liveEngagementMap[post.id] || { views: 0, likes: 0, comments: [] };
            const readMins = estimateReadMinutes(content);

            return (
              <article
                key={post.id}
                className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-[#E3E8EF] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#F5B301] hover:shadow-md"
              >
                <div>
                  {post.featured_image && (
                    <Link
                      href={href}
                      className="relative block aspect-[16/10] w-full overflow-hidden bg-slate-100"
                    >
                      <Image
                        src={post.featured_image}
                        alt={alt}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover transition duration-300 group-hover:scale-105"
                      />
                    </Link>
                  )}
                  <div className="p-6 pb-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-block rounded-full bg-[#F4F6F9] px-3 py-1 text-xs font-semibold text-[#0B1F3A]">
                        {post.category || (isHausa ? "Aikin Famfo" : "Plumbing Guide")}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-[#5B6675]">
                        <Clock className="h-3.5 w-3.5" />
                        {isHausa ? `Minti ${readMins}` : `${readMins} min`}
                      </span>
                    </div>
                    <h2 className="mt-3 font-heading text-xl font-bold text-[#0B1F3A]">
                      <Link href={href} className="hover:text-[#E0A200]">
                        {title}
                      </Link>
                    </h2>
                    {summary && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[#5B6675]">
                        {summary}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#F1F5F9] px-6 py-4">
                  <div className="flex items-center gap-3 text-xs text-[#5B6675]">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" />
                      {eng.views}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5 text-rose-500" />
                      {eng.likes}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {eng.comments.length}
                    </span>
                  </div>
                  <Link
                    href={href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-[#E0A200]"
                  >
                    {isHausa ? "Karanta" : "Read guide"}
                    <ArrowRight className="h-4 w-4 text-[#F5B301]" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
