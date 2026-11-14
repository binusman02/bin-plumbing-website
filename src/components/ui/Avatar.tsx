"use client";

import { useState } from "react";

interface AvatarProps {
  name?: string | null;
  src?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  online?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
};

export function Avatar({ name, src, size = "md", online, className = "" }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const initials = (name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("") || "U";

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name || "Profile photo"}
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-full border border-slate-200 object-cover bg-slate-100`}
        />
      ) : (
        <div
          className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-full border border-slate-200 bg-[#0B1F3A] font-bold text-white`}
          aria-label={name || "User"}
        >
          {initials}
        </div>
      )}
      {typeof online === "boolean" && (
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
            online ? "bg-emerald-500" : "bg-slate-300"
          }`}
          title={online ? "Online" : "Offline"}
        />
      )}
    </div>
  );
}
