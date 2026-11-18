"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

interface WhatsAppFloatingButtonProps {
  whatsapp?: string;
}

export default function WhatsAppFloatingButton({ whatsapp }: WhatsAppFloatingButtonProps) {
  const pathname = usePathname();

  // Do not show on internal portals
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/plumber") || pathname?.startsWith("/customer")) {
    return null;
  }

  const cleanNumber = (whatsapp || "").replace(/\D/g, "");
  const className =
    "w-12 h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg hover:shadow-xl transition-colors duration-200 active:opacity-90";

  return (
    <aside aria-label="WhatsApp support" className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40">
      {cleanNumber ? (
        <a
          href={`https://wa.me/${cleanNumber}?text=Hello%20FlowGuard%20Plumbing,%20I%20would%20like%20to%20make%20an%20enquiry.`}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          aria-label="Chat on WhatsApp"
          title="Chat on WhatsApp"
        >
          <MessageCircle className="w-6 h-6" />
        </a>
      ) : (
        <Link
          href="/contact"
          className={className}
          aria-label="Contact Support"
          title="Contact Support"
        >
          <MessageCircle className="w-6 h-6" />
        </Link>
      )}
    </aside>
  );
}
