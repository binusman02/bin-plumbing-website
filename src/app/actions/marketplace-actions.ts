"use server";

import path from "path";
import { revalidatePath, updateTag } from "next/cache";
import { triggerWorkforceOnCustomerTicketMessage } from "@/lib/ai-workforce/auto-triggers";
import { notifyCustomerOnPlumberAssigned } from "@/lib/ai-workforce/public-amina";
import { reconcileStaleWorkforceState } from "@/lib/ai-workforce/workforce-sync";
import { validateJobTransition, type JobAction } from "@/lib/job-lifecycle";
import { PLUMBER_UPDATABLE_STATUSES } from "@/lib/status-styles";
import {
  appendRequestHistoryEntry,
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
  type PaymentRecord,
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
import { requireApprovedPlumberActor, resolvePortalActor } from "@/lib/portal-auth";
import {
  isValidCoordinate,
  plumberMayShareLocation,
  validateLocationInput,
  type LocationInput,
} from "@/lib/live-location";
import {
  plumberHasActiveJob,
  plumberHasOpenTrip,
  reconcilePlumberSharing,
  recordHeartbeat,
  saveLiveLocation,
  setSharing,
} from "@/lib/live-location-server";

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
      actorRole: "plumber",
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

    if (status === "approved") {
      const supabase = getServiceSupabase();
      const { data: plumberRow } = await supabase
        .from("plumbers")
        .select("auth_user_id")
        .eq("id", plumberId)
        .maybeSingle();
      if (plumberRow?.auth_user_id) {
        await supabase.auth.admin
          .updateUserById(String(plumberRow.auth_user_id), {
            app_metadata: { role: "plumber" },
          })
          .catch(() => {});
      }
    }

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
    const plumberActor = admin ? null : await requireApprovedPlumberActor();
    if (!admin && (!plumberActor || plumberActor.id !== plumberId)) {
      return { success: false, error: "Unauthorized. Approved technician account required." };
    }

    const ok = await updatePlumberAvailability(plumberId, isAvailable);
    if (!ok) return { success: false, error: "Plumber not found." };

    // Going Off Duty ends tracking unless the plumber still has an active job.
    if (!isAvailable) {
      await reconcilePlumberSharing(plumberId);
    }

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

    // Notification is created below; do not post automatic system messages into chat conversations

    await createNotification({
      recipientId: params.plumberId,
      recipientRole: "plumber",
      actorRole: "admin",
      type: "job_assigned",
      title: `Job Assigned: ${params.ticketNumber}`,
      body: `Assigned by ${admin.fullName}. Open Jobs & Assignments to coordinate inspection.`,
      entityType: "service_request",
      entityId: params.ticketNumber,
      destination: `/plumber?tab=jobs&ticket=${params.ticketNumber}`,
    });

    await notifyCustomerOnPlumberAssigned({
      ticketNumber: params.ticketNumber,
      plumberName: params.plumberName,
    });

    await reconcileStaleWorkforceState().catch(() => {});

    revalidatePath("/admin/requests");
    revalidatePath("/admin/plumbers");
    revalidatePath("/admin");
    revalidatePath("/tracking");
    revalidatePath("/plumber");
    revalidatePath("/customer");
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
    const plumberActor = admin ? null : await requireApprovedPlumberActor();
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized. Sign in as an approved technician." };
    }

    const effectivePlumberId = admin ? params.plumberId : plumberActor!.id;
    const effectivePlumberName = admin ? params.plumberName : plumberActor!.name;

    const supabase = getServiceSupabase();
    let existingReq: { id: string; customer_id: string | null };
    if (!admin) {
      // Atomic conditional claim: prevents two plumbers from claiming the same unassigned job simultaneously
      const { data: claimed, error: claimErr } = await supabase
        .from("service_requests")
        .update({
          assigned_technician: effectivePlumberName,
          assigned_plumber_id: effectivePlumberId,
          status: "scheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("ticket_number", params.ticketNumber)
        .is("assigned_plumber_id", null)
        .not("status", "in", "(completed,cancelled)")
        .is("deleted_at", null)
        .select("id, customer_id")
        .maybeSingle();

      if (claimErr) {
        return { success: false, error: claimErr.message };
      }
      if (!claimed) {
        return {
          success: false,
          error: "This job is unavailable or has already been claimed by another plumber.",
        };
      }

      await appendRequestHistoryEntry(params.ticketNumber, {
        actor: effectivePlumberName,
        action: "Claimed job assignment",
        details: `${effectivePlumberName} claimed dispatch ${params.ticketNumber}.`,
      });
      existingReq = {
        id: String(claimed.id),
        customer_id: claimed.customer_id ? String(claimed.customer_id) : null,
      };
    } else {
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("id, assigned_plumber_id, customer_id")
        .eq("ticket_number", params.ticketNumber)
        .maybeSingle();

      if (!reqRow) {
        return { success: false, error: "Service request not found." };
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
      existingReq = {
        id: String(reqRow.id),
        customer_id: reqRow.customer_id ? String(reqRow.customer_id) : null,
      };
    }

    // Notification is created below; do not post automatic system messages into chat conversations

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      actorRole: "plumber",
      actorId: effectivePlumberId,
      type: "job_claimed",
      title: `Job Claimed: ${params.ticketNumber}`,
      body: `${effectivePlumberName} claimed dispatch ${params.ticketNumber}.`,
      entityType: "service_request",
      entityId: params.ticketNumber,
      destination: `/admin/requests?ticket=${params.ticketNumber}`,
      dedupeKey: `job_claimed:admin:${params.ticketNumber}:${effectivePlumberId}`,
    });
    await notifyCustomerOnPlumberAssigned({
      ticketNumber: params.ticketNumber,
      plumberName: effectivePlumberName,
      customerId: existingReq.customer_id,
    });

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
  items?: import("@/lib/quotation-items").QuotationLineItem[];
}) {
  try {
    if (data.labourCharge <= 0) {
      return { success: false, error: "Labour / service charge must be greater than zero." };
    }

    const admin = await requireAdminUser();
    const plumberActor = admin ? null : await requireApprovedPlumberActor();
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized. Sign in as an approved assigned technician." };
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
      actorRole: admin ? "admin" : "plumber",
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

    const ok = await setCustomerQuotationApproval(
      quotationId,
      decision,
      customerActor?.name || (admin ? admin.fullName : "Customer"),
      undefined,
      admin ? "admin" : "customer"
    );
    if (!ok) return { success: false, error: "Quotation record not found." };

    revalidatePath("/tracking");
    revalidatePath("/customer");
    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    await reconcileStaleWorkforceState().catch(() => {});

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
    const plumberActor = admin ? null : await requireApprovedPlumberActor();
    if (!admin && !plumberActor) {
      return { success: false, error: "Unauthorized. Approved technician account required." };
    }

    if (plumberActor) {
      const ctx = await verifyTicketAccess(plumberActor, ticketNumber);
      if (!ctx) {
        return { success: false, error: "You are not assigned to this service request." };
      }
      const allowedPlumberStatuses: readonly RequestStatus[] = PLUMBER_UPDATABLE_STATUSES;
      if (!allowedPlumberStatuses.includes(status)) {
        return { success: false, error: "Only administrators can set this request status." };
      }

      const statusToAction: Partial<Record<RequestStatus, JobAction>> = {
        scheduled: "accept",
        in_progress: "start_work",
        work_completed: "complete_work",
      };
      const mappedAction = statusToAction[status];
      if (mappedAction) {
        const supabase = getServiceSupabase();
        const [{ data: reqRow }, { data: quoteRows }] = await Promise.all([
          supabase
            .from("service_requests")
            .select("status")
            .eq("ticket_number", ticketNumber)
            .maybeSingle(),
          supabase
            .from("quotations")
            .select("customer_approval_status")
            .eq("ticket_number", ticketNumber)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);
        const transition = validateJobTransition({
          action: mappedAction,
          currentStatus: String(reqRow?.status || "new"),
          hasAnyQuotation: (quoteRows || []).length > 0,
          hasApprovedQuotation: (quoteRows || []).some(
            (q) => q.customer_approval_status === "approved"
          ),
          tripStarted: true,
        });
        if (!transition.allowed) {
          return {
            success: false,
            error: transition.error || "Invalid job status transition.",
          };
        }
        if (transition.idempotent) {
          return { success: true };
        }
      }
    }

    const actorName = admin ? admin.fullName : plumberActor!.name;
    const updatedReq = await updateServiceRequest(
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

    if (!updatedReq) {
      return { success: false, error: "Service request not found or could not be updated." };
    }

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id, assigned_plumber_id")
      .eq("ticket_number", ticketNumber)
      .maybeSingle();

    const statusActorRole: "admin" | "plumber" = admin ? "admin" : "plumber";
    const statusActorId = admin ? admin.userId : plumberActor!.id;

    const isCompletionStatus =
      status === "work_completed" || status === "awaiting_final_payment";

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: statusActorRole,
        actorId: statusActorId,
        type: isCompletionStatus ? "payment_receipt_requested" : "status_updated",
        title: isCompletionStatus
          ? `Work Completed — Upload Payment Receipt: ${ticketNumber}`
          : `Status Updated: ${ticketNumber}`,
        body: isCompletionStatus
          ? "Your plumbing work is marked complete. Please complete your transfer and upload your payment receipt."
          : `Your request is now ${status.replace(/_/g, " ")}.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/customer?tab=requests&ticket=${ticketNumber}`,
      });
    }
    if (isCompletionStatus && statusActorRole === "plumber") {
      await createNotification({
        recipientId: "admin",
        recipientRole: "admin",
        actorRole: "plumber",
        actorId: statusActorId,
        type: "status_updated",
        title: `Work Marked Complete: ${ticketNumber}`,
        body: `${actorName} marked ${ticketNumber} as ${status.replace(/_/g, " ")}. Customer has been prompted to upload payment receipt.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/admin/requests?ticket=${ticketNumber}`,
      });
    }
    if (reqRow?.assigned_plumber_id) {
      await createNotification({
        recipientId: String(reqRow.assigned_plumber_id),
        recipientRole: "plumber",
        actorRole: statusActorRole,
        actorId: statusActorId,
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
    revalidatePath("/customer");
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

    let isInternal = Boolean(params.isInternal);
    if (isInternal && actor.role === "customer") {
      return { success: false, error: "Customers cannot send internal notes." };
    }

    const ticketCtx = await verifyTicketAccess(actor, params.ticketNumber || params.requestId);
    if (!ticketCtx) {
      return { success: false, error: "You are not authorised to message on this service request." };
    }

    // If replying to a locked/internal message, force the reply to stay internal so customers never see it
    if (params.replyToId && (actor.role === "admin" || actor.role === "plumber")) {
      const supabase = getServiceSupabase();
      const { data: parentMsg } = await supabase
        .from("messages")
        .select("is_internal")
        .eq("id", params.replyToId)
        .maybeSingle();
      if (parentMsg?.is_internal) {
        isInternal = true;
      }
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

    let aiReply = null;
    if (actor.role === "customer" && !isInternal && params.message.trim().length > 0) {
      const outcome = await triggerWorkforceOnCustomerTicketMessage({
        ticketNumber: ticketCtx.ticketNumber,
        customerName: actor.name,
        customerMessage: params.message.trim(),
      }).catch(() => ({ action: "skipped" as const }));
      if (outcome.action === "replied") {
        aiReply = await postJobMessage({
          requestId: ticketCtx.requestId,
          ticketNumber: ticketCtx.ticketNumber,
          senderRole: "admin",
          senderName: "Zainab (Support)",
          senderId: null,
          recipientRole: "customer",
          recipientId: ticketCtx.customerId,
          recipients: [
            {
              recipientId: ticketCtx.customerId || "customer",
              recipientRole: "customer",
            },
          ],
          message: outcome.replyText,
          isInternal: false,
        }).catch(() => null);
      }
    }

    revalidatePath("/tracking");
    revalidatePath("/customer");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/communications");
    revalidatePath("/plumber");
    return { success: true, message: msg, aiReply };
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

export async function submitPaymentReceiptAction(params: {
  requestId?: string;
  ticketNumber: string;
  fileName: string;
  url: string;
  mimeType?: string;
  size?: number;
}) {
  try {
    const actor = await resolveChatActor("customer");
    if (!actor || actor.role !== "customer") {
      return { success: false, error: "Please sign in as a customer to upload a payment receipt." };
    }

    const ticketCtx = await verifyTicketAccess(actor, params.ticketNumber || params.requestId || "");
    if (!ticketCtx) {
      return { success: false, error: "You are not authorised to upload a receipt for this request." };
    }

    const recipients = getAuthorizedRecipients(ticketCtx, "customer", false);
    const primaryRecipient = recipients[0];

    const msg = await postJobMessage({
      requestId: ticketCtx.requestId,
      ticketNumber: ticketCtx.ticketNumber,
      senderRole: "customer",
      senderName: actor.name,
      senderId: actor.id,
      recipientRole: primaryRecipient?.recipientRole || "admin",
      recipientId: primaryRecipient?.recipientId || null,
      recipients,
      message: `Payment receipt uploaded: ${params.fileName}`,
      attachment: {
        url: params.url,
        name: params.fileName,
        mimeType: params.mimeType || "application/octet-stream",
        size: params.size || 0,
      },
      isInternal: false,
      replyToId: null,
    });

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      actorRole: "customer",
      actorId: actor.id,
      type: "payment_receipt_uploaded",
      title: `Payment Receipt Uploaded: ${ticketCtx.ticketNumber}`,
      body: `${actor.name} uploaded a payment receipt (${params.fileName}) for ${ticketCtx.ticketNumber}. Please verify and reconcile.`,
      entityType: "service_request",
      entityId: ticketCtx.ticketNumber,
      destination: `/admin/requests?ticket=${ticketCtx.ticketNumber}`,
    });

    revalidatePath("/admin/requests");
    revalidatePath("/admin/communications");
    revalidatePath("/admin");
    revalidatePath("/customer");
    revalidatePath("/tracking");

    return { success: true, message: msg };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not upload payment receipt." };
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

    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("customer_id, assigned_plumber_id")
      .eq("ticket_number", params.ticketNumber)
      .maybeSingle();

    if (reqRow?.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: "admin",
        type: "payment_recorded",
        title: `Payment Recorded: ${params.ticketNumber}`,
        body: `Your manual payment of ₦${totalPayment.toLocaleString()} has been logged for verification.`,
        entityType: "service_request",
        entityId: params.ticketNumber,
        destination: `/customer?tab=payments&ticket=${params.ticketNumber}`,
        dedupeKey: `payment_recorded:customer:${pay.id}`,
      });
    }

    await reconcileStaleWorkforceState().catch(() => {});

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

    const rate = await checkRateLimit(
      "tracking_lookup",
      12,
      10 * 60 * 1000,
      ticketNumber.trim().toUpperCase()
    );
    if (!rate.allowed) {
      return {
        success: false,
        error: "Too many tracking attempts. Please wait a few minutes and try again.",
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

    const sanitizedRequest: import("@/lib/marketplace").ServiceRequestRecord = {
      ...request,
      internal_notes: undefined,
      customer_lat: undefined,
      customer_lng: undefined,
      customer_id: undefined,
      assigned_plumber_id: undefined,
    };

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
      request: sanitizedRequest,
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
    updateTag("settings");
    updateTag("service-categories");
    updateTag("service-areas");
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/contact");
    revalidatePath("/about");
    revalidatePath("/services");
    revalidatePath("/services/[slug]", "page");
    revalidatePath("/sitemap.xml");
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
  customerLat?: number;
  customerLng?: number;
  customerLocationSource?: "gps" | "map_pin" | "address_only";
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

    if (
      typeof data.customerLat === "number" &&
      typeof data.customerLng === "number" &&
      isValidCoordinate(data.customerLat, data.customerLng)
    ) {
      const supabase = getServiceSupabase();
      const nowIso = new Date().toISOString();
      const source = data.customerLocationSource === "gps" ? "gps" : "map_pin";
      let { error: locErr } = await supabase
        .from("service_requests")
        .update({
          customer_lat: data.customerLat,
          customer_lng: data.customerLng,
          customer_location_source: source,
          customer_location_updated_at: nowIso,
        })
        .eq("id", result.id);
      if (locErr && /customer_location_/.test(locErr.message)) {
        ({ error: locErr } = await supabase
          .from("service_requests")
          .update({ customer_lat: data.customerLat, customer_lng: data.customerLng })
          .eq("id", result.id));
      }
      if (locErr) {
        // The request itself was created; the customer can pin the property later.
        console.error("[submitServiceRequestAction] property location not saved:", locErr.message);
      } else {
        result.customer_lat = data.customerLat;
        result.customer_lng = data.customerLng;
      }
    }

    revalidatePath("/customer");
    revalidatePath("/tracking");
    revalidatePath("/admin/requests");
    return { success: true, request: result, ticketNumber: result.ticket_number };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to submit plumbing request." };
  }
}

export type LocationActionResult =
  | {
      success: true;
      /** ISO time at which the SERVER confirmed this update. Only set after persistence. */
      confirmedAt: string;
      /** True when a newer fix was already stored and this (older) one was discarded. */
      ignored?: boolean;
    }
  | {
      success: false;
      code:
        | "unauthorized"
        | "not_allowed"
        | "invalid"
        | "poor_accuracy"
        | "rate_limited"
        | "implausible"
        | "no_location"
        | "storage";
      error: string;
    };

async function authorisePlumberLocationWrite(): Promise<
  | { ok: true; plumberId: string }
  | { ok: false; result: Extract<LocationActionResult, { success: false }> }
> {
  // Identity comes ONLY from the verified session – never from client input.
  const actor = await requireApprovedPlumberActor();
  if (!actor) {
    return {
      ok: false,
      result: {
        success: false,
        code: "unauthorized",
        error: "Please sign in with an approved technician account to share location.",
      },
    };
  }

  const hasOpenTrip = await plumberHasOpenTrip(actor.id);
  if (
    !plumberMayShareLocation({
      isApproved: true,
      hasOpenTrip,
    })
  ) {
    await setSharing(actor.id, false);
    return {
      ok: false,
      result: {
        success: false,
        code: "not_allowed",
        error: "Start a trip on an active job to share your location.",
      },
    };
  }

  const limit = await checkRateLimit("plumber_location", 20, 60_000, actor.id);
  if (!limit.allowed) {
    return {
      ok: false,
      result: {
        success: false,
        code: "rate_limited",
        error: "Too many location updates. Retrying shortly.",
      },
    };
  }
  return { ok: true, plumberId: actor.id };
}

export async function updatePlumberLocationAction(
  input: LocationInput
): Promise<LocationActionResult> {
  try {
    const validated = validateLocationInput(input);
    if (!validated.ok) {
      return {
        success: false,
        code: validated.code === "poor_accuracy" ? "poor_accuracy" : "invalid",
        error:
          validated.code === "poor_accuracy"
            ? "GPS accuracy is currently low. Move to an open area and try again."
            : "Your device reported an invalid location. Please try again.",
      };
    }

    const auth = await authorisePlumberLocationWrite();
    if (!auth.ok) return auth.result;

    const saved = await saveLiveLocation(auth.plumberId, validated.value);
    if (!saved.ok) {
      return saved.reason === "implausible"
        ? {
            success: false,
            code: "implausible",
            error: "That location change looks unreliable and was not saved.",
          }
        : {
            success: false,
            code: "storage",
            error: "Location update failed. Your last confirmed location is still available.",
          };
    }
    return { success: true, confirmedAt: saved.confirmedAtIso, ignored: saved.ignored ? true : undefined };
  } catch (err) {
    console.error("[updatePlumberLocationAction]", err instanceof Error ? err.message : err);
    return {
      success: false,
      code: "storage",
      error: "Location update failed. Your last confirmed location is still available.",
    };
  }
}

/** Keeps a stationary-but-connected plumber from appearing offline. */
export async function sendLocationHeartbeatAction(): Promise<LocationActionResult> {
  try {
    const auth = await authorisePlumberLocationWrite();
    if (!auth.ok) return auth.result;
    const beat = await recordHeartbeat(auth.plumberId);
    if (!beat.ok) {
      return beat.reason === "no_location"
        ? {
            success: false,
            code: "no_location",
            error: "No location has been saved yet.",
          }
        : {
            success: false,
            code: "storage",
            error: "Location update failed. Your last confirmed location is still available.",
          };
    }
    return { success: true, confirmedAt: beat.confirmedAtIso };
  } catch (err) {
    console.error("[sendLocationHeartbeatAction]", err instanceof Error ? err.message : err);
    return {
      success: false,
      code: "storage",
      error: "Location update failed. Your last confirmed location is still available.",
    };
  }
}

/** Explicit stop (e.g. user taps "Stop sharing"); also erases stored coordinates. */
export async function stopLocationSharingAction(): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireApprovedPlumberActor();
    if (!actor) return { success: false, error: "Unauthorized." };
    // Sharing may not be stopped while a job is active: the customer is relying on it.
    if (await plumberHasActiveJob(actor.id)) {
      return {
        success: false,
        error: "Location sharing stays on while you have an active job.",
      };
    }
    const ok = await setSharing(actor.id, false);
    return ok ? { success: true } : { success: false, error: "Could not stop sharing." };
  } catch (err) {
    console.error("[stopLocationSharingAction]", err instanceof Error ? err.message : err);
    return { success: false, error: "Could not stop sharing." };
  }
}

export async function startPlumberTripAction(
  ticketNumber: string,
  coords?: { lat: number; lng: number; accuracyM?: number | null } | null
): Promise<{ success: boolean; startedAt?: string; error?: string }> {
  try {
    const actor = await requireApprovedPlumberActor();
    if (!actor) return { success: false, error: "Unauthorized." };
    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) return { success: false, error: "You are not assigned to this service request." };

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("status, customer_id")
      .eq("ticket_number", ticketNumber)
      .maybeSingle();

    if (!reqRow) return { success: false, error: "Service request not found." };
    if (reqRow.status === "completed" || reqRow.status === "cancelled") {
      return { success: false, error: "Cannot start a trip for a completed or cancelled job." };
    }

    const startedAt = new Date().toISOString();
    const hasCoords =
      coords != null &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      !(coords.lat === 0 && coords.lng === 0);

    await updateServiceRequest(
      ticketNumber,
      {},
      {
        actor: actor.name,
        action: "trip_started",
        details: hasCoords
          ? `Trip started at ${startedAt} (${coords!.lat.toFixed(5)}, ${coords!.lng.toFixed(5)})`
          : `Trip started at ${startedAt}`,
      }
    );

    await setSharing(actor.id, true);
    if (hasCoords) {
      await saveLiveLocation(actor.id, {
        lat: coords!.lat,
        lng: coords!.lng,
        accuracyM: coords!.accuracyM ?? null,
        heading: null,
        speed: null,
        fixTimeMs: Date.now(),
      });
    }

    if (reqRow.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: "plumber",
        actorId: actor.id,
        type: "status_updated",
        title: `Plumber on the way: ${ticketNumber}`,
        body: `${actor.name} has started the trip to your property. Live tracking is now active.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/customer?tab=requests&ticket=${ticketNumber}`,
      });
    }

    return { success: true, startedAt };
  } catch (err) {
    console.error("[startPlumberTripAction]", err instanceof Error ? err.message : err);
    return { success: false, error: "Could not start trip." };
  }
}

export async function markPlumberArrivedAction(
  ticketNumber: string,
  coords?: { lat: number; lng: number; accuracyM?: number | null } | null
): Promise<{ success: boolean; arrivedAt?: string; error?: string }> {
  try {
    const actor = await requireApprovedPlumberActor();
    if (!actor) return { success: false, error: "Unauthorized." };
    const ctx = await verifyTicketAccess(actor, ticketNumber);
    if (!ctx) return { success: false, error: "You are not assigned to this service request." };

    const supabase = getServiceSupabase();
    const { data: reqRow } = await supabase
      .from("service_requests")
      .select("status, customer_id")
      .eq("ticket_number", ticketNumber)
      .maybeSingle();

    if (!reqRow) return { success: false, error: "Service request not found." };

    const arrivedAt = new Date().toISOString();
    const hasCoords =
      coords != null &&
      Number.isFinite(coords.lat) &&
      Number.isFinite(coords.lng) &&
      !(coords.lat === 0 && coords.lng === 0);

    // Save arrived event in job history WITHOUT changing the main job status.
    await updateServiceRequest(
      ticketNumber,
      {},
      {
        actor: actor.name,
        action: "arrived",
        details: hasCoords
          ? `Arrived at ${arrivedAt} (${coords!.lat.toFixed(5)}, ${coords!.lng.toFixed(5)})`
          : `Arrived at ${arrivedAt}`,
      }
    );

    // Stop live location sharing for this trip (unless another assigned job is still on the way).
    const { data: otherJobs } = await supabase
      .from("service_requests")
      .select("ticket_number, status, history")
      .eq("assigned_plumber_id", actor.id)
      .not("status", "in", "(completed,cancelled)");

    const hasAnotherActiveTrip = (otherJobs || []).some((row) => {
      if (row.ticket_number === ticketNumber) return false;
      const hist = Array.isArray(row.history) ? (row.history as { action?: string }[]) : [];
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i]?.action === "arrived") return false;
        if (hist[i]?.action === "trip_started") return true;
        if (hist[i]?.action === "trip_cancelled") return false;
      }
      return false;
    });

    if (!hasAnotherActiveTrip) {
      await setSharing(actor.id, false);
    }

    if (reqRow.customer_id) {
      await createNotification({
        recipientId: String(reqRow.customer_id),
        recipientRole: "customer",
        actorRole: "plumber",
        actorId: actor.id,
        type: "status_updated",
        title: `Your plumber has arrived: ${ticketNumber}`,
        body: `${actor.name} has arrived at your property.`,
        entityType: "service_request",
        entityId: ticketNumber,
        destination: `/customer?tab=requests&ticket=${ticketNumber}`,
      });
    }

    await createNotification({
      recipientId: "admin",
      recipientRole: "admin",
      actorRole: "plumber",
      actorId: actor.id,
      type: "status_updated",
      title: `Your plumber has arrived: ${ticketNumber}`,
      body: `${actor.name} arrived at ${ticketNumber}.`,
      entityType: "service_request",
      entityId: ticketNumber,
      destination: `/admin/requests?ticket=${ticketNumber}`,
    });

    return { success: true, arrivedAt };
  } catch (err) {
    console.error("[markPlumberArrivedAction]", err instanceof Error ? err.message : err);
    return { success: false, error: "Could not record arrival." };
  }
}

export async function updateCustomerRequestLocationAction(
  requestId: string,
  lat: number,
  lng: number,
  source: "gps" | "map_pin" = "map_pin"
) {
  try {
    if (!requestId || !isValidCoordinate(lat, lng)) {
      return { success: false, error: "Invalid location coordinates." };
    }
    const actor = await resolvePortalActor("customer");
    if (!actor || actor.role !== "customer") {
      return { success: false, error: "Customer authentication required." };
    }
    const supabase = getServiceSupabase();
    const { data: reqRow, error: fetchErr } = await supabase
      .from("service_requests")
      .select("id, customer_id, customer_phone, status")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr || !reqRow) {
      return { success: false, error: "Service request not found." };
    }

    const reqPhone = String(reqRow.customer_phone || "").replace(/\D/g, "").slice(-10);
    const actorPhone = String(actor.phone || "").replace(/\D/g, "").slice(-10);
    const isOwner =
      (reqRow.customer_id && String(reqRow.customer_id) === actor.id) ||
      (reqPhone && actorPhone && reqPhone === actorPhone);

    if (!isOwner) {
      return { success: false, error: "You are not authorized to update this request." };
    }
    if (["completed", "cancelled"].includes(String(reqRow.status || ""))) {
      return { success: false, error: "Completed or cancelled requests cannot be updated." };
    }

    const nowIso = new Date().toISOString();
    let { error } = await supabase
      .from("service_requests")
      .update({
        customer_lat: lat,
        customer_lng: lng,
        customer_location_source: source === "gps" ? "gps" : "map_pin",
        customer_location_updated_at: nowIso,
      })
      .eq("id", requestId);

    if (error && /customer_location_/.test(error.message)) {
      // Migration 20261115 not applied yet: store the coordinates only.
      ({ error } = await supabase
        .from("service_requests")
        .update({ customer_lat: lat, customer_lng: lng })
        .eq("id", requestId));
    }

    if (error) {
      console.error("[updateCustomerRequestLocationAction]", error.message);
      return { success: false, error: "Could not save your location. Please try again." };
    }
    revalidatePath("/customer");
    revalidatePath("/admin/requests");
    revalidatePath("/plumber");
    return { success: true };
  } catch (err) {
    console.error("[updateCustomerRequestLocationAction]", err instanceof Error ? err.message : err);
    return { success: false, error: "Could not save your location. Please try again." };
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
          actorRole: "admin",
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
          actorRole: "admin",
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

    await reconcileStaleWorkforceState().catch(() => {});

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
      actorRole: "customer",
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
          actorRole: "admin",
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

    updateTag("gallery");
    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/services");
    revalidatePath("/");
    revalidatePath("/projects");
    return { success: true, item };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to upload gallery item." };
  }
}

export async function uploadServiceImageAction(formData: FormData) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const file = formData.get("image") as File | null;
    if (!file || file.size === 0) {
      return { success: false, error: "Please select an image file to upload." };
    }
    if (!ALLOWED_PHOTO_TYPES.has(file.type) || file.size > MAX_FILE_BYTES) {
      return { success: false, error: "Image must be JPG, PNG, or WEBP under 5MB." };
    }

    const safeName = `service-${Date.now().toString(36)}-${sanitizeFileName(file.name)}`;
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

    return {
      success: true,
      imageUrl: `/api/gallery/file/${encodeURIComponent(safeName)}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to upload service image." };
  }
}

export async function toggleGalleryPublishAction(id: string, published: boolean) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const ok = await toggleGalleryPublish(id, published);
    if (!ok) {
      return { success: false, error: "Failed to update gallery item publish status." };
    }
    updateTag("gallery");
    updateTag("gallery");
    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/services");
    revalidatePath("/");
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

    const ok = await deleteGalleryItem(id);
    if (!ok) {
      return { success: false, error: "Failed to delete gallery item." };
    }

    if (row?.image_url && String(row.image_url).includes("/api/gallery/file/")) {
      const rawName = decodeURIComponent(String(row.image_url).split("/api/gallery/file/")[1] || "");
      const safeName = path.basename(rawName);
      if (safeName) {
        await adminSupabase.storage.from("chat-uploads").remove([`gallery/${safeName}`]).catch(() => {});
      }
    }

    updateTag("gallery");
    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/services");
    revalidatePath("/");
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
  slug?: string;
  title?: string;
  summary?: string;
  content?: string;
  category: string;
  status?: "draft" | "review" | "published";
  needs_owner_review: boolean;
  en_title?: string;
  en_slug?: string;
  en_summary?: string;
  en_content?: string;
  en_seo_title?: string;
  en_meta_description?: string;
  en_image_alt?: string;
  en_status?: "draft" | "review" | "published";
  ha_title?: string;
  ha_slug?: string;
  ha_summary?: string;
  ha_content?: string;
  ha_seo_title?: string;
  ha_meta_description?: string;
  ha_image_alt?: string;
  ha_status?: "draft" | "review" | "published";
  featured_image?: string;
  image_attribution?: string;
  target_service_slug?: string;
  main_keyword?: string;
  supporting_keywords?: string[];
  author_name?: string;
  published_at?: string | null;
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
    updateTag("guides");
    revalidatePath("/admin/guides");
    revalidatePath("/guides");
    revalidatePath("/en/blog");
    revalidatePath("/ha/blog");
    if (saved.en_slug) revalidatePath(`/en/blog/${saved.en_slug}`);
    if (saved.ha_slug) revalidatePath(`/ha/blog/${saved.ha_slug}`);
    revalidatePath("/sitemap.xml");
    return { success: true, guide: saved };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to save guide." };
  }
}

export async function seedDraftGuidesAction() {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Admin authorisation required." };
    }
    const { BILINGUAL_BLOG_STARTER_ARTICLES } = await import(
      "@/data/bilingual-blog-starter"
    );
    const seeded = [];
    for (const outline of BILINGUAL_BLOG_STARTER_ARTICLES) {
      const saved = await upsertGuide(
        {
          ...outline,
          status: outline.status || "published",
          en_status: outline.en_status || "published",
          ha_status: outline.ha_status || "published",
          needs_owner_review: outline.needs_owner_review ?? false,
        },
        admin.email || "admin"
      );
      if (saved) seeded.push(saved);
    }
    updateTag("guides");
    revalidatePath("/admin/guides");
    revalidatePath("/en/blog");
    revalidatePath("/ha/blog");
    revalidatePath("/sitemap.xml");
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

export async function updatePaymentRecordAction(input: {
  paymentId: string;
  customerName: string;
  labourPortion: number;
  materialsPortion: number;
  companyCommission: number;
  plumberPayable: number;
  totalPayment: number;
  paymentMethod: "bank_transfer" | "cash" | "pos";
  transactionRef?: string;
  verificationStatus: "pending" | "verified" | "rejected";
  notes?: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Admin authorisation required." };
    const supabase = getServiceSupabase();
    const nowIso = new Date().toISOString();

    const paymentStatus =
      input.verificationStatus === "verified"
        ? "confirmed"
        : input.verificationStatus === "rejected"
          ? "failed"
          : "pending";

    const updatePayload: Record<string, unknown> = {
      customer_name: input.customerName.trim() || "Customer",
      labour_portion: Math.max(0, Number(input.labourPortion) || 0),
      materials_portion: Math.max(0, Number(input.materialsPortion) || 0),
      company_commission: Math.max(0, Number(input.companyCommission) || 0),
      plumber_payable: Math.max(0, Number(input.plumberPayable) || 0),
      total_payment: Math.max(0, Number(input.totalPayment) || 0),
      payment_method: input.paymentMethod,
      transaction_ref: input.transactionRef?.trim() || null,
      verification_status: input.verificationStatus,
      payment_status: paymentStatus,
      notes: input.notes?.trim() || null,
    };

    if (input.verificationStatus === "verified") {
      updatePayload.verified_by = admin.fullName;
      updatePayload.verified_at = nowIso;
    }

    const { data, error } = await supabase
      .from("payments")
      .update(updatePayload)
      .eq("id", input.paymentId)
      .select("*")
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Could not update payment record." };
    }

    await appendAuditLog({
      actor: admin.fullName,
      action: "Updated Payment Record",
      entity_type: "payment",
      entity_id: String(data.ticket_number || input.paymentId),
      new_value: `${input.totalPayment} (${input.verificationStatus})`,
    });

    await reconcileStaleWorkforceState().catch(() => {});

    revalidatePath("/admin/financials");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");
    revalidatePath("/plumber");
    revalidatePath("/customer");

    return {
      success: true,
      payment: {
        id: String(data.id),
        request_id: String(data.request_id || ""),
        ticket_number: String(data.ticket_number || ""),
        customer_name: String(data.customer_name || "Customer"),
        total_payment: Number(data.total_payment || 0),
        labour_portion: Number(data.labour_portion || 0),
        materials_portion: Number(data.materials_portion || 0),
        company_commission: Number(data.company_commission || 0),
        plumber_payable: Number(data.plumber_payable || 0),
        payment_method: (data.payment_method as "bank_transfer" | "cash" | "pos") || "bank_transfer",
        transaction_ref: data.transaction_ref ? String(data.transaction_ref) : undefined,
        payment_status:
          (data.payment_status as "pending" | "confirmed" | "failed") || "pending",
        verification_status:
          (data.verification_status as "pending" | "verified" | "rejected") || "pending",
        verified_by: data.verified_by ? String(data.verified_by) : undefined,
        verified_at: data.verified_at ? String(data.verified_at) : undefined,
        payment_date: String(data.payment_date || data.created_at || nowIso),
        notes: data.notes ? String(data.notes) : undefined,
        created_at: String(data.created_at || nowIso),
      } as PaymentRecord,
    };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not update payment." };
  }
}

export async function adminUpdateCustomerRecordAction(input: {
  customerId: string;
  oldPhone?: string;
  name: string;
  phone: string;
  email?: string;
  area: string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Admin authorisation required." };
    const cleanName = input.name.trim();
    const cleanPhone = input.phone.trim();
    const cleanEmail = input.email?.trim() || null;
    const cleanArea = input.area.trim() || "Kano";
    if (!cleanName || !cleanPhone) {
      return { success: false, error: "Customer name and phone number are required." };
    }

    const supabase = getServiceSupabase();

    // Update customer account row if it exists in customers table
    if (input.customerId && !input.customerId.startsWith("req-") && !input.customerId.startsWith("enq-")) {
      await supabase
        .from("customers")
        .update({
          full_name: cleanName,
          phone: cleanPhone,
          email: cleanEmail,
          address: cleanArea,
        })
        .eq("id", input.customerId);
    }

    // Also update linked service_requests by customer_id or old phone
    if (input.customerId && !input.customerId.startsWith("req-") && !input.customerId.startsWith("enq-")) {
      await supabase
        .from("service_requests")
        .update({
          customer_name: cleanName,
          customer_phone: cleanPhone,
          customer_email: cleanEmail,
          city_lga: cleanArea,
        })
        .eq("customer_id", input.customerId);
    }
    if (input.oldPhone) {
      await supabase
        .from("service_requests")
        .update({
          customer_name: cleanName,
          customer_phone: cleanPhone,
          customer_email: cleanEmail,
          city_lga: cleanArea,
        })
        .eq("customer_phone", input.oldPhone);
    }

    await appendAuditLog({
      actor: admin.fullName,
      action: "Updated Customer Contact",
      entity_type: "customer",
      entity_id: input.customerId || cleanPhone,
      new_value: `${cleanName} (${cleanPhone})`,
    });

    revalidatePath("/admin/customers");
    revalidatePath("/admin/requests");
    revalidatePath("/admin");

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Could not update customer." };
  }
}




