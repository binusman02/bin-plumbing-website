"use server";

import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { checkRateLimit, isHoneypotTriggered, verifyTurnstileToken } from "@/lib/security";

export interface ContactEnquiryInput {
  fullName: string;
  phone: string;
  location: string;
  serviceType: string;
  message: string;
  website?: string;
  formLoadedAt?: number;
  turnstileToken?: string;
}

export async function submitContactEnquiry(data: ContactEnquiryInput) {
  try {
    if (isHoneypotTriggered(data.website)) {
      return { success: true };
    }

    if (data.formLoadedAt && Date.now() - data.formLoadedAt < 2000) {
      return { success: false, error: "Please take a moment before submitting the form." };
    }

    const rate = await checkRateLimit("contact_enquiry", 5, 10 * 60 * 1000);
    if (!rate.allowed) {
      return {
        success: false,
        error: `Too many messages sent. Please try again in ${rate.retryAfterSeconds} seconds.`,
      };
    }

    const turnstileOk = await verifyTurnstileToken(data.turnstileToken);
    if (!turnstileOk) {
      return { success: false, error: "Security verification failed. Please try again." };
    }

    const fullName = data.fullName?.trim() || "";
    const phone = data.phone?.trim() || "";
    const location = data.location?.trim() || "";
    const serviceType = data.serviceType?.trim() || "General Enquiry";
    const message = data.message?.trim() || "";

    if (!fullName || fullName.length < 2) {
      return { success: false, error: "Please enter your full name." };
    }

    if (!phone || phone.replace(/[^0-9+]/g, "").length < 7) {
      return { success: false, error: "Please enter a valid phone number." };
    }

    if (!location) {
      return { success: false, error: "Please select or enter your location." };
    }

    if (!message || message.length < 10) {
      return { success: false, error: "Please enter a brief message (at least 10 characters)." };
    }

    const supabase = getServiceSupabase();
    const { data: inserted, error } = await supabase
      .from("enquiries")
      .insert({
        name: fullName,
        phone,
        email: "",
        subject: `${serviceType} (${location})`,
        message,
        status: "unread",
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error inserting enquiry:", error);
      return { success: false, error: "Database error occurred while submitting." };
    }

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      type: "enquiry_submitted",
      title: "New direct enquiry",
      body: `${fullName} (${location}) submitted a ${serviceType} enquiry.`,
      entityType: "enquiry",
      entityId: inserted?.id ? String(inserted.id) : "",
      destination: "/admin/enquiries",
      dedupeKey: inserted?.id ? `enquiry:${inserted.id}` : undefined,
    });

    revalidatePath("/admin/enquiries");
    revalidatePath("/admin");
    return { success: true };
  } catch (err: unknown) {
    console.error("Server Action Exception (Enquiry):", err);
    return { success: false, error: "An unexpected error occurred." };
  }
}
