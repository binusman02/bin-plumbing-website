"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ChatPresenceState } from "@/components/chat/ChatAttachment";
import type { JobMessage } from "@/lib/marketplace";
import { broadcastRealtimeEvent, useRealtimeHub } from "@/lib/realtime-hub";

interface UsePortalRealtimeChatOptions {
  role: "customer" | "plumber";
  userId?: string | null;
  isAvailable?: boolean;
  ticketSet: Set<string>;
  activeTicket: string;
  isMessagesTabActive: boolean;
  filterIncomingMessage?: (msg: JobMessage) => boolean;
  setMessages: Dispatch<SetStateAction<JobMessage[]>>;
}

export function usePortalRealtimeChat({
  role,
  userId,
  isAvailable,
  ticketSet,
  activeTicket,
  isMessagesTabActive,
  filterIncomingMessage,
  setMessages,
}: UsePortalRealtimeChatOptions) {
  const [presence, setPresence] = useState<ChatPresenceState>({
    adminOnline: false,
    plumberOnline: false,
    customerOnline: false,
    onlinePlumberIds: [],
    onlineCustomerIds: [],
  });

  const syncTicketMessages = useCallback(
    async (ticket: string) => {
      if (!ticket || !ticketSet.has(ticket)) return;
      try {
        const res = await fetch(
          `/api/chat/presence?ticket=${encodeURIComponent(ticket)}&role=${role}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.presence) setPresence(data.presence);
        if (Array.isArray(data.messages)) {
          const visible = filterIncomingMessage
            ? (data.messages as JobMessage[]).filter(filterIncomingMessage)
            : (data.messages as JobMessage[]);
          setMessages((prev) => {
            const others = prev.filter((m) => m.ticket_number !== ticket);
            return [...others, ...visible];
          });
        }
      } catch {
        // Ignore transient network errors
      }
    },
    [ticketSet, role, filterIncomingMessage, setMessages]
  );

  useRealtimeHub({
    role,
    userId: userId || undefined,
    isAvailable,
    enabled: Boolean(userId),
    onMessageSignal: ({ ticketNumber }) => {
      if (ticketNumber && ticketSet.has(ticketNumber)) {
        syncTicketMessages(ticketNumber);
      }
    },
    onMessage: (msg) => {
      if (!ticketSet.has(msg.ticket_number)) return;
      if (filterIncomingMessage && !filterIncomingMessage(msg)) return;
      syncTicketMessages(msg.ticket_number);
    },
    onRead: ({ ticketNumber, viewerRole }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.ticket_number !== ticketNumber || m.sender_role === viewerRole) return m;
          const readBy = Array.isArray(m.read_by) ? m.read_by : [m.sender_role];
          return readBy.includes(viewerRole) ? m : { ...m, read_by: [...readBy, viewerRole] };
        })
      );
    },
    onPresenceSync: (p) => {
      setPresence((prev) => ({
        ...prev,
        adminOnline: p.adminOnline,
        plumberOnline: role === "plumber" ? p.plumberOnline || prev.plumberOnline : p.plumberOnline,
        customerOnline: role === "customer" ? p.customerOnline || prev.customerOnline : p.customerOnline,
        onlinePlumberIds: p.onlinePlumberIds,
        onlineCustomerIds: p.onlineCustomerIds,
      }));
    },
  });

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const sendPresence = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/chat/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data?.presence) setPresence(data.presence);
        })
        .catch(() => {});
    };
    sendPresence();
    const id = window.setInterval(sendPresence, 20000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [role, userId]);

  useEffect(() => {
    if (!userId || !isMessagesTabActive || !activeTicket) return;

    if (typeof document === "undefined" || document.visibilityState === "visible") {
      fetch("/api/chat/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNumber: activeTicket, viewerRole: role }),
      }).catch(() => {});
      broadcastRealtimeEvent("messages_read", { ticketNumber: activeTicket, viewerRole: role });
    }

    const syncOnce = () => {
      if (document.visibilityState === "hidden") return;
      syncTicketMessages(activeTicket);
    };
    const id = window.setInterval(syncOnce, 30000);
    window.addEventListener("online", syncOnce);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", syncOnce);
    };
  }, [userId, isMessagesTabActive, activeTicket, role, syncTicketMessages]);

  return { presence, setPresence };
}
