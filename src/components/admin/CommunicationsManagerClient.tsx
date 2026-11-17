"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
import { pushUrlIfChanged } from "@/lib/history";
import {
  NOTIFICATION_NAV_EVENT,
  type NotificationNavigationRequest,
} from "@/lib/notification-navigation";
import type {
  JobMessage,
  PlumberProfile,
  ServiceRequestRecord,
  StructuredQuotation,
} from "@/lib/marketplace";

interface CommunicationsManagerClientProps {
  messages: JobMessage[];
  requests: ServiceRequestRecord[];
  quotations?: StructuredQuotation[];
  plumbers?: PlumberProfile[];
}

export default function CommunicationsManagerClient({
  messages,
  requests,
  plumbers = [],
}: CommunicationsManagerClientProps) {
  const searchParams = useSearchParams();
  const urlTicket = searchParams.get("ticket");
  const urlMessageId = searchParams.get("message");

  const [navState, setNavState] = useState<{
    ticket: string | null;
    messageId: string | null;
    navKey: string;
  }>(() => ({
    ticket: urlTicket,
    messageId: urlMessageId,
    navKey: `init-${urlTicket || ""}-${urlMessageId || ""}`,
  }));

  useEffect(() => {
    const pending =
      typeof window !== "undefined" ? window.__binLastNotificationNav : undefined;
    if (
      pending &&
      pending.pathname.startsWith("/admin/communications") &&
      (pending.ticket || pending.messageId)
    ) {
      setNavState({
        ticket: pending.ticket || urlTicket,
        messageId: pending.messageId || urlMessageId,
        navKey: pending.navKey,
      });
      return;
    }

    setNavState((prev) => {
      if (prev.ticket === urlTicket && prev.messageId === urlMessageId) {
        return prev;
      }
      return {
        ticket: urlTicket,
        messageId: urlMessageId,
        navKey: `url-${urlTicket || ""}-${urlMessageId || ""}-${Date.now()}`,
      };
    });
  }, [urlTicket, urlMessageId]);

  useEffect(() => {
    const onNav = (ev: Event) => {
      const detail = (ev as CustomEvent<NotificationNavigationRequest>).detail;
      if (!detail || !detail.pathname.startsWith("/admin/communications")) return;
      setNavState({
        ticket: detail.ticket,
        messageId: detail.messageId,
        navKey: detail.navKey,
      });
      if (typeof window !== "undefined") {
        pushUrlIfChanged(detail.destination);
      }
    };
    const onPopState = () => {
      const sp = new URLSearchParams(window.location.search);
      const nextTicket = sp.get("ticket");
      const nextMessageId = sp.get("message");
      setNavState({
        ticket: nextTicket,
        messageId: nextMessageId,
        navKey: `pop-${nextTicket || ""}-${nextMessageId || ""}-${Date.now()}`,
      });
    };
    window.addEventListener(NOTIFICATION_NAV_EVENT, onNav);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener(NOTIFICATION_NAV_EVENT, onNav);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const handleTargetChange = useCallback(
    (nextTicket: string | null, nextMessageId: string | null) => {
      setNavState((prev) => ({
        ticket: nextTicket,
        messageId: nextMessageId,
        navKey: prev.navKey,
      }));
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (nextTicket) {
          url.searchParams.set("ticket", nextTicket);
        } else {
          url.searchParams.delete("ticket");
        }
        if (nextMessageId) {
          url.searchParams.set("message", nextMessageId);
        } else {
          url.searchParams.delete("message");
        }
        pushUrlIfChanged(url.pathname + url.search + url.hash);
      }
    },
    []
  );

  const plumberAvatars: Record<string, string> = {};
  for (const p of plumbers) {
    if (p.avatar_url) {
      plumberAvatars[p.id] = p.avatar_url;
      if (p.full_name) {
        plumberAvatars[p.full_name.trim().toLowerCase()] = p.avatar_url;
      }
    }
  }

  return (
    <WhatsAppChatWorkspace
      actorRole="admin"
      actorId="admin"
      actorName="Operations Coordinator"
      requests={requests}
      initialMessages={messages}
      plumberAvatars={plumberAvatars}
      initialTicket={navState.ticket}
      initialMessageId={navState.messageId}
      navigationKey={navState.navKey}
      onTargetChange={handleTargetChange}
      emptyTitle="No service request conversations"
      emptyDescription="Messages from customers and assigned plumbers will appear here."
    />
  );
}
