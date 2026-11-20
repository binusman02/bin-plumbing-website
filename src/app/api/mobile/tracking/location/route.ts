import { NextResponse } from "next/server";
import { resolvePortalActor } from "@/lib/portal-auth";
import { validateLocationInput } from "@/lib/live-location";
import { saveLiveLocation, setSharing } from "@/lib/live-location-server";

export async function POST(request: Request) {
  try {
    const actor = await resolvePortalActor("plumber");
    if (!actor || actor.role !== "plumber") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (body?.stopSharing === true) {
      await setSharing(actor.id, false);
      return NextResponse.json({ success: true, sharing: false });
    }

    const validated = validateLocationInput({
      lat: body?.lat,
      lng: body?.lng,
      accuracy: body?.accuracy,
      heading: body?.heading,
      speed: body?.speed,
      timestamp: body?.timestamp,
    });

    if (!validated.ok) {
      return NextResponse.json(
        { error: "Invalid GPS coordinates", reason: validated.message },
        { status: 400 }
      );
    }

    const result = await saveLiveLocation(actor.id, validated.value);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      confirmedAt: result.confirmedAtIso,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Location update failed" },
      { status: 500 }
    );
  }
}
