import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
}

const PAD_MAP = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className = "", padding = "md" }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-xs ${PAD_MAP[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  tone?: "navy" | "gold" | "emerald" | "amber" | "slate";
}

const ICON_TONES = {
  navy: "bg-[#0B1F3A]/10 text-[#0B1F3A]",
  gold: "bg-[#F5B301]/20 text-[#07152B]",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  slate: "bg-[#F4F6F9] text-slate-700",
};

export function StatCard({ label, value, hint, icon, tone = "navy" }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 truncate font-heading text-2xl font-bold text-[#0B1F3A]">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONES[tone]}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
