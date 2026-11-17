"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import CurrentYear from "@/components/ui/CurrentYear";

export const AUTH_LABEL_CLASS =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wider text-[#C9D3E0]";

export const AUTH_INPUT_CLASS =
  "h-12 w-full rounded-[10px] border border-white/15 bg-[#07152B] px-4 text-sm text-white placeholder:text-[#C9D3E0]/50 transition-colors focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30";

export const AUTH_INPUT_WITH_ICON_CLASS =
  "h-12 w-full rounded-[10px] border border-white/15 bg-[#07152B] pl-11 pr-4 text-sm text-white placeholder:text-[#C9D3E0]/50 transition-colors focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30";

export const AUTH_PRIMARY_BTN_CLASS =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#F5B301] px-6 text-sm font-bold text-[#0B1F3A] transition-colors hover:bg-[#E0A200] disabled:cursor-not-allowed disabled:opacity-60";

export const AUTH_FIELD_ERROR_CLASS = "mt-1.5 text-xs font-medium text-red-400";

interface AuthAlertProps {
  type: "error" | "success";
  message: string;
}

export function AuthAlert({ type, message }: AuthAlertProps) {
  if (type === "error") {
    return (
      <div
        role="alert"
        className="flex items-start gap-2.5 rounded-[10px] border border-red-500/40 bg-red-950/60 p-3.5 text-sm text-red-200"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-[10px] border border-emerald-500/40 bg-emerald-950/60 p-3.5 text-sm text-emerald-200"
    >
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <span>{message}</span>
    </div>
  );
}

interface AuthLayoutProps {
  roleLabel: "CUSTOMER PORTAL" | "TECHNICIAN PORTAL" | "ADMINISTRATOR PORTAL";
  title: string;
  subtitle: string;
  children: React.ReactNode;
  bottomLinks?: React.ReactNode;
}

export function AuthLayout({
  roleLabel,
  title,
  subtitle,
  children,
  bottomLinks,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#07152B] px-4 py-6 text-white flex flex-col justify-between">
      {/* Top Left Navigation */}
      <div className="mx-auto w-full max-w-[1200px]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#C9D3E0] transition-colors hover:text-[#F5B301]"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to main website</span>
        </Link>
      </div>

      {/* Centered Auth Card */}
      <main className="my-8 flex w-full items-center justify-center">
        <div className="w-full max-w-[440px] rounded-[12px] border border-white/15 bg-[#0B1F3A] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.35)] sm:p-8">
          {/* Shared Brand Header */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center justify-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F5B301]/80 bg-white">
                <Image
                  src="/images/logo/flowguard-icon.jpg"
                  alt="FlowGuard Plumbing Enterprises logo"
                  width={36}
                  height={36}
                  className="h-full w-full scale-[1.08] object-cover"
                  priority
                />
              </div>
              <span className="text-xs font-bold tracking-wide text-white sm:text-sm">
                FlowGuard Plumbing Enterprises
              </span>
            </Link>

            <p className="mt-5 text-xs font-bold uppercase tracking-widest text-[#F5B301]">
              {roleLabel}
            </p>
            <h1 className="mt-1.5 font-heading text-2xl font-bold tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#C9D3E0]">
              {subtitle}
            </p>
          </div>

          <div className="mt-6">{children}</div>

          {bottomLinks && (
            <div className="mt-6 border-t border-white/10 pt-5 text-center text-xs text-[#C9D3E0]">
              {bottomLinks}
            </div>
          )}
        </div>
      </main>

      {/* Shared Footer */}
      <footer className="mx-auto w-full max-w-[1200px] shrink-0 pt-2 pb-2 text-center text-xs text-[#C9D3E0]/80">
        © <CurrentYear fallback={2026} /> FlowGuard Plumbing Enterprises. All rights reserved.
      </footer>
    </div>
  );
}
