"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Quote, Star } from "lucide-react";

export interface PublicReviewItem {
  id: string;
  rating: number;
  comment: string;
  customer_name: string;
  service_category?: string | null;
  area?: string | null;
}

interface ReviewsSliderProps {
  reviews: PublicReviewItem[];
}

export function ReviewsSlider({ reviews }: ReviewsSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pausedUntilRef = useRef<number>(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const count = reviews.length;

  const scrollToIndex = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const cards = Array.from(track.children) as HTMLElement[];
    const clamped = ((index % count) + count) % count;
    const target = cards[clamped];
    if (!target) return;
    track.scrollTo({
      left: clamped === 0 ? 0 : target.offsetLeft,
      behavior: "smooth",
    });
    setActiveIndex(clamped);
  };

  useEffect(() => {
    if (count <= 1) return;

    const timer = window.setInterval(() => {
      if (isHovered || Date.now() < pausedUntilRef.current) return;
      const track = trackRef.current;
      if (!track || track.scrollWidth <= track.clientWidth + 8) return;

      const cards = Array.from(track.children) as HTMLElement[];
      const atEnd =
        track.scrollLeft + track.clientWidth >= track.scrollWidth - 16;

      if (atEnd) {
        track.scrollTo({ left: 0, behavior: "smooth" });
        setActiveIndex(0);
        return;
      }

      let currentIdx = 0;
      let minDist = Infinity;
      cards.forEach((card, idx) => {
        const dist = Math.abs(card.offsetLeft - track.scrollLeft);
        if (dist < minDist) {
          minDist = dist;
          currentIdx = idx;
        }
      });

      const nextIdx = (currentIdx + 1) % cards.length;
      const nextCard = cards[nextIdx];
      if (!nextCard) return;
      track.scrollTo({
        left: nextIdx === 0 ? 0 : nextCard.offsetLeft,
        behavior: "smooth",
      });
      setActiveIndex(nextIdx);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [count, isHovered]);

  if (count === 0) return null;

  return (
    <div
      className="mt-8 space-y-5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => {
        pausedUntilRef.current = Date.now() + 8000;
      }}
      onPointerDown={() => {
        pausedUntilRef.current = Date.now() + 8000;
      }}
    >
      <div
        ref={trackRef}
        onScroll={() => {
          const track = trackRef.current;
          if (!track) return;
          const cards = Array.from(track.children) as HTMLElement[];
          let nearest = 0;
          let minDist = Infinity;
          cards.forEach((card, idx) => {
            const dist = Math.abs(card.offsetLeft - track.scrollLeft);
            if (dist < minDist) {
              minDist = dist;
              nearest = idx;
            }
          });
          setActiveIndex(nearest);
        }}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {reviews.map((rev) => (
          <article
            key={rev.id}
            className="relative flex w-[84vw] max-w-[360px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm transition hover:border-[#F5B301]/70 hover:shadow-md sm:w-[calc(50%-10px)] sm:max-w-none lg:w-[calc(33.333%-14px)]"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 text-[#F5B301]">
                  {Array.from({ length: Math.max(1, Math.min(5, rev.rating || 5)) }).map(
                    (_, idx) => (
                      <Star key={idx} className="h-4 w-4 fill-[#F5B301]" />
                    )
                  )}
                </div>
                <Quote className="h-5 w-5 text-slate-200" aria-hidden="true" />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[#4B5B70]">
                &ldquo;{rev.comment}&rdquo;
              </p>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-3.5 text-xs">
              <p className="font-bold text-[#0B1F3A]">{rev.customer_name}</p>
              {(rev.service_category || rev.area) && (
                <p className="mt-0.5 text-[#5B6675]">
                  {[rev.service_category, rev.area].filter(Boolean).join(" • ")}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>

      {count > 1 && (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            {reviews.map((rev, idx) => (
              <button
                key={`rev-dot-${rev.id}`}
                type="button"
                aria-label={`View review ${idx + 1}`}
                onClick={() => {
                  pausedUntilRef.current = Date.now() + 8000;
                  scrollToIndex(idx);
                }}
                className={`h-2 rounded-full transition-all ${
                  activeIndex === idx
                    ? "w-6 bg-[#0B1F3A]"
                    : "w-2 bg-slate-300 hover:bg-slate-400"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Previous review"
              onClick={() => {
                pausedUntilRef.current = Date.now() + 8000;
                scrollToIndex(activeIndex - 1);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E3E8EF] bg-white text-[#0B1F3A] shadow-xs transition hover:border-[#F5B301] hover:bg-amber-50/40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next review"
              onClick={() => {
                pausedUntilRef.current = Date.now() + 8000;
                scrollToIndex(activeIndex + 1);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E3E8EF] bg-white text-[#0B1F3A] shadow-xs transition hover:border-[#F5B301] hover:bg-amber-50/40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
