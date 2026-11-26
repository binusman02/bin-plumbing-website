import { NextResponse } from "next/server";
import { reportToOwner } from "@/lib/ai-workforce/owner-report";
import {
  defaultPublicAminaStore,
  sendBookingConfirmationEmail,
} from "@/lib/ai-workforce/public-amina";
import { recordTeamNote } from "@/lib/ai-workforce/team-memory";
import { createUniversalServiceRequest } from "@/lib/marketplace";
import { resolvePortalActor } from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

const COOKIE_NAME = "fg_amina_session";

function readToken(request: Request, bodyToken?: string): string | null {
  if (bodyToken && /^amina_[a-zA-Z0-9_-]{8,}$/.test(bodyToken.trim())) {
    return bodyToken.trim();
  }
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === COOKIE_NAME) {
      const val = decodeURIComponent(rest.join("=") || "").trim();
      if (/^amina_[a-zA-Z0-9_-]{8,}$/.test(val)) return val;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const rate = await checkRateLimit("public_amina_book", 5, 10 * 60 * 1000);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Too many bookings submitted. Please wait ${rate.retryAfterSeconds}s and try again.`,
      },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    sessionToken?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    state?: string;
    cityOrLga?: string;
    address?: string;
    problemType?: string;
    issueSummary?: string;
    urgency?: string;
  };

  const fullName = String(body?.fullName || "").trim();
  const phone = String(body?.phone || "").trim();
  const email = String(body?.email || "").trim();
  const state = String(body?.state || "Kano State").trim();
  const cityOrLga = String(body?.cityOrLga || "").trim();
  const address = String(body?.address || "").trim();
  const problemType = String(body?.problemType || "General Plumbing").trim();
  const issueSummary = String(body?.issueSummary || "").trim();
  const urgency = body?.urgency === "urgent" ? "urgent" : "standard";

  if (!fullName || !phone || !email || !cityOrLga || !address || !issueSummary) {
    return NextResponse.json(
      {
        error:
          "Please complete Full Name, Phone, Email (for plumber updates), Area/LGA, Address, and Issue description.",
      },
      { status: 400 }
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address so we can notify you when a plumber is assigned." },
      { status: 400 }
    );
  }

  const customerActor = await resolvePortalActor("customer").catch(() => null);
  const created = await createUniversalServiceRequest({
    priority: urgency,
    propertyType: "Residential / Home",
    state,
    cityLga: cityOrLga,
    address,
    problemCategory: problemType,
    issueDescription: issueSummary,
    customerId: customerActor?.id,
    customerName: fullName,
    customerPhone: phone,
    customerEmail: email,
    createdByRole: "customer",
  });

  await sendBookingConfirmationEmail({
    email,
    customerName: fullName,
    ticketNumber: created.ticket_number,
    cityOrLga,
  });

  const session = await defaultPublicAminaStore.getOrCreateSession(
    readToken(request, body?.sessionToken)
  );
  await defaultPublicAminaStore.updateSession(session.id, {
    visitorName: fullName,
    visitorPhone: phone,
    visitorEmail: email,
    ticketNumber: created.ticket_number,
    lastTopic: `Booked ${problemType} in ${cityOrLga}`,
  });

  const confirmMsg = `I've booked your request! Your ticket number is ${created.ticket_number}. Our coordinator is reviewing approved technicians in ${cityOrLga}, and you'll get an update by email and right here in this chat as soon as a plumber is assigned.`;
  const confirmRecord = await defaultPublicAminaStore.appendMessage({
    sessionId: session.id,
    role: "assistant",
    content: confirmMsg,
    source: "text",
  });

  await recordTeamNote({
    fromAgent: "sales_ai",
    toAgent: "operations_manager",
    ticketNumber: created.ticket_number,
    note: `Amina booked website request ${created.ticket_number} (${problemType} in ${cityOrLga}, ${urgency}) for ${fullName}.`,
  }).catch(() => {});

  await reportToOwner({
    agentId: "sales_ai",
    status: urgency === "urgent" ? "urgent" : "reported",
    urgent: urgency === "urgent",
    ticketNumber: created.ticket_number,
    summary: `Booked new website request ${created.ticket_number} for ${fullName} (${problemType} in ${cityOrLga}). Waiting for plumber approval.`,
    forceStoreReport: true,
  }).catch(() => {});

  const storedMessages = await defaultPublicAminaStore.listMessages(session.id, 40);
  const messages = storedMessages.length > 0 ? storedMessages : [confirmRecord];
  const res = NextResponse.json({
    ok: true,
    ticketNumber: created.ticket_number,
    trackingUrl: `/tracking?ticket=${encodeURIComponent(created.ticket_number)}`,
    sessionToken: session.sessionToken,
    confirmMessage: confirmMsg,
    messages,
  });

  res.cookies.set(COOKIE_NAME, session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
