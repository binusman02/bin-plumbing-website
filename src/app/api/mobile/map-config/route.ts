import { NextResponse } from "next/server";

export async function GET() {
  const candidates = [
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim(),
    process.env.MAPBOX_ACCESS_TOKEN?.trim(),
  ];
  const publicToken = candidates.find((t) => t && t.startsWith("pk.")) || "";
  return NextResponse.json({ mapboxPublicToken: publicToken });
}
