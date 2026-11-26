import { NextResponse } from "next/server";
import { reportToOwner } from "@/lib/ai-workforce/owner-report";
import {
  defaultPublicAminaStore,
  sendBookingConfirmationEmail,
} from "@/lib/ai-workforce/public-amina";
import { recordTeamNote } from "@/lib/ai-workforce/team-memory";
import { createUniversalServiceRequest } from "@/lib/marketplace";
import { isValidCoordinate } from "@/lib/live-location";
import { resolvePortalActor } from "@/lib/portal-auth";
import { checkRateLimit } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

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
    customerLat?: number;
    customerLng?: number;
    customerLocationSource?: string;
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

  const hasValidGps =
    typeof body?.customerLat === "number" &&
    typeof body?.customerLng === "number" &&
    isValidCoordinate(body.customerLat, body.customerLng);

  if (hasValidGps) {
    const source =
      body?.customerLocationSource === "gps" || body?.customerLocationSource === "map_pin"
        ? body.customerLocationSource
        : "gps";
    try {
      const supabase = getServiceSupabase();
      const { error: gpsErr } = await supabase
        .from("service_requests")
        .update({
          customer_lat: body.customerLat,
          customer_lng: body.customerLng,
          customer_location_source: source,
          customer_location_updated_at: new Date().toISOString(),
        })
        .eq("id", created.id);
      if (gpsErr) {
        await supabase
          .from("service_requests")
          .update({
            customer_lat: body.customerLat,
            customer_lng: body.customerLng,
          })
          .eq("id", created.id);
      }
    } catch {
      // Non-fatal if live-location columns are not migrated yet
    }
  }

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

  const confirmMsg = `I've booked your request! Your ticket number is ${created.ticket_number}.${hasValidGps ? " Your GPS location is synced so your assigned plumber can navigate straight to you." : ""} You'll get an update by email and here in chat as soon as an approved plumber is assigned, and you can track your plumber's live GPS location online at /tracking?ticket=${created.ticket_number} once they start their trip.`;
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
