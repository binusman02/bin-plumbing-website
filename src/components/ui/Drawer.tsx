"use client";

import type { ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerBadge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  maxWidthClass?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  headerBadge,
  footer,
  children,
  maxWidthClass = "md:max-w-2xl",
}: DrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-[1px]">
      <div className={`flex h-full w-full flex-col bg-white shadow-2xl md:w-[72%] ${maxWidthClass}`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              {(subtitle || headerBadge) && (
                <div className="flex flex-wrap items-center gap-2">
                  {subtitle && (
                    <span className="font-mono text-xs font-bold text-[#0B1F3A]">{subtitle}</span>
                  )}
                  {headerBadge}
                </div>
              )}
              <h3 className="truncate text-base font-bold text-[#0B1F3A] sm:text-lg">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 md:flex"
            aria-label="Close drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>

        {footer && <div className="border-t border-slate-200 bg-white p-4">{footer}</div>}
      </div>
    </div>
  );
}
