import { NextRequest, NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import {
  listNotificationsForRecipient,
  type NotificationMutationAction,
  updateNotificationState,
  verifyNotificationDestination,
} from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const roleHint = req.nextUrl.searchParams.get("role") as
    | "admin"
    | "customer"
    | "plumber"
    | null;
  const actor = await resolvePortalActor(roleHint || undefined);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") || "30");
  const offsetParam = Number(req.nextUrl.searchParams.get("offset") || "0");
  const recipientId = actor.role === "admin" ? "admin" : actor.id;
  const result = await listNotificationsForRecipient({
    recipientRole: actor.role,
    recipientId,
    limit: Number.isFinite(limitParam) ? limitParam : 30,
    offset: Number.isFinite(offsetParam) ? offsetParam : 0,
  });

  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const roleHint = (body?.role as "admin" | "customer" | "plumber" | undefined) || undefined;
  const actor = await resolvePortalActor(roleHint);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action = body?.action as NotificationMutationAction | undefined;
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const recipientId = actor.role === "admin" ? "admin" : actor.id;
  const ok = await updateNotificationState({
    recipientRole: actor.role,
    recipientId,
    action,
    notificationId: body?.notificationId,
    notificationIds: body?.notificationIds,
  });

  if (!ok) {
    return NextResponse.json({ error: "Failed to update notification" }, { status: 400 });
  }

  let destinationValid = true;
  let destinationError: string | undefined;
  if (body?.verifyDestination && body?.notificationId) {
    const check = await verifyNotificationDestination({
      recipientRole: actor.role,
      recipientId,
      notificationId: String(body.notificationId),
    });
    destinationValid = check.valid;
    destinationError = check.reason;
  }

  const updated = await listNotificationsForRecipient({
    recipientRole: actor.role,
    recipientId,
  });
  return NextResponse.json({
    success: true,
    destinationValid,
    destinationError,
    ...updated,
  });
}
