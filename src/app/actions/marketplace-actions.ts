"use server";

import path from "path";
import { revalidatePath } from "next/cache";
import {
  createPlumberApplication,
  updatePlumberVerification,
  updatePlumberAvailability,
  submitStructuredQuotation,
  setCustomerQuotationApproval,
  recordPayment,
  postJobMessage,
  type ChatAttachment,
  getMarketplaceSettings,
  updateMarketplaceSettings,
  updateServiceRequest,
  registerCustomer,
  getCustomerByPhoneOrId,
  verifyPaymentById,
  deleteCustomerById,
  createComplaint,
  updateComplaintStatus,
  saveEnquiryNoteAndStatus,
  updatePlumberChecklistAndNotes,
  addGalleryItem,
  toggleGalleryPublish,
  deleteGalleryItem,
  editJobMessageById,
  appendAuditLog,
  submitReview,
  moderateReview,
  upsertGuide,
  type PlumberVerificationStatus,
  type RequestStatus,
  type PlumberDocument,
  type ComplaintRecord,
} from "@/lib/marketplace";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  checkRateLimit,
  requireAdminUser,
  verifyTurnstileToken,
} from "@/lib/security";
import { createNotification } from "@/lib/notifications";
import {
  getAuthorizedRecipients,
  resolveChatActor,
  verifyTicketAccess,
} from "@/lib/chat-auth";

const ALLOWED_DOC_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

async function savePrivatePlumberFile(
  file: File,
  folderName: string
): Promise<PlumberDocument> {
  const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
  const safeBase = sanitizeFileName(path.basename(file.name, path.extname(file.name)));
  const safeName = `${Date.now().toString(36)}-${safeBase || "doc"}${ext}`;
  const storagePath = `${folderName}/${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  const adminSupabase = getServiceSupabase();
  const { error } = await adminSupabase.storage
    .from("plumber-documents")
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload document ${file.name}: ${error.message}`);
  }

  return {
    name: file.name,
    type: mimeType,
    size: file.size,
    storage_path: storagePath,
    url: `/api/admin/plumber-file?path=${encodeURIComponent(storagePath)}`,
  };
}

export async function submitPlumberApplicationAction(formData: FormData) {
  try {
    const honeypot = (formData.get("website") as string) || "";
    if (honeypot.trim().length > 0) {
      return { success: true, applicationRef: "PA-SUBMITTED" };
    }

    const formLoadedAt = Number(formData.get("formLoadedAt") || 0);
    if (formLoadedAt && Date.now() - formLoadedAt < 2000) {
      return { success: false, error: "Please take a moment before submitting your application." };
    }

    const rate = await checkRateLimit("plumber_application", 5, 10 * 60 * 1000);
    if (!rate.allowed) {
      return {
        success: false,
        error: `Too many applications submitted. Please wait ${rate.retryAfterSeconds} seconds.`,
      };
    }

    const turnstileToken = (formData.get("turnstileToken") as string) || undefined;
    if (!(await verifyTurnstileToken(turnstileToken))) {
      return { success: false, error: "Security verification failed. Please try again." };
    }

    const fullName = (formData.get("fullName") as string)?.trim() || "";
    const phone = (formData.get("phone") as string)?.trim() || "";
    const email = (formData.get("email") as string)?.trim() || "";
    const residentialLocation = (formData.get("residentialLocation") as string)?.trim() || "";
    const preferredLocationsStr = (formData.get("preferredLocations") as string) || "";
    const skillsStr = (formData.get("skills") as string) || "";
    const experienceYears = Number(formData.get("experienceYears")) || 1;
    const experienceDetails = (formData.get("experienceDetails") as string)?.trim() || "";
    const referencesInfo = (formData.get("referencesInfo") as string)?.trim() || "";
    const availability = (formData.get("availability") as string)?.trim() || "";
    const consentPrivacy = formData.get("consentPrivacy") === "true";

    if (!fullName || fullName.length < 2) {
      return { success: false, error: "Please enter your full name." };
    }
    const compactPhone = phone.replace(/[\s()-]/g, "");
    if (!/^(?:\+?234|0)[789][01]\d{8}$/.test(compactPhone)) {
      return { success: false, error: "Please enter a valid Nigerian phone number (e.g. 0806 329 8575)." };
    }
    if (!email || !email.includes("@")) {
      return { success: false, error: "A valid email address is required for onboarding and portal sign-in." };
    }
    if (!residentialLocation) {
      return { success: false, error: "Please enter your residential location." };
    }
    if (!availability) {
      return { success: false, error: "Please specify your availability (days and times or full-time/part-time)." };
    }
    if (!consentPrivacy) {
      return { success: false, error: "Please agree to the Privacy Notice before submitting." };
    }

    const uploadFolder = `app-${Date.now().toString(36)}`;
    const uploadedDocs: PlumberDocument[] = [];

    const idFile = formData.get("idDocument") as File | null;
    if (idFile && idFile.size > 0) {
      if (!ALLOWED_DOC_TYPES.has(idFile.type) || idFile.size > MAX_FILE_BYTES) {
        return { success: false, error: "ID document must be JPG, PNG, WEBP, or PDF under 5MB." };
      }
      const doc = await savePrivatePlumberFile(idFile, uploadFolder);
      uploadedDocs.push({ ...doc, type: "id_card" });
    }

    const certFile = formData.get("tradeCertificate") as File | null;
    if (certFile && certFile.size > 0) {
      if (!ALLOWED_DOC_TYPES.has(certFile.type) || certFile.size > MAX_FILE_BYTES) {
        return { success: false, error: "Trade certificate must be JPG, PNG, WEBP, or PDF under 5MB." };
      }
      const doc = await savePrivatePlumberFile(certFile, uploadFolder);
      uploadedDocs.push({ ...doc, type: "certificate" });
    }

    const workPhotos = formData.getAll("workPhotos") as File[];
    for (const photo of workPhotos) {
      if (photo && photo.size > 0) {
        if (!ALLOWED_PHOTO_TYPES.has(photo.type) || photo.size > MAX_FILE_BYTES) {
          return { success: false, error: "Work photos must be JPG, PNG, or WEBP under 5MB each." };
        }
        const doc = await savePrivatePlumberFile(photo, uploadFolder);
        uploadedDocs.push({ ...doc, type: "photo" });
      }
    }

    const preferredLocations = preferredLocationsStr
      ? preferredLocationsStr.split(",").map((s) => s.trim()).filter(Boolean)
      : [residentialLocation];

    const skills = skillsStr
      ? skillsStr.split(",").map((s) => s.trim()).filter(Boolean)
      : ["General Plumbing"];

    const applicant = await createPlumberApplication({
      full_name: fullName,
      phone,
      email,
      residential_location: residentialLocation,
      preferred_locations: preferredLocations,
      skills,
      experience_years: experienceYears,
      experience_details: experienceDetails,
      references_info: referencesInfo,
      availability,
      documents: uploadedDocs,
      is_available: true,
      notes: `Availability: ${availability}`,
    });

    await appendAuditLog({
      actor: fullName,
      action: "Submitted Plumber Application",
      entity_type: "plumber",
      entity_id: applicant.id,
      new_value: applicant.application_ref,
    });

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      type: "plumber_application",
      title: `New Plumber Application: ${fullName}`,
      body: `${residentialLocation} • ${applicant.application_ref}`,
      entityType: "plumber",
      entityId: applicant.id,
      destination: "/admin/plumbers",
    });

    revalidatePath("/admin/plumbers");
    revalidatePath("/admin");

    return {
      success: true,
      message: "Application submitted successfully. Our operations team will review your details.",
      applicantId: applicant.id,
      applicationRef: applicant.application_ref,
    };
  } catch (err: any) {
    console.error("Plumber application error:", err);
    return { success: false, error: err.message || "Failed to submit application." };
  }
}

export async function updatePlumberStatusAction(
  plumberId: string,
  status: PlumberVerificationStatus,
  notes?: string
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };

    const ok = await updatePlumberVerification(plumberId, status, notes);
    if (!ok) return { success: false, error: "Plumber not found." };

    revalidatePath("/admin/plumbers");
    revalidatePath("/admin");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function togglePlumberAvailabilityAction(
  plumberId: string,
  isAvailable: boolean
) {
  try {
    const admin = await requireAdminUser();
    const plumberActor = admin ? null : await resolveChatActor("plumber");
    if (!admin && (!plumberActor || plumberActor.id !== plumberId)) {
      return { success: false, error: "Unauthorized." };
    }

    const ok = await updatePlumberAvailability(plumberId, isAvailable);
    if (!ok) return { success: false, error: "Plumber not found." };

    revalidatePath("/admin");
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin/requests");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function assignPlumberToRequestAction(params: {
  ticketNumber: string;
  plumberId: string;
  plumberName: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };

    await updateServiceRequest(
      params.ticketNumber,
      {
        assigned_technician: params.plumberName,
        assigned_plumber_id: params.plumberId,
        status: "contacted",
      },
      {
        actor: admin.fullName,
        action: `Assigned plumber ${params.plumberName}`,
      }
    );

    // 3. Post system audit message
    await postJobMessage({
      requestId: params.ticketNumber,
      ticketNumber: params.ticketNumber,
      senderRole: "admin",
      senderName: "Operations Coordinator",
      recipientRole: "customer",
      message: `Plumber Assigned: ${params.plumberName} has been assigned to coordinate your inspection and quotation.`,
    });

    await createNotification({
      recipientId: params.plumberId,
      recipientRole: "plumber",
      type: "job_assigned",
      title: `Job Assigned: ${params.ticketNumber}`,
      body: `Assigned by ${admin.fullName}. Open Jobs & Assignments to coordinate inspection.`,
      entityType: "service_request",
      entityId: params.ticketNumber,
      destination: `/plumber?tab=jobs&ticket=${params.ticketNumber}`,
    });

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id")
      .eq("ticket_number", params.ticketNumber)
      .maybeSingle();
    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        type: "plumber_assigned",
        title: `Plumber Assigned: ${params.ticketNumber}`,
        body: `${params.plumberName} has been assigned to your service request.`,
        entityType: "service_request",
        entityId: params.ticketNumber,
        destination: `/customer?tab=requests&ticket=${params.ticketNumber}`,
      });
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin");
    revalidatePath("/tracking");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function claimServiceRequestAction(params: {
  ticketNumber: string;
  plumberId: string;
  plumberName: string;
}) {
  try {
    const admin = await requireAdminUser();
    const plumberActor = admin ? null : await resolveChatActor("plumber");
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized. Sign in as a verified plumber." };
    }

    const effectivePlumberId = admin ? params.plumberId : plumberActor!.id;
    const effectivePlumberName = admin ? params.plumberName : plumberActor!.name;

    const supabase = getServiceSupabase();
    const { data: existingReq } = await supabase
      .from("service_requests")
      .select("id, assigned_plumber_id, customer_id")
      .eq("ticket_number", params.ticketNumber)
      .maybeSingle();

    if (!existingReq) {
      return { success: false, error: "Service request not found." };
    }
    if (
      existingReq.assigned_plumber_id &&
      String(existingReq.assigned_plumber_id) !== effectivePlumberId &&
      !admin
    ) {
      return { success: false, error: "This job is already assigned to another plumber." };
    }

    await updateServiceRequest(
      params.ticketNumber,
      {
        assigned_technician: effectivePlumberName,
        assigned_plumber_id: effectivePlumberId,
        status: "scheduled",
      },
      {
        actor: effectivePlumberName,
        action: "Claimed job assignment",
      }
    );

    // 3. Post audit communication message
    await postJobMessage({
      requestId: String(existingReq.id),
      ticketNumber: params.ticketNumber,
      senderRole: "plumber",
      senderId: effectivePlumberId,
      senderName: effectivePlumberName,
      recipientRole: "customer",
      message: `Technician Accepted: ${effectivePlumberName} has claimed this dispatch and will coordinate inspection directly.`,
    });

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      type: "job_claimed",
      title: `Job Claimed: ${params.ticketNumber}`,
      body: `${effectivePlumberName} claimed dispatch ${params.ticketNumber}.`,
      entityType: "service_request",
      entityId: params.ticketNumber,
      destination: `/admin/requests?ticket=${params.ticketNumber}`,
      dedupeKey: `job_claimed:admin:${params.ticketNumber}:${effectivePlumberId}`,
    });
    if (existingReq.customer_id) {
      await createNotification({
        recipientId: String(existingReq.customer_id),
        recipientRole: "customer",
        type: "plumber_assigned",
        title: `Plumber Assigned: ${params.ticketNumber}`,
        body: `${effectivePlumberName} has been assigned to your service request.`,
        entityType: "service_request",
        entityId: params.ticketNumber,
        destination: `/customer?tab=requests&ticket=${params.ticketNumber}`,
        dedupeKey: `plumber_assigned:customer:${params.ticketNumber}:${effectivePlumberId}`,
      });
    }

    revalidatePath("/plumber");
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/tracking");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function submitQuotationAction(data: {
  requestId: string;
  ticketNumber: string;
  plumberId: string;
  plumberName: string;
  labourCharge: number;
  materialsCost: number;
  transportCharge: number;
  otherCharges: number;
  isSmallJob?: boolean;
  smallJobReason?: string;
  notes?: string;
}) {
  try {
    if (data.labourCharge <= 0) {
      return { success: false, error: "Labour / service charge must be greater than zero." };
    }

    const admin = await requireAdminUser();
    const plumberActor = admin ? null : await resolveChatActor("plumber");
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized. Sign in as the assigned plumber." };
    }

    if (plumberActor) {
      const ticketCtx = await verifyTicketAccess(plumberActor, data.ticketNumber || data.requestId);
      if (!ticketCtx) {
        return { success: false, error: "You are not assigned to this service request." };
      }
    }

    const verifiedPlumberId = admin ? data.plumberId : plumberActor!.id;
    const verifiedPlumberName = admin ? data.plumberName : plumberActor!.name;

    const quotation = await submitStructuredQuotation({
      ...data,
      plumberId: verifiedPlumberId,
      plumberName: verifiedPlumberName,
    });

    // Record customer-facing audit message
    await postJobMessage({
      requestId: data.requestId,
      ticketNumber: data.ticketNumber,
      senderRole: admin ? "admin" : "plumber",
      senderId: admin ? admin.userId : verifiedPlumberId,
      senderName: verifiedPlumberName,
      recipientRole: "customer",
      message: `📋 Quotation Sent to Customer: ${verifiedPlumberName} has prepared a quotation for customer review. Please review and approve on your customer portal.`,
      isInternal: false,
    });

    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/tracking");
    revalidatePath("/plumber");

    return { success: true, quotation };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function customerQuotationDecisionAction(
  quotationId: string,
  ticketNumber: string,
  decision: "approved" | "rejected"
) {
  try {
    const admin = await requireAdminUser();
    const customerActor = admin ? null : await resolveChatActor("customer");
    if (!admin && !customerActor) {
      return { success: false, error: "Authentication required to respond to a quotation." };
    }

    if (customerActor) {
      const ctx = await verifyTicketAccess(customerActor, ticketNumber);
      if (!ctx) {
        return { success: false, error: "You are not authorised to respond to this quotation." };
      }
    }

    const supabase = getServiceSupabase();
    const { data: quoteRow } = await supabase
      .from("quotations")
      .select("id, ticket_number, customer_approval_status")
      .eq("id", quotationId)
      .maybeSingle();

    if (!quoteRow || String(quoteRow.ticket_number) !== ticketNumber) {
      return { success: false, error: "Quotation record not found for this ticket." };
    }
    if (quoteRow.customer_approval_status !== "pending") {
      return { success: false, error: "This quotation has already been decided." };
    }

    const ok = await setCustomerQuotationApproval(quotationId, decision);
    if (!ok) return { success: false, error: "Quotation record not found." };

    await postJobMessage({
      requestId: ticketNumber,
      ticketNumber: ticketNumber,
      senderRole: "customer",
      senderId: customerActor?.id,
      senderName: customerActor?.name || "Client",
      recipientRole: "plumber",
      message:
        decision === "approved"
          ? `✅ Quotation Approved: Client has formally approved the itemised quotation. Technician is authorised to commence work.`
          : `⚠️ Quotation Revision Requested: Client declined the current quotation. Please contact client or update the estimate.`,
      isInternal: false,
    });

    revalidatePath("/tracking");
    revalidatePath("/customer");
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/financials");
    revalidatePath("/admin/communications");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateRequestStatusByTicketAction(
  ticketNumber: string,
  status: RequestStatus,
  notes?: string
) {
  try {
    const admin = await requireAdminUser();
    const plumberActor = admin ? null : await resolveChatActor("plumber");
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized." };
    }

    if (plumberActor) {
      const ctx = await verifyTicketAccess(plumberActor, ticketNumber);
      if (!ctx) {
        return { success: false, error: "You are not assigned to this service request." };
      }
      const allowedPlumberStatuses: RequestStatus[] = [
        "scheduled",
        "in_progress",
        "inspection_required",
        "quotation_submitted",
        "work_completed",
        "awaiting_final_payment",
      ];
      if (!allowedPlumberStatuses.includes(status)) {
        return { success: false, error: "Only administrators can set this request status." };
      }
    }

    const actorName = admin ? admin.fullName : plumberActor!.name;
    await updateServiceRequest(
      ticketNumber,
      {
        status,
        internal_notes: notes,
      },
      {
        actor: actorName,
        action: `Status updated to ${status}`,
        details: notes,
      }
    );

    await postJobMessage({
      requestId: ticketNumber,
      ticketNumber: ticketNumber,
      senderRole: admin ? "admin" : "plumber",
      senderId: admin ? admin.userId : plumberActor!.id,
      senderName: actorName,
      recipientRole: "customer",
      message: `Job status transitioned to: ${status.replace(/_/g, " ").toUpperCase()}${notes ? ` - ${notes}` : ""}`,
    });

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id, assigned_plumber_id")
      .eq("ticket_number", ticketNumber)
      .maybeSingle();

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        type: "status_updated",
        title: `Status Updated: ${ticketNumber}`,
        body: `Your request is now ${status.replace(/_/g, " ")}.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/customer?tab=requests&ticket=${ticketNumber}`,
      });
    }
    if (reqRow?.assigned_plumber_id) {
      await createNotification({
        recipientId: String(reqRow.assigned_plumber_id),
        recipientRole: "plumber",
        type: "status_updated",
        title: `Job Status Updated: ${ticketNumber}`,
        body: `Status changed to ${status.replace(/_/g, " ")}.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/plumber?tab=jobs&ticket=${ticketNumber}`,
      });
    }

    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/tracking");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function postCommunicationMessageAction(params: {
  requestId: string;
  ticketNumber: string;
  senderRole?: "customer" | "plumber" | "admin";
  senderName?: string;
  recipientRole?: "customer" | "plumber" | "admin";
  message: string;
  attachment?: ChatAttachment;
  isInternal?: boolean;
  replyToId?: string | null;
}) {
  try {
    if (!params.message?.trim() && !params.attachment) {
      return { success: false, error: "Message or file attachment is required." };
    }

    // Derive verified sender identity strictly from authenticated session
    const actor = await resolveChatActor(params.senderRole);
    if (!actor) {
      return { success: false, error: "Authentication required to send messages." };
    }

    const isInternal = Boolean(params.isInternal);
    if (isInternal && actor.role !== "admin") {
      return { success: false, error: "Only administrators can send internal notes." };
    }

    const ticketCtx = await verifyTicketAccess(actor, params.ticketNumber || params.requestId);
    if (!ticketCtx) {
      return { success: false, error: "You are not authorised to message on this service request." };
    }

    const recipients = getAuthorizedRecipients(ticketCtx, actor.role, isInternal);
    const primaryRecipient = recipients[0];

    const msg = await postJobMessage({
      requestId: ticketCtx.requestId,
      ticketNumber: ticketCtx.ticketNumber,
      senderRole: actor.role,
      senderName: actor.name,
      senderId: actor.id,
      recipientRole: primaryRecipient?.recipientRole || "admin",
      recipientId: primaryRecipient?.recipientId || null,
      recipients,
      message: params.message.trim(),
      attachment: params.attachment,
      isInternal,
      replyToId: params.replyToId || null,
    });

    revalidatePath("/tracking");
    revalidatePath("/customer");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/communications");
    revalidatePath("/plumber");
    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function editCommunicationMessageAction(params: {
  messageId: string;
  actorRole?: "admin" | "customer" | "plumber";
  newMessage: string;
}) {
  try {
    const actor = await resolveChatActor(params.actorRole);
    if (!actor) return { success: false, error: "Unauthorized" };
    if (!params.newMessage?.trim()) return { success: false, error: "Message text is required." };

    const updated = await editJobMessageById({
      messageId: params.messageId,
      actorId: actor.id,
      actorRole: actor.role,
      newMessage: params.newMessage.trim(),
    });
    if (!updated) {
      return { success: false, error: "Message not found or permission denied." };
    }
    return { success: true, message: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not edit message." };
  }
}

export async function recordPaymentReconciliationAction(params: {
  requestId: string;
  ticketNumber: string;
  customerName: string;
  totalPayment: number;
  labourPortion: number;
  materialsPortion: number;
  companyCommission: number;
  plumberPayable: number;
  paymentMethod: "bank_transfer" | "cash" | "pos";
  transactionRef?: string;
  notes?: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }

    const totalPayment = Number(params.totalPayment) || 0;
    const labourPortion = Math.max(0, Number(params.labourPortion) || 0);
    const materialsPortion = Math.max(0, Number(params.materialsPortion) || 0);
    if (totalPayment <= 0) {
      return { success: false, error: "Total payment must be greater than zero." };
    }

    // Recalculate commission and plumber payable strictly on the server
    const settings = await getMarketplaceSettings();
    const rate = Math.max(0, Math.min(100, Number(settings.commission_default_rate) || 20)) / 100;
    const serverCommission = Math.round(labourPortion * rate);
    const serverPlumberPayable = Math.max(0, totalPayment - serverCommission);

    const supabase = getServiceSupabase();
    if (params.transactionRef?.trim()) {
      const { data: dup } = await supabase
        .from("payments")
        .select("id")
        .eq("ticket_number", params.ticketNumber)
        .eq("transaction_ref", params.transactionRef.trim())
        .maybeSingle();
      if (dup) {
        return { success: false, error: "A payment with this transaction reference already exists." };
      }
    }

    const pay = await recordPayment({
      ...params,
      totalPayment,
      labourPortion,
      materialsPortion,
      companyCommission: serverCommission,
      plumberPayable: serverPlumberPayable,
    });

    await postJobMessage({
      requestId: params.requestId || params.ticketNumber,
      ticketNumber: params.ticketNumber,
      senderRole: "admin",
      senderId: admin.userId,
      senderName: "Finance & Accounts",
      recipientRole: "plumber",
      message: `Payment Recorded (Pending Verification): ₦${totalPayment.toLocaleString()} via ${params.paymentMethod}. Estimated plumber payable: ₦${serverPlumberPayable.toLocaleString()}.`,
    });

    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id, assigned_plumber_id")
      .eq("ticket_number", params.ticketNumber)
      .maybeSingle();

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        type: "payment_recorded",
        title: `Payment Recorded: ${params.ticketNumber}`,
        body: `Your manual payment of ₦${totalPayment.toLocaleString()} has been logged for verification.`,
        entityType: "service_request",
        entityId: params.ticketNumber,
        destination: `/customer?tab=payments&ticket=${params.ticketNumber}`,
        dedupeKey: `payment_recorded:customer:${pay.id}`,
      });
    }

    revalidatePath("/admin/financials");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/tracking");
    revalidatePath("/plumber");
    revalidatePath("/customer");

    return { success: true, payment: pay };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function getTrackingDataAction(ticketNumber: string, phone: string) {
  try {
    if (!ticketNumber?.trim() || !phone?.trim()) {
      return {
        success: false,
        error: "Both the Ticket Reference Number and Phone Number are required to view your request.",
      };
    }

    const { getServiceRequestByTicket, getQuotationsForRequest, getMessagesForRequest } = await import("@/lib/marketplace");
    const request = await getServiceRequestByTicket(ticketNumber.trim(), phone.trim());
    if (!request) {
      return {
        success: false,
        error: "No matching service request found for this reference number and phone number. Please verify both details and try again.",
      };
    }

    const quotations = await getQuotationsForRequest(request.ticket_number);
    // STRICT PRIVACY: Customer must NEVER see internal communication between admin and plumber
    const allCustomerMessages = await getMessagesForRequest(request.ticket_number, false);
    const safeCustomerMessages = allCustomerMessages.filter(
      (m) =>
        !m.is_internal &&
        !(m.sender_role === "admin" && m.recipient_role === "plumber") &&
        !(m.sender_role === "plumber" && m.recipient_role === "admin") &&
        (m.sender_role === "customer" || m.recipient_role === "customer")
    );

    return {
      success: true,
      request,
      quotations,
      messages: safeCustomerMessages,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function saveMarketplaceSettingsAction(
  data: Partial<import("@/lib/marketplace").MarketplaceSettings>
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const payload = { ...data };
    if (Array.isArray(payload.coverage_areas)) {
      payload.active_coverage_locations = payload.coverage_areas
        .filter((a) => a.active && a.area.trim())
        .map((a) => (a.state ? `${a.area.trim()}, ${a.state.trim()}` : a.area.trim()));
    }
    await updateMarketplaceSettings(payload);
    await appendAuditLog({
      actor: admin.email || admin.fullName || "Admin",
      action: "settings_updated",
      entity_type: "settings",
      entity_id: "marketplace_settings",
      new_value: "Updated platform settings",
    });
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/contact");
    revalidatePath("/about");
    revalidatePath("/services");
    revalidatePath("/faq");
    revalidatePath("/request");
    revalidatePath("/join-as-plumber");
    revalidatePath("/privacy");
    revalidatePath("/terms");
    return { success: true, message: "Settings saved successfully." };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// CUSTOMER PORTAL & ACCOUNT ACTIONS
// ---------------------------------------------------------------------------
export async function registerCustomerAction(data: {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  cityLga?: string;
  neighbourhood?: string;
  propertyType?: string;
}) {
  try {
    if (!data.fullName?.trim() || !data.phone?.trim() || !data.address?.trim()) {
      return {
        success: false,
        error: "Full Name, Phone number, and Property address are required to create an account.",
      };
    }
    const customer = await registerCustomer(data);
    revalidatePath("/customer");
    return { success: true, customer };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to register customer profile." };
  }
}

export async function loginCustomerAction(phoneOrId: string) {
  try {
    if (!phoneOrId?.trim()) {
      return { success: false, error: "Please enter your registered phone number or Customer ID." };
    }
    const customer = await getCustomerByPhoneOrId(phoneOrId);
    if (!customer) {
      return {
        success: false,
        error: "No customer account found with that phone number. Please register an account below.",
      };
    }
    revalidatePath("/customer");
    return { success: true, customer };
  } catch (err: any) {
    return { success: false, error: err.message || "Login failed." };
  }
}

export async function submitCustomerRequestAction(data: {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  problemCategory: string;
  issueDescription: string;
  addressInKano: string;
  cityLga?: string;
  neighbourhood?: string;
  propertyType?: string;
  preferredTiming?: string;
  preferredDate?: string;
  priority?: "standard" | "urgent";
}) {
  try {
    const { createUniversalServiceRequest } = await import("@/lib/marketplace");
    const result = await createUniversalServiceRequest({
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      problemCategory: data.problemCategory,
      issueDescription: data.issueDescription,
      addressInKano: data.addressInKano,
      cityOrLga: data.cityLga || "",
      neighbourhood: data.neighbourhood || "",
      propertyType: data.propertyType || "Residential",
      preferredTiming: data.preferredTiming || "Morning (09:00 - 12:00)",
      preferredDate: data.preferredDate || new Date().toISOString().slice(0, 10),
      priority: data.priority || "standard",
    });

    revalidatePath("/customer");
    revalidatePath("/tracking");
    revalidatePath("/admin/requests");
    return { success: true, request: result, ticketNumber: result.ticket_number };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit plumbing request." };
  }
}

export async function verifyPaymentAction(
  paymentId: string,
  decision: "verified" | "rejected"
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const actor = admin.email || admin.fullName || "Admin";
    const ok = await verifyPaymentById(paymentId, decision, actor);
    if (!ok) return { success: false, error: "Payment record not found." };

    const supabase = getServiceSupabase();
    const { data: payRow } = await supabase
      .from("payments")
      .select("ticket_number, total_payment")
      .eq("id", paymentId)
      .maybeSingle();

    if (payRow?.ticket_number) {
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("customer_id, assigned_plumber_id")
        .eq("ticket_number", String(payRow.ticket_number))
        .maybeSingle();
      if (reqRow?.customer_id) {
        await createNotification({
          recipientId: String(reqRow.customer_id),
          recipientRole: "customer",
          type: decision === "verified" ? "payment_verified" : "payment_rejected",
          title:
            decision === "verified"
              ? `Payment Verified: ${payRow.ticket_number}`
              : `Payment Issue: ${payRow.ticket_number}`,
          body:
            decision === "verified"
              ? `Your payment of ₦${Number(payRow.total_payment || 0).toLocaleString()} has been verified.`
              : `Your payment record for ${payRow.ticket_number} could not be verified.`,
          entityType: "service_request",
          entityId: String(payRow.ticket_number),
          destination: `/customer?tab=payments&ticket=${payRow.ticket_number}`,
          dedupeKey: `payment_${decision}:customer:${paymentId}`,
        });
      }
      if (reqRow?.assigned_plumber_id && decision === "verified") {
        await createNotification({
          recipientId: String(reqRow.assigned_plumber_id),
          recipientRole: "plumber",
          type: "payment_verified",
          title: `Payment Verified: ${payRow.ticket_number}`,
          body: `Customer payment for ${payRow.ticket_number} has been verified.`,
          entityType: "service_request",
          entityId: String(payRow.ticket_number),
          destination: `/plumber?tab=earnings&ticket=${payRow.ticket_number}`,
          dedupeKey: `payment_${decision}:plumber:${paymentId}`,
        });
      }
    }

    revalidatePath("/admin/financials");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to verify payment." };
  }
}

export async function deleteCustomerAction(customerId: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized." };
    }
    const ok = await deleteCustomerById(customerId, admin.email || admin.fullName || "Admin");
    if (!ok) return { success: false, error: "Customer record not found." };
    revalidatePath("/admin/customers");
    revalidatePath("/admin/audit-log");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete customer." };
  }
}

export async function submitComplaintAction(data: {
  ticketNumber?: string;
  customerName: string;
  customerPhone: string;
  plumberName?: string;
  rating?: number;
  category: "complaint" | "feedback";
  message: string;
}) {
  try {
    if (!data.message?.trim()) {
      return { success: false, error: "Please enter your feedback or complaint details." };
    }
    const customerActor = await resolveChatActor("customer");
    if (data.ticketNumber?.trim() && customerActor) {
      const ctx = await verifyTicketAccess(customerActor, data.ticketNumber.trim());
      if (!ctx) {
        return { success: false, error: "You are not authorised to file a complaint on this ticket." };
      }
    }
    const item = await createComplaint({
      ticket_number: data.ticketNumber || "",
      customer_name: customerActor?.name || data.customerName,
      customer_phone: customerActor?.role === "customer" ? customerActor.phone : data.customerPhone,
      plumber_name: data.plumberName,
      rating: data.rating,
      category: data.category,
      message: data.message.trim(),
    });
    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      type: "complaint_submitted",
      title: data.category === "complaint" ? "New Customer Complaint" : "New Customer Feedback",
      body: `${data.customerName}: ${data.message.trim().slice(0, 90)}`,
      entityType: "complaint",
      entityId: item.id,
      destination: "/admin/complaints",
    });
    revalidatePath("/admin/complaints");
    revalidatePath("/admin");
    revalidatePath("/customer");
    return { success: true, item };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit feedback." };
  }
}

export async function updateComplaintStatusAction(
  id: string,
  status: ComplaintRecord["status"],
  adminNote?: string
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const ok = await updateComplaintStatus(id, status, adminNote, admin.email || admin.fullName || "Admin");
    if (!ok) return { success: false, error: "Record not found." };

    const supabase = getServiceSupabase();
    const { data: cmp } = await supabase
      .from("complaints")
      .select("ticket_number, category")
      .eq("id", id)
      .maybeSingle();
    if (cmp?.ticket_number) {
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("customer_id")
        .eq("ticket_number", String(cmp.ticket_number))
        .maybeSingle();
      if (reqRow?.customer_id) {
        await createNotification({
          recipientId: String(reqRow.customer_id),
          recipientRole: "customer",
          type: "complaint_updated",
          title: `Complaint Update: ${cmp.ticket_number}`,
          body: `Your ${cmp.category || "complaint"} status is now ${status.replace(/_/g, " ")}.`,
          entityType: "complaint",
          entityId: id,
          destination: `/customer?tab=profile`,
          dedupeKey: `complaint_status:${id}:${status}`,
        });
      }
    }

    revalidatePath("/admin/complaints");
    revalidatePath("/admin");
    revalidatePath("/admin/audit-log");
    revalidatePath("/customer");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update complaint." };
  }
}

export async function saveEnquiryNoteAction(
  enquiryId: string,
  status: "new" | "contacted" | "closed",
  note: string
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    await saveEnquiryNoteAndStatus(enquiryId, status, note, admin.email || admin.fullName || "Admin");
    revalidatePath("/admin/enquiries");
    revalidatePath("/admin");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to save enquiry note." };
  }
}

export async function updatePlumberOnboardingAction(params: {
  plumberId: string;
  checklist?: any;
  onboardingNotes?: string;
  agreementUrl?: string;
  rejectionReason?: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const ok = await updatePlumberChecklistAndNotes({
      ...params,
      actor: admin.email || admin.fullName || "Admin",
    });
    if (!ok) return { success: false, error: "Plumber not found." };
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin/audit-log");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update plumber onboarding." };
  }
}

export async function addGalleryItemAction(formData: FormData) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const title = (formData.get("title") as string)?.trim() || "";
    const serviceCategory = (formData.get("serviceCategory") as string)?.trim() || "";
    const location = (formData.get("location") as string)?.trim() || "";
    const published = formData.get("published") === "true";
    const file = formData.get("image") as File | null;

    if (!title || !serviceCategory || !file || file.size === 0) {
      return { success: false, error: "Title, service category, and image file are required." };
    }
    if (!ALLOWED_PHOTO_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
      return { success: false, error: "Image must be JPG, PNG, or WEBP under 5MB." };
    }

    const safeName = `${Date.now().toString(36)}-${sanitizeFileName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const adminSupabase = getServiceSupabase();
    const { error: uploadErr } = await adminSupabase.storage
      .from("chat-uploads")
      .upload(`gallery/${safeName}`, buffer, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadErr) {
      return { success: false, error: uploadErr.message };
    }

    const item = await addGalleryItem({
      title,
      category: serviceCategory,
      caption: "",
      location: location || undefined,
      image_url: `/api/gallery/file/${encodeURIComponent(safeName)}`,
      published,
    });

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    return { success: true, item };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to upload gallery item." };
  }
}

export async function toggleGalleryPublishAction(id: string, published: boolean) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    await toggleGalleryPublish(id, published);
    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update publish status." };
  }
}

export async function deleteGalleryItemAction(id: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const adminSupabase = getServiceSupabase();
    const { data: row } = await adminSupabase
      .from("gallery_items")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();

    await deleteGalleryItem(id);

    if (row?.image_url && String(row.image_url).includes("/api/gallery/file/")) {
      const rawName = decodeURIComponent(String(row.image_url).split("/api/gallery/file/")[1] || "");
      const safeName = path.basename(rawName);
      if (safeName) {
        await adminSupabase.storage.from("chat-uploads").remove([`gallery/${safeName}`]).catch(() => {});
      }
    }

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete gallery item." };
  }
}

export async function submitCustomerReviewAction(input: {
  ticketNumber: string;
  customerName: string;
  area?: string;
  serviceCategory?: string;
  rating: number;
  comment: string;
}) {
  try {
    if (!input.ticketNumber.trim() || !input.comment.trim()) {
      return { success: false, error: "Please include your review comment." };
    }

    const customerActor = await resolveChatActor("customer");
    if (!customerActor) {
      return { success: false, error: "Please sign in as a customer to submit a review." };
    }

    const ctx = await verifyTicketAccess(customerActor, input.ticketNumber.trim());
    if (!ctx) {
      return { success: false, error: "You can only review your own service requests." };
    }

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("status")
      .eq("id", ctx.requestId)
      .maybeSingle();
    if (!reqRow || !["completed", "work_completed"].includes(String(reqRow.status))) {
      return { success: false, error: "Reviews can only be submitted after work is completed." };
    }

    const { data: existingReview } = await supabase
      .from("customer_reviews")
      .select("id")
      .eq("ticket_number", ctx.ticketNumber)
      .maybeSingle();
    if (existingReview) {
      return { success: false, error: "You have already submitted a review for this service request." };
    }

    const rating = Math.min(5, Math.max(1, Math.round(Number(input.rating) || 5)));
    const review = await submitReview({
      ticketNumber: ctx.ticketNumber,
      customerName: customerActor.name || input.customerName.trim() || "Verified Customer",
      area: input.area?.trim(),
      serviceCategory: input.serviceCategory?.trim(),
      rating,
      comment: input.comment.trim(),
    });
    if (!review) {
      return { success: false, error: "Could not save review right now." };
    }
    revalidatePath("/customer");
    revalidatePath("/admin/complaints");
    return { success: true, review };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit review." };
  }
}

export async function moderateReviewAction(
  id: string,
  status: "approved" | "rejected"
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    await moderateReview(id, status, admin.email || "admin");
    revalidatePath("/admin/complaints");
    revalidatePath("/");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to moderate review." };
  }
}

export async function upsertGuideAction(input: {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  category: string;
  status: "draft" | "published";
  needs_owner_review: boolean;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const saved = await upsertGuide(input, admin.email || "admin");
    if (!saved) {
      return { success: false, error: "Could not save guide." };
    }
    revalidatePath("/admin/guides");
    revalidatePath("/guides");
    revalidatePath(`/guides/${saved.slug}`);
    revalidatePath("/sitemap.xml");
    return { success: true, guide: saved };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to save guide." };
  }
}

const DRAFT_GUIDE_OUTLINES = [
  {
    slug: "overhead-water-tank-and-pump-care",
    title: "Overhead Water Tank & Pump Care Checklist",
    category: "Water Tanks & Pumps",
    summary: "Needs owner review: Routine checks for float valves, tank sediment, and pump pressure.",
    content:
      "## Why Regular Tank Checks Matter\n\n[Needs owner review] Outline covering float valve wear, tank lid sealing, and sediment flushing intervals.\n\n## Signs Your Pump Needs Inspection\n\n[Needs owner review] Short-cycling, pressure drops, and dry-run protection checks.",
  },
  {
    slug: "detecting-hidden-pipe-leaks-early",
    title: "How to Spot Hidden Pipe Leaks Early",
    category: "Pipework & Leaks",
    summary: "Needs owner review: Early warning signs of damp walls, meter drift, and pressure loss.",
    content:
      "## Common Warning Signs\n\n[Needs owner review] Damp patches, bubbling paint, and unexpected water usage.\n\n## What to Do Before the Plumber Arrives\n\n[Needs owner review] Shutting off the isolation valve and taking photos for inspection.",
  },
  {
    slug: "preventing-kitchen-and-bathroom-drain-blockages",
    title: "Preventing Kitchen & Bathroom Drain Blockages",
    category: "Drainage & Blockages",
    summary: "Needs owner review: Practical habits to keep floor traps and sink lines clear.",
    content:
      "## Kitchen Sink Best Practices\n\n[Needs owner review] Grease traps, strainers, and hot water flushing.\n\n## Bathroom Trap Care\n\n[Needs owner review] Hair catchers and avoiding harsh chemical drain openers.",
  },
  {
    slug: "borehole-and-booster-pump-pressure-issues",
    title: "Troubleshooting Low Water Pressure from Booster Pumps",
    category: "Water Tanks & Pumps",
    summary: "Needs owner review: Checking airlocks, non-return valves, and pressure switches.",
    content:
      "## Typical Causes of Low Pressure\n\n[Needs owner review] Faulty check valves, clogged filters, or worn impellers.\n\n## When to Request an On-Site Inspection\n\n[Needs owner review] Electrical and mechanical checks by a qualified technician.",
  },
  {
    slug: "bathroom-fixture-replacement-checklist",
    title: "Checklist Before Replacing Bathroom Taps, Mixers & WCs",
    category: "Bathroom & Kitchen",
    summary: "Needs owner review: Measurements, shut-off valves, and spare part compatibility.",
    content:
      "## Pre-Purchase Measurements\n\n[Needs owner review] Rough-in distances, thread sizes, and water pressure compatibility.\n\n## Inspection & Itemised Quote\n\n[Needs owner review] Confirming labour and fitting parts before installation begins.",
  },
  {
    slug: "preparing-your-property-for-plumbing-inspection",
    title: "How to Prepare for an On-Site Plumbing Inspection",
    category: "General Plumbing",
    summary: "Needs owner review: Simple steps to help your assigned technician diagnose faster.",
    content:
      "## Access & Photos\n\n[Needs owner review] Clearing under-sink cabinets and sharing photos in your request.\n\n## Reviewing Your Itemised Quotation\n\n[Needs owner review] Understanding labour, materials, and approval before work starts.",
  },
];

export async function seedDraftGuidesAction() {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const seeded = [];
    for (const outline of DRAFT_GUIDE_OUTLINES) {
      const saved = await upsertGuide(
        {
          ...outline,
          status: "draft",
          needs_owner_review: true,
        },
        admin.email || "admin"
      );
      if (saved) seeded.push(saved);
    }
    revalidatePath("/admin/guides");
    return { success: true, guides: seeded };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to seed draft guides." };
  }
}

// ---------------------------------------------------------------------------
// PHASE 2: CRM BULK ACTIONS, ARCHIVE/DELETE & SAVED VIEWS
// ---------------------------------------------------------------------------
export async function bulkUpdateRequestsAction(params: {
  requestIds: string[];
  action: "status" | "priority" | "assign" | "archive" | "restore";
  status?: RequestStatus;
  priority?: "standard" | "urgent";
  plumberId?: string;
  plumberName?: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Admin authorisation required." };
    if (!Array.isArray(params.requestIds) || params.requestIds.length === 0) {
      return { success: false, error: "Select at least one service request." };
    }

    const nowIso = new Date().toISOString();
    let updatedCount = 0;

    for (const reqId of params.requestIds) {
      if (params.action === "status" && params.status) {
        const res = await updateServiceRequest(
          reqId,
          { status: params.status },
          { actor: admin.fullName, action: `Bulk status -> ${params.status}` }
        );
        if (res) updatedCount++;
      } else if (params.action === "priority" && params.priority) {
        const res = await updateServiceRequest(
          reqId,
          { priority: params.priority },
          { actor: admin.fullName, action: `Bulk priority -> ${params.priority}` }
        );
        if (res) updatedCount++;
      } else if (params.action === "assign" && params.plumberId && params.plumberName) {
        const res = await updateServiceRequest(
          reqId,
          {
            assigned_plumber_id: params.plumberId,
            assigned_technician: params.plumberName,
            status: "contacted",
          },
          { actor: admin.fullName, action: `Bulk assigned ${params.plumberName}` }
        );
        if (res) updatedCount++;
      } else if (params.action === "archive") {
        const res = await updateServiceRequest(
          reqId,
          { archived_at: nowIso },
          { actor: admin.fullName, action: "Archived service request" }
        );
        if (res) updatedCount++;
      } else if (params.action === "restore") {
        const res = await updateServiceRequest(
          reqId,
          { archived_at: null, deleted_at: null },
          { actor: admin.fullName, action: "Restored service request" }
        );
        if (res) updatedCount++;
      }
    }

    await appendAuditLog({
      actor: admin.fullName,
      action: `Bulk Request Update (${params.action})`,
      entity_type: "service_request",
      entity_id: params.requestIds.slice(0, 5).join(","),
      new_value: `${updatedCount} updated`,
    });

    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/plumber");
    revalidatePath("/customer");
    return { success: true, updatedCount };
  } catch (err: any) {
    return { success: false, error: err.message || "Bulk update failed." };
  }
}

export async function archiveServiceRequestAction(requestId: string, restore = false) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Admin authorisation required." };
    const nowIso = new Date().toISOString();
    const updated = await updateServiceRequest(
      requestId,
      { archived_at: restore ? null : nowIso, deleted_at: restore ? null : undefined },
      { actor: admin.fullName, action: restore ? "Restored Request" : "Archived Request" }
    );
    if (!updated) return { success: false, error: "Request not found." };
    await appendAuditLog({
      actor: admin.fullName,
      action: restore ? "Restored Service Request" : "Archived Service Request",
      entity_type: "service_request",
      entity_id: updated.ticket_number,
    });
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    return { success: true, request: updated };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to update archive state." };
  }
}

export async function deleteServiceRequestSafelyAction(requestId: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Admin authorisation required." };
    const supabase = getServiceSupabase();

    const [{ count: paymentCount }, { count: quoteCount }] = await Promise.all([
      supabase.from("payments").select("id", { count: "exact", head: true }).eq("request_id", requestId),
      supabase.from("quotations").select("id", { count: "exact", head: true }).eq("request_id", requestId),
    ]);

    if ((paymentCount || 0) > 0 || (quoteCount || 0) > 0) {
      return {
        success: false,
        error: "Cannot permanently delete a request with linked quotations or financial transactions. Archive it instead.",
      };
    }

    const nowIso = new Date().toISOString();
    const updated = await updateServiceRequest(
      requestId,
      { deleted_at: nowIso, archived_at: nowIso },
      { actor: admin.fullName, action: "Moved to Recycle Bin" }
    );
    if (!updated) return { success: false, error: "Request not found." };

    await appendAuditLog({
      actor: admin.fullName,
      action: "Soft-Deleted Service Request",
      entity_type: "service_request",
      entity_id: updated.ticket_number,
    });
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to delete service request." };
  }
}

export interface CrmSavedView {
  id: string;
  name: string;
  filters: Record<string, string>;
  columns: string[];
  sort_key: string;
  sort_dir: "asc" | "desc";
}

export async function getSavedCrmViewsAction(scope = "service_requests"): Promise<CrmSavedView[]> {
  try {
    const admin = await requireAdminUser();
    if (!admin) return [];
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("crm_saved_views")
      .select("*")
      .eq("scope", scope)
      .eq("admin_id", admin.userId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return data.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name || "View"),
      filters: (row.filters as Record<string, string>) || {},
      columns: Array.isArray(row.columns) ? (row.columns as string[]) : [],
      sort_key: String(row.sort_key || "created_at"),
      sort_dir: row.sort_dir === "asc" ? "asc" : "desc",
    }));
  } catch {
    return [];
  }
}

export async function saveCrmViewAction(input: {
  name: string;
  scope?: string;
  filters: Record<string, string>;
  columns: string[];
  sortKey: string;
  sortDir: "asc" | "desc";
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };
    const cleanName = input.name.trim();
    if (!cleanName) return { success: false, error: "View name is required." };

    const supabase = getServiceSupabase();
    const id = `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("crm_saved_views")
      .insert({
        id,
        admin_id: admin.userId,
        scope: input.scope || "service_requests",
        name: cleanName,
        filters: input.filters,
        columns: input.columns,
        sort_key: input.sortKey,
        sort_dir: input.sortDir,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return {
      success: true,
      view: {
        id: String(data.id),
        name: String(data.name),
        filters: (data.filters as Record<string, string>) || {},
        columns: Array.isArray(data.columns) ? (data.columns as string[]) : [],
        sort_key: String(data.sort_key || "created_at"),
        sort_dir: data.sort_dir === "asc" ? "asc" : "desc",
      } as CrmSavedView,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not save view." };
  }
}

export async function deleteCrmViewAction(viewId: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };
    const supabase = getServiceSupabase();
    await supabase.from("crm_saved_views").delete().eq("id", viewId).eq("admin_id", admin.userId);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not delete view." };
  }
}




