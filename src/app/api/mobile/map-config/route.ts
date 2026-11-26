import { connection, NextResponse } from "next/server";
import { MAP_CONFIG, resolvePublicMapboxToken } from "@/lib/map-config";

export async function GET() {
  await connection();
  const publicToken = resolvePublicMapboxToken();
  return NextResponse.json({
    mapboxPublicToken: publicToken,
    provider: publicToken ? "mapbox" : "osm",
    styleUrl: MAP_CONFIG.styleUrl,
    streetTileUrl: MAP_CONFIG.streetFallbackUrl,
    osmTileUrl: MAP_CONFIG.streetUrl,
    satelliteTileUrl: MAP_CONFIG.satelliteUrl,
  });
}
