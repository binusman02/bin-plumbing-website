export interface NotificationNavigationRequest {
  destination: string;
  pathname: string;
  tab: string | null;
  ticket: string | null;
  messageId: string | null;
  notificationId?: string;
  navKey: string;
}

export const NOTIFICATION_NAV_EVENT = "bin-notification-navigate";

declare global {
  interface Window {
    __binLastNotificationNav?: NotificationNavigationRequest;
  }
}

export function isLikelyMessageId(value?: string | null): boolean {
  if (!value) return false;
  const clean = value.trim();
  if (!clean) return false;
  if (/^BP-/i.test(clean)) return false;
  return true;
}

export function ensureMessageInDestination(
  destination: string,
  entityType?: string | null,
  entityId?: string | null
): string {
  const raw = (destination || "").trim();
  if (!raw) return "";

  const isMsgEntity =
    entityType === "message" && isLikelyMessageId(entityId);

  try {
    const url = new URL(raw, "http://localhost");
    const isChatDestination =
      url.pathname.startsWith("/admin/communications") ||
      (url.pathname.startsWith("/customer") && url.searchParams.get("tab") === "messages") ||
      (url.pathname.startsWith("/plumber") && url.searchParams.get("tab") === "messages");

    if (isChatDestination && isMsgEntity && !url.searchParams.get("message")) {
      url.searchParams.set("message", String(entityId).trim());
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw;
  }
}

export function parseNotificationDestination(
  destination: string,
  options?: {
    entityType?: string | null;
    entityId?: string | null;
    notificationId?: string;
    navKey?: string;
  }
): NotificationNavigationRequest {
  const normalized = ensureMessageInDestination(
    destination,
    options?.entityType,
    options?.entityId
  );
  const navKey =
    options?.navKey ||
    `nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const url = new URL(normalized || "/", "http://localhost");
    const tab = url.searchParams.get("tab");
    const ticket = url.searchParams.get("ticket");
    const messageId =
      url.searchParams.get("message") ||
      (options?.entityType === "message" && isLikelyMessageId(options?.entityId)
        ? String(options?.entityId).trim()
        : null);

    return {
      destination: normalized,
      pathname: url.pathname,
      tab: tab ? tab.trim() : null,
      ticket: ticket ? ticket.trim() : null,
      messageId: messageId ? messageId.trim() : null,
      notificationId: options?.notificationId,
      navKey,
    };
  } catch {
    return {
      destination: normalized,
      pathname: normalized.split("?")[0] || "/",
      tab: null,
      ticket: null,
      messageId:
        options?.entityType === "message" && isLikelyMessageId(options?.entityId)
          ? String(options?.entityId).trim()
          : null,
      notificationId: options?.notificationId,
      navKey,
    };
  }
}

export function dispatchNotificationNavigation(
  req: NotificationNavigationRequest
): void {
  if (typeof window === "undefined") return;
  window.__binLastNotificationNav = req;
  window.dispatchEvent(
    new CustomEvent<NotificationNavigationRequest>(NOTIFICATION_NAV_EVENT, {
      detail: req,
    })
  );
}
