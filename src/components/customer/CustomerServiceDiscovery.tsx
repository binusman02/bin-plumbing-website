"use client";

import { useState } from "react";
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

  if (categories.length === 0) {
    return null;
  }

  const spotlightCategories = categories.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* All Categories */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3A] sm:text-base">
              All Categories
            </h3>
            <p className="text-xs text-slate-500">
              Tap a service to start a plumbing request
            </p>
          </div>
          <button
            type="button"
            onClick={() => setViewAllOpen(true)}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-[#0B1F3A] transition hover:bg-slate-100"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5 text-[#F5B301]" />
          </button>
        </div>

        <div className="-mx-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:px-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible lg:grid-cols-5">
          {categories.map((cat) => {
            const label = cat.title || cat.name || cat.slug;
            const Icon = getCategoryIcon(cat.icon_name || cat.slug);
            return (
              <button
                key={cat.id || cat.slug}
                type="button"
                onClick={() => onSelectCategory(label)}
                className="group flex w-[132px] shrink-0 snap-start flex-col items-start justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-sm transition hover:border-[#F5B301] hover:shadow-md active:scale-[0.98] md:w-auto"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A] transition group-hover:bg-[#F5B301]/20">
                  <Icon className="h-5 w-5 text-[#0B1F3A]" />
                </span>
                <span className="line-clamp-2 text-xs font-bold leading-snug text-[#0B1F3A]">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Featured Service Spotlight */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3A] sm:text-base">
              Service Spotlight
            </h3>
            <p className="text-xs text-slate-500">
              Verified FlowGuard plumbing services across Kano
            </p>
          </div>
        </div>

        <div className="-mx-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3.5 pb-1 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible">
          {spotlightCategories.map((cat) => {
            const label = cat.title || cat.name || cat.slug;
            const summary = cat.short_description || cat.description;
            const imgSrc = resolveSharpServiceImage(cat.image, cat.slug);
            const imgAlt = resolveServiceImageAlt(cat.slug, label, cat.image_alt);
            return (
              <div
                key={`spotlight-${cat.id || cat.slug}`}
                className="group relative flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#0B1F3A] text-white shadow-sm sm:w-[300px] md:w-auto"
              >
                <div className="relative h-36 w-full overflow-hidden bg-slate-900">
                  <Image
                    src={imgSrc}
                    alt={imgAlt}
                    fill
                    sizes="(max-width: 768px) 280px, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover opacity-85 transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/45 to-transparent" />
                  <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#0B1F3A] shadow-sm">
                    FlowGuard Service
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                  <div className="space-y-1">
                    <h4 className="line-clamp-1 text-sm font-bold text-white">
                      {label}
                    </h4>
                    <p className="line-clamp-2 text-xs leading-relaxed text-slate-200">
                      {summary}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectCategory(label)}
                    className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#F5B301] px-3 text-xs font-bold text-[#07152B] transition hover:bg-[#e5a700] active:opacity-90"
                  >
                    Request {label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
            <div className="grid grid-cols-1 gap-2.5 overflow-y-auto p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:grid-cols-2">
              {categories.map((cat) => {
                const label = cat.title || cat.name || cat.slug;
                const summary = cat.short_description || cat.description;
                const Icon = getCategoryIcon(cat.icon_name || cat.slug);
                return (
                  <button
                    key={`sheet-${cat.id || cat.slug}`}
                    type="button"
                    onClick={() => {
                      setViewAllOpen(false);
                      onSelectCategory(label);
                    }}
                    className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-[#F5B301] hover:bg-amber-50/30 active:scale-[0.99]"
                  >
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[#0B1F3A]">{label}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">
                        {summary}
                      </p>
                    </div>
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
