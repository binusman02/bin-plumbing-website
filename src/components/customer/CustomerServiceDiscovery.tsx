"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Bath,
  ChevronRight,
  Droplets,
  Gauge,
  Hammer,
  Pipette,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wrench,
  X,
} from "lucide-react";
import type { ServiceCategorySetting } from "@/lib/marketplace";
import { resolveServiceImageAlt, resolveSharpServiceImage } from "@/lib/service-images";

interface CustomerServiceDiscoveryProps {
  categories: ServiceCategorySetting[];
  onSelectCategory: (categoryTitle: string) => void;
}

function getCategoryIcon(iconName?: string) {
  const key = (iconName || "").toLowerCase();
  if (key.includes("droplet") || key.includes("water") || key.includes("leak")) {
    return Droplets;
  }
  if (key.includes("gauge") || key.includes("pump") || key.includes("pressure")) {
    return Gauge;
  }
  if (key.includes("bath") || key.includes("shower") || key.includes("toilet")) {
    return Bath;
  }
  if (key.includes("thermometer") || key.includes("heater") || key.includes("hot")) {
    return Thermometer;
  }
  if (key.includes("pipette") || key.includes("pipe") || key.includes("drain")) {
    return Pipette;
  }
  if (key.includes("shield") || key.includes("inspect")) {
    return ShieldCheck;
  }
  if (key.includes("hammer") || key.includes("install") || key.includes("remodel")) {
    return Hammer;
  }
  if (key.includes("sparkle") || key.includes("clean")) {
    return Sparkles;
  }
  return Wrench;
}

export function CustomerServiceDiscovery({
  categories,
  onSelectCategory,
}: CustomerServiceDiscoveryProps) {
  const [viewAllOpen, setViewAllOpen] = useState(false);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const categoriesTrackRef = useRef<HTMLDivElement | null>(null);
  const spotlightTrackRef = useRef<HTMLDivElement | null>(null);
  const categoriesPausedUntilRef = useRef<number>(0);
  const spotlightPausedUntilRef = useRef<number>(0);

  const spotlightCategories = categories.slice(0, 5);
  const categoriesCount = categories.length;
  const spotlightCount = spotlightCategories.length;

  useEffect(() => {
    if (categoriesCount <= 1 && spotlightCount <= 1) return;
    if (typeof window === "undefined") return;

    const advanceTrack = (
      track: HTMLDivElement | null,
      pausedUntil: number,
      onIndexChange?: (idx: number) => void
    ) => {
      if (!track || window.innerWidth >= 768) return;
      if (Date.now() < pausedUntil) return;
      if (track.scrollWidth <= track.clientWidth + 8) return;

      const children = Array.from(track.children) as HTMLElement[];
      if (children.length <= 1) return;

      const currentLeft = track.scrollLeft;
      let currentIndex = 0;
      let minDist = Infinity;
      children.forEach((child, idx) => {
        const dist = Math.abs(child.offsetLeft - currentLeft);
        if (dist < minDist) {
          minDist = dist;
          currentIndex = idx;
        }
      });

      const atEnd =
        track.scrollLeft + track.clientWidth >= track.scrollWidth - 16;
      const nextIndex = atEnd ? 0 : (currentIndex + 1) % children.length;
      const targetChild = children[nextIndex];
      if (!targetChild) return;

      track.scrollTo({
        left: nextIndex === 0 ? 0 : targetChild.offsetLeft - 14,
        behavior: "smooth",
      });
      onIndexChange?.(nextIndex);
    };

    const timer = window.setInterval(() => {
      advanceTrack(categoriesTrackRef.current, categoriesPausedUntilRef.current);
      advanceTrack(
        spotlightTrackRef.current,
        spotlightPausedUntilRef.current,
        setSpotlightIndex
      );
    }, 5000);

    return () => window.clearInterval(timer);
  }, [categoriesCount, spotlightCount]);

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* All Categories */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0B1F3A] sm:text-base">
            All Categories
          </h3>
          <button
            type="button"
            onClick={() => setViewAllOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#0B1F3A] transition hover:bg-slate-100"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5 text-[#F5B301]" />
          </button>
        </div>

        <div
          ref={categoriesTrackRef}
          onTouchStart={() => {
            categoriesPausedUntilRef.current = Date.now() + 8000;
          }}
          onPointerDown={() => {
            categoriesPausedUntilRef.current = Date.now() + 8000;
          }}
          className="-mx-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:px-0 md:grid md:grid-cols-5 md:gap-4 md:overflow-visible lg:grid-cols-9"
        >
          {categories.map((cat) => {
            const label = cat.title || cat.name || cat.slug;
            const Icon = getCategoryIcon(cat.icon_name || cat.slug);
            return (
              <button
                key={cat.id || cat.slug}
                type="button"
                onClick={() => onSelectCategory(label)}
                className="group flex w-[76px] shrink-0 snap-start flex-col items-center gap-1.5 text-center transition active:scale-95 md:w-auto"
              >
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200/90 bg-white text-[#0B1F3A] shadow-sm transition group-hover:border-[#F5B301] group-hover:bg-amber-50/40 group-hover:shadow-md">
                  <Icon className="h-6 w-6 text-[#0B1F3A]" />
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#0B1F3A]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Service Spotlight */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#0B1F3A] sm:text-base">
            Service Spotlight
          </h3>
        </div>

        <div
          ref={spotlightTrackRef}
          onTouchStart={() => {
            spotlightPausedUntilRef.current = Date.now() + 8000;
          }}
          onPointerDown={() => {
            spotlightPausedUntilRef.current = Date.now() + 8000;
          }}
          onScroll={() => {
            const track = spotlightTrackRef.current;
            if (!track) return;
            const children = Array.from(track.children) as HTMLElement[];
            let nearest = 0;
            let minDist = Infinity;
            children.forEach((child, idx) => {
              const dist = Math.abs(child.offsetLeft - track.scrollLeft);
              if (dist < minDist) {
                minDist = dist;
                nearest = idx;
              }
            });
            setSpotlightIndex(nearest);
          }}
          className="-mx-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible"
        >
          {spotlightCategories.map((cat) => {
            const label = cat.title || cat.name || cat.slug;
            const imgSrc = resolveSharpServiceImage(cat.image, cat.slug);
            const imgAlt = resolveServiceImageAlt(cat.slug, label, cat.image_alt);
            return (
              <div
                key={`spotlight-${cat.id || cat.slug}`}
                className="group relative h-48 w-[280px] shrink-0 snap-start overflow-hidden rounded-2xl bg-[#0B1F3A] text-white shadow-md sm:w-[300px] md:w-auto"
              >
                <Image
                  src={imgSrc}
                  alt={imgAlt}
                  fill
                  sizes="(max-width: 768px) 280px, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07152B] via-[#0B1F3A]/45 to-black/15" />
                <div className="relative z-10 flex h-full flex-col justify-between p-4">
                  <span className="w-fit rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A] backdrop-blur-xs">
                    FlowGuard
                  </span>
                  <div className="space-y-2.5">
                    <h4 className="line-clamp-1 text-base font-bold text-white drop-shadow-xs">
                      {label}
                    </h4>
                    <button
                      type="button"
                      onClick={() => onSelectCategory(label)}
                      className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#F5B301] px-3 text-xs font-bold text-[#07152B] shadow-sm transition hover:bg-[#e5a700] active:opacity-90"
                    >
                      Request This Service
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {spotlightCategories.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pt-1 md:hidden">
            {spotlightCategories.map((cat, idx) => (
              <button
                key={`dot-${cat.id || cat.slug}`}
                type="button"
                aria-label={`Show featured service ${idx + 1}`}
                onClick={() => {
                  const track = spotlightTrackRef.current;
                  const target = track?.children[idx] as HTMLElement | undefined;
                  if (track && target) {
                    spotlightPausedUntilRef.current = Date.now() + 8000;
                    track.scrollTo({
                      left: idx === 0 ? 0 : target.offsetLeft - 14,
                      behavior: "smooth",
                    });
                    setSpotlightIndex(idx);
                  }
                }}
                className={`h-1.5 rounded-full transition-all ${
                  spotlightIndex === idx
                    ? "w-5 bg-[#0B1F3A]"
                    : "w-1.5 bg-slate-300"
                }`}
              />
            ))}
          </div>
        )}
      </section>

      {/* View All Categories Sheet */}
      {viewAllOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[1px] sm:items-center sm:p-4"
          onClick={() => setViewAllOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3A]">
                  All Plumbing Categories
                </h3>
                <p className="text-xs text-slate-500">
                  {categories.length} active services available
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewAllOpen(false)}
                aria-label="Close categories"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              {categories.map((cat) => {
                const label = cat.title || cat.name || cat.slug;
                const Icon = getCategoryIcon(cat.icon_name || cat.slug);
                return (
                  <button
                    key={`sheet-${cat.id || cat.slug}`}
                    type="button"
                    onClick={() => {
                      setViewAllOpen(false);
                      onSelectCategory(label);
                    }}
                    className="group flex flex-col items-center gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 text-center transition hover:border-[#F5B301] hover:bg-amber-50/30 active:scale-95"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B1F3A]/5 text-[#0B1F3A] transition group-hover:bg-[#F5B301]/20">
                      <Icon className="h-6 w-6" />
                    </span>
                    <p className="line-clamp-2 text-[11px] font-semibold leading-tight text-[#0B1F3A]">
                      {label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
