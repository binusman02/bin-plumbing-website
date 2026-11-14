"use client";

import { useSearchParams } from "next/navigation";
import { WhatsAppChatWorkspace } from "@/components/chat/WhatsAppChatWorkspace";
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
}: CommunicationsManagerClientProps) {
  const searchParams = useSearchParams();
  const initialTicket = searchParams.get("ticket");

  return (
    <WhatsAppChatWorkspace
      actorRole="admin"
      actorId="admin"
      actorName="Operations Coordinator"
      requests={requests}
      initialMessages={messages}
      initialTicket={initialTicket}
      emptyTitle="No service request conversations"
      emptyDescription="Messages from customers and assigned plumbers will appear here."
    />
  );
}
