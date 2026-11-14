"use client";

import Link from "next/link";
import { MessageCircle, Phone, Wrench } from "lucide-react";

interface MobileStickyBarProps {
  phone?: string;
  whatsapp?: string;
}

export function MobileStickyBar({ phone, whatsapp }: MobileStickyBarProps) {
  const cleanPhone = (phone || "").replace(/[^0-9+]/g, "");
  const cleanWa = (whatsapp || "").replace(/[^0-9]/g, "");

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-md pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-2">
        {cleanPhone && (
          <a
            href={`tel:${cleanPhone}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-[#0B1F3A]"
          >
            <Phone className="h-4 w-4" />
            <span>Call</span>
          </a>
        )}
        {cleanWa && (
          <a
            href={`https://wa.me/${cleanWa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            <span>WhatsApp</span>
          </a>
        )}
        <Link
          href="/request"
          className="inline-flex h-11 flex-[1.4] items-center justify-center gap-1.5 rounded-xl bg-[#F5B301] px-3 text-xs font-bold text-[#07152B]"
        >
          <Wrench className="h-4 w-4" />
          <span>Request a Plumber</span>
        </Link>
      </div>
    </div>
  );
}
