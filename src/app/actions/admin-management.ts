"use server";

import { revalidatePath } from "next/cache";
import {
  createUniversalServiceRequest,
  updateServiceRequest,
  type RequestStatus,
} from "@/lib/marketplace";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

// Update status of a service request
export async function updateRequestStatus(
  requestId: string,
  newStatus: string
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized" };
    }

    await updateServiceRequest(
      requestId,
      { status: newStatus as RequestStatus },
      {
        actor: admin.fullName,
        action: `Status updated to ${newStatus}`,
      }
    );

    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/plumber");
    revalidatePath("/tracking");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Create a new service request directly from the Admin Dashboard (Call-in or Walk-in client)
export async function createAdminServiceRequest(data: {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  priority: "standard" | "urgent";
  propertyType: string;
  problemCategory?: string;
  addressInKano: string;
  cityLga?: string;
  preferredTiming: string;
  preferredDate?: string;
  issueDescription: string;
  assignedPlumberId?: string;
  assignedTechnician?: string;
  quotedAmount?: number;
  internalNotes?: string;
  status?: "new" | "contacted" | "scheduled" | "in_progress" | "completed" | "cancelled" | string;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized" };
    }

    if (!data.customerName?.trim() || !data.customerPhone?.trim() || !data.addressInKano?.trim()) {
      return { success: false, error: "Customer name, phone, and address are required." };
    }

    const created = await createUniversalServiceRequest({
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      customerEmail: data.customerEmail,
      priority: data.priority || "standard",
      propertyType: data.propertyType || "Residential / Home",
      problemCategory: data.problemCategory || data.propertyType || "General Plumbing",
      addressInKano: data.addressInKano,
      cityOrLga: data.cityLga || "",
      preferredTiming: data.preferredTiming || "Immediate dispatch",
      preferredDate: data.preferredDate || new Date().toISOString().slice(0, 10),
      issueDescription: data.issueDescription,
      createdByRole: "admin",
    });

    let finalRequest = created;
    if (
      data.assignedPlumberId ||
      data.assignedTechnician ||
      data.quotedAmount !== undefined ||
      data.internalNotes ||
      data.status
    ) {
      const updated = await updateServiceRequest(
        created.ticket_number,
        {
          assigned_plumber_id: data.assignedPlumberId || null,
          assigned_technician: data.assignedTechnician || null,
          quoted_amount: data.quotedAmount ?? null,
          internal_notes: data.internalNotes || null,
          status: (data.status as RequestStatus) || (data.assignedTechnician ? "scheduled" : "new"),
        },
        {
          actor: admin.fullName,
          action: "Created Service Request via Admin CRM",
        }
      );
      if (updated) finalRequest = updated;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/admin/customers");
    revalidatePath("/plumber");
    revalidatePath("/tracking");
    return { success: true, ticketNumber: created.ticket_number, request: finalRequest };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Update service request assignment, notes, or quote
export async function updateRequestDetails(
  requestId: string,
  updates: {
    assignedPlumberId?: string | null;
    assignedTechnician?: string | null;
    quotedAmount?: number;
    internalNotes?: string;
    status?: string;
    priority?: "standard" | "urgent";
    preferredDate?: string | null;
  }
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized" };
    }

    const updated = await updateServiceRequest(
      requestId,
      {
        assigned_plumber_id: updates.assignedPlumberId,
        assigned_technician: updates.assignedTechnician,
        quoted_amount: updates.quotedAmount,
        internal_notes: updates.internalNotes,
        status: updates.status as RequestStatus | undefined,
        priority: updates.priority,
        preferred_date: updates.preferredDate,
      },
      {
        actor: admin.fullName,
        action: "Updated Request Details",
        details: [
          updates.status ? `Status: ${updates.status}` : null,
          updates.priority ? `Priority: ${updates.priority}` : null,
          updates.assignedTechnician ? `Plumber: ${updates.assignedTechnician}` : null,
          updates.preferredDate ? `Appointment: ${updates.preferredDate}` : null,
        ]
          .filter(Boolean)
          .join(" • ") || undefined,
      }
    );

    if (!updated) {
      return { success: false, error: "Service request not found." };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/requests");
    revalidatePath("/plumber");
    revalidatePath("/customer");
    revalidatePath("/tracking");
    return { success: true, request: updated };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Update enquiry status
export async function updateEnquiryStatus(
  enquiryId: string,
  newStatus: "unread" | "read" | "replied" | "archived"
) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized" };
    }

    const mappedStatus =
      newStatus === "replied" ? "contacted" : newStatus === "archived" ? "closed" : newStatus === "read" ? "new" : "unread";

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("enquiries")
      .update({ status: mappedStatus, updated_at: new Date().toISOString() })
      .eq("id", enquiryId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/enquiries");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Delete an enquiry
export async function deleteEnquiry(enquiryId: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return { success: false, error: "Unauthorized" };
    }

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("enquiries")
      .delete()
      .eq("id", enquiryId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/admin");
    revalidatePath("/admin/enquiries");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Add a gallery project
export async function createGalleryProject(data: {
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  isVerified?: boolean;
}) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };

    const supabase = getServiceSupabase();
    const { error } = await supabase.from("gallery_items").insert({
      title: data.title.trim(),
      category: data.category.trim(),
      caption: data.description.trim(),
      image_url: data.imageUrl.trim(),
      published: false,
      sort_order: 0,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    revalidatePath("/");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Toggle publication of a gallery project
export async function toggleGalleryPublish(projectId: string, isPublished: boolean) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("gallery_items")
      .update({ published: isPublished, updated_at: new Date().toISOString() })
      .eq("id", projectId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

// Delete a gallery project
export async function deleteGalleryProject(projectId: string) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return { success: false, error: "Unauthorized" };

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from("gallery_items")
      .delete()
      .eq("id", projectId);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/admin/gallery");
    revalidatePath("/gallery");
    revalidatePath("/projects");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
