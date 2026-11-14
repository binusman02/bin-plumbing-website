"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bell,
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
import type { AdminNotificationItem } from "@/lib/admin-notifications";
import { useRealtimeHub } from "@/lib/realtime-hub";

interface AdminLayoutShellProps {
  userEmail: string;
  unreadCount?: number;
  unreadEnquiriesCount?: number;
  unreadCommunicationsCount?: number;
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
  { prefix: "/admin/gallery", title: "Gallery CMS" },
  { prefix: "/admin/complaints", title: "Complaints & Feedback" },
  { prefix: "/admin/audit-log", title: "Audit Log" },
  { prefix: "/admin/notifications", title: "Notifications" },
  { prefix: "/admin/settings", title: "Settings" },
  { prefix: "/admin", title: "Overview" },
];

export function AdminLayoutShell({
  userEmail,
  unreadEnquiriesCount = 0,
  unreadCommunicationsCount = 0,
  children,
}: AdminLayoutShellProps) {
  const pathname = usePathname() || "/admin";
  const [persistentNotifCount, setPersistentNotifCount] = useState(0);
  const [liveUnreadEnquiries, setLiveUnreadEnquiries] =
    useState(unreadEnquiriesCount);
  const [liveUnreadCommunications, setLiveUnreadCommunications] = useState(
    unreadCommunicationsCount
  );

  useEffect(() => {
    setLiveUnreadEnquiries(unreadEnquiriesCount);
    setLiveUnreadCommunications(unreadCommunicationsCount);
  }, [unreadEnquiriesCount, unreadCommunicationsCount]);

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
      } catch {
        // Ignore transient network errors during background polling
      }
    };

    const interval = window.setInterval(refreshSignals, 30000);
    window.addEventListener("focus", refreshSignals);
    document.addEventListener("visibilitychange", refreshSignals);
    window.addEventListener("admin-signals-refresh", refreshSignals);

    // Admin online presence heartbeat
    const sendPresence = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      }).catch(() => {});
    };
    sendPresence();
    const presenceInterval = window.setInterval(sendPresence, 20000);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearInterval(presenceInterval);
      window.removeEventListener("focus", refreshSignals);
      document.removeEventListener("visibilitychange", refreshSignals);
      window.removeEventListener("admin-signals-refresh", refreshSignals);
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
                            : "overview";

  const navGroups: PortalNavGroup[] = [
    {
      label: "Operations",
      items: [
        { id: "overview", label: "Overview", href: "/admin", icon: LayoutDashboard },
        { id: "requests", label: "Service Requests", href: "/admin/requests", icon: ClipboardList },
        { id: "plumbers", label: "Plumbers", href: "/admin/plumbers", icon: Wrench },
        { id: "financials", label: "Financials", href: "/admin/financials", icon: DollarSign },
      ],
    },
    {
      label: "Clients & Inbox",
      items: [
        { id: "customers", label: "Customers", href: "/admin/customers", icon: Users },
        {
          id: "enquiries",
          label: "Direct Enquiries",
          href: "/admin/enquiries",
          icon: Inbox,
          badge: liveUnreadEnquiries,
        },
        {
          id: "communications",
          label: "Communications",
          href: "/admin/communications",
          icon: MessageSquare,
          badge: liveUnreadCommunications,
        },
        { id: "complaints", label: "Complaints & Feedback", href: "/admin/complaints", icon: AlertTriangle },
        {
          id: "notifications",
          label: "Notifications",
          href: "/admin/notifications",
          icon: Bell,
          badge: persistentNotifCount || undefined,
        },
      ],
    },
    {
      label: "Content & System",
      items: [
        { id: "gallery", label: "Gallery CMS", href: "/admin/gallery", icon: ImageIcon },
        { id: "audit-log", label: "Audit Log", href: "/admin/audit-log", icon: History },
        { id: "settings", label: "Settings", href: "/admin/settings", icon: Settings },
      ],
    },
  ];

  const bottomNavItems: PortalNavItem[] = [
    { id: "overview", label: "Home", shortLabel: "Home", href: "/admin", icon: LayoutDashboard },
    { id: "requests", label: "Requests", shortLabel: "Requests", href: "/admin/requests", icon: ClipboardList },
    { id: "plumbers", label: "Plumbers", shortLabel: "Plumbers", href: "/admin/plumbers", icon: Wrench },
    { id: "financials", label: "Money", shortLabel: "Money", href: "/admin/financials", icon: DollarSign },
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
      onUnreadCountChange={setPersistentNotifCount}
      onSignOut={() => logoutAdmin()}
      storageKey="bin_admin_sidebar_collapsed"
    >
      {children}
    </PortalShell>
  );
}
