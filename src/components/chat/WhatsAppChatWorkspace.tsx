"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import {
  editCommunicationMessageAction,
  postCommunicationMessageAction,
} from "@/app/actions/marketplace-actions";
import {
  ChatAttachmentBubble,
  type ChatPresenceState,
  MAX_CHAT_FILE_BYTES,
  MessageReceiptTick,
  PendingAttachmentPill,
  uploadChatFile,
} from "@/components/chat/ChatAttachment";
import { Avatar } from "@/components/ui";
import {
  NOTIFICATION_NAV_EVENT,
  type NotificationNavigationRequest,
} from "@/lib/notification-navigation";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";
import { getStatusMeta } from "@/lib/status-styles";
import type { ChatAttachment, JobMessage, ServiceRequestRecord } from "@/lib/marketplace";

interface WhatsAppChatWorkspaceProps {
  actorRole: "admin" | "customer" | "plumber";
  actorId: string;
  actorName: string;
  requests: ServiceRequestRecord[];
  initialMessages: JobMessage[];
  initialTicket?: string | null;
  initialMessageId?: string | null;
  navigationKey?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  onTicketRead?: (ticketNumber: string) => void;
  onTargetChange?: (ticket: string | null, messageId: string | null) => void;
  plumberAvatars?: Record<string, string>;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatLastSeen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = formatDayLabel(iso);
  const time = formatTimeShort(iso);
  if (day === "Today") return `Last seen today at ${time}`;
  if (day === "Yesterday") return `Last seen yesterday at ${time}`;
  return `Last seen ${day} at ${time}`;
}

const QUICK_EMOJIS = ["👍", "🙏", "🔧", "🚰", "💧", "✅", "📸", "📍", "⏰", "😊", "👋", "⚠️"];

export function WhatsAppChatWorkspace({
  actorRole,
  actorId,
  actorName,
  requests,
  initialMessages,
  initialTicket = null,
  initialMessageId = null,
  navigationKey = null,
  emptyTitle = "No conversations yet",
  emptyDescription = "Messages for your service requests and active jobs will appear here.",
  onTicketRead,
  onTargetChange,
  plumberAvatars,
}: WhatsAppChatWorkspaceProps) {
  const [messages, setMessages] = useState<JobMessage[]>(initialMessages);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(initialTicket);
  const [listSearch, setListSearch] = useState("");
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Target message deep-linking & highlight states
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{
    ticket: string;
    messageId: string;
    navKey: string;
  } | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [highlightPulseCount, setHighlightPulseCount] = useState(0);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetStatusBanner, setTargetStatusBanner] = useState<{
    type: "error" | "warning";
    title: string;
    message: string;
  } | null>(null);

  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<JobMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<JobMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [visTick, setVisTick] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<"public_customer" | "private_plumber">(
    "public_customer"
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [typingInfo, setTypingInfo] = useState<{ ticket: string; name: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [presence, setPresence] = useState<ChatPresenceState>({
    adminOnline: actorRole === "admin",
    plumberOnline: actorRole === "plumber",
    customerOnline: actorRole === "customer",
    onlinePlumberIds: [],
    onlineCustomerIds: [],
    lastSeenMap: {},
  });

  const endRef = useRef<HTMLDivElement | null>(null);
  const messagesFeedRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const prevTicketRef = useRef<string | null>(initialTicket);
  const suppressAutoScrollBottomRef = useRef<boolean>(Boolean(initialMessageId));
  const lastHandledNavKeyRef = useRef<string>("");
  const messagesRef = useRef<JobMessage[]>(messages);
  const requestsRef = useRef<ServiceRequestRecord[]>(requests);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0) return initialMessages;
      const byId = new Map(prev.map((m) => [m.id, m]));
      let changed = initialMessages.length !== prev.length;
      for (const m of initialMessages) {
        const existing = byId.get(m.id);
        if (!existing || existing.message !== m.message || existing.read_at !== m.read_at || existing.deleted_for_everyone !== m.deleted_for_everyone) {
          changed = true;
        }
        byId.set(m.id, m);
      }
      if (!changed) return prev;
      return Array.from(byId.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [initialMessages]);

  const executeTargetNavigation = useCallback(
    async (
      rawTicket: string | null | undefined,
      rawMessageId: string | null | undefined,
      navKey: string
    ) => {
      const cleanTicket = (rawTicket || "").trim();
      const cleanMsgId = (rawMessageId || "").trim();
      if (!cleanTicket && !cleanMsgId) return;

      // Clear search filters so the target conversation & message are visible
      setListSearch("");
      setUnreadOnly(false);
      setThreadSearchOpen(false);
      setThreadSearch("");
      setTargetStatusBanner(null);

      if (cleanMsgId) {
        suppressAutoScrollBottomRef.current = true;
      }

      const currentRequests = requestsRef.current;
      const currentMessages = messagesRef.current;

      // Immediate local selection & scroll for already-loaded messages on repeated clicks
      if (cleanTicket && cleanMsgId) {
        const localAllowed = currentRequests.some(
          (r) => r.ticket_number === cleanTicket
        );
        const localMsg = currentMessages.find(
          (m) => m.id === cleanMsgId && m.ticket_number === cleanTicket
        );
        if (
          localAllowed &&
          localMsg &&
          !localMsg.deleted_for_everyone &&
          !(
            Array.isArray(localMsg.deleted_by_ids) &&
            localMsg.deleted_by_ids.includes(actorId)
          ) &&
          !(actorRole === "customer" && localMsg.is_internal)
        ) {
          setSelectedTicket(cleanTicket);
          setPendingScrollTarget({
            ticket: cleanTicket,
            messageId: cleanMsgId,
            navKey,
          });
        }
      } else if (cleanTicket && !cleanMsgId) {
        const localAllowed = currentRequests.some(
          (r) => r.ticket_number === cleanTicket
        );
        if (localAllowed) {
          suppressAutoScrollBottomRef.current = false;
          setSelectedTicket(cleanTicket);
        }
      }

      // Server verification & message hydration (handles permissions, older messages, and deleted messages)
      setTargetLoading(true);
      try {
        const qs = new URLSearchParams();
        if (cleanTicket) qs.set("ticket", cleanTicket);
        if (cleanMsgId) qs.set("message", cleanMsgId);
        qs.set("role", actorRole);

        const res = await fetch(`/api/chat/resolve-target?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);

        if (
          !res.ok ||
          data?.status === "access_denied" ||
          data?.status === "unauthorized" ||
          data?.status === "not_found"
        ) {
          setPendingScrollTarget(null);
          setHighlightedMessageId(null);
          const isDenied =
            res.status === 403 ||
            res.status === 401 ||
            data?.status === "access_denied" ||
            data?.status === "unauthorized";
          setSelectedTicket(null);
          setTargetStatusBanner({
            type: isDenied ? "error" : "warning",
            title: isDenied ? "Access Denied" : "Destination Unavailable",
            message:
              data?.reason ||
              (isDenied
                ? "Access denied: You do not have permission to view this conversation or message."
                : "The requested conversation or message could not be found."),
          });
          return;
        }

        if (Array.isArray(data?.messages)) {
          const fetched: JobMessage[] = data.messages;
          setMessages((prev) => {
            const byId = new Map<string, JobMessage>();
            for (const m of prev) byId.set(m.id, m);
            for (const m of fetched) byId.set(m.id, m);
            return Array.from(byId.values()).sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            );
          });
        }

        const resolvedTicket = String(data?.ticketNumber || cleanTicket);
        if (resolvedTicket) {
          setSelectedTicket(resolvedTicket);
        }

        if (data?.status === "message_deleted") {
          suppressAutoScrollBottomRef.current = true;
          setPendingScrollTarget(null);
          setHighlightedMessageId(null);
          setTargetStatusBanner({
            type: "warning",
            title: "Original Message Unavailable",
            message:
              data?.reason ||
              "The specific message from this notification has been deleted and is no longer available.",
          });
          return;
        }

        if (data?.messageId) {
          suppressAutoScrollBottomRef.current = true;
          setPendingScrollTarget({
            ticket: resolvedTicket,
            messageId: String(data.messageId),
            navKey,
          });
        } else {
          suppressAutoScrollBottomRef.current = false;
        }
      } catch {
        // Ignore transient network errors if local fast-path already resolved
      } finally {
        setTargetLoading(false);
      }
    },
    [actorRole, actorId]
  );

  // Trigger target navigation when initialTicket / initialMessageId / navigationKey props change
  useEffect(() => {
    if (!initialTicket && !initialMessageId) return;
    const effectiveKey =
      navigationKey || `prop-${initialTicket || ""}-${initialMessageId || ""}`;
    if (lastHandledNavKeyRef.current === effectiveKey) return;
    lastHandledNavKeyRef.current = effectiveKey;
    executeTargetNavigation(initialTicket, initialMessageId, effectiveKey);
  }, [initialTicket, initialMessageId, navigationKey, executeTargetNavigation]);

  // Listen for explicit notification click events even when URL and props are unchanged
  useEffect(() => {
    const handleNavEvent = (ev: Event) => {
      const custom = ev as CustomEvent<NotificationNavigationRequest>;
      const detail = custom.detail;
      if (!detail) return;
      if (!detail.ticket && !detail.messageId) return;
      if (lastHandledNavKeyRef.current === detail.navKey) return;
      lastHandledNavKeyRef.current = detail.navKey;
      onTargetChange?.(detail.ticket, detail.messageId);
      executeTargetNavigation(detail.ticket, detail.messageId, detail.navKey);
    };

    window.addEventListener(NOTIFICATION_NAV_EVENT, handleNavEvent);
    return () => {
      window.removeEventListener(NOTIFICATION_NAV_EVENT, handleNavEvent);
    };
  }, [executeTargetNavigation, onTargetChange]);

  // Preserve per-conversation drafts when switching threads
  useEffect(() => {
    const prev = prevTicketRef.current;
    if (prev && prev !== selectedTicket) {
      draftsRef.current[prev] = draft;
    }
    if (selectedTicket && prev !== selectedTicket) {
      setDraft(draftsRef.current[selectedTicket] || "");
      setEditingMsg(null);
      setEditDraft("");
      setReplyTo(null);
      setEmojiOpen(false);
      setSendError(null);
    }
    prevTicketRef.current = selectedTicket;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicket]);

  const syncInFlightRef = useRef<string | null>(null);
  const lastSyncAtRef = useRef<Record<string, number>>({});
  const syncTicketMessages = useCallback(
    async (ticket: string, force = false) => {
      if (syncInFlightRef.current === ticket) return;
      const now = Date.now();
      if (!force && now - (lastSyncAtRef.current[ticket] || 0) < 5000) return;
      syncInFlightRef.current = ticket;
      lastSyncAtRef.current[ticket] = now;
      try {
        const res = await fetch(
          `/api/chat/presence?ticket=${encodeURIComponent(ticket)}&role=${actorRole}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data?.presence) {
          setPresence(data.presence);
        }
        if (Array.isArray(data?.messages)) {
          const fetched: JobMessage[] = data.messages;
          setMessages((prev) => {
            const byId = new Map<string, JobMessage>();
            for (const m of prev) byId.set(m.id, m);
            for (const m of fetched) byId.set(m.id, m);
            return Array.from(byId.values()).sort((a, b) =>
              a.created_at.localeCompare(b.created_at)
            );
          });
        }
      } catch {
        // Ignore transient network errors
      } finally {
        if (syncInFlightRef.current === ticket) {
          syncInFlightRef.current = null;
        }
      }
    },
    [actorRole]
  );

  // Presence heartbeat & offline unload signal (independent of selectedTicket)
  useEffect(() => {
    let active = true;
    const pingPresence = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: actorRole }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data?.presence) setPresence(data.presence);
        })
        .catch(() => {});
    };

    pingPresence();
    const timer = setInterval(pingPresence, 45000);

    const handlePageHide = () => {
      const payload = JSON.stringify({ role: actorRole, action: "offline" });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/chat/presence",
          new Blob([payload], { type: "application/json" })
        );
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [actorRole]);

  // Fallback ticket message sync, visibility listener & online reconnect sync
  useEffect(() => {
    const syncTimer = setInterval(() => {
      if (document.visibilityState === "visible" && selectedTicket) {
        void syncTicketMessages(selectedTicket);
      }
    }, 45000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setVisTick((v) => v + 1);
        if (selectedTicket) void syncTicketMessages(selectedTicket);
      }
    };

    const handleOnline = () => {
      if (selectedTicket) void syncTicketMessages(selectedTicket, true);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);

    return () => {
      clearInterval(syncTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [selectedTicket, syncTicketMessages]);

  useRealtimeHub({
    role: actorRole,
    userId: actorId,
    onMessageSignal: ({ ticketNumber }) => {
      if (!ticketNumber) return;
      syncTicketMessages(ticketNumber);
    },
    onMessage: (msg) => {
      if (actorRole === "customer" && msg.is_internal) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      syncTicketMessages(msg.ticket_number);
    },
    onRead: ({ ticketNumber, viewerRole }) => {
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => {
          if (m.ticket_number !== ticketNumber || m.sender_role === viewerRole) return m;
          const readBy = Array.isArray(m.read_by) ? m.read_by : [m.sender_role];
          return {
            ...m,
            read_at: m.read_at || nowIso,
            delivered_at: m.delivered_at || nowIso,
            read_by: readBy.includes(viewerRole) ? readBy : [...readBy, viewerRole],
            ...(viewerRole === "admin" ? { admin_read: true } : {}),
          };
        })
      );
    },
    onDelivered: ({ ticketNumber, viewerRole }) => {
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => {
          if (m.ticket_number !== ticketNumber || m.sender_role === viewerRole) return m;
          return { ...m, delivered_at: m.delivered_at || nowIso };
        })
      );
    },
    onTyping: (data) => {
      if (data.senderRole === actorRole) return;
      if (data.isTyping) {
        setTypingInfo({ ticket: data.ticketNumber, name: data.senderName || data.senderRole });
        setTimeout(() => {
          setTypingInfo((curr) => (curr?.ticket === data.ticketNumber ? null : curr));
        }, 3000);
      } else {
        setTypingInfo((curr) => (curr?.ticket === data.ticketNumber ? null : curr));
      }
    },
    onMessageDeleted: ({ messageId, mode }) => {
      if (mode === "for_everyone") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, deleted_for_everyone: true, message: "This message was deleted", attachment: undefined }
              : m
          )
        );
      }
    },
    onPresenceSync: (p) => {
      setPresence((prev) => ({
        adminOnline: p.adminOnline || prev.adminOnline,
        plumberOnline: p.plumberOnline || prev.plumberOnline,
        customerOnline: p.customerOnline || prev.customerOnline,
        onlinePlumberIds: Array.from(new Set([...prev.onlinePlumberIds, ...p.onlinePlumberIds])),
        onlineCustomerIds: Array.from(new Set([...prev.onlineCustomerIds, ...p.onlineCustomerIds])),
      }));
    },
  });

  // Visible messages (excluding deleted_for_me and customer internal notes)
  const visibleMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (actorRole === "customer" && m.is_internal) return false;
        if (Array.isArray(m.deleted_by_ids) && m.deleted_by_ids.includes(actorId)) return false;
        return true;
      }),
    [messages, actorRole, actorId]
  );

  // Build conversations list sorted by latest message / request updated_at
  const threads = useMemo(() => {
    const map = new Map<
      string,
      {
        ticket: string;
        req?: ServiceRequestRecord;
        title: string;
        subtitle: string;
        lastMessage?: JobMessage;
        unreadCount: number;
        lastActivity: string;
        isOnline: boolean;
        avatarUrl?: string;
      }
    >();

    for (const req of requests) {
      const title =
        actorRole === "admin"
          ? req.customer_name || req.ticket_number
          : actorRole === "plumber"
            ? `${req.problem_category} (${req.ticket_number})`
            : req.problem_category || req.ticket_number;

      const subtitle =
        actorRole === "admin"
          ? `${req.ticket_number} • ${req.problem_category}${req.assigned_technician ? ` • ${req.assigned_technician}` : ""}`
          : `${req.ticket_number} • ${req.city_lga || req.address_in_kano}`;

      const isOnline =
        actorRole === "admin"
          ? Boolean(req.customer_id && presence.onlineCustomerIds.includes(req.customer_id)) ||
            Boolean(req.assigned_plumber_id && presence.onlinePlumberIds.includes(req.assigned_plumber_id))
          : presence.adminOnline;

      const avatarUrl =
        actorRole !== "plumber" && plumberAvatars
          ? (req.assigned_plumber_id && plumberAvatars[req.assigned_plumber_id]) ||
            (req.assigned_technician &&
              plumberAvatars[req.assigned_technician.trim().toLowerCase()]) ||
            undefined
          : undefined;

      map.set(req.ticket_number, {
        ticket: req.ticket_number,
        req,
        title,
        subtitle,
        unreadCount: 0,
        lastActivity: req.updated_at || req.created_at,
        isOnline,
        avatarUrl,
      });
    }

    for (const m of visibleMessages) {
      const existing = map.get(m.ticket_number) || {
        ticket: m.ticket_number,
        title: m.ticket_number,
        subtitle: m.sender_name,
        unreadCount: 0,
        lastActivity: m.created_at,
        isOnline: presence.adminOnline,
      };

      const isUnread =
        m.sender_role !== actorRole &&
        !(Array.isArray(m.read_by) && m.read_by.includes(actorRole));

      if (isUnread) existing.unreadCount += 1;
      if (!existing.lastMessage || m.created_at >= existing.lastMessage.created_at) {
        existing.lastMessage = m;
        if (m.created_at > existing.lastActivity) existing.lastActivity = m.created_at;
      }
      map.set(m.ticket_number, existing);
    }

    const q = listSearch.trim().toLowerCase();
    return Array.from(map.values())
      .filter((t) => {
        if (unreadOnly && t.unreadCount === 0) return false;
        if (!q) return true;
        return (
          t.ticket.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.subtitle.toLowerCase().includes(q) ||
          (t.lastMessage?.message || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
  }, [requests, visibleMessages, actorRole, presence, listSearch, unreadOnly, plumberAvatars]);

  const activeThread = useMemo(
    () => threads.find((t) => t.ticket === selectedTicket) || null,
    [threads, selectedTicket]
  );

  const threadMessages = useMemo(() => {
    if (!selectedTicket) return [];
    const q = threadSearch.trim().toLowerCase();
    return visibleMessages
      .filter((m) => m.ticket_number === selectedTicket)
      .filter((m) => (!q ? true : m.message.toLowerCase().includes(q) || m.sender_name.toLowerCase().includes(q)))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }, [visibleMessages, selectedTicket, threadSearch]);

  // Track first unread incoming message in active thread for unread divider
  const firstUnreadId = useMemo(() => {
    const first = threadMessages.find(
      (m) =>
        m.sender_role !== actorRole &&
        !(Array.isArray(m.read_by) && m.read_by.includes(actorRole))
    );
    return first?.id || null;
  }, [threadMessages, actorRole]);

  // Mark active thread messages & linked message notifications as read ONLY when page is visible
  const lastReadSyncedTicketRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedTicket) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const hasUnread = visibleMessages.some((m) => {
      if (m.ticket_number !== selectedTicket || m.sender_role === actorRole) return false;
      const inReadBy = Array.isArray(m.read_by) && m.read_by.includes(actorRole);
      return !inReadBy;
    });
    const isNewlyOpenedTicket = lastReadSyncedTicketRef.current !== selectedTicket;
    if (!hasUnread && !isNewlyOpenedTicket) return;
    lastReadSyncedTicketRef.current = selectedTicket;

    fetch("/api/chat/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketNumber: selectedTicket, viewerRole: actorRole }),
    })
      .then((res) => {
        if (!res.ok) return;
        broadcastRealtimeEvent("messages_read", {
          ticketNumber: selectedTicket,
          viewerRole: actorRole,
        });
        broadcastRealtimeEvent("notification_sync", { recipientRole: actorRole });
        setMessages((prev) =>
          prev.map((m) =>
            m.ticket_number === selectedTicket && m.sender_role !== actorRole
              ? {
                  ...m,
                  read_at: m.read_at || new Date().toISOString(),
                  read_by: Array.from(new Set([...(m.read_by || []), actorRole])),
                  ...(actorRole === "admin" ? { admin_read: true } : {}),
                }
              : m
          )
        );
        onTicketRead?.(selectedTicket);
        window.dispatchEvent(new Event("admin-signals-refresh"));
        window.dispatchEvent(new Event("notifications-refresh"));
      })
      .catch(() => {});
  }, [selectedTicket, visibleMessages, actorRole, onTicketRead, visTick]);

  // Coordinate scrolling & highlighting with actual DOM rendering of the target message
  useEffect(() => {
    if (!pendingScrollTarget) return;
    if (selectedTicket !== pendingScrollTarget.ticket) return;

    const targetId = pendingScrollTarget.messageId;
    const existsInThread = threadMessages.some((m) => m.id === targetId);
    if (!existsInThread) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const scrollAndHighlight = (el: HTMLElement) => {
      if (cancelled) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(targetId);
      setHighlightPulseCount((c) => c + 1);
      setPendingScrollTarget(null);

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedMessageId((curr) => (curr === targetId ? null : curr));
      }, 4500);
    };

    const escapeAttr = (val: string) =>
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(val)
        : val.replace(/["\\]/g, "\\$&");

    const tryLocateElement = (): boolean => {
      const container = messagesFeedRef.current || document;
      const el = container.querySelector<HTMLElement>(
        `[data-message-id="${escapeAttr(targetId)}"]`
      );
      if (el) {
        requestAnimationFrame(() => scrollAndHighlight(el));
        return true;
      }
      return false;
    };

    if (!tryLocateElement() && messagesFeedRef.current) {
      observer = new MutationObserver(() => {
        if (tryLocateElement() && observer) {
          observer.disconnect();
          observer = null;
        }
      });
      observer.observe(messagesFeedRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      cancelled = true;
      if (observer) observer.disconnect();
    };
  }, [pendingScrollTarget, selectedTicket, threadMessages]);

  useEffect(() => {
    if (
      suppressAutoScrollBottomRef.current ||
      pendingScrollTarget ||
      highlightedMessageId
    ) {
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadMessages.length, selectedTicket, pendingScrollTarget, highlightedMessageId]);

  const handleSelectThread = (ticket: string) => {
    suppressAutoScrollBottomRef.current = false;
    setPendingScrollTarget(null);
    setHighlightedMessageId(null);
    setTargetStatusBanner(null);
    setSelectedTicket(ticket);
    onTargetChange?.(ticket, null);
  };

  // Press Escape on desktop to close overlays or exit the currently open chat
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingMsg) {
        setEditingMsg(null);
        setEditDraft("");
        return;
      }
      if (emojiOpen) {
        setEmojiOpen(false);
        return;
      }
      if (threadSearchOpen) {
        setThreadSearchOpen(false);
        setThreadSearch("");
        return;
      }
      if (replyTo) {
        setReplyTo(null);
        return;
      }
      if (selectedTicket) {
        setPendingScrollTarget(null);
        setHighlightedMessageId(null);
        setTargetStatusBanner(null);
        setSelectedTicket(null);
        onTargetChange?.(null, null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingMsg, emojiOpen, threadSearchOpen, replyTo, selectedTicket, onTargetChange]);

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!selectedTicket) return;
    broadcastRealtimeEvent("typing", {
      ticketNumber: selectedTicket,
      senderRole: actorRole,
      senderName: actorName,
      isTyping: val.trim().length > 0,
    });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      broadcastRealtimeEvent("typing", {
        ticketNumber: selectedTicket,
        senderRole: actorRole,
        senderName: actorName,
        isTyping: false,
      });
    }, 2000);
  };

  const handleSend = () => {
    if (!selectedTicket) return;
    if (!draft.trim() && !pendingFile) return;
    setSendError(null);
    suppressAutoScrollBottomRef.current = false;
    setHighlightedMessageId(null);

    const targetTicket = selectedTicket;
    const targetReqId = activeThread?.req?.id || targetTicket;
    const isInternal =
      (actorRole === "admin" || actorRole === "plumber") &&
      (visibilityMode === "private_plumber" || Boolean(replyTo?.is_internal));

    startTransition(async () => {
      try {
        let attachment: ChatAttachment | undefined;
        if (pendingFile) {
          setUploading(true);
          attachment = await uploadChatFile(pendingFile, targetTicket, actorRole);
          setUploading(false);
        }

        const res = await postCommunicationMessageAction({
          requestId: targetReqId,
          ticketNumber: targetTicket,
          senderRole: actorRole,
          message: draft.trim(),
          attachment,
          isInternal,
          replyToId: replyTo?.id || null,
        });

        if (res.success && res.message) {
          const sentMsg = res.message;
          setMessages((prev) => (prev.some((m) => m.id === sentMsg.id) ? prev : [...prev, sentMsg]));
          setDraft("");
          draftsRef.current[targetTicket] = "";
          setPendingFile(null);
          setReplyTo(null);
          setEmojiOpen(false);
          broadcastRealtimeEvent("new_message", { ticketNumber: targetTicket });
          broadcastRealtimeEvent("notification_sync", {});
        } else {
          setSendError(res.error || "Could not send message.");
        }
      } catch (err: any) {
        setUploading(false);
        setSendError(err?.message || "Failed to send message.");
      }
    });
  };

  const handleSaveEdit = () => {
    if (!editingMsg || !editDraft.trim()) return;
    const target = editingMsg;
    const nextText = editDraft.trim();
    setSendError(null);
    startTransition(async () => {
      const res = await editCommunicationMessageAction({
        messageId: target.id,
        actorRole,
        newMessage: nextText,
      });
      if (res.success && res.message) {
        setMessages((prev) => prev.map((m) => (m.id === target.id ? res.message! : m)));
        setEditingMsg(null);
        setEditDraft("");
        broadcastRealtimeEvent("new_message", { ticketNumber: target.ticket_number });
      } else {
        setSendError(res.error || "Could not edit message.");
      }
    });
  };

  const handleDeleteMessage = async (msg: JobMessage, mode: "for_me" | "for_everyone") => {
    const res = await fetch("/api/chat/message", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.id, mode, actorRole }),
    });
    if (res.ok) {
      if (mode === "for_me") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id ? { ...m, deleted_by_ids: [...(m.deleted_by_ids || []), actorId] } : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, deleted_for_everyone: true, message: "This message was deleted", attachment: undefined }
              : m
          )
        );
        broadcastRealtimeEvent("message_deleted", { messageId: msg.id, mode: "for_everyone" });
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* LEFT PANEL: CONVERSATION LIST */}
      <aside
        className={`flex w-full flex-col border-r border-slate-200 bg-white md:w-80 lg:w-96 ${
          selectedTicket || targetStatusBanner ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="border-b border-slate-200 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#0B1F3A]">Conversations ({threads.length})</h2>
            <button
              type="button"
              onClick={() => setUnreadOnly((v) => !v)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                unreadOnly ? "bg-[#0B1F3A] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Unread
            </button>
          </div>
          <div className="relative mt-2.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Search ticket, customer, message..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center p-6 text-center">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-semibold text-slate-700">{emptyTitle}</p>
              <p className="mt-1 text-xs text-slate-500">{emptyDescription}</p>
            </div>
          ) : (
            threads.map((t) => {
              const active = t.ticket === selectedTicket;
              return (
                <button
                  key={t.ticket}
                  type="button"
                  onClick={() => handleSelectThread(t.ticket)}
                  className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition ${
                    active ? "bg-[#0B1F3A]/5" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar name={t.title} src={t.avatarUrl} size="md" />
                    {t.isOnline && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-[#0B1F3A]">{t.title}</p>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatTimeShort(t.lastActivity)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] font-medium text-slate-500">{t.subtitle}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-slate-600">
                        {t.lastMessage
                          ? t.lastMessage.deleted_for_everyone
                            ? "Message deleted"
                            : t.lastMessage.message || "Attachment"
                          : "No messages yet"}
                      </p>
                      {t.unreadCount > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#F5B301] px-1.5 text-[10px] font-bold text-[#0B1F3A]">
                          {t.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT PANEL: ACTIVE CONVERSATION */}
      <section
        className={`flex flex-1 flex-col bg-[#F4F6F9] ${
          selectedTicket || targetStatusBanner ? "flex" : "hidden md:flex"
        }`}
      >
        {!activeThread ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            {targetStatusBanner ? (
              <div
                role="alert"
                data-testid="chat-target-status-banner"
                className={`max-w-md rounded-2xl border p-6 text-left shadow-sm ${
                  targetStatusBanner.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-950"
                    : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
              >
                <div className="flex items-start gap-3">
                  {targetStatusBanner.type === "error" ? (
                    <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                  )}
                  <div className="flex-1">
                    <h3 className="text-base font-bold">
                      {targetStatusBanner.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed opacity-90">
                      {targetStatusBanner.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetStatusBanner(null);
                        onTargetChange?.(null, null);
                      }}
                      className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-[#0B1F3A] px-3.5 text-xs font-semibold text-white hover:bg-[#132f57]"
                    >
                      Back to Conversations
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0B1F3A]/10 text-[#0B1F3A]">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#0B1F3A]">Select a conversation</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500">
                  Choose a service request thread on the left to view messages, delivery receipts, and attachments.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTicket(null);
                    setTargetStatusBanner(null);
                    onTargetChange?.(null, null);
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Avatar name={activeThread.title} src={activeThread.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-[#0B1F3A]">{activeThread.title}</p>
                    {activeThread.req && (
                      <span
                        className={`hidden sm:inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          getStatusMeta(activeThread.req.status).className
                        }`}
                      >
                        {getStatusMeta(activeThread.req.status).label}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {typingInfo?.ticket === activeThread.ticket ? (
                      <span className="font-semibold text-emerald-600">{typingInfo.name} is typing...</span>
                    ) : activeThread.isOnline ? (
                      <span className="text-emerald-600">Online • {activeThread.ticket}</span>
                    ) : (
                      (() => {
                        const targetUserId =
                          actorRole === "admin"
                            ? activeThread.req?.customer_id || activeThread.req?.assigned_plumber_id
                            : null;
                        const lastSeen = targetUserId
                          ? formatLastSeen(presence.lastSeenMap?.[targetUserId])
                          : null;
                        return lastSeen ? `${lastSeen} • ${activeThread.ticket}` : activeThread.subtitle;
                      })()
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setThreadSearchOpen((v) => !v);
                  setThreadSearch("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                aria-label="Search in conversation"
              >
                <Search className="h-4 w-4" />
              </button>
            </header>

            {targetStatusBanner && (
              <div
                role="alert"
                data-testid="chat-target-status-banner"
                className={`flex items-start justify-between gap-3 border-b px-4 py-2.5 text-xs ${
                  targetStatusBanner.type === "error"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                <div className="flex items-start gap-2">
                  {targetStatusBanner.type === "error" ? (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  )}
                  <div>
                    <span className="font-bold">{targetStatusBanner.title}: </span>
                    <span>{targetStatusBanner.message}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetStatusBanner(null)}
                  className="rounded p-0.5 opacity-70 hover:opacity-100"
                  aria-label="Dismiss notice"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {targetLoading && (
              <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px] font-medium text-slate-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0B1F3A]" />
                <span>Locating message...</span>
              </div>
            )}

            {threadSearchOpen && (
              <div className="border-b border-slate-200 bg-white px-4 py-2">
                <input
                  type="search"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search messages in this thread..."
                  className="h-8 w-full rounded-lg border border-slate-200 px-3 text-xs focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
            )}

            {/* Messages Feed */}
            <div ref={messagesFeedRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {threadMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  No messages in this conversation yet. Send a message below to begin.
                </div>
              ) : (
                threadMessages.map((msg, idx) => {
                  const isMine = msg.sender_role === actorRole;
                  const prevMsg = idx > 0 ? threadMessages[idx - 1] : null;
                  const dayLabel = formatDayLabel(msg.created_at);
                  const prevDayLabel = prevMsg ? formatDayLabel(prevMsg.created_at) : "";
                  const showDay = dayLabel !== prevDayLabel;
                  const quoted = msg.reply_to_id
                    ? visibleMessages.find((m) => m.id === msg.reply_to_id)
                    : null;

                  const isRead =
                    Boolean(msg.read_at) ||
                    (Array.isArray(msg.read_by) && msg.read_by.some((r) => r !== msg.sender_role));
                  const isDelivered = Boolean(msg.delivered_at);
                  const isHighlighted = highlightedMessageId === msg.id;

                  return (
                    <div
                      key={msg.id}
                      id={`chat-msg-${msg.id}`}
                      data-message-id={msg.id}
                      data-highlighted={isHighlighted ? "true" : "false"}
                      data-highlight-pulse={isHighlighted ? String(highlightPulseCount) : undefined}
                      className="space-y-2 scroll-mt-20"
                    >
                      {showDay && (
                        <div className="flex justify-center py-1">
                          <span className="rounded-full bg-white px-3 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">
                            {dayLabel}
                          </span>
                        </div>
                      )}
                      {firstUnreadId === msg.id && (
                        <div className="my-2 flex items-center gap-2">
                          <span className="h-px flex-1 bg-[#F5B301]/40" />
                          <span className="rounded-full bg-[#F5B301]/20 px-3 py-0.5 text-[10px] font-bold text-[#0B1F3A]">
                            Unread messages
                          </span>
                          <span className="h-px flex-1 bg-[#F5B301]/40" />
                        </div>
                      )}
                      <div className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`relative max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm transition-all duration-300 sm:max-w-[70%] ${
                            msg.is_internal
                              ? "border border-amber-300 bg-amber-50 text-amber-950"
                              : isMine
                                ? "bg-[#0B1F3A] text-white"
                                : "border border-slate-200 bg-white text-slate-800"
                          } ${
                            isHighlighted
                              ? "ring-4 ring-[#F5B301] ring-offset-2 shadow-xl"
                              : ""
                          }`}
                        >
                          <div className="mb-1 flex items-center justify-between gap-3 text-[11px]">
                            <span
                              className={`font-bold ${
                                msg.is_internal
                                  ? "text-amber-800"
                                  : isMine
                                    ? "text-[#F5B301]"
                                    : "text-[#0B1F3A]"
                              }`}
                            >
                              {msg.sender_name}
                              {msg.is_internal && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-amber-200/70 px-1.5 py-0.2 text-[9px] uppercase text-amber-900">
                                  <Lock className="h-2.5 w-2.5" /> Internal
                                </span>
                              )}
                            </span>
                            {!msg.deleted_for_everyone && (
                              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplyTo(msg);
                                    if (msg.is_internal && (actorRole === "admin" || actorRole === "plumber")) {
                                      setVisibilityMode("private_plumber");
                                    }
                                  }}
                                  title="Reply"
                                  className="rounded p-0.5 hover:bg-black/10"
                                >
                                  <Reply className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(msg.message || "");
                                    setCopiedId(msg.id);
                                    setTimeout(() => setCopiedId(null), 1500);
                                  }}
                                  title="Copy"
                                  className="rounded p-0.5 hover:bg-black/10"
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                                {isMine && msg.message && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMsg(msg);
                                      setEditDraft(msg.message);
                                      setReplyTo(null);
                                    }}
                                    title="Edit message"
                                    className="rounded p-0.5 hover:bg-black/10"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteMessage(
                                      msg,
                                      isMine || actorRole === "admin" ? "for_everyone" : "for_me"
                                    )
                                  }
                                  title={isMine || actorRole === "admin" ? "Delete for everyone" : "Delete for me"}
                                  className="rounded p-0.5 hover:bg-rose-500/20"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>

                          {quoted && (
                            <div
                              className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-[11px] ${
                                isMine
                                  ? "border-[#F5B301] bg-white/10 text-slate-200"
                                  : "border-[#0B1F3A] bg-slate-100 text-slate-600"
                              }`}
                            >
                              <p className="font-semibold">{quoted.sender_name}</p>
                              <p className="truncate">{quoted.message || "Attachment"}</p>
                            </div>
                          )}

                          {msg.deleted_for_everyone ? (
                            <p className="italic opacity-70">{msg.message}</p>
                          ) : (
                            <>
                              {msg.message && <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>}
                              {msg.attachment && (
                                <div className="mt-2">
                                  <ChatAttachmentBubble attachment={msg.attachment} isDark={isMine} />
                                </div>
                              )}
                            </>
                          )}

                          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-75">
                            {copiedId === msg.id && <span className="mr-1 text-emerald-400">Copied</span>}
                            {msg.edited_at && !msg.deleted_for_everyone && (
                              <span className="mr-1 italic opacity-80">Edited</span>
                            )}
                            <span>{formatTimeShort(msg.created_at)}</span>
                            {isMine && !msg.deleted_for_everyone && (
                              <MessageReceiptTick
                                status={msg.receipt_status}
                                isRead={isRead}
                                isDelivered={isDelivered}
                                light
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={endRef} />
            </div>

            {/* Composer */}
            <div className="border-t border-slate-200 bg-white p-3">
              {sendError && (
                <p className="mb-2 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700">
                  {sendError}
                </p>
              )}
              {editingMsg && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-l-4 border-[#0B1F3A] bg-slate-50 px-3 py-1.5 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[#0B1F3A]">Editing message</p>
                    <input
                      type="text"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveEdit();
                        } else if (e.key === "Escape") {
                          setEditingMsg(null);
                          setEditDraft("");
                        }
                      }}
                      className="mt-1 h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs text-slate-900 focus:border-[#0B1F3A] focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={isPending || !editDraft.trim()}
                    className="flex h-7 w-7 items-center justify-center rounded bg-[#0B1F3A] text-white disabled:opacity-40"
                    aria-label="Save edit"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMsg(null);
                      setEditDraft("");
                    }}
                    aria-label="Cancel edit"
                  >
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              )}
              {replyTo && (
                <div className="mb-2 flex items-center justify-between rounded-lg border-l-4 border-[#F5B301] bg-slate-50 px-3 py-1.5 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-[#0B1F3A]">Replying to {replyTo.sender_name}</p>
                      {replyTo.is_internal && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                          <Lock className="h-2.5 w-2.5" /> Locked (Hidden from customer)
                        </span>
                      )}
                    </div>
                    <p className="truncate text-slate-500">{replyTo.message || "Attachment"}</p>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
              )}
              {pendingFile && (
                <div className="mb-2">
                  <PendingAttachmentPill file={pendingFile} onRemove={() => setPendingFile(null)} />
                </div>
              )}

              {(actorRole === "admin" || actorRole === "plumber") && (
                <div className="mb-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={Boolean(replyTo?.is_internal)}
                    onClick={() => setVisibilityMode("public_customer")}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      visibilityMode === "public_customer" && !replyTo?.is_internal
                        ? "bg-[#0B1F3A] text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {actorRole === "admin" ? "Customer & Team" : "Customer & Admin"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisibilityMode("private_plumber")}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                      visibilityMode === "private_plumber" || replyTo?.is_internal
                        ? "bg-amber-500 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Lock className="h-3 w-3" />{" "}
                    {actorRole === "admin" ? "Internal Note (Team Only)" : "Private to Admin"}
                  </button>
                </div>
              )}

              {emojiOpen && (
                <div className="mb-2 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {QUICK_EMOJIS.map((em) => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        handleDraftChange(`${draft}${em}`);
                        setEmojiOpen(false);
                      }}
                      className="rounded-lg px-2 py-1 text-base hover:bg-white"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > MAX_CHAT_FILE_BYTES) {
                        setSendError("File size must not exceed 20 MB.");
                      } else {
                        setPendingFile(f);
                      }
                    }
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Insert emoji"
                >
                  <Smile className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  rows={1}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  className="max-h-28 min-h-[40px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-[#0B1F3A] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || uploading || (!draft.trim() && !pendingFile)}
                  className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#0B1F3A] px-4 text-xs font-bold text-white transition hover:bg-[#0B1F3A]/90 disabled:opacity-40"
                >
                  {isPending || uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
