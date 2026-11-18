"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, MapPin, X, ZoomIn } from "lucide-react";
import type { GalleryItemRecord } from "@/lib/marketplace";
import { resolveSharpServiceImage } from "@/lib/service-images";

interface PublicGalleryClientProps {
  items: GalleryItemRecord[];
}

export function PublicGalleryClient({ items }: PublicGalleryClientProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [lightboxItem, setLightboxItem] = useState<GalleryItemRecord | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.service_category?.trim()) set.add(item.service_category.trim());
    });
    return ["All", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    if (selectedCategory === "All") return items;
    return items.filter((item) => item.service_category === selectedCategory);
  }, [items, selectedCategory]);

  useEffect(() => {
    if (!lightboxItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxItem]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-12 text-center">
        <Camera className="mx-auto mb-3 h-10 w-10 text-[#66778C]" />
        <h2 className="text-lg font-bold text-[#0B1F3A]">
          No published project photos yet
        </h2>
        <p className="mt-2 text-sm text-[#4B5B70]">
          Photos are added here after completed jobs are reviewed and published by our team.
        </p>
        <Link
          href="/request"
          className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[#F5B301] px-6 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
        >
          Request a Plumber
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {categories.length > 2 && (
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                  active
                    ? "bg-[#0B1F3A] text-white shadow-sm"
                    : "border border-[#E3E8EF] bg-white text-[#4B5B70] hover:border-[#0B1F3A]/40 hover:text-[#0B1F3A]"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="group overflow-hidden rounded-xl border border-[#E3E8EF] bg-white shadow-sm transition hover:border-[#F5B301]/60 hover:shadow-md"
          >
            <button
              type="button"
              onClick={() => setLightboxItem(item)}
              className="relative block aspect-[4/3] w-full overflow-hidden bg-[#F4F6F9] text-left"
              aria-label={`View ${item.title}`}
            >
              <Image
                src={resolveSharpServiceImage(item.image_url)}
                alt={item.title}
                fill
                quality={85}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 420px"
                className="object-cover transition duration-300 group-hover:scale-105"
              />
              <span className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#07152B]/75 text-white opacity-0 transition group-hover:opacity-100">
                <ZoomIn className="h-4 w-4" />
              </span>
            </button>
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9A6B00]">
                {item.service_category}
              </p>
              <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">{item.title}</h2>
              {item.location && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm text-[#4B5B70]">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-[#66778C]" />
                  <span>{item.location}</span>
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxItem(null)}
              aria-label="Close photo preview"
              className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-[#07152B]/80 text-white hover:bg-[#07152B]"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="flex max-h-[75vh] items-center justify-center bg-[#07152B]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveSharpServiceImage(lightboxItem.image_url)}
                alt={lightboxItem.title}
                className="max-h-[75vh] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#F5B301]">
                  {lightboxItem.service_category}
                </p>
                <h3 className="text-lg font-bold text-[#0B1F3A]">{lightboxItem.title}</h3>
              </div>
              {lightboxItem.location && (
                <p className="flex items-center gap-1.5 text-sm text-[#4B5B70]">
                  <MapPin className="h-4 w-4 text-[#66778C]" />
                  {lightboxItem.location}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
