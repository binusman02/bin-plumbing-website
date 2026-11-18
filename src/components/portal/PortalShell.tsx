"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Search,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationDrawer } from "@/components/ui/NotificationDrawer";
import { InstallAppButton } from "@/components/portal/InstallAppButton";
import type { NotificationNavigationRequest } from "@/lib/notification-navigation";

export interface PortalNavItem {
  id: string;
  label: string;
  shortLabel?: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  onClick?: () => void;
}

export interface PortalNavGroup {
  label: string;
  items: PortalNavItem[];
}

interface PortalShellProps {
  portalTitle: string;
  pageTitle: string;
  navGroups: PortalNavGroup[];
  activeItemId: string;
  bottomNavItems: PortalNavItem[];
  userName: string;
  userRoleLabel: string;
  userAvatarUrl?: string | null;
  portalRole?: "admin" | "customer" | "plumber";
  onNotificationNavigate?: (
    destination: string,
    navRequest: NotificationNavigationRequest
  ) => void;
  onUnreadCountChange?: (count: number) => void;
  onSignOut: () => void;
  unreadCount?: number;
  notificationHref?: string;
  onBellClick?: () => void;
  globalSearch?: string;
  onGlobalSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  storageKey?: string;
  children: React.ReactNode;
}

export function PortalShell({
  portalTitle,
  pageTitle,
  navGroups,
  activeItemId,
  bottomNavItems,
  userName,
  userRoleLabel,
  userAvatarUrl,
  portalRole,
  onNotificationNavigate,
  onUnreadCountChange,
  onSignOut,
  unreadCount = 0,
  notificationHref,
  onBellClick,
  globalSearch,
  onGlobalSearchChange,
  searchPlaceholder = "Search...",
  storageKey = "bin_portal_sidebar_collapsed",
  children,
}: PortalShellProps) {
  // Default to Bigin's sleek stacked icon-rail mode (collapsed = true) unless user explicitly expanded it
  const [collapsed, setCollapsed] = useState(true);
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [persistentUnread, setPersistentUnread] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "false") setCollapsed(false);
      else if (saved === "true") setCollapsed(true);
    } catch {}
  }, [storageKey]);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {}
  };

  const initials = (userName || "U")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");

  const overviewItem = navGroups[0]?.items[0] || bottomNavItems[0];
  const overviewHref =
    overviewItem?.href ||
    (portalRole === "admin"
      ? "/admin"
      : portalRole === "plumber"
        ? "/plumber"
        : portalRole === "customer"
          ? "/customer"
          : "/");

  const handleOverviewLogoClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setTabletDrawerOpen(false);
    setMoreSheetOpen(false);
    if (overviewItem?.onClick) {
      e.preventDefault();
      overviewItem.onClick();
    }
  };

  const renderNavItem = (item: PortalNavItem, isCompact: boolean, closeDrawer?: () => void) => {
    const Icon = item.icon;
    const isActive = activeItemId === item.id;
    const railLabel = item.shortLabel || item.label.split(/\s+/)[0];

    // Bigin-Style Stacked Icon + Short Label Tile when in compact rail mode; full row when expanded
    const baseClasses = isCompact
      ? `group relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center transition-all duration-150 ${
          isActive
            ? "bg-[#F5B301] text-[#0B1F3A] font-bold shadow-xs"
            : "text-[#C9D3E0] hover:bg-white/10 hover:text-white"
        }`
      : `group relative flex min-h-[38px] w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
          isActive
            ? "bg-[#F5B301] text-[#0B1F3A] font-bold shadow-xs"
            : "text-[#C9D3E0] hover:bg-white/10 hover:text-white"
        }`;

    const content = isCompact ? (
      <>
        <span className="relative flex items-center justify-center">
          <Icon
            className={`h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105 ${
              isActive ? "text-[#0B1F3A]" : "text-[#C9D3E0] group-hover:text-white"
            }`}
          />
          {typeof item.badge === "number" && item.badge > 0 && (
            <span
              className={`absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-extrabold shadow-xs ${
                isActive
                  ? "bg-[#0B1F3A] text-[#F5B301]"
                  : "bg-[#F5B301] text-[#0B1F3A]"
              }`}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </span>
        <span
          className={`w-full truncate px-0.5 text-[10px] leading-tight tracking-tight ${
            isActive ? "font-bold text-[#0B1F3A]" : "font-medium text-[#C9D3E0] group-hover:text-white"
          }`}
        >
          {railLabel}
        </span>
      </>
    ) : (
      <>
        <Icon
          className={`h-4 w-4 shrink-0 ${
            isActive ? "text-[#0B1F3A]" : "text-[#C9D3E0] group-hover:text-white"
          }`}
        />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {typeof item.badge === "number" && item.badge > 0 && (
          <span
            className={`ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
              isActive
                ? "bg-[#0B1F3A] text-[#F5B301]"
                : "bg-[#F5B301] text-[#0B1F3A]"
            }`}
          >
            {item.badge}
          </span>
        )}
      </>
    );

    if (item.href) {
      return (
        <Link
          key={item.id}
          href={item.href}
          onClick={closeDrawer}
          title={item.label}
          className={baseClasses}
        >
          {content}
        </Link>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          item.onClick?.();
          closeDrawer?.();
        }}
        title={item.label}
        className={baseClasses}
      >
        {content}
      </button>
    );
  };

  const sidebarWidthClass = collapsed ? "lg:w-[72px]" : "lg:w-[220px]";
  const mainOffsetClass = collapsed ? "lg:pl-[72px]" : "lg:pl-[220px]";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F4F6F9] text-[#1B2430] font-sans">
      {/* 1. BIGIN-STYLE DESKTOP & TABLET SIDEBAR RAIL (Brand Navy #0B1F3A + Gold #F5B301) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden md:flex flex-col bg-[#0B1F3A] text-white border-r border-white/10 transition-all duration-200 md:w-[72px] ${sidebarWidthClass}`}
      >
        {/* Brand Header */}
        <div className="flex h-14 shrink-0 items-center justify-center border-b border-white/10 px-2.5">
          <Link
            href={overviewHref}
            onClick={handleOverviewLogoClick}
            className={`flex items-center gap-2.5 overflow-hidden ${
              collapsed ? "justify-center w-full" : "w-full px-1"
            }`}
            title={`${portalTitle} Overview`}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F5B301] bg-white shadow-xs">
              <Image
                src="/images/logo/flowguard-icon.jpg"
                alt="FlowGuard Plumbing Enterprises"
                width={36}
                height={36}
                className="h-full w-full scale-[1.08] object-cover"
                priority
              />
            </div>
            {!collapsed && (
              <div className="hidden lg:block min-w-0">
                <p className="truncate text-xs font-bold leading-tight text-white">
                  {portalTitle}
                </p>
                <p className="truncate text-[10px] font-medium text-[#F5B301]">
                  FlowGuard Plumbing
                </p>
              </div>
            )}
          </Link>
        </div>

        {/* Bigin-Style Stacked Icon-Rail Menu (Hidden Scrollbar for Clean Native Look) */}
        <nav
          aria-label="Portal Navigation"
          className="flex-1 overflow-y-auto px-1.5 py-2.5 space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {navGroups.map((group, groupIdx) => (
            <div key={group.label} className={collapsed ? "space-y-1" : "space-y-1 pt-2 first:pt-0"}>
              {!collapsed && (
                <p className="hidden lg:block px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#F5B301]/80">
                  {group.label}
                </p>
              )}
              {collapsed && groupIdx > 0 && (
                <div className="mx-2 my-1 border-t border-white/10" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div key={item.id}>
                    <div className="hidden lg:block">
                      {renderNavItem(item, collapsed)}
                    </div>
                    <div className="lg:hidden">
                      {renderNavItem(item, true)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bigin-Style Slim Bottom Footer (User Avatar + Expand/Collapse "»" Toggle) */}
        <div className="shrink-0 border-t border-white/10 bg-[#07152B]/80 p-1.5 space-y-1">
          {!collapsed && (
            <div className="hidden lg:flex items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5B301] text-[10px] font-bold text-[#0B1F3A]">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{userName}</p>
                <p className="truncate text-[10px] text-[#C9D3E0]">{userRoleLabel}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                className="rounded p-1 text-[#C9D3E0] hover:bg-white/10 hover:text-[#F5B301]"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-1">
            {collapsed && (
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                className="flex h-8 flex-1 items-center justify-center rounded-lg text-[#C9D3E0] transition-colors hover:bg-white/10 hover:text-[#F5B301]"
              >
                <LogOut className="h-4 w-4 shrink-0" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) {
                  setTabletDrawerOpen(true);
                } else {
                  toggleCollapse();
                }
              }}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[#C9D3E0] transition-colors hover:bg-white/10 hover:text-white"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronsRight className="h-4 w-4 shrink-0 text-[#F5B301]" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4 shrink-0 text-[#F5B301] hidden lg:block" />
                  <Menu className="h-4 w-4 shrink-0 lg:hidden" />
                  <span className="hidden lg:inline text-[11px]">Collapse</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>

      {/* Tablet Overlay Drawer (768–1023px) */}
      {tabletDrawerOpen && (
        <div className="fixed inset-0 z-50 hidden md:flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#07152B]/70"
            onClick={() => setTabletDrawerOpen(false)}
          />
          <aside className="relative z-10 flex w-[260px] flex-col bg-[#0B1F3A] text-white shadow-2xl">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <Link
                href={overviewHref}
                onClick={handleOverviewLogoClick}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F5B301] bg-white">
                  <Image
                    src="/images/logo/flowguard-icon.jpg"
                    alt="FlowGuard Plumbing"
                    width={32}
                    height={32}
                    className="h-full w-full scale-[1.08] object-cover"
                  />
                </div>
                <span className="text-sm font-bold text-white">{portalTitle}</span>
              </Link>
              <button
                type="button"
                onClick={() => setTabletDrawerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-[8px] text-[#C9D3E0] hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
              {navGroups.map((group) => (
                <div key={group.label} className="space-y-1">
                  <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-[#C9D3E0]/70">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {group.items.map((item) =>
                      renderNavItem(item, false, () => setTabletDrawerOpen(false))
                    )}
                  </div>
                </div>
              ))}
            </nav>
            <div className="border-t border-white/10 p-3">
              <button
                type="button"
                onClick={onSignOut}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[8px] px-3 text-sm font-medium text-[#C9D3E0] hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4 text-[#F5B301]" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* 2. MAIN CONTENT COLUMN */}
      <div className={`flex min-h-screen flex-col md:pl-[72px] ${mainOffsetClass} transition-all duration-200`}>
        {/* Bigin-Inspired Dark Navy Top Bar (#0B1F3A + #F5B301 Brand Colors) */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-white/10 bg-[#0B1F3A] px-4 text-white shadow-xs md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href={overviewHref}
              onClick={handleOverviewLogoClick}
              aria-label={`${portalTitle} Overview`}
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F5B301] bg-white md:hidden"
            >
              <Image
                src="/images/logo/flowguard-icon.jpg"
                alt="FlowGuard Plumbing Enterprises"
                width={32}
                height={32}
                className="h-full w-full scale-[1.08] object-cover"
              />
            </Link>
            <h1 className="truncate font-heading text-base font-bold text-white md:text-lg">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5">
            {/* Global Search (desktop & tablet) */}
            {onGlobalSearchChange && (
              <div className="relative hidden md:block w-56 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#C9D3E0]" />
                <input
                  type="search"
                  value={globalSearch || ""}
                  onChange={(e) => onGlobalSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-lg border border-white/15 bg-white/10 pl-9 pr-3 text-xs text-white placeholder:text-[#C9D3E0]/80 focus:border-[#F5B301] focus:bg-white/15 focus:outline-none"
                />
              </div>
            )}

            {/* Notification Bell */}
            {notificationHref ? (
              <Link
                href={notificationHref}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A] shadow-sm">
                    <span className="relative">{unreadCount}</span>
                  </span>
                )}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (portalRole) {
                    setNotifOpen(true);
                  } else {
                    onBellClick?.();
                  }
                }}
                aria-label="Notifications"
                className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                <Bell className="h-4 w-4" />
                {(portalRole ? persistentUnread : unreadCount) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A] shadow-sm">
                    <span className="relative">
                      {(portalRole ? persistentUnread : unreadCount) > 9
                        ? "9+"
                        : portalRole
                          ? persistentUnread
                          : unreadCount}
                    </span>
                  </span>
                )}
              </button>
            )}

            {portalRole && (
              <NotificationDrawer
                open={notifOpen}
                role={portalRole}
                onClose={() => setNotifOpen(false)}
                onUnreadCountChange={(c) => {
                  setPersistentUnread(c);
                  onUnreadCountChange?.(c);
                }}
                onNavigate={onNotificationNavigate}
              />
            )}

            <InstallAppButton />

            {/* User Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-2.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
              >
                <Avatar name={userName} src={userAvatarUrl} size="xs" />
                <span className="hidden sm:inline max-w-[140px] truncate">{userName}</span>
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-[12px] border border-[#E3E8EF] bg-white p-2 shadow-lg">
                    <div className="border-b border-[#E3E8EF] px-3 py-2">
                      <p className="truncate text-sm font-semibold text-[#0B1F3A]">{userName}</p>
                      <p className="truncate text-xs text-[#5B6675]">{userRoleLabel}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                      className="mt-1 flex min-h-[44px] w-full items-center gap-2 rounded-[8px] px-3 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="mx-auto w-full max-w-[1640px] flex-1 px-3.5 py-3.5 pb-24 sm:px-5 md:p-5 md:pb-8 lg:px-6 lg:py-5">
          <PwaInstallPrompt />
          {children}
        </main>
      </div>

      {/* 3. PHONE BOTTOM NAVIGATION BAR (< 768px) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E3E8EF] bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgba(11,31,58,0.08)] backdrop-blur-md md:hidden"
      >
        <div className="grid h-16 grid-cols-5 items-center px-1">
          {bottomNavItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isMore = item.id === "more";
            const isActive = isMore ? moreSheetOpen : activeItemId === item.id;

            const inner = (
              <span
                className={`flex w-full flex-col items-center justify-center rounded-xl py-1 transition active:opacity-80 ${
                  isActive ? "bg-[#0B1F3A]/[0.06]" : ""
                }`}
              >
                <span className="relative">
                  <Icon
                    className={`h-5 w-5 ${
                      isActive ? "text-[#0B1F3A]" : "text-[#5B6675]"
                    }`}
                  />
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A] shadow-xs">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-0.5 max-w-full truncate px-1 text-[11px] font-semibold ${
                    isActive ? "text-[#0B1F3A]" : "text-[#5B6675]"
                  }`}
                >
                  {item.shortLabel || item.label}
                </span>
                {isActive && (
                  <span className="mt-0.5 h-0.5 w-5 rounded-full bg-[#F5B301]" />
                )}
              </span>
            );

            if (isMore) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMoreSheetOpen(true)}
                  className="flex h-full flex-col items-center justify-center px-1"
                >
                  {inner}
                </button>
              );
            }

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => setMoreSheetOpen(false)}
                  className="flex h-full flex-col items-center justify-center px-1"
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMoreSheetOpen(false);
                  item.onClick?.();
                }}
                className="flex h-full flex-col items-center justify-center px-1"
              >
                {inner}
              </button>
            );
          })}
        </div>
      </nav>

      {/* 4. FULL-SCREEN "MORE" SHEET ON PHONE */}
      {moreSheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0B1F3A] text-white md:hidden">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
            <Link
              href={overviewHref}
              onClick={handleOverviewLogoClick}
              className="flex items-center gap-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#F5B301] bg-white">
                <Image
                  src="/images/logo/flowguard-icon.jpg"
                  alt="FlowGuard Plumbing"
                  width={32}
                  height={32}
                  className="h-full w-full scale-[1.08] object-cover"
                />
              </div>
              <span className="font-heading text-base font-bold text-white">
                {portalTitle}
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMoreSheetOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white/10 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
            {navGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <p className="px-2 text-xs font-semibold uppercase tracking-wider text-[#F5B301]">
                  {group.label}
                </p>
                <div className="divide-y divide-white/10 rounded-[12px] border border-white/10 bg-[#07152B]/60">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const rowClass =
                      "flex min-h-[52px] w-full items-center justify-between px-4 text-base font-medium text-white";
                    if (item.href) {
                      return (
                        <Link
                          key={item.id}
                          href={item.href}
                          onClick={() => setMoreSheetOpen(false)}
                          className={rowClass}
                        >
                          <span className="flex items-center gap-3">
                            <Icon className="h-5 w-5 text-[#F5B301]" />
                            <span>{item.label}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 text-[#C9D3E0]" />
                        </Link>
                      );
                    }
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setMoreSheetOpen(false);
                          item.onClick?.();
                        }}
                        className={rowClass}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-[#F5B301]" />
                          <span>{item.label}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 text-[#C9D3E0]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => {
                setMoreSheetOpen(false);
                onSignOut();
              }}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-[8px] bg-[#F5B301] text-base font-bold text-[#0B1F3A]"
            >
              <LogOut className="h-5 w-5" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
