import type { ChatPresenceState } from "@/components/chat/ChatAttachment";

export interface ThreadPresenceSummary {
  isOnline: boolean;
  adminOnline: boolean;
  plumberOnline: boolean;
  customerOnline: boolean;
  statusText: string;
}

export function mergePresenceSnapshots(
  rt: ChatPresenceState,
  server: ChatPresenceState
): ChatPresenceState {
  const onlineAdminIds = Array.from(
    new Set([...(rt.onlineAdminIds || []), ...(server.onlineAdminIds || [])])
  );
  const onlinePlumberIds = Array.from(
    new Set([...(rt.onlinePlumberIds || []), ...(server.onlinePlumberIds || [])])
  );
  const onlineCustomerIds = Array.from(
    new Set([...(rt.onlineCustomerIds || []), ...(server.onlineCustomerIds || [])])
  );

  return {
    adminOnline: Boolean(rt.adminOnline || server.adminOnline || onlineAdminIds.length > 0),
    plumberOnline: Boolean(rt.plumberOnline || server.plumberOnline || onlinePlumberIds.length > 0),
    customerOnline: Boolean(rt.customerOnline || server.customerOnline || onlineCustomerIds.length > 0),
    onlineAdminIds,
    onlinePlumberIds,
    onlineCustomerIds,
    lastSeenMap: server.lastSeenMap || rt.lastSeenMap || {},
  };
}

export function resolveThreadPresenceStatus(params: {
  actorRole: "admin" | "customer" | "plumber";
  assignedPlumberId?: string | null;
  customerId?: string | null;
  presence: ChatPresenceState;
}): ThreadPresenceSummary {
  const { actorRole, assignedPlumberId, customerId, presence } = params;
  const adminOnline = Boolean(presence.adminOnline);
  const plumberOnline = Boolean(
    assignedPlumberId && presence.onlinePlumberIds.includes(assignedPlumberId)
  );
  const customerOnline = Boolean(
    customerId && presence.onlineCustomerIds.includes(customerId)
  );

  if (actorRole === "customer") {
    if (adminOnline && plumberOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Admin & Plumber online",
      };
    }
    if (adminOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Admin online",
      };
    }
    if (plumberOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Plumber online",
      };
    }
    return {
      isOnline: false,
      adminOnline,
      plumberOnline,
      customerOnline,
      statusText: "Offline",
    };
  }

  if (actorRole === "plumber") {
    if (adminOnline && customerOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Admin & Customer online",
      };
    }
    if (adminOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Admin online",
      };
    }
    if (customerOnline) {
      return {
        isOnline: true,
        adminOnline,
        plumberOnline,
        customerOnline,
        statusText: "Customer online",
      };
    }
    return {
      isOnline: false,
      adminOnline,
      plumberOnline,
      customerOnline,
      statusText: "Offline",
    };
  }

  // Admin viewer
  if (customerOnline && plumberOnline) {
    return {
      isOnline: true,
      adminOnline,
      plumberOnline,
      customerOnline,
      statusText: "Customer & Plumber online",
    };
  }
  if (customerOnline) {
    return {
      isOnline: true,
      adminOnline,
      plumberOnline,
      customerOnline,
      statusText: "Customer online",
    };
  }
  if (plumberOnline) {
    return {
      isOnline: true,
      adminOnline,
      plumberOnline,
      customerOnline,
      statusText: "Plumber online",
    };
  }
  return {
    isOnline: false,
    adminOnline,
    plumberOnline,
    customerOnline,
    statusText: "Offline",
  };
}
