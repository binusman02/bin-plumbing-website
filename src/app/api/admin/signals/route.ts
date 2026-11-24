import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/security";
import { getAdminNotifications } from "@/lib/admin-notifications";

export async function GET() {
  try {
    const admin = await requireAdminUser();
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { items, unreadEnquiriesCount, unreadCommunicationsCount, unreadWorkforceCount } =
      await getAdminNotifications();

    return NextResponse.json(
      {
        notifications: items,
        unreadCount: items.length,
        unreadEnquiriesCount,
        unreadCommunicationsCount,
        unreadWorkforceCount,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to load admin signals" },
      { status: 500 }
    );
  }
}
