"use server";

import { revalidatePath } from "next/cache";
import { isValidCoordinate } from "@/lib/live-location";
import { createUniversalServiceRequest } from "@/lib/marketplace";
import { resolvePortalActor } from "@/lib/portal-auth";
import { checkRateLimit, isHoneypotTriggered, verifyTurnstileToken } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

export interface ServiceRequestInput {
  fullName: string;
  phone: string;
  email?: string;
  state: string;
  cityOrLga: string;
  neighbourhood?: string;
  address: string;
  problemType: string;
  issueSummary: string;
  urgency: "standard" | "urgent";
  preferredDate?: string;
  preferredTime?: string;
  consentPrivacy: boolean;
  photos?: string[];
  website?: string;
  turnstileToken?: string;
  customerLat?: number;
  customerLng?: number;
  customerLocationSource?: "gps" | "map_pin" | "address_only";
}

export async function submitServiceRequest(data: ServiceRequestInput) {
  try {
    if (isHoneypotTriggered(data.website)) {
      return { success: true, ticketNumber: "BP-SUBMITTED", phone: data.phone || "" };
    }

    const rate = await checkRateLimit("service_request", 5, 10 * 60 * 1000);
    if (!rate.allowed) {
      return {
        success: false,
        error: `Too many requests submitted. Please wait ${rate.retryAfterSeconds} seconds and try again.`,
      };
    }

    const turnstileOk = await verifyTurnstileToken(data.turnstileToken);
    if (!turnstileOk) {
      return { success: false, error: "Security verification failed. Please try again." };
    }

    if (
      !data.fullName?.trim() ||
      !data.phone?.trim() ||
      !data.address?.trim() ||
      !data.issueSummary?.trim()
    ) {
      return {
        success: false,
        error:
          "Please fill in all mandatory fields (Full Name, Phone, Address, and Problem Description).",
      };
    }

    if (!data.consentPrivacy) {
      return {
        success: false,
        error: "You must consent to the privacy policy to submit a request.",
      };
    }

    const customerActor = await resolvePortalActor("customer").catch(() => null);

    const created = await createUniversalServiceRequest({
      priority: data.urgency === "urgent" ? "urgent" : "standard",
      propertyType: "Residential / Home",
      address: `${data.address.trim()}${data.neighbourhood ? `, ${data.neighbourhood.trim()}` : ""}`,
      state: data.state?.trim() || undefined,
      cityLga: data.cityOrLga?.trim() || "",
      neighbourhood: data.neighbourhood?.trim() || "",
      preferredTiming: `${data.preferredDate || "Earliest"} ${data.preferredTime || ""}`.trim(),
      preferredDate: data.preferredDate || undefined,
      problemCategory: data.problemType?.trim() || "General Plumbing",
      issueDescription: data.issueSummary.trim(),
      customerId: customerActor?.id,
      customerName: data.fullName.trim(),
      customerPhone: data.phone.trim(),
      customerEmail: data.email?.trim() || undefined,
      photos: Array.isArray(data.photos) ? data.photos.slice(0, 5) : undefined,
    });

    if (
      typeof data.customerLat === "number" &&
      typeof data.customerLng === "number" &&
      isValidCoordinate(data.customerLat, data.customerLng)
    ) {
      const source =
        data.customerLocationSource === "gps" || data.customerLocationSource === "map_pin"
          ? data.customerLocationSource
          : "map_pin";
      const nowIso = new Date().toISOString();
      try {
        const supabase = getServiceSupabase();
        const { error } = await supabase
          .from("service_requests")
          .update({
            customer_lat: data.customerLat,
            customer_lng: data.customerLng,
            customer_location_source: source,
            customer_location_updated_at: nowIso,
          })
          .eq("id", created.id);
        if (error) {
          await supabase
            .from("service_requests")
            .update({
              customer_lat: data.customerLat,
              customer_lng: data.customerLng,
            })
            .eq("id", created.id);
        }
      } catch {
        // Ignore if live-location columns are not migrated yet
      }
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/customer");

    return {
      success: true,
      ticketNumber: created.ticket_number,
      phone: data.phone.trim(),
      message:
        "Your plumbing request has been received. Our coordination team will review and contact you.",
    };
  } catch (err: unknown) {
    console.error("Server Action Exception (Service Request):", err);
    return { success: false, error: "An unexpected error occurred while saving your request." };
  }
}
