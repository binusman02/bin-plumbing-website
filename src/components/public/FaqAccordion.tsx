"use client";

import { useState } from "react";
import { Plus, Minus } from "lucide-react";

export interface FaqItem {
  q: string;
  a: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="divide-y divide-[#E3E8EF] rounded-xl border border-[#E3E8EF] bg-white">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={item.q} className="px-6 py-5">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="flex w-full items-center justify-between gap-4 text-left"
            >
              <span className="font-heading text-base font-bold text-[#0B1F3A] sm:text-lg">
                {item.q}
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#F4F6F9] text-[#F5B301]">
                {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              </span>
            </button>
            {isOpen && (
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-[#5B6675]">
                {item.a}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
