"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  Bell,
  Check,
  CheckCheck,
  CheckSquare,
  CreditCard,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { formatDateTime } from "@/lib/currency";
import {
  dispatchNotificationNavigation,
  type NotificationNavigationRequest,
  parseNotificationDestination,
} from "@/lib/notification-navigation";
import type { NotificationMutationAction, NotificationRecord } from "@/lib/notifications";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";

interface NotificationDrawerProps {
  open?: boolean;
  role: "admin" | "customer" | "plumber";
  variant?: "drawer" | "inline";
  onClose?: () => void;
  onUnreadCountChange?: (count: number) => void;
  onNavigate?: (destination: string, navRequest: NotificationNavigationRequest) => void;
}

type TabFilter = "all" | "unread" | "archived";

const inFlightNotifications = new Map<string, Promise<unknown>>();

export function NotificationDrawer({
  open = false,
  role,
  variant = "drawer",
  onClose,
  onUnreadCountChange,
  onNavigate,
}: NotificationDrawerProps) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [dbUnreadCount, setDbUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const loadNotifications = useCallback(
    async (append = false, currentCount = 0) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const offset = append ? currentCount : 0;
        const cacheKey = `${role}:${offset}`;
        let reqPromise = inFlightNotifications.get(cacheKey);
        if (!reqPromise) {
          reqPromise = fetch(
            `/api/notifications?role=${role}&limit=30&offset=${offset}`,
            { cache: "no-store" }
          ).then(async (res) => {
            if (res.status === 401) {
              return { items: [], hasMore: false, unreadCount: 0 };
            }
            if (!res.ok) {
              inFlightNotifications.delete(cacheKey);
              throw new Error("Could not load notifications.");
            }
            return res.json();
          });
          inFlightNotifications.set(cacheKey, reqPromise);
          void reqPromise.catch(() => {}).finally(() => {
            window.setTimeout(() => {
              if (inFlightNotifications.get(cacheKey) === reqPromise) {
                inFlightNotifications.delete(cacheKey);
              }
            }, 2500);
          });
        }
        const data = (await reqPromise) as {
          items?: NotificationRecord[];
          hasMore?: boolean;
          unreadCount?: number;
        };
        const incoming: NotificationRecord[] = Array.isArray(data.items) ? data.items : [];
        setItems((prev) => {
          if (!append) return incoming;
          const seen = new Set(prev.map((n) => n.id));
          return [...prev, ...incoming.filter((n) => !seen.has(n.id))];
        });
        setHasMore(Boolean(data.hasMore));
        if (typeof data.unreadCount === "number") {
          setDbUnreadCount(data.unreadCount);
          onUnreadCountChange?.(data.unreadCount);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load notifications.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [role, onUnreadCountChange]
  );

  useEffect(() => {
    if (open || variant === "inline") {
      void loadNotifications(false, 0);
    }
  }, [open, variant, loadNotifications]);

  // Keep unread count synced on mount, visibility restore, online reconnect, and custom events
  useEffect(() => {
    void loadNotifications(false, 0);

    const handleRefresh = () => {
      void loadNotifications(false, 0);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadNotifications(false, 0);
      }
    };

    window.addEventListener("notifications-refresh", handleRefresh);
    window.addEventListener("online", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadNotifications(false, 0);
      }
    }, 45000);
    return () => {
      window.removeEventListener("notifications-refresh", handleRefresh);
      window.removeEventListener("online", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [loadNotifications]);

  // Multi-tab / multi-session real-time notification sync
  useRealtimeHub({
    role,
    onNotificationSync: (data) => {
      if (!data.recipientRole || data.recipientRole === role) {
        void loadNotifications(false, 0);
      }
    },
    onDataSync: () => {
      void loadNotifications(false, 0);
    },
    onMessageSignal: () => {
      void loadNotifications(false, 0);
    },
  });

  const mutate = async (
    action: NotificationMutationAction,
    notificationId?: string,
    notificationIds?: string[],
    verifyDestination = false
  ): Promise<{ ok: boolean; destinationValid?: boolean; destinationError?: string }> => {
    setBusyId(notificationId || action);
    setOpenMenuId(null);
    setError(null);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          action,
          notificationId,
          notificationIds,
          verifyDestination,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setError(data?.error || "Could not update notification.");
        return { ok: false };
      }
      setItems(Array.isArray(data.items) ? data.items : []);
      setHasMore(Boolean(data.hasMore));
      if (typeof data.unreadCount === "number") {
        setDbUnreadCount(data.unreadCount);
        onUnreadCountChange?.(data.unreadCount);
      }
      if (action.startsWith("bulk_")) {
        setSelectedIds([]);
        setSelectMode(false);
      }
      broadcastRealtimeEvent("notification_sync", { recipientRole: role });
      window.dispatchEvent(new Event("admin-signals-refresh"));
      return {
        ok: true,
        destinationValid: data.destinationValid,
        destinationError: data.destinationError,
      };
    } catch {
      setError("Network error updating notification.");
      return { ok: false };
    } finally {
      setBusyId(null);
    }
  };

  const filtered = useMemo(() => {
    if (tab === "unread") return items.filter((n) => !n.read_at && !n.archived_at);
    if (tab === "archived") return items.filter((n) => Boolean(n.archived_at));
    return items.filter((n) => !n.archived_at);
  }, [items, tab]);

  const handleOpenNotification = async (item: NotificationRecord) => {
    if (selectMode) {
      setSelectedIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
      return;
    }

    const res = await mutate("read", item.id, undefined, true);
    if (res.destinationValid === false) {
      setError(res.destinationError || "The linked record is no longer available.");
      return;
    }

    const navReq = parseNotificationDestination(item.destination, {
      entityType: item.entity_type,
      entityId: item.entity_id,
      notificationId: item.id,
    });

    if (navReq.destination) {
      dispatchNotificationNavigation(navReq);
      onClose?.();
      if (onNavigate) {
        onNavigate(navReq.destination, navReq);
      } else {
        router.push(navReq.destination);
      }
    }
  };

  const getIcon = (type: string) => {
    if (type.includes("message")) return MessageSquare;
    if (type.includes("payment") || type.includes("quotation")) return CreditCard;
    if (type.includes("request") || type.includes("job")) return Wrench;
    return Bell;
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (variant === "drawer" && !open) return null;

  const panelContent = (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <Bell className="h-5 w-5 text-[#0B1F3A]" />
          <h2 className="text-base font-bold text-[#0B1F3A]">Notifications</h2>
          {dbUnreadCount > 0 && (
            <span className="rounded-full bg-[#F5B301] px-2 py-0.5 text-xs font-bold text-[#07152B]">
              {dbUnreadCount > 99 ? "99+" : dbUnreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds([]);
              }}
              className="min-h-[36px] rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
          {variant === "drawer" && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Mark all read */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-2.5">
        <div className="flex gap-1">
          {(["all", "unread", "archived"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setSelectedIds([]);
              }}
              className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                tab === t
                  ? "bg-[#0B1F3A] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {dbUnreadCount > 0 && (
          <button
            type="button"
            disabled={busyId === "read_all"}
            onClick={() => mutate("read_all")}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-[#0B1F3A] hover:text-[#E0A200] disabled:opacity-50"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs">
          <span className="font-semibold text-[#0B1F3A]">
            {selectedIds.length} selected
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIds.length === 0 || Boolean(busyId)}
              onClick={() => mutate("bulk_read", undefined, selectedIds)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Mark read
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || Boolean(busyId)}
              onClick={() => mutate("bulk_archive", undefined, selectedIds)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              Archive
            </button>
            <button
              type="button"
              disabled={selectedIds.length === 0 || Boolean(busyId)}
              onClick={() => mutate("bulk_delete", undefined, selectedIds)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs text-rose-700">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => loadNotifications(false, 0)}
            className="inline-flex shrink-0 items-center gap-1 font-bold underline"
          >
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* List */}
      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Bell className="mx-auto h-9 w-9 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">
              {tab === "unread"
                ? "No unread notifications."
                : tab === "archived"
                  ? "No archived notifications."
                  : "You're all caught up. New updates will appear here."}
            </p>
          </div>
        ) : (
          <>
            {filtered.map((item) => {
              const Icon = getIcon(item.type);
              const isUnread = !item.read_at;
              const isSelected = selectedIds.includes(item.id);
              const menuOpen = openMenuId === item.id;

              return (
                <div
                  key={item.id}
                  className={`relative flex items-start gap-3 px-5 py-4 transition-colors ${
                    isUnread ? "bg-amber-50/50" : "bg-white hover:bg-slate-50"
                  }`}
                >
                  {selectMode && (
                    <button
                      type="button"
                      onClick={() => toggleSelectId(item.id)}
                      aria-label="Select notification"
                      className="mt-1.5 shrink-0 text-[#0B1F3A]"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 text-[#0B1F3A]" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>
                  )}

                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isUnread
                        ? "bg-[#0B1F3A] text-[#F5B301]"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(item)}
                      className="block w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm ${
                            isUnread ? "font-bold text-[#0B1F3A]" : "font-medium text-slate-700"
                          }`}
                        >
                          {item.title}
                        </p>
                        {isUnread && (
                          <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#F5B301]"
                            aria-label="Unread"
                          />
                        )}
                      </div>
                      {item.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.body}</p>
                      )}
                      <p className="mt-1.5 text-[11px] text-slate-400">
                        {formatDateTime(item.created_at)}
                      </p>
                    </button>
                  </div>

                  {/* Three-dot action menu */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setOpenMenuId(menuOpen ? null : item.id)}
                      aria-label="Notification actions"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {menuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-xs font-medium text-slate-700 shadow-lg">
                          {isUnread ? (
                            <button
                              type="button"
                              onClick={() => mutate("read", item.id)}
                              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-slate-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Mark as read
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => mutate("unread", item.id)}
                              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-slate-50"
                            >
                              <Bell className="h-3.5 w-3.5" /> Mark as unread
                            </button>
                          )}

                          {!item.archived_at ? (
                            <button
                              type="button"
                              onClick={() => mutate("archive", item.id)}
                              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-slate-50"
                            >
                              <Archive className="h-3.5 w-3.5" /> Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => mutate("unarchive", item.id)}
                              className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left hover:bg-slate-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Restore
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => mutate("delete", item.id)}
                            className="flex min-h-[36px] w-full items-center gap-2 rounded-lg px-2.5 text-left text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <div className="p-4 text-center">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadNotifications(true, items.length)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Load more notifications
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {panelContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-slate-900/45 backdrop-blur-[1px]">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        className="relative z-10 h-full w-full shadow-2xl sm:max-w-md"
      >
        {panelContent}
      </aside>
    </div>
  );
}
