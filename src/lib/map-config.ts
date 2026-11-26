/**
 * Map provider configuration (browser-safe: only NEXT_PUBLIC_ values).
 *
 * Defaults use free, keyless community tiles so the project works out of the box.
 * Those servers are fine for development and light use, but they carry NO
 * production SLA and have usage policies:
 *   - OpenStreetMap tile servers: https://operations.osmfoundation.org/policies/tiles/
 *   - Esri World Imagery: free for light use; high traffic needs an ArcGIS plan.
 * For production, set the NEXT_PUBLIC_MAP_* variables to a hosted provider
 * (e.g. MapTiler, Stadia Maps, Thunderforest, Mapbox raster, or self-hosted tiles).
 * Keys in tile URLs are public by nature – restrict them by HTTP referrer/domain
 * in the provider dashboard. Never put server routing keys here.
 */
import { KANO_CENTER } from "@/lib/geo";

export const MAP_CONFIG = {
  /** Hosted MapLibre vector style URL (e.g. MapTiler or Stadia Maps with domain-restricted key). */
  styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || "",
  isUsingOsmFallback: !process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim(),
  streetUrl:
    process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  streetAttribution:
    process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ||
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
  streetFallbackUrl:
    process.env.NEXT_PUBLIC_MAP_FALLBACK_TILE_URL ||
    "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
  streetFallbackAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
  satelliteUrl:
    process.env.NEXT_PUBLIC_MAP_SATELLITE_URL ||
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  satelliteAttribution:
    process.env.NEXT_PUBLIC_MAP_SATELLITE_ATTRIBUTION ||
    "Imagery &copy; Esri, Maxar, Earthstar Geographics",
  maxZoom: 19,
} as const;

function envNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolves a browser/mobile-safe Mapbox public token (`pk.*`).
 * Strictly rejects secret `sk.*` server tokens so they never leave the server.
 */
export function resolvePublicMapboxToken(
  env: Record<string, string | undefined> = process.env
): string {
  const candidates = [
    env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim(),
    env.MAPBOX_ACCESS_TOKEN?.trim(),
    env.MAPBOX_PUBLIC_TOKEN?.trim(),
    env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim(),
    env.MAPBOX_SERVER_TOKEN?.trim(),
  ];
  return candidates.find((t) => Boolean(t && t.startsWith("pk."))) || "";
}

/**
 * Centre of the service area. Used ONLY when no better coordinate (job, property
 * or the viewer's real GPS fix) exists, and always labelled as a default view.
 */
export const SERVICE_AREA_CENTER = (() => {
  const lat = envNumber(process.env.NEXT_PUBLIC_SERVICE_AREA_LAT);
  const lng = envNumber(process.env.NEXT_PUBLIC_SERVICE_AREA_LNG);
  return lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    ? { lat, lng }
    : KANO_CENTER;
})();
