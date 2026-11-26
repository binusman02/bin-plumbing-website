import { NextResponse } from "next/server";
import {
  customerSessionToken,
  handleCustomerZainabTurn,
} from "@/lib/ai-workforce/customer-zainab";
import { defaultPublicAminaStore } from "@/lib/ai-workforce/public-amina";
import { withIncidentMonitor } from "@/lib/ai-workforce/incident-monitor";
import { resolvePortalActor } from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

export const GET = withIncidentMonitor("/api/customer/zainab/chat:GET", "customer", async () => {
  const actor = await resolvePortalActor("customer");
  if (!actor || actor.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = customerSessionToken(actor.id);
  const session = await defaultPublicAminaStore.findSessionByToken(token);
  if (!session) {
    return NextResponse.json({ ok: true, sessionToken: token, messages: [] });
  }
  const messages = await defaultPublicAminaStore.listMessages(session.id, 40);
  return NextResponse.json({ ok: true, sessionToken: token, messages });
});

export const POST = withIncidentMonitor(
  "/api/customer/zainab/chat:POST",
  "customer",
  async (request: Request) => {
  const actor = await resolvePortalActor("customer");
  if (!actor || actor.role !== "customer") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = await checkRateLimit("customer_zainab_chat", 25, 10 * 60 * 1000, actor.id);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Please wait ${rate.retryAfterSeconds}s before sending another message.` },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    source?: "text" | "voice";
    history?: Array<{ role: "customer" | "assistant"; content: string; source?: "text" | "voice" }>;
  };
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Please write or record a message." }, { status: 400 });
  }

  const result = await handleCustomerZainabTurn({
    customerId: actor.id,
    customerName: actor.name || "Customer",
    customerMessage: message,
    source: body?.source === "voice" ? "voice" : "text",
    clientHistory: Array.isArray(body?.history) ? body.history : undefined,
  });

  return NextResponse.json({
    ok: true,
    sessionToken: result.sessionToken,
    reply: result.reply,
    messages: result.messages,
  });
});
