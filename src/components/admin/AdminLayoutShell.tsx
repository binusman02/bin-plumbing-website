"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  Bot,
  ClipboardList,
  DollarSign,
  History,
  Image as ImageIcon,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Users,
  Wrench,
} from "lucide-react";
import {
  PortalShell,
  type PortalNavGroup,
  type PortalNavItem,
} from "@/components/portal/PortalShell";
import { logoutAdmin } from "@/app/actions/admin-auth";
import { AdminAiCopilot } from "@/components/admin/AdminAiCopilot";
import type { AdminNotificationItem } from "@/lib/admin-notifications";
import { useRealtimeHub } from "@/lib/realtime-hub";

interface AdminLayoutShellProps {
  userEmail: string;
  unreadCount?: number;
  unreadEnquiriesCount?: number;
  unreadCommunicationsCount?: number;
  unreadWorkforceCount?: number;
  notifications?: AdminNotificationItem[];
  children: React.ReactNode;
}

const PAGE_TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: "/admin/requests", title: "Service Requests" },
  { prefix: "/admin/plumbers", title: "Plumber Management" },
  { prefix: "/admin/financials", title: "Financials & Commission" },
  { prefix: "/admin/customers", title: "Customers Directory" },
  { prefix: "/admin/enquiries", title: "Direct Enquiries" },
  { prefix: "/admin/communications", title: "Communications Audit" },
  { prefix: "/admin/guides", title: "Blog & Guides CMS" },
  { prefix: "/admin/gallery", title: "Gallery CMS" },
  { prefix: "/admin/complaints", title: "Complaints & Feedback" },
  { prefix: "/admin/audit-log", title: "Audit Log" },
  { prefix: "/admin/notifications", title: "Notifications" },
  { prefix: "/admin/settings", title: "Settings" },
  { prefix: "/admin/workforce", title: "AI Workforce" },
  { prefix: "/admin", title: "Overview" },
];

export function AdminLayoutShell({
  userEmail,
  unreadEnquiriesCount = 0,
  unreadCommunicationsCount = 0,
  unreadWorkforceCount = 0,
  children,
}: AdminLayoutShellProps) {
  const pathname = usePathname() || "/admin";
  const [liveUnreadEnquiries, setLiveUnreadEnquiries] =
    useState(unreadEnquiriesCount);
  const [liveUnreadCommunications, setLiveUnreadCommunications] = useState(
    unreadCommunicationsCount
  );
  const [liveUnreadWorkforce, setLiveUnreadWorkforce] =
    useState(unreadWorkforceCount);

  useEffect(() => {
    setLiveUnreadEnquiries(unreadEnquiriesCount);
    setLiveUnreadCommunications(unreadCommunicationsCount);
    setLiveUnreadWorkforce(pathname.startsWith("/admin/workforce") ? 0 : unreadWorkforceCount);
  }, [unreadEnquiriesCount, unreadCommunicationsCount, unreadWorkforceCount, pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/admin/workforce")) return;
    setLiveUnreadWorkforce(0);
    fetch("/api/admin/workforce/ack", { method: "POST" })
      .then(() => {
        window.dispatchEvent(new Event("notifications-refresh"));
      })
      .catch(() => {});
  }, [pathname]);

  useRealtimeHub({
    role: "admin",
    onMessage: () => {
      window.dispatchEvent(new Event("admin-signals-refresh"));
      window.dispatchEvent(new Event("notifications-refresh"));
    },
    onMessageSignal: () => {
      window.dispatchEvent(new Event("admin-signals-refresh"));
      window.dispatchEvent(new Event("notifications-refresh"));
    },
    onAdminSignal: () => {
      window.dispatchEvent(new Event("admin-signals-refresh"));
      window.dispatchEvent(new Event("notifications-refresh"));
    },
  });

  useEffect(() => {
    let active = true;

    const refreshSignals = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/admin/signals", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (typeof data.unreadEnquiriesCount === "number") {
          setLiveUnreadEnquiries(data.unreadEnquiriesCount);
        }
        if (typeof data.unreadCommunicationsCount === "number") {
          setLiveUnreadCommunications(data.unreadCommunicationsCount);
        }
        if (typeof data.unreadWorkforceCount === "number") {
          setLiveUnreadWorkforce(
            window.location.pathname.startsWith("/admin/workforce")
              ? 0
              : data.unreadWorkforceCount
          );
        }
      } catch {
        // Ignore transient network errors during background polling
      }
    };

    const interval = window.setInterval(refreshSignals, 45000);
    window.addEventListener("focus", refreshSignals);
    document.addEventListener("visibilitychange", refreshSignals);
    window.addEventListener("admin-signals-refresh", refreshSignals);

    // Admin online presence heartbeat (25s < 70s server TTL so status never flickers)
    const sendPresence = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }).catch(() => {});
    };
    sendPresence();
    const presenceInterval = window.setInterval(sendPresence, 25000);

    const handlePageHide = () => {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/chat/presence",
          new Blob([JSON.stringify({ role: "admin", action: "offline" })], {
            type: "application/json",
          })
        );
      }
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearInterval(presenceInterval);
      window.removeEventListener("focus", refreshSignals);
      document.removeEventListener("visibilitychange", refreshSignals);
      window.removeEventListener("admin-signals-refresh", refreshSignals);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  const currentTitle =
    PAGE_TITLES.find((p) =>
      p.prefix === "/admin" ? pathname === "/admin" : pathname.startsWith(p.prefix)
    )?.title || "Admin Dashboard";

  const activeId =
    pathname === "/admin"
      ? "overview"
      : pathname.startsWith("/admin/requests")
        ? "requests"
        : pathname.startsWith("/admin/plumbers")
          ? "plumbers"
          : pathname.startsWith("/admin/financials")
            ? "financials"
            : pathname.startsWith("/admin/customers")
              ? "customers"
              : pathname.startsWith("/admin/enquiries")
                ? "enquiries"
                : pathname.startsWith("/admin/communications")
                  ? "communications"
                  : pathname.startsWith("/admin/guides")
                    ? "guides"
                    : pathname.startsWith("/admin/gallery")
                    ? "gallery"
                    : pathname.startsWith("/admin/complaints")
                      ? "complaints"
                      : pathname.startsWith("/admin/notifications")
                        ? "notifications"
                        : pathname.startsWith("/admin/audit-log")
                          ? "audit-log"
                          : pathname.startsWith("/admin/settings")
                            ? "settings"
                            : pathname.startsWith("/admin/workforce")
                              ? "workforce"
                              : "overview";

  const navGroups: PortalNavGroup[] = [
    {
      label: "Operations",
      items: [
        {
          id: "overview",
          label: "Overview",
          shortLabel: "Overview",
          href: "/admin",
          icon: LayoutDashboard,
        },
        {
          id: "requests",
          label: "Service Requests",
          shortLabel: "Pipelines",
          href: "/admin/requests",
          icon: ClipboardList,
        },
        {
          id: "customers",
          label: "Customers",
          shortLabel: "Contacts",
          href: "/admin/customers",
          icon: Users,
        },
        {
          id: "plumbers",
          label: "Plumbers",
          shortLabel: "Plumbers",
          href: "/admin/plumbers",
          icon: Wrench,
        },
        {
          id: "financials",
          label: "Financials",
          shortLabel: "Finance",
          href: "/admin/financials",
          icon: DollarSign,
        },
        {
          id: "workforce",
          label: "AI Workforce",
          shortLabel: "Workforce",
          href: "/admin/workforce",
          icon: Bot,
          badge: liveUnreadWorkforce > 0 ? liveUnreadWorkforce : undefined,
        },
      ],
    },
    {
      label: "Clients & Inbox",
      items: [
        {
          id: "communications",
          label: "Communications",
          shortLabel: "Messages",
          href: "/admin/communications",
          icon: MessageSquare,
          badge: liveUnreadCommunications,
        },
        {
          id: "enquiries",
          label: "Direct Enquiries",
          shortLabel: "Enquiries",
          href: "/admin/enquiries",
          icon: Inbox,
          badge: liveUnreadEnquiries,
        },
        {
          id: "complaints",
          label: "Complaints & Feedback",
          shortLabel: "Feedback",
          href: "/admin/complaints",
          icon: AlertTriangle,
        },
      ],
    },
    {
      label: "Content & System",
      items: [
        {
          id: "guides",
          label: "Blog & Guides",
          shortLabel: "Blog",
          href: "/admin/guides",
          icon: BookOpen,
        },
        {
          id: "gallery",
          label: "Gallery CMS",
          shortLabel: "Gallery",
          href: "/admin/gallery",
          icon: ImageIcon,
        },
        {
          id: "audit-log",
          label: "Audit Log",
          shortLabel: "Audit",
          href: "/admin/audit-log",
          icon: History,
        },
        {
          id: "settings",
          label: "Settings",
          shortLabel: "Settings",
          href: "/admin/settings",
          icon: Settings,
        },
      ],
    },
  ];

  const bottomNavItems: PortalNavItem[] = [
    { id: "overview", label: "Home", shortLabel: "Home", href: "/admin", icon: LayoutDashboard },
    { id: "requests", label: "Requests", shortLabel: "Requests", href: "/admin/requests", icon: ClipboardList },
    { id: "customers", label: "Customers", shortLabel: "Contacts", href: "/admin/customers", icon: Users },
    { id: "plumbers", label: "Plumbers", shortLabel: "Plumbers", href: "/admin/plumbers", icon: Wrench },
    { id: "more", label: "More", shortLabel: "More", icon: MoreHorizontal },
  ];

  return (
    <PortalShell
      portalTitle="Admin Dashboard"
      pageTitle={currentTitle}
      navGroups={navGroups}
      activeItemId={activeId}
      bottomNavItems={bottomNavItems}
      userName={userEmail || "Admin"}
      userRoleLabel="Operations Admin"
      portalRole="admin"
      onSignOut={() => logoutAdmin()}
      storageKey="bin_admin_rail_collapsed"
    >
      {children}
      <AdminAiCopilot />
    </PortalShell>
  );
}
