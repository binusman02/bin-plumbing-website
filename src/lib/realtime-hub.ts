"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { JobMessage } from "@/lib/marketplace";

const CHANNEL_NAME = "bin-plumbing-live";

export interface RealtimePresencePayload {
  role: "admin" | "plumber" | "customer";
  userId?: string;
  isAvailable?: boolean;
}

export interface RealtimeHubOptions {
  role: "admin" | "plumber" | "customer";
  userId?: string;
  isAvailable?: boolean;
  enabled?: boolean;
  onMessage?: (msg: JobMessage) => void;
  onMessageSignal?: (data: { ticketNumber: string }) => void;
  onRead?: (data: { ticketNumber: string; viewerRole: "admin" | "plumber" | "customer" }) => void;
  onDelivered?: (data: { ticketNumber: string; viewerRole: "admin" | "plumber" | "customer" }) => void;
  onTyping?: (data: { ticketNumber: string; senderRole: "admin" | "plumber" | "customer"; senderName: string; isTyping: boolean }) => void;
  onMessageDeleted?: (data: { messageId: string; mode: "for_me" | "for_everyone" }) => void;
  onAvailability?: (data: { plumberId: string; isAvailable: boolean }) => void;
  onAdminSignal?: () => void;
  onNotificationSync?: (data: { recipientRole?: string }) => void;
  onDataSync?: (data: { entity?: string; ticketNumber?: string }) => void;
  /**
   * "A plumber's location changed" signal. It carries NO coordinates and no personal
   * data; authorised viewers re-fetch through /api/tracking/snapshot.
   */
  onLocationSignal?: (data: { ticketNumbers: string[] }) => void;
  onConnectionChange?: (connected: boolean) => void;
  onPresenceSync?: (online: {
    adminOnline: boolean;
    plumberOnline: boolean;
    customerOnline: boolean;
    onlinePlumberIds: string[];
    onlineCustomerIds: string[];
    availabilityUpdates: Record<string, boolean>;
  }) => void;
}

let sharedChannel: RealtimeChannel | null = null;
let sharedSubscribed = false;
let latestPresencePayload: RealtimePresencePayload | null = null;
const pendingBroadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
const hubListeners = new Set<{ current: RealtimeHubOptions }>();
const locationSignalListeners = new Set<(data: { ticketNumbers: string[] }) => void>();
const connectionListeners = new Set<(connected: boolean) => void>();

function computePresenceSummary(ch: RealtimeChannel) {
  const state = ch.presenceState<RealtimePresencePayload>();
  let adminOnline = false;
  let plumberOnline = false;
  let customerOnline = false;
  const onlinePlumberIds: string[] = [];
  const onlineCustomerIds: string[] = [];
  const availabilityUpdates: Record<string, boolean> = {};

  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (entry.role === "admin") adminOnline = true;
      if (entry.role === "plumber") {
        plumberOnline = true;
        if (entry.userId) {
          if (!onlinePlumberIds.includes(entry.userId)) {
            onlinePlumberIds.push(entry.userId);
          }
          if (typeof entry.isAvailable === "boolean") {
            availabilityUpdates[entry.userId] = entry.isAvailable;
          }
        }
      }
      if (entry.role === "customer") {
        customerOnline = true;
        if (entry.userId && !onlineCustomerIds.includes(entry.userId)) {
          onlineCustomerIds.push(entry.userId);
        }
      }
    }
  }

  return {
    adminOnline,
    plumberOnline,
    customerOnline,
    onlinePlumberIds,
    onlineCustomerIds,
    availabilityUpdates,
  };
}

function getSharedChannel(): RealtimeChannel | null {
  if (typeof window === "undefined") return null;
  if (!sharedChannel) {
    const supabase = createClient();
    for (const existing of supabase.getChannels()) {
      if (existing.topic === `realtime:${CHANNEL_NAME}`) {
        void supabase.removeChannel(existing);
      }
    }
    sharedSubscribed = false;
    const ch = supabase.channel(CHANNEL_NAME, {
      config: { broadcast: { self: false } },
    });

    const handlePresence = () => {
      const summary = computePresenceSummary(ch);
      for (const listener of hubListeners) {
        listener.current.onPresenceSync?.(summary);
      }
    };

    ch.on("presence", { event: "sync" }, handlePresence)
      .on("presence", { event: "join" }, handlePresence)
      .on("presence", { event: "leave" }, handlePresence)
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        if (payload?.ticketNumber) {
          const ticketNumber = String(payload.ticketNumber);
          for (const listener of hubListeners) {
            listener.current.onMessageSignal?.({ ticketNumber });
          }
        }
      })
      .on("broadcast", { event: "messages_read" }, ({ payload }) => {
        if (payload?.ticketNumber && payload?.viewerRole) {
          const data = {
            ticketNumber: String(payload.ticketNumber),
            viewerRole: payload.viewerRole as "admin" | "plumber" | "customer",
          };
          for (const listener of hubListeners) {
            listener.current.onRead?.(data);
          }
        }
      })
      .on("broadcast", { event: "plumber_availability" }, ({ payload }) => {
        if (payload?.plumberId && typeof payload?.isAvailable === "boolean") {
          const data = {
            plumberId: String(payload.plumberId),
            isAvailable: Boolean(payload.isAvailable),
          };
          for (const listener of hubListeners) {
            listener.current.onAvailability?.(data);
          }
        }
      })
      .on("broadcast", { event: "admin_signal" }, () => {
        for (const listener of hubListeners) {
          listener.current.onAdminSignal?.();
          listener.current.onNotificationSync?.({ recipientRole: "admin" });
        }
      })
      .on("broadcast", { event: "notification_sync" }, ({ payload }) => {
        const data = {
          recipientRole: typeof payload?.recipientRole === "string" ? payload.recipientRole : undefined,
        };
        for (const listener of hubListeners) {
          listener.current.onNotificationSync?.(data);
        }
      })
      .on("broadcast", { event: "messages_delivered" }, ({ payload }) => {
        if (payload?.ticketNumber && payload?.viewerRole) {
          const data = {
            ticketNumber: String(payload.ticketNumber),
            viewerRole: payload.viewerRole as "admin" | "plumber" | "customer",
          };
          for (const listener of hubListeners) {
            listener.current.onDelivered?.(data);
          }
        }
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload?.ticketNumber && payload?.senderRole) {
          const data = {
            ticketNumber: String(payload.ticketNumber),
            senderRole: payload.senderRole as "admin" | "plumber" | "customer",
            senderName: String(payload.senderName || ""),
            isTyping: Boolean(payload.isTyping),
          };
          for (const listener of hubListeners) {
            listener.current.onTyping?.(data);
          }
        }
      })
      .on("broadcast", { event: "message_deleted" }, ({ payload }) => {
        if (payload?.messageId) {
          const data = {
            messageId: String(payload.messageId),
            mode: (payload.mode === "for_everyone" ? "for_everyone" : "for_me") as "for_me" | "for_everyone",
          };
          for (const listener of hubListeners) {
            listener.current.onMessageDeleted?.(data);
          }
        }
      })
      .on("broadcast", { event: "location_update" }, ({ payload }) => {
        const raw = Array.isArray(payload?.ticketNumbers) ? payload.ticketNumbers : [];
        const ticketNumbers = raw
          .filter((t: unknown): t is string => typeof t === "string")
          .slice(0, 20);
        for (const listener of hubListeners) {
          listener.current.onLocationSignal?.({ ticketNumbers });
        }
        for (const cb of locationSignalListeners) cb({ ticketNumbers });
      })
      .on("broadcast", { event: "data_sync" }, ({ payload }) => {
        const data = {
          entity: typeof payload?.entity === "string" ? payload.entity : undefined,
          ticketNumber: typeof payload?.ticketNumber === "string" ? payload.ticketNumber : undefined,
        };
        for (const listener of hubListeners) {
          listener.current.onDataSync?.(data);
          listener.current.onAdminSignal?.();
        }
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const ticketNumber = typeof row.ticket_number === "string" ? row.ticket_number : "";
          if (!ticketNumber) return;
          for (const listener of hubListeners) {
            listener.current.onMessageSignal?.({ ticketNumber });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const recipientRole = typeof row.recipient_role === "string" ? row.recipient_role : undefined;
          for (const listener of hubListeners) {
            listener.current.onNotificationSync?.({ recipientRole });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_requests" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const ticketNumber = typeof row.ticket_number === "string" ? row.ticket_number : undefined;
          for (const listener of hubListeners) {
            listener.current.onDataSync?.({ entity: "service_requests", ticketNumber });
            listener.current.onAdminSignal?.();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotations" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const ticketNumber = typeof row.ticket_number === "string" ? row.ticket_number : undefined;
          for (const listener of hubListeners) {
            listener.current.onDataSync?.({ entity: "quotations", ticketNumber });
            listener.current.onAdminSignal?.();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        (payload) => {
          const row = (payload.new || payload.old || {}) as Record<string, unknown>;
          const ticketNumber = typeof row.ticket_number === "string" ? row.ticket_number : undefined;
          for (const listener of hubListeners) {
            listener.current.onDataSync?.({ entity: "payments", ticketNumber });
            listener.current.onAdminSignal?.();
          }
        }
      );

    sharedChannel = ch;
    ch.subscribe(async (status) => {
      const connected = status === "SUBSCRIBED";
      if (sharedSubscribed !== connected) {
        sharedSubscribed = connected;
        for (const listener of hubListeners) {
          listener.current.onConnectionChange?.(connected);
        }
        for (const cb of connectionListeners) cb(connected);
      }
      if (status === "SUBSCRIBED") {
        if (latestPresencePayload) {
          await ch.track(latestPresencePayload);
        }
        while (pendingBroadcasts.length > 0) {
          const next = pendingBroadcasts.shift();
          if (next) {
            void ch.send({
              type: "broadcast",
              event: next.event,
              payload: next.payload,
            });
          }
        }
      }
    });
  }
  return sharedChannel;
}

export function broadcastRealtimeEvent(
  event:
    | "new_message"
    | "messages_read"
    | "messages_delivered"
    | "typing"
    | "message_deleted"
    | "plumber_availability"
    | "admin_signal"
    | "notification_sync"
    | "location_update"
    | "data_sync",
  payload: Record<string, unknown>
): void {
  try {
    const ch = getSharedChannel();
    if (!ch) return;
    if (!sharedSubscribed) {
      if (pendingBroadcasts.length < 20) {
        pendingBroadcasts.push({ event, payload });
      }
      return;
    }
    void ch.send({
      type: "broadcast",
      event,
      payload,
    });
  } catch {
    // Ignore transient broadcast errors
  }
}

export function isRealtimeConnected(): boolean {
  return sharedSubscribed;
}

/**
 * Subscribe to location-changed signals without touching presence tracking.
 * Signals contain no coordinates; call /api/tracking/snapshot to read data.
 */
export function subscribeLocationSignals(
  onSignal: (data: { ticketNumbers: string[] }) => void,
  onConnection?: (connected: boolean) => void
): () => void {
  locationSignalListeners.add(onSignal);
  if (onConnection) connectionListeners.add(onConnection);
  getSharedChannel(); // make sure the shared channel exists/subscribes
  if (onConnection) onConnection(sharedSubscribed);
  return () => {
    locationSignalListeners.delete(onSignal);
    if (onConnection) connectionListeners.delete(onConnection);
  };
}

export function useRealtimeHub(options: RealtimeHubOptions) {
  const { role, userId, isAvailable, enabled = true } = options;
  const callbacksRef = useRef(options);

  useEffect(() => {
    callbacksRef.current = options;
  });

  useEffect(() => {
    if (!enabled) return;
    hubListeners.add(callbacksRef);

    latestPresencePayload = {
      role,
      userId,
      isAvailable,
    };

    const ch = getSharedChannel();
    if (ch && sharedSubscribed) {
      void ch.track(latestPresencePayload);
      callbacksRef.current.onPresenceSync?.(computePresenceSummary(ch));
    }

    return () => {
      hubListeners.delete(callbacksRef);
    };
  }, [enabled, role, userId, isAvailable]);
}
