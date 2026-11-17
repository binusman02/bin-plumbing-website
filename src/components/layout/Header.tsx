"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight, ChevronDown, User, Wrench } from "lucide-react";
import { COMPANY } from "@/data/company";

interface HeaderProps {
  companyName?: string;
}

export default function Header({ companyName }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginMenuOpen, setLoginMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const loginRef = useRef<HTMLDivElement>(null);

  const rawBrandName = (companyName || COMPANY.shortName)
    .replace(/\s+Enterprises?\b/i, "")
    .trim();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (loginRef.current && !loginRef.current.contains(e.target as Node)) {
        setLoginMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const closeAll = () => {
    setMobileMenuOpen(false);
    setLoginMenuOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full bg-white border-b border-[#E3E8EF] transition-shadow duration-200 ${
        scrolled ? "shadow-md" : "shadow-none"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        {/* Left: Full FlowGuard Plumbing Logo */}
        <Link
          href="/"
          onClick={closeAll}
          aria-label={rawBrandName || COMPANY.shortName}
          className="inline-flex items-center shrink-0 overflow-hidden transition-opacity hover:opacity-90"
        >
          <Image
            src="/images/logo/flowguard-logo.jpg"
            alt={rawBrandName || COMPANY.shortName}
            width={240}
            height={72}
            className="h-14 w-auto scale-[1.08] object-contain sm:h-16"
            priority
          />
        </Link>

        {/* Middle: Desktop Navigation Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-semibold"
        >
          {COMPANY.navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`py-1.5 whitespace-nowrap transition-colors relative ${
                  isActive
                    ? "text-[#0B1F3A] font-bold"
                    : "text-[#5B6675] hover:text-[#0B1F3A]"
                }`}
              >
                {item.name}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#F5B301] rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right: Login Dropdown + Primary CTA */}
        <div className="hidden lg:flex items-center gap-3 shrink-0">
          <div className="relative" ref={loginRef}>
            <button
              type="button"
              onClick={() => setLoginMenuOpen((prev) => !prev)}
              aria-expanded={loginMenuOpen}
              className="inline-flex items-center gap-1.5 h-11 px-4 rounded-lg border border-[#E3E8EF] bg-white hover:bg-[#F4F6F9] text-[#0B1F3A] text-sm font-semibold transition-colors"
            >
              <span>Login</span>
              <ChevronDown
                className={`w-4 h-4 text-[#5B6675] transition-transform duration-150 ${
                  loginMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {loginMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl border border-[#E3E8EF] shadow-lg py-1.5 z-50">
                <Link
                  href="/customer"
                  onClick={closeAll}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#1B2430] hover:bg-[#F4F6F9] hover:text-[#0B1F3A] transition-colors"
                >
                  <User className="w-4 h-4 text-[#F5B301]" />
                  <span>Customer Portal</span>
                </Link>
                <Link
                  href="/plumber"
                  onClick={closeAll}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-[#1B2430] hover:bg-[#F4F6F9] hover:text-[#0B1F3A] transition-colors"
                >
                  <Wrench className="w-4 h-4 text-[#0B1F3A]" />
                  <span>Plumber Portal</span>
                </Link>
              </div>
            )}
          </div>

          <Link
            href="/request"
            className="inline-flex items-center gap-2 bg-[#F5B301] hover:bg-[#E0A200] text-[#0B1F3A] font-bold h-11 px-5 text-sm rounded-lg transition-all duration-200 hover:-translate-y-0.5 whitespace-nowrap"
          >
            <span>REQUEST A PLUMBER</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Mobile Menu Toggle */}
        <div className="flex lg:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 text-[#0B1F3A] hover:bg-[#F4F6F9] rounded-lg transition-colors"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Clean Full-Screen Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col lg:hidden">
          <div className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-[#E3E8EF]">
            <Image
              src="/images/logo/flowguard-logo.jpg"
              alt={rawBrandName || COMPANY.shortName}
              width={210}
              height={64}
              className="h-12 w-auto scale-[1.08] object-contain"
            />
            <button
              type="button"
              onClick={closeAll}
              className="p-2 text-[#0B1F3A] hover:bg-[#F4F6F9] rounded-lg transition-colors"
              aria-label="Close Navigation Menu"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col justify-between gap-8">
            <nav aria-label="Mobile Navigation" className="flex flex-col space-y-2">
              {COMPANY.navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeAll}
                    className={`py-3.5 px-4 rounded-xl text-base font-semibold flex items-center justify-between transition-colors ${
                      isActive
                        ? "bg-[#F4F6F9] text-[#0B1F3A] font-bold border-l-4 border-[#F5B301]"
                        : "text-[#1B2430] hover:bg-[#F4F6F9]"
                    }`}
                  >
                    <span>{item.name}</span>
                    <ArrowRight className="w-4 h-4 text-[#5B6675]" />
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-4 pt-6 border-t border-[#E3E8EF]">
              <Link
                href="/request"
                onClick={closeAll}
                className="w-full h-12 bg-[#F5B301] hover:bg-[#E0A200] text-[#0B1F3A] font-bold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <span>REQUEST A PLUMBER</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/customer"
                  onClick={closeAll}
                  className="h-12 border border-[#E3E8EF] bg-[#F4F6F9] text-[#0B1F3A] font-semibold text-sm rounded-lg flex items-center justify-center gap-2"
                >
                  <User className="w-4 h-4 text-[#F5B301]" />
                  <span>Customer Login</span>
                </Link>
                <Link
                  href="/plumber"
                  onClick={closeAll}
                  className="h-12 border border-[#E3E8EF] bg-[#F4F6F9] text-[#0B1F3A] font-semibold text-sm rounded-lg flex items-center justify-center gap-2"
                >
                  <Wrench className="w-4 h-4 text-[#0B1F3A]" />
                  <span>Plumber Login</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
