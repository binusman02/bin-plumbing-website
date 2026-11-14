"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Bell,
  Search,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Avatar } from "@/components/ui/Avatar";
import { NotificationDrawer } from "@/components/ui/NotificationDrawer";

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
  onNotificationNavigate?: (destination: string) => void;
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
  const [collapsed, setCollapsed] = useState(false);
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [persistentUnread, setPersistentUnread] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "true") setCollapsed(true);
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

  const renderNavItem = (item: PortalNavItem, isCompact: boolean, closeDrawer?: () => void) => {
    const Icon = item.icon;
    const isActive = activeItemId === item.id;
    const baseClasses = `group relative flex min-h-[44px] w-full items-center gap-3 rounded-[8px] px-3 py-2 text-sm font-medium transition-colors duration-150 ${
      isActive
        ? "bg-white/10 text-white font-semibold"
        : "text-[#C9D3E0] hover:bg-white/5 hover:text-white"
    } ${isCompact ? "justify-center px-2" : ""}`;

    const content = (
      <>
        {isActive && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-[#F5B301]"
            aria-hidden="true"
          />
        )}
        <Icon
          className={`h-5 w-5 shrink-0 ${
            isActive ? "text-[#F5B301]" : "text-[#C9D3E0] group-hover:text-white"
          }`}
        />
        {!isCompact && <span className="flex-1 truncate text-left">{item.label}</span>}
        {!isCompact && typeof item.badge === "number" && item.badge > 0 && (
          <span className="ml-auto inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#F5B301] px-1.5 py-0.5 text-xs font-bold text-[#0B1F3A]">
            {item.badge}
          </span>
        )}
        {isCompact && typeof item.badge === "number" && item.badge > 0 && (
          <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A]">
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
          title={isCompact ? item.label : undefined}
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
        title={isCompact ? item.label : undefined}
        className={baseClasses}
      >
        {content}
      </button>
    );
  };

  const sidebarWidthClass = collapsed ? "lg:w-[76px]" : "lg:w-[260px]";
  const mainOffsetClass = collapsed ? "lg:pl-[76px]" : "lg:pl-[260px]";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F4F6F9] text-[#1B2430] font-sans">
      {/* 1. DESKTOP & TABLET SIDEBAR (hidden on phone < 768px) */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden md:flex flex-col bg-[#0B1F3A] text-white border-r border-white/10 transition-all duration-200 md:w-[76px] ${sidebarWidthClass}`}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <Link
            href="/"
            className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "lg:justify-center lg:w-full" : ""}`}
            title={portalTitle}
          >
            <Image
              src="/images/logo/bin-plumbing-logo.jpg"
              alt="Bin Plumbing Services Ltd"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full border border-white/20 object-cover"
            />
            {!collapsed && (
              <div className="hidden lg:block min-w-0">
                <p className="truncate text-sm font-bold leading-tight text-white">
                  {portalTitle}
                </p>
                <p className="truncate text-xs text-[#C9D3E0]">Bin Plumbing Ltd</p>
              </div>
            )}
          </Link>
        </div>

        {/* Scrollable Grouped Menu */}
        <nav
          aria-label="Portal Navigation"
          className="flex-1 overflow-y-auto px-3 py-4 space-y-5"
        >
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              {!collapsed && (
                <p className="hidden lg:block px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-[#C9D3E0]/70">
                  {group.label}
                </p>
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

        {/* Bottom User Box & Collapse Toggle (always visible, never overlaps menu) */}
        <div className="shrink-0 border-t border-white/10 p-3 space-y-2 bg-[#07152B]/60">
          <button
            type="button"
            onClick={() => {
              // On tablet, open overlay drawer; on desktop, toggle collapse
              if (window.innerWidth < 1024) {
                setTabletDrawerOpen(true);
              } else {
                toggleCollapse();
              }
            }}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[8px] px-2 text-xs font-medium text-[#C9D3E0] transition-colors hover:bg-white/10 hover:text-white"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0 hidden lg:block" />
                <Menu className="h-4 w-4 shrink-0 lg:hidden" />
                <span className="hidden lg:inline">Collapse menu</span>
              </>
            )}
          </button>

          <div
            className={`flex items-center gap-2.5 rounded-[8px] bg-white/5 p-2 ${
              collapsed ? "lg:justify-center" : "md:justify-center lg:justify-start"
            }`}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5B301] text-xs font-bold text-[#0B1F3A]">
              {initials}
            </div>
            {!collapsed && (
              <div className="hidden lg:block min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{userName}</p>
                <p className="truncate text-xs text-[#C9D3E0]">{userRoleLabel}</p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-[8px] px-3 text-sm font-medium text-[#C9D3E0] transition-colors hover:bg-white/10 hover:text-white ${
              collapsed ? "lg:justify-center lg:px-2" : "md:justify-center lg:justify-start"
            }`}
            title="Sign out"
          >
            <LogOut className="h-4 w-4 shrink-0 text-[#F5B301]" />
            {!collapsed && <span className="hidden lg:inline">Sign out</span>}
          </button>
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
              <div className="flex items-center gap-2.5">
                <Image
                  src="/images/logo/bin-plumbing-logo.jpg"
                  alt="Bin Plumbing"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
                <span className="text-sm font-bold text-white">{portalTitle}</span>
              </div>
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
      <div className={`flex min-h-screen flex-col md:pl-[76px] ${mainOffsetClass} transition-all duration-200`}>
        {/* Slim White Top Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-[#E3E8EF] bg-white px-4 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate font-heading text-lg font-bold text-[#0B1F3A] md:text-xl">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Search (desktop & tablet) */}
            {onGlobalSearchChange && (
              <div className="relative hidden md:block w-56 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5B6675]" />
                <input
                  type="search"
                  value={globalSearch || ""}
                  onChange={(e) => onGlobalSearchChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="h-10 w-full rounded-[10px] border border-[#E3E8EF] bg-[#F4F6F9] pl-9 pr-3 text-sm text-[#1B2430] placeholder:text-[#5B6675] focus:border-[#F5B301] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
                />
              </div>
            )}

            {/* Notification Bell */}
            {notificationHref ? (
              <Link
                href={notificationHref}
                aria-label="Notifications"
                className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E3E8EF] bg-white text-[#0B1F3A] transition-colors hover:bg-[#F4F6F9]"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-xs font-bold text-[#0B1F3A] shadow-sm">
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
                className="relative flex h-11 w-11 items-center justify-center rounded-[10px] border border-[#E3E8EF] bg-white text-[#0B1F3A] transition-colors hover:bg-[#F4F6F9]"
              >
                <Bell className="h-5 w-5" />
                {(portalRole ? persistentUnread : unreadCount) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-xs font-bold text-[#0B1F3A] shadow-sm">
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

            {/* User Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex h-11 items-center gap-2 rounded-[10px] border border-[#E3E8EF] bg-white px-2.5 text-sm font-semibold text-[#0B1F3A] transition-colors hover:bg-[#F4F6F9]"
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
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-5 pb-24 md:p-6 md:pb-8 lg:p-8">
          <PwaInstallPrompt />
          {children}
        </main>
      </div>

      {/* 3. PHONE BOTTOM NAVIGATION BAR (< 768px) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E3E8EF] bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-16 grid-cols-5 items-center">
          {bottomNavItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isMore = item.id === "more";
            const isActive = isMore ? moreSheetOpen : activeItemId === item.id;

            const inner = (
              <>
                <span className="relative">
                  <Icon
                    className={`h-5 w-5 ${
                      isActive ? "text-[#0B1F3A]" : "text-[#5B6675]"
                    }`}
                  />
                  {typeof item.badge === "number" && item.badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F5B301] px-1 text-[10px] font-bold text-[#0B1F3A]">
                      {item.badge}
                    </span>
                  )}
                </span>
                <span
                  className={`mt-1 truncate text-xs font-semibold ${
                    isActive ? "text-[#0B1F3A]" : "text-[#5B6675]"
                  }`}
                >
                  {item.shortLabel || item.label}
                </span>
                {isActive && (
                  <span className="mt-0.5 h-0.5 w-5 rounded-full bg-[#F5B301]" />
                )}
              </>
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
            <div className="flex items-center gap-2.5">
              <Image
                src="/images/logo/bin-plumbing-logo.jpg"
                alt="Bin Plumbing"
                width={32}
                height={32}
                className="h-8 w-8 rounded-full object-cover"
              />
              <span className="font-heading text-base font-bold text-white">
                {portalTitle}
              </span>
            </div>
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
