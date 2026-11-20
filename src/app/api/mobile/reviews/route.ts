import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const roleHint = url.searchParams.get("role") as
      | "customer"
      | "plumber"
      | "admin"
      | null;
    const actor = await resolvePortalActor(roleHint || undefined);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getServiceSupabase();

    if (actor.role === "plumber") {
      const { data: reqs } = await supabase
        .from("service_requests")
        .select("ticket_number")
        .eq("assigned_plumber_id", actor.id);
      const tickets = (reqs || []).map((r) => String(r.ticket_number));
      let reviews: Record<string, unknown>[] = [];
      if (tickets.length > 0) {
        const { data: revRows } = await supabase
          .from("reviews")
          .select("*")
          .in("ticket_number", tickets)
          .order("created_at", { ascending: false });
        reviews = (revRows as Record<string, unknown>[]) || [];
      }
      return NextResponse.json({ reviews });
    }

    const { data: revRows } = await supabase
      .from("reviews")
      .select("*")
      .eq("customer_name", actor.name)
      .order("created_at", { ascending: false })
      .limit(30);

    return NextResponse.json({ reviews: revRows || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load reviews" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("customer");
    if (!actor || actor.role !== "customer") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const ticketNumber =
      typeof body?.ticketNumber === "string" && body.ticketNumber.trim()
        ? body.ticketNumber.trim()
        : `GENERAL-${Date.now().toString(36).toUpperCase()}`;
    const rating = Math.min(5, Math.max(1, Number(body?.rating) || 5));
    const comment =
      typeof body?.comment === "string" && body.comment.trim()
        ? body.comment.trim()
        : "Great plumbing service from FlowGuard.";
    const serviceCategory =
      typeof body?.serviceCategory === "string" && body.serviceCategory.trim()
        ? body.serviceCategory.trim()
        : "General Plumbing";

    const supabase = getServiceSupabase();
    let assignedPlumberId: string | null = null;
    let area = "Kano State";

    if (!ticketNumber.startsWith("GENERAL-")) {
      const { data: reqRow } = await supabase
        .from("service_requests")
        .select("assigned_plumber_id, address_in_kano, problem_category")
        .eq("ticket_number", ticketNumber)
        .maybeSingle();
      if (reqRow) {
        assignedPlumberId = reqRow.assigned_plumber_id
          ? String(reqRow.assigned_plumber_id)
          : null;
        if (reqRow.address_in_kano) area = String(reqRow.address_in_kano);
      }
    }

    const reviewId = `rev-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("reviews")
      .insert({
        id: reviewId,
        ticket_number: ticketNumber,
        customer_name: actor.name,
        area,
        service_category: serviceCategory,
        rating,
        comment,
        status: "approved",
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Recalculate assigned plumber's average rating
    if (assignedPlumberId) {
      const { data: plumberReqs } = await supabase
        .from("service_requests")
        .select("ticket_number")
        .eq("assigned_plumber_id", assignedPlumberId);
      const pTickets = (plumberReqs || []).map((r) => String(r.ticket_number));
      if (pTickets.length > 0) {
        const { data: allRevs } = await supabase
          .from("reviews")
          .select("rating")
          .in("ticket_number", pTickets);
        if (allRevs && allRevs.length > 0) {
          const avg =
            allRevs.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) /
            allRevs.length;
          await supabase
            .from("plumbers")
            .update({ rating: Number(avg.toFixed(2)) })
            .eq("id", assignedPlumberId);
        }
      }
    }

    return NextResponse.json({ success: true, review: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save review" },
      { status: 500 }
    );
  }
}
