import { connection, NextResponse } from "next/server";
import { MAP_CONFIG } from "@/lib/map-config";

export async function GET() {
  await connection();
  const candidates = [
    process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim(),
    process.env.MAPBOX_ACCESS_TOKEN?.trim(),
    process.env.MAPBOX_PUBLIC_TOKEN?.trim(),
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim(),
  ];
  const publicToken = candidates.find((t) => t && t.startsWith("pk.")) || "";
  return NextResponse.json({
    mapboxPublicToken: publicToken,
    provider: publicToken ? "mapbox" : "osm",
    streetTileUrl: MAP_CONFIG.streetFallbackUrl,
    osmTileUrl: MAP_CONFIG.streetUrl,
    satelliteTileUrl: MAP_CONFIG.satelliteUrl,
  });
}
