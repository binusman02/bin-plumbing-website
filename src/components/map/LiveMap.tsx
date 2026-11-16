"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import { MAP_CONFIG, SERVICE_AREA_CENTER } from "@/lib/map-config";
import { haversineMeters, type LocationStatus } from "@/lib/live-location";
import {
  createFixBufferState,
  NAV_CONFIG,
  projectPointOntoRoute,
  pushFixToBuffer,
  sampleBufferedPosition,
  smoothHeading,
  splitRouteAtProjection,
  stepCameraFollow,
  updateOffRouteState,
  type CameraPose,
  type FixBufferState,
  type OffRouteState,
} from "@/lib/live-navigation";
import { useDeviceHeading } from "@/hooks/useDeviceHeading";

export type MapMarkerKind =
  | "customer"
  | "plumber_online"
  | "plumber_offline"
  | "request";

export interface LiveMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  kind: MapMarkerKind;
}

export interface OwnPositionFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  heading: number | null;
  speed: number | null;
  timestampMs: number;
}

export interface RemotePlumberState {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracyM: number | null;
  status: LocationStatus;
  statusLabel: string;
  coordinatesAtMs: number | null;
  label: string;
}

export interface LiveMapProps {
  markers: LiveMapMarker[];
  center?: { lat: number; lng: number };
  zoom?: number;
  heightClassName?: string;
  interactivePicker?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  onMarkerClick?: (id: string) => void;
  /** Road-snapped route coordinates `[lat, lng][]`. */
  roadRoutePoints?: [number, number][];
  /** Straight-line fallback `[lat, lng][]`. */
  straightLine?: [number, number][];
  /** Legacy alias for straight-line polyline. */
  polyline?: [number, number][];
  /** Optional GPS accuracy circle in meters. */
  accuracyCircle?: { lat: number; lng: number; radiusM: number } | null;
  /** Highlights a marker with a gold ring. */
  selectedMarkerId?: string | null;
  /** Explicitly pans/zooms to this marker when set or changed. */
  focusMarkerId?: string | null;
  /** Increment to force re-focusing even when focusMarkerId hasn't changed. */
  focusSeq?: number;
  /** Real-time local GPS fix for 60fps blue dot + accuracy circle + direction cone. */
  ownPosition?: OwnPositionFix | null;
  /** Destination coordinates for 75m arrival auto-fit & navigation. */
  destination?: { lat: number; lng: number } | null;
  /** Enables turn-by-turn follow camera (30% from bottom, heading-up, Compass/Recenter). */
  navigationMode?: boolean;
  /** Called when the plumber is >50m off-route for 10s (respects 15s cooldown). */
  onNeedReroute?: () => void;
  /** Customer/Admin remote plumber marker with smooth 60fps interpolation + 5s extrapolation. */
  remotePlumber?: RemotePlumberState | null;
}

function escapeHtml(text: string): string {
  return text.replace(/[<>&"']/g, "");
}

function buildRasterStyle(
  tileUrl: string,
  attribution: string,
  sourceMaxZoom = 19
): StyleSpecification {
  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: sourceMaxZoom,
        attribution,
      },
    },
    layers: [
      {
        id: "raster-base",
        type: "raster",
        source: "raster-tiles",
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  };
}

function getMapStyle(mode: "street" | "satellite"): string | StyleSpecification {
  if (mode === "satellite") {
    // Cap Esri World Imagery source at z17 so MapLibre overzooms smoothly instead of
    // requesting z18/z19 tiles where Esri returns "Map data not available" placeholders.
    return buildRasterStyle(MAP_CONFIG.satelliteUrl, MAP_CONFIG.satelliteAttribution, 17);
  }
  if (MAP_CONFIG.styleUrl) {
    return MAP_CONFIG.styleUrl;
  }
  return buildRasterStyle(MAP_CONFIG.streetUrl, MAP_CONFIG.streetAttribution, 19);
}

function buildPinElement(
  kind: MapMarkerKind,
  label: string,
  selected: boolean
): HTMLDivElement {
  const isPlumber = kind === "plumber_online" || kind === "plumber_offline";
  const imgSrc = isPlumber
    ? "/images/map-pins/plumber-pin.png"
    : "/images/map-pins/property-pin.svg";
  const safeLabel = escapeHtml(label);
  const statusDot =
    kind === "plumber_online"
      ? `<span style="position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:9999px;background:#10B981;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`
      : kind === "plumber_offline"
      ? `<span style="position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:9999px;background:#64748B;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`
      : kind === "request"
      ? `<span style="position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:9999px;background:#DC2626;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);"></span>`
      : "";
  const imgFilter =
    kind === "plumber_offline" ? "filter:grayscale(0.45) opacity(0.85);" : "";
  const ringStyle = selected
    ? "box-shadow:0 0 0 3px #F5B301, 0 4px 12px rgba(11,31,58,0.45);"
    : "box-shadow:0 2px 6px rgba(0,0,0,0.28);";

  const el = document.createElement("div");
  el.style.display = "flex";
  el.style.flexDirection = "column";
  el.style.alignItems = "center";
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="margin-bottom:2px;background:${selected ? "#0B1F3A" : "rgba(11,31,58,0.92)"};color:#fff;padding:2px 7px;border-radius:9999px;font-size:10px;font-weight:700;white-space:nowrap;max-width:170px;overflow:hidden;text-overflow:ellipsis;${ringStyle}border:1px solid ${selected ? "#F5B301" : "rgba(255,255,255,0.2)"};">
      ${safeLabel}
    </div>
    <div style="position:relative;width:46px;height:52px;display:flex;align-items:flex-end;justify-content:center;">
      <img src="${imgSrc}" alt="${safeLabel}" style="width:46px;height:52px;object-fit:contain;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.32));${imgFilter}" />
      ${statusDot}
    </div>
  `;
  return el;
}

function buildCircleGeoJson(lat: number, lng: number, radiusM: number) {
  const cappedRadius = Math.min(Math.max(radiusM, 5), 250);
  const steps = 32;
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const degLat = cappedRadius / 111_320;
  const degLng = cappedRadius / (111_320 * Math.max(0.1, Math.cos(latRad)));
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * Math.PI * 2;
    coords.push([lng + degLng * Math.cos(theta), lat + degLat * Math.sin(theta)]);
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [coords],
        },
      },
    ],
  };
}

function toLineGeoJson(pts?: [number, number][]) {
  if (!pts || pts.length < 2) {
    return { type: "FeatureCollection" as const, features: [] };
  }
  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "LineString" as const,
          coordinates: pts.map(([lat, lng]) => [lng, lat]),
        },
      },
    ],
  };
}

function buildOwnDotElement(): {
  root: HTMLDivElement;
  cone: HTMLDivElement;
} {
  const root = document.createElement("div");
  root.style.position = "relative";
  root.style.width = "56px";
  root.style.height = "56px";
  root.style.display = "flex";
  root.style.alignItems = "center";
  root.style.justifyContent = "center";
  root.style.pointerEvents = "none";

  const cone = document.createElement("div");
  cone.style.position = "absolute";
  cone.style.inset = "0";
  cone.style.display = "none";
  cone.style.transformOrigin = "50% 50%";
  cone.innerHTML = `
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="binConeGrad" x1="28" y1="28" x2="28" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#2563EB" stop-opacity="0.48"/>
          <stop offset="100%" stop-color="#2563EB" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M28 28 L12 6 A24 24 0 0 1 44 6 Z" fill="url(#binConeGrad)"/>
    </svg>
  `;

  const dot = document.createElement("div");
  dot.style.width = "18px";
  dot.style.height = "18px";
  dot.style.borderRadius = "9999px";
  dot.style.background = "#2563EB";
  dot.style.border = "3px solid #FFFFFF";
  dot.style.boxShadow = "0 2px 8px rgba(37, 99, 235, 0.55)";
  dot.style.position = "relative";
  dot.style.zIndex = "2";

  root.appendChild(cone);
  root.appendChild(dot);
  return { root, cone };
}

function remoteStatusBadgeText(status: LocationStatus): { text: string; bg: string } {
  if (status === "live") return { text: "LIVE", bg: "#10B981" };
  if (status === "stale") return { text: "UPDATING", bg: "#F59E0B" };
  return { text: "LAST SEEN", bg: "#64748B" };
}

function buildRemotePlumberElement(
  label: string,
  status: LocationStatus
): {
  root: HTMLDivElement;
  iconWrap: HTMLDivElement;
  badge: HTMLSpanElement;
  nameSpan: HTMLSpanElement;
} {
  const safeLabel = escapeHtml(label);
  const badgeInfo = remoteStatusBadgeText(status);

  const root = document.createElement("div");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.alignItems = "center";
  root.style.pointerEvents = "auto";

  const pill = document.createElement("div");
  pill.style.display = "inline-flex";
  pill.style.alignItems = "center";
  pill.style.gap = "5px";
  pill.style.marginBottom = "4px";
  pill.style.background = "rgba(11, 31, 58, 0.94)";
  pill.style.color = "#FFFFFF";
  pill.style.padding = "2px 8px";
  pill.style.borderRadius = "9999px";
  pill.style.fontSize = "10px";
  pill.style.fontWeight = "700";
  pill.style.whiteSpace = "nowrap";
  pill.style.boxShadow = "0 2px 8px rgba(0,0,0,0.28)";

  const badge = document.createElement("span");
  badge.textContent = badgeInfo.text;
  badge.style.background = badgeInfo.bg;
  badge.style.color = "#FFFFFF";
  badge.style.padding = "1px 5px";
  badge.style.borderRadius = "9999px";
  badge.style.fontSize = "9px";
  badge.style.fontWeight = "800";
  badge.style.letterSpacing = "0.04em";

  const nameSpan = document.createElement("span");
  nameSpan.textContent = safeLabel;
  pill.appendChild(badge);
  pill.appendChild(nameSpan);

  const iconWrap = document.createElement("div");
  iconWrap.style.width = "40px";
  iconWrap.style.height = "40px";
  iconWrap.style.borderRadius = "9999px";
  iconWrap.style.background = "#0B1F3A";
  iconWrap.style.border = "3px solid #F5B301";
  iconWrap.style.boxShadow = "0 4px 12px rgba(11,31,58,0.4)";
  iconWrap.style.display = "flex";
  iconWrap.style.alignItems = "center";
  iconWrap.style.justifyContent = "center";
  iconWrap.style.transformOrigin = "50% 50%";
  iconWrap.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F5B301" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10 17h4V5H2v12h3"/>
      <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5"/>
      <circle cx="7.5" cy="17.5" r="2.5"/>
      <circle cx="17.5" cy="17.5" r="2.5"/>
    </svg>
  `;

  root.appendChild(pill);
  root.appendChild(iconWrap);
  return { root, iconWrap, badge, nameSpan };
}

const OVERLAY_SOURCE_IDS = {
  accuracy: "live-map-accuracy-src",
  passedRoute: "live-map-passed-route-src",
  roadRoute: "live-map-road-route-src",
  straightLine: "live-map-straight-line-src",
} as const;

export type CameraMode = "following-own" | "following-remote" | "overview" | "free";

export function LiveMap({
  markers,
  center,
  zoom = 13,
  heightClassName = "h-64",
  interactivePicker = false,
  onPickLocation,
  onMarkerClick,
  roadRoutePoints,
  straightLine,
  polyline,
  accuracyCircle,
  selectedMarkerId,
  focusMarkerId,
  focusSeq,
  ownPosition,
  destination,
  navigationMode = false,
  onNeedReroute,
  remotePlumber,
}: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const maplibreRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markerInstancesRef = useRef<
    Map<
      string,
      {
        marker: import("maplibre-gl").Marker;
        signature: string;
        animFrame?: number;
      }
    >
  >(new Map());
  const lastFittedIdsRef = useRef<string>("");
  const lastFocusIdRef = useRef<string | null | undefined>(undefined);
  const lastFocusSeqRef = useRef<number | undefined>(focusSeq);

  const onPickRef = useRef(onPickLocation);
  const interactivePickerRef = useRef(interactivePicker);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onNeedRerouteRef = useRef(onNeedReroute);

  const [mapStyle, setMapStyle] = useState<"street" | "satellite">("street");
  const [styleLoaded, setStyleLoaded] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [followPaused, setFollowPaused] = useState(false);
  const [headingUp, setHeadingUp] = useState(true);
  const [lowFps, setLowFps] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>(
    navigationMode ? "following-own" : "overview"
  );
  const [isDev, setIsDev] = useState(process.env.NODE_ENV === "development");
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("gpsdiag=1")) {
      setIsDev(true);
    }
  }, []);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagSnapshot, setDiagSnapshot] = useState<Record<string, unknown> | null>(null);
  const diagOpenRef = useRef(false);
  useEffect(() => {
    diagOpenRef.current = diagOpen;
  }, [diagOpen]);
  const diagLogRef = useRef<Record<string, unknown>[]>([]);
  const diagLastIngestRef = useRef<{
    accepted: boolean;
    rejectionReason: string | null;
    rawLat: number;
    rawLng: number;
    accuracy: number | null;
    speed: number | null;
    heading: number | null;
    timestampMs: number;
    receivedAtMs: number;
  } | null>(null);
  const lastDiagEmitMsRef = useRef(0);

  const followPausedRef = useRef(false);
  const headingUpRef = useRef(true);
  const lowFpsRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const navModeRef = useRef(navigationMode);
  const destinationRef = useRef(destination);
  const cameraModeRef = useRef<CameraMode>(navigationMode ? "following-own" : "overview");

  useEffect(() => {
    navModeRef.current = navigationMode;
    if (navigationMode) {
      cameraModeRef.current = "following-own";
      setCameraMode("following-own");
      setFollowPaused(false);
      followPausedRef.current = false;
    } else if (cameraModeRef.current === "following-own") {
      cameraModeRef.current = "overview";
      setCameraMode("overview");
    }
  }, [navigationMode]);

  useEffect(() => {
    destinationRef.current = destination;
  }, [destination]);

  useEffect(() => {
    onNeedRerouteRef.current = onNeedReroute;
  }, [onNeedReroute]);

  useEffect(() => {
    followPausedRef.current = followPaused;
  }, [followPaused]);

  useEffect(() => {
    headingUpRef.current = headingUp;
  }, [headingUp]);

  useEffect(() => {
    lowFpsRef.current = lowFps;
  }, [lowFps]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = mq.matches;
    };
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const deviceHeading = useDeviceHeading({
    enabled: Boolean(ownPosition),
    gpsHeadingDeg: ownPosition?.heading ?? null,
    gpsSpeedMps: ownPosition?.speed ?? null,
  });
  const headingStateRef = useRef(deviceHeading);
  useEffect(() => {
    headingStateRef.current = deviceHeading;
  }, [deviceHeading]);

  // Latest overlay data refs so style reloads restore overlays cleanly
  const overlaysRef = useRef({
    roadRoutePoints,
    straightLine,
    polyline,
    accuracyCircle,
  });

  useEffect(() => {
    overlaysRef.current = { roadRoutePoints, straightLine, polyline, accuracyCircle };
  }, [roadRoutePoints, straightLine, polyline, accuracyCircle]);

  useEffect(() => {
    if (center || typeof navigator === "undefined" || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  }, [center]);

  useEffect(() => {
    onPickRef.current = onPickLocation;
  }, [onPickLocation]);

  useEffect(() => {
    interactivePickerRef.current = interactivePicker;
  }, [interactivePicker]);

  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  const syncOverlaysToMap = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const {
      roadRoutePoints: rr,
      straightLine: sl,
      polyline: pl,
      accuracyCircle: ac,
    } = overlaysRef.current;

    const accData = ac
      ? buildCircleGeoJson(ac.lat, ac.lng, ac.radiusM)
      : { type: "FeatureCollection" as const, features: [] };
    const roadData = toLineGeoJson(rr);
    const directData = toLineGeoJson(sl || pl);

    // Accuracy circle
    const accSrc = map.getSource(OVERLAY_SOURCE_IDS.accuracy) as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (accSrc) {
      accSrc.setData(accData);
    } else {
      map.addSource(OVERLAY_SOURCE_IDS.accuracy, { type: "geojson", data: accData });
      map.addLayer({
        id: "live-map-accuracy-fill",
        type: "fill",
        source: OVERLAY_SOURCE_IDS.accuracy,
        paint: { "fill-color": "#2563EB", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "live-map-accuracy-stroke",
        type: "line",
        source: OVERLAY_SOURCE_IDS.accuracy,
        paint: { "line-color": "#2563EB", "line-width": 1.5, "line-opacity": 0.45 },
      });
    }

    // Straight-line fallback
    const directSrc = map.getSource(OVERLAY_SOURCE_IDS.straightLine) as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (directSrc) {
      directSrc.setData(directData);
    } else {
      map.addSource(OVERLAY_SOURCE_IDS.straightLine, {
        type: "geojson",
        data: directData,
      });
      map.addLayer({
        id: "live-map-straight-line",
        type: "line",
        source: OVERLAY_SOURCE_IDS.straightLine,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#64748B",
          "line-width": 3,
          "line-dasharray": [2, 2],
          "line-opacity": 0.85,
        },
      });
    }

    // Passed portion of road route (grey)
    const passedData = toLineGeoJson(undefined);
    const passedSrc = map.getSource(OVERLAY_SOURCE_IDS.passedRoute) as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (!passedSrc) {
      map.addSource(OVERLAY_SOURCE_IDS.passedRoute, { type: "geojson", data: passedData });
      map.addLayer({
        id: "live-map-road-passed",
        type: "line",
        source: OVERLAY_SOURCE_IDS.passedRoute,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#94A3B8", "line-width": 5, "line-opacity": 0.75 },
      });
    }

    // Road route (navy casing + gold/blue core)
    const roadSrc = map.getSource(OVERLAY_SOURCE_IDS.roadRoute) as
      | import("maplibre-gl").GeoJSONSource
      | undefined;
    if (roadSrc) {
      roadSrc.setData(roadData);
    } else {
      map.addSource(OVERLAY_SOURCE_IDS.roadRoute, { type: "geojson", data: roadData });
      map.addLayer({
        id: "live-map-road-casing",
        type: "line",
        source: OVERLAY_SOURCE_IDS.roadRoute,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0B1F3A", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "live-map-road-core",
        type: "line",
        source: OVERLAY_SOURCE_IDS.roadRoute,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#F5B301", "line-width": 4, "line-opacity": 0.95 },
      });
    }
  }, []);

  const fitAllMarkers = useCallback(() => {
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!map || !ml) return;
    const pts: [number, number][] = markers.map((m) => [m.lng, m.lat]);
    if (remotePlumber) {
      pts.push([remotePlumber.lng, remotePlumber.lat]);
    }
    if (ownPosition) {
      pts.push([ownPosition.lng, ownPosition.lat]);
    }
    if (pts.length === 1) {
      map.easeTo({
        center: pts[0],
        zoom: Math.max(zoom, 14),
        duration: 500,
      });
    } else if (pts.length > 1) {
      const bounds = new ml.LngLatBounds();
      for (const p of pts) bounds.extend(p);
      map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 500 });
    } else {
      const target = center || userLocation || SERVICE_AREA_CENTER;
      map.easeTo({
        center: [target.lng, target.lat],
        zoom,
        duration: 500,
      });
    }
  }, [markers, remotePlumber, ownPosition, center, userLocation, zoom]);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const instances = markerInstancesRef.current;

    async function init() {
      if (!containerRef.current || mapRef.current) return;
      const mlMod = await import("maplibre-gl");
      const ml = (mlMod as unknown as { default?: typeof import("maplibre-gl") }).default || mlMod;
      await import("maplibre-gl/dist/maplibre-gl.css");
      if (typeof ml.setWorkerUrl === "function") {
        ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      }
      if (cancelled || !containerRef.current) return;

      maplibreRef.current = ml;
      const initialCenter = center || SERVICE_AREA_CENTER;
      const map = new ml.Map({
        container: containerRef.current,
        style: getMapStyle("street"),
        center: [initialCenter.lng, initialCenter.lat],
        zoom,
        maxZoom: MAP_CONFIG.maxZoom,
        pitchWithRotate: false,
      });

      map.addControl(new ml.NavigationControl({ showCompass: false }), "bottom-right");

      map.on("load", () => {
        setStyleLoaded(true);
        setTileError(false);
        // Disable 3D buildings on hosted vector styles to keep low-end Android smooth
        const style = map.getStyle();
        if (style?.layers) {
          for (const layer of style.layers) {
            if (layer.type === "fill-extrusion") {
              map.setLayoutProperty(layer.id, "visibility", "none");
            }
          }
        }
        syncOverlaysToMap();
      });

      map.on("styledata", () => {
        if (map.isStyleLoaded()) {
          setStyleLoaded(true);
          syncOverlaysToMap();
        }
      });

      map.on("idle", () => {
        setTileError(false);
      });

      map.on("error", (ev: { error?: { message?: string } }) => {
        const msg = String(ev?.error?.message || "");
        if (/tile|fetch|network|403|404|429/i.test(msg)) {
          setTileError(true);
        }
      });

      map.on("click", (e: import("maplibre-gl").MapMouseEvent) => {
        if (interactivePickerRef.current) {
          onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
        }
      });

      const pauseFollowForUser = (ev: { originalEvent?: unknown }) => {
        if (!ev?.originalEvent) return;
        setFollowPaused(true);
        followPausedRef.current = true;
        cameraModeRef.current = "free";
        setCameraMode("free");
        if (resumeTimerRef.current != null) {
          window.clearTimeout(resumeTimerRef.current);
        }
        resumeTimerRef.current = window.setTimeout(() => {
          setFollowPaused(false);
          followPausedRef.current = false;
          resumeTimerRef.current = null;
          if (navModeRef.current) {
            cameraModeRef.current = "following-own";
            setCameraMode("following-own");
          }
        }, 10_000);
      };
      map.on("dragstart", pauseFollowForUser);
      map.on("zoomstart", pauseFollowForUser);
      map.on("rotatestart", pauseFollowForUser);
      map.on("pitchstart", pauseFollowForUser);

      mapRef.current = map;

      if (typeof ResizeObserver !== "undefined" && containerRef.current) {
        resizeObserver = new ResizeObserver(() => {
          map.resize();
        });
        resizeObserver.observe(containerRef.current);
      }
    }

    void init();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      for (const entry of instances.values()) {
        if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
        entry.marker.remove();
      }
      instances.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch street / satellite style
  const prevStyleModeRef = useRef<"street" | "satellite">("street");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || prevStyleModeRef.current === mapStyle) return;
    prevStyleModeRef.current = mapStyle;
    setTileError(false);
    map.setStyle(getMapStyle(mapStyle));
  }, [mapStyle]);

  // Update overlays when route or accuracy circle changes
  useEffect(() => {
    if (styleLoaded) {
      syncOverlaysToMap();
    }
  }, [styleLoaded, roadRoutePoints, straightLine, polyline, accuracyCircle, syncOverlaysToMap]);

  // ---------------------------------------------------------------------------
  // Continuous 60 fps Own-Position + Remote-Plumber + Camera-Follow Controller
  // ---------------------------------------------------------------------------
  const ownMarkerRef = useRef<{
    marker: import("maplibre-gl").Marker;
    cone: HTMLDivElement;
  } | null>(null);
  const ownBufferRef = useRef<FixBufferState>(createFixBufferState());
  const ownLatestRef = useRef(ownPosition);
  useEffect(() => {
    ownLatestRef.current = ownPosition;
  });

  const remoteMarkerRef = useRef<{
    marker: import("maplibre-gl").Marker;
    iconWrap: HTMLDivElement;
    badge: HTMLSpanElement;
    nameSpan: HTMLSpanElement;
  } | null>(null);
  const remoteBufferRef = useRef<FixBufferState>(createFixBufferState());
  const remoteHeadingRef = useRef<number | null>(null);
  const remoteLatestRef = useRef(remotePlumber);
  useEffect(() => {
    remoteLatestRef.current = remotePlumber;
  });

  const cameraPoseRef = useRef<CameraPose | null>(null);
  const transitionUntilPerfRef = useRef<number>(0);
  const routeSnapActiveRef = useRef<boolean>(false);
  const offRouteRef = useRef<OffRouteState>({ offRouteSinceMs: null, lastRerouteAtMs: 0 });
  const prevRouteSegRef = useRef<number | null>(null);
  const lastRouteKeyRef = useRef<string>("");
  const lastRouteSplitMsRef = useRef(0);
  const lastSplitSegRef = useRef<number | null>(null);
  const lastAccUpdateMsRef = useRef(0);
  const lastAccStateRef = useRef<{ lat: number; lng: number; radiusM: number } | null>(null);
  const arrivalFittedRef = useRef(false);
  const remoteFittedKeyRef = useRef<string>("");

  // Reset route continuity ONLY when a genuinely new route is installed
  useEffect(() => {
    const pts = roadRoutePoints;
    const key =
      pts && pts.length >= 2
        ? `${pts.length}:${pts[0][0].toFixed(4)},${pts[0][1].toFixed(4)}->${pts[pts.length - 1][0].toFixed(4)},${pts[pts.length - 1][1].toFixed(4)}`
        : "";
    if (key !== lastRouteKeyRef.current) {
      lastRouteKeyRef.current = key;
      prevRouteSegRef.current = null;
      lastSplitSegRef.current = null;
    }
  }, [roadRoutePoints]);

  // 1) Own-position GPS ingestion (keyed on primitive values, never restarts rAF)
  const ownLat = ownPosition?.lat ?? null;
  const ownLng = ownPosition?.lng ?? null;
  const ownTs = ownPosition?.timestampMs ?? null;
  const ownAcc = ownPosition?.accuracyM ?? null;
  const ownSpeed = ownPosition?.speed ?? null;
  const ownHeading = ownPosition?.heading ?? null;

  useEffect(() => {
    if (ownLat == null || ownLng == null) {
      ownBufferRef.current = createFixBufferState();
      arrivalFittedRef.current = false;
      if (ownMarkerRef.current) {
        ownMarkerRef.current.marker.remove();
        ownMarkerRef.current = null;
      }
      return;
    }

    // Sample in pure GPS coordinate space (never route-snapped space) to keep interpolation clean
    const nowPerf = performance.now();
    const currentGpsPos = sampleBufferedPosition(
      ownBufferRef.current,
      nowPerf,
      NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS,
      headingStateRef.current.heading
    );

    const { accepted, rejectionReason, nextState } = pushFixToBuffer(
      ownBufferRef.current,
      {
        lat: ownLat,
        lng: ownLng,
        accuracy: ownAcc,
        speed: ownSpeed,
        heading: ownHeading,
        timestampMs: ownTs || Date.now(),
      },
      nowPerf,
      {
        currentDisplayed: currentGpsPos ? { lat: currentGpsPos.lat, lng: currentGpsPos.lng } : null,
        minDurationMs: reducedMotionRef.current ? 1 : 250,
        maxDurationMs: reducedMotionRef.current ? 1 : 2_000,
        allowWarmupAccuracyMs: 10_000,
      }
    );
    ownBufferRef.current = nextState;
    if (isDev) {
      diagLastIngestRef.current = {
        accepted,
        rejectionReason,
        rawLat: ownLat,
        rawLng: ownLng,
        accuracy: ownAcc,
        speed: ownSpeed,
        heading: ownHeading,
        timestampMs: ownTs || Date.now(),
        receivedAtMs: Date.now(),
      };
    }
  }, [ownLat, ownLng, ownTs, ownAcc, ownSpeed, ownHeading, isDev]);

  // 2) Remote-plumber GPS ingestion (keyed ONLY on primitive values; immune to parent re-renders)
  const remLat = remotePlumber?.lat ?? null;
  const remLng = remotePlumber?.lng ?? null;
  const remCoordMs = remotePlumber?.coordinatesAtMs ?? null;
  const remSpeed = remotePlumber?.speed ?? null;
  const remHeading = remotePlumber?.heading ?? null;
  const remAcc = remotePlumber?.accuracyM ?? null;

  useEffect(() => {
    if (remLat == null || remLng == null) {
      remoteBufferRef.current = createFixBufferState();
      remoteHeadingRef.current = null;
      if (remoteMarkerRef.current) {
        remoteMarkerRef.current.marker.remove();
        remoteMarkerRef.current = null;
      }
      return;
    }

    const nowPerf = performance.now();
    const currentGpsPos = sampleBufferedPosition(
      remoteBufferRef.current,
      nowPerf,
      NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS
    );

    const { accepted, nextState } = pushFixToBuffer(
      remoteBufferRef.current,
      {
        lat: remLat,
        lng: remLng,
        accuracy: remAcc,
        speed: remSpeed,
        heading: remHeading,
        timestampMs: remCoordMs || Date.now(),
      },
      nowPerf,
      {
        currentDisplayed: currentGpsPos ? { lat: currentGpsPos.lat, lng: currentGpsPos.lng } : null,
        minDurationMs: reducedMotionRef.current ? 1 : 400,
        maxDurationMs: reducedMotionRef.current ? 1 : 5_000,
        allowWarmupAccuracyMs: 15_000,
      }
    );
    if (accepted) {
      remoteBufferRef.current = nextState;
      if (remHeading != null && Number.isFinite(remHeading)) {
        remoteHeadingRef.current = smoothHeading(remoteHeadingRef.current, remHeading, 0.35);
      }
    }
  }, [remLat, remLng, remCoordMs, remSpeed, remHeading, remAcc]);

  // 3) Remote-plumber metadata handler (updates label & LIVE/UPDATING/LAST SEEN badge in-place)
  const remLabel = remotePlumber?.label ?? "";
  const remStatus = remotePlumber?.status ?? "unavailable";

  useEffect(() => {
    const obj = remoteMarkerRef.current;
    if (!obj) return;
    const badgeInfo = remoteStatusBadgeText(remStatus);
    obj.badge.textContent = badgeInfo.text;
    obj.badge.style.background = badgeInfo.bg;
    obj.nameSpan.textContent = escapeHtml(remLabel);
  }, [remLabel, remStatus]);

  // 4) One-time fit when tracked target/destination changes (NOT on every GPS tick!)
  const markersKey = markers.map((m) => `${m.id}:${m.lat.toFixed(4)},${m.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!map || !ml || !styleLoaded) return;
    if (remLat == null || remLng == null) {
      remoteFittedKeyRef.current = "";
      return;
    }
    const fitKey = `${remLabel}|${markersKey}`;
    if (fitKey === remoteFittedKeyRef.current) return;
    remoteFittedKeyRef.current = fitKey;

    if (cameraModeRef.current === "free") return;
    if (markers.length > 0) {
      const bounds = new ml.LngLatBounds([remLng, remLat], [remLng, remLat]);
      for (const m of markers) bounds.extend([m.lng, m.lat]);
      map.fitBounds(bounds, {
        padding: 56,
        maxZoom: 16,
        duration: reducedMotionRef.current ? 0 : 600,
      });
    } else {
      map.easeTo({
        center: [remLng, remLat],
        duration: reducedMotionRef.current ? 0 : 600,
      });
    }
  }, [styleLoaded, remLabel, markersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 5) Single continuous rAF animation & damped-spring camera loop per map lifecycle
  const hasOwn = ownLat != null && ownLng != null;
  const hasRemote = remLat != null && remLng != null;

  useEffect(() => {
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!map || !ml || !styleLoaded || (!hasOwn && !hasRemote)) return;

    if (hasOwn && !ownMarkerRef.current && ownLatestRef.current) {
      const { root, cone } = buildOwnDotElement();
      const marker = new ml.Marker({ element: root, anchor: "center" })
        .setLngLat([ownLatestRef.current.lng, ownLatestRef.current.lat])
        .addTo(map);
      ownMarkerRef.current = { marker, cone };
    }

    if (hasRemote && !remoteMarkerRef.current && remoteLatestRef.current) {
      const r = remoteLatestRef.current;
      const { root, iconWrap, badge, nameSpan } = buildRemotePlumberElement(r.label, r.status);
      const marker = new ml.Marker({ element: root, anchor: "bottom" })
        .setLngLat([r.lng, r.lat])
        .addTo(map);
      remoteMarkerRef.current = { marker, iconWrap, badge, nameSpan };
    }

    let rafId = 0;
    let lastFramePerf = performance.now();
    let slowFrames = 0;
    let fastFrames = 0;

    const tick = (nowPerf: number) => {
      const frameDelta = Math.max(1, Math.min(100, nowPerf - lastFramePerf));
      lastFramePerf = nowPerf;

      // Low-FPS hysteresis: drop pitch after 15 slow frames (>50ms), recover after 90 smooth frames (<25ms)
      if (frameDelta > 50) {
        slowFrames += 1;
        fastFrames = 0;
        if (slowFrames >= 15 && !lowFpsRef.current) {
          lowFpsRef.current = true;
          setLowFps(true);
        }
      } else {
        slowFrames = 0;
        if (lowFpsRef.current && frameDelta < 25) {
          fastFrames += 1;
          if (fastFrames >= 90) {
            lowFpsRef.current = false;
            setLowFps(false);
            fastFrames = 0;
          }
        } else {
          fastFrames = 0;
        }
      }

      // ---- A. Own-position dot + route snap + continuous follow camera ----
      const dotObj = ownMarkerRef.current;
      const ownSample = hasOwn
        ? sampleBufferedPosition(
            ownBufferRef.current,
            nowPerf,
            NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS,
            headingStateRef.current.heading
          )
        : null;

      if (dotObj && ownSample) {
        let lat = ownSample.lat;
        let lng = ownSample.lng;
        let activeProjSeg: number | null = prevRouteSegRef.current;
        let activeProjDistM: number | null = null;
        let snappedPos: { lat: number; lng: number } | null = null;

        // Route projection & snapping: snap EVERY frame for smooth 60fps road glide,
        // while throttling GeoJSON route-split & off-route checks to ~5 Hz.
        const routePts = overlaysRef.current.roadRoutePoints;
        if (routePts && routePts.length >= 2) {
          const proj = projectPointOntoRoute([lat, lng], routePts, {
            prevSegmentIndex: prevRouteSegRef.current,
          });
          if (proj) {
            prevRouteSegRef.current = proj.segmentIndex;
            activeProjSeg = proj.segmentIndex;
            activeProjDistM = proj.distanceMeters;
            // Hysteresis: snap ON <= 25 m, snap OFF > 35 m so boundary noise doesn't ping-pong
            if (proj.distanceMeters <= 25) {
              routeSnapActiveRef.current = true;
            } else if (proj.distanceMeters > 35) {
              routeSnapActiveRef.current = false;
            }
            if (routeSnapActiveRef.current && proj.distanceMeters <= 35) {
              lat = proj.snappedPoint[0];
              lng = proj.snappedPoint[1];
              snappedPos = { lat, lng };
            }

            if (nowPerf - lastRouteSplitMsRef.current >= 200) {
              lastRouteSplitMsRef.current = nowPerf;
              if (lastSplitSegRef.current !== proj.segmentIndex) {
                lastSplitSegRef.current = proj.segmentIndex;
                const { passed, remaining } = splitRouteAtProjection(routePts, proj);
                const passedSrc = map.getSource(OVERLAY_SOURCE_IDS.passedRoute) as
                  | import("maplibre-gl").GeoJSONSource
                  | undefined;
                const roadSrc = map.getSource(OVERLAY_SOURCE_IDS.roadRoute) as
                  | import("maplibre-gl").GeoJSONSource
                  | undefined;
                if (passedSrc) passedSrc.setData(toLineGeoJson(passed));
                if (roadSrc) roadSrc.setData(toLineGeoJson(remaining));
              }
              if (navModeRef.current) {
                const rerouteCheck = updateOffRouteState(
                  offRouteRef.current,
                  proj.distanceMeters,
                  Date.now()
                );
                offRouteRef.current = rerouteCheck.nextState;
                if (rerouteCheck.shouldReroute) {
                  onNeedRerouteRef.current?.();
                }
              }
            }
          }
        }

        dotObj.marker.setLngLat([lng, lat]);

        if (isDev && nowPerf - lastDiagEmitMsRef.current >= 200) {
          lastDiagEmitMsRef.current = nowPerf;
          const buf = ownBufferRef.current;
          const ing = diagLastIngestRef.current;
          const stab = buf.latestFix;
          const raw = buf.rawLatestFix;
          const camCenter = map.getCenter();
          const entry = {
            atIso: new Date().toISOString(),
            gps: ing
              ? {
                  rawLat: ing.rawLat,
                  rawLng: ing.rawLng,
                  accuracyM: ing.accuracy,
                  speedMps: ing.speed,
                  headingDeg: ing.heading,
                  timestampMs: ing.timestampMs,
                  ageSinceLastMs: Date.now() - ing.receivedAtMs,
                }
              : null,
            processing: {
              lastAccepted: raw ? { lat: raw.lat, lng: raw.lng } : null,
              stabilized: stab ? { lat: stab.lat, lng: stab.lng } : null,
              interpolated: { lat: ownSample.lat, lng: ownSample.lng },
              snapped: snappedPos,
              distRawToStabM:
                raw && stab ? Math.round(haversineMeters(raw.lat, raw.lng, stab.lat, stab.lng) * 10) / 10 : null,
              distStabToRenderedM: stab
                ? Math.round(haversineMeters(stab.lat, stab.lng, lat, lng) * 10) / 10
                : null,
              routeSeg: activeProjSeg,
              routeDistM: activeProjDistM != null ? Math.round(activeProjDistM * 10) / 10 : null,
              snapActive: routeSnapActiveRef.current,
            },
            controller: {
              movementState: buf.movementState,
              interpProgress: Math.round(ownSample.progress * 100) / 100,
              extrapolating: ownSample.extrapolating,
              stale: ownSample.stale,
              accepted: ing?.accepted ?? null,
              rejectionReason: ing?.rejectionReason ?? null,
            },
            camera: {
              mode: cameraModeRef.current,
              currentCenter: { lat: camCenter.lat, lng: camCenter.lng },
              targetCenter: { lat, lng },
              currentBearing: Math.round(map.getBearing()),
              targetBearing:
                headingUpRef.current && headingStateRef.current.heading != null
                  ? Math.round(headingStateRef.current.heading)
                  : 0,
              paused: followPausedRef.current || nowPerf < transitionUntilPerfRef.current,
            },
          };
          diagLogRef.current.push(entry);
          if (diagLogRef.current.length > 500) {
            diagLogRef.current.shift();
          }
          if (diagOpenRef.current) {
            setDiagSnapshot(entry);
          }
        }

        // Direction cone
        const hd = headingStateRef.current;
        if (hd.hasLiveHeading && hd.heading != null) {
          dotObj.cone.style.display = "block";
          const mapBearing = map.getBearing();
          dotObj.cone.style.transform = `rotate(${hd.heading - mapBearing}deg)`;
        } else {
          dotObj.cone.style.display = "none";
        }

        // Throttled accuracy circle (~4.5 Hz, only when moved >=2m or radius changed >=3m)
        const latestFix = ownBufferRef.current.latestFix;
        if (latestFix?.accuracy != null && nowPerf - lastAccUpdateMsRef.current >= 220) {
          const prevAcc = lastAccStateRef.current;
          const movedEnough =
            !prevAcc ||
            haversineMeters(prevAcc.lat, prevAcc.lng, lat, lng) >= 2 ||
            Math.abs(prevAcc.radiusM - latestFix.accuracy) >= 3;
          if (movedEnough) {
            lastAccUpdateMsRef.current = nowPerf;
            lastAccStateRef.current = { lat, lng, radiusM: latestFix.accuracy };
            const accSrc = map.getSource(OVERLAY_SOURCE_IDS.accuracy) as
              | import("maplibre-gl").GeoJSONSource
              | undefined;
            if (accSrc) accSrc.setData(buildCircleGeoJson(lat, lng, latestFix.accuracy));
          }
        }

        // Continuous damped-spring camera follow (every rAF frame, unless a one-off easeTo is running)
        if (cameraModeRef.current === "following-own") {
          if (nowPerf < transitionUntilPerfRef.current) {
            const c = map.getCenter();
            cameraPoseRef.current = { lat: c.lat, lng: c.lng, bearing: map.getBearing() };
          } else {
            const dest = destinationRef.current;
          const distToDest = dest ? haversineMeters(lat, lng, dest.lat, dest.lng) : Infinity;

          if (dest && distToDest <= 75) {
            if (!arrivalFittedRef.current) {
              arrivalFittedRef.current = true;
              if ((map.getPadding().top || 0) > 0) {
                map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
              }
              const bounds = new ml.LngLatBounds([lng, lat], [lng, lat]);
              bounds.extend([dest.lng, dest.lat]);
              map.fitBounds(bounds, {
                padding: 56,
                maxZoom: 18,
                duration: reducedMotionRef.current ? 0 : 600,
              });
            }
          } else {
            arrivalFittedRef.current = false;
            const h = containerRef.current?.clientHeight || 360;
            const targetTopPad = Math.round(h * 0.4);
            const curPad = map.getPadding();
            if (Math.abs((curPad.top || 0) - targetTopPad) > 4) {
              map.setPadding({ top: targetTopPad, bottom: 0, left: 0, right: 0 });
            }

            const speed = latestFix?.speed ?? 0;
            const targetZoom = speed >= 10 ? 16 : 17;
            const isPhone = typeof window !== "undefined" && window.innerWidth < 768;
            const targetPitch =
              isPhone && !reducedMotionRef.current && !lowFpsRef.current ? 40 : 0;
            const targetBearing =
              headingUpRef.current && hd.heading != null ? hd.heading : 0;

            const nextPose = reducedMotionRef.current
              ? { lat, lng, bearing: targetBearing }
              : stepCameraFollow(
                  cameraPoseRef.current,
                  { lat, lng, bearing: targetBearing },
                  frameDelta
                );
            cameraPoseRef.current = nextPose;

            map.jumpTo({
              center: [nextPose.lng, nextPose.lat],
              zoom: targetZoom,
              bearing: nextPose.bearing,
              pitch: targetPitch,
            });
          }
          }
        } else if ((map.getPadding().top || 0) > 0) {
          map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
          cameraPoseRef.current = null;
        }
      }

      // ---- B. Remote-plumber marker (60 fps continuous buffer + 5s bounded extrapolation) ----
      const remObj = remoteMarkerRef.current;
      const remSample = hasRemote
        ? sampleBufferedPosition(
            remoteBufferRef.current,
            nowPerf,
            NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS
          )
        : null;

      if (remObj && remSample) {
        remObj.marker.setLngLat([remSample.lng, remSample.lat]);
        if (remoteHeadingRef.current != null) {
          remObj.iconWrap.style.transform = `rotate(${remoteHeadingRef.current - map.getBearing()}deg)`;
        }
        if (cameraModeRef.current === "following-remote") {
          const nextPose = reducedMotionRef.current
            ? { lat: remSample.lat, lng: remSample.lng, bearing: map.getBearing() }
            : stepCameraFollow(
                cameraPoseRef.current,
                { lat: remSample.lat, lng: remSample.lng, bearing: map.getBearing() },
                frameDelta,
                { posTauMs: 180 }
              );
          cameraPoseRef.current = nextPose;
          map.jumpTo({
            center: [nextPose.lng, nextPose.lat],
            zoom: Math.max(map.getZoom(), 15),
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [styleLoaded, hasOwn, hasRemote, isDev]);

  const fitAllMarkersRef = useRef(fitAllMarkers);
  useEffect(() => {
    fitAllMarkersRef.current = fitAllMarkers;
  }, [fitAllMarkers]);

  // Sync markers with smooth interpolation
  useEffect(() => {
    const map = mapRef.current;
    const ml = maplibreRef.current;
    if (!map || !ml) return;

    const instances = markerInstancesRef.current;
    const nextIds = new Set(markers.map((m) => m.id));

    for (const [id, entry] of instances.entries()) {
      if (!nextIds.has(id)) {
        if (entry.animFrame) cancelAnimationFrame(entry.animFrame);
        entry.marker.remove();
        instances.delete(id);
      }
    }

    for (const m of markers) {
      const selected = selectedMarkerId === m.id;
      const signature = `${m.kind}|${m.label}|${selected ? "1" : "0"}`;
      const existing = instances.get(m.id);

      if (!existing) {
        const el = buildPinElement(m.kind, m.label, selected);
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onMarkerClickRef.current?.(m.id);
        });
        const marker = new ml.Marker({ element: el, anchor: "bottom" })
          .setLngLat([m.lng, m.lat])
          .addTo(map);
        instances.set(m.id, { marker, signature });
      } else {
        if (existing.signature !== signature) {
          const nextEl = buildPinElement(m.kind, m.label, selected);
          nextEl.addEventListener("click", (ev) => {
            ev.stopPropagation();
            onMarkerClickRef.current?.(m.id);
          });
          existing.marker.remove();
          const marker = new ml.Marker({ element: nextEl, anchor: "bottom" })
            .setLngLat([m.lng, m.lat])
            .addTo(map);
          if (existing.animFrame) cancelAnimationFrame(existing.animFrame);
          instances.set(m.id, { marker, signature });
        } else {
          const cur = existing.marker.getLngLat();
          const dLat = m.lat - cur.lat;
          const dLng = m.lng - cur.lng;
          if (Math.abs(dLat) > 0.000002 || Math.abs(dLng) > 0.000002) {
            if (existing.animFrame) cancelAnimationFrame(existing.animFrame);
            const startLat = cur.lat;
            const startLng = cur.lng;
            const startTime = performance.now();
            const duration = 650;
            const step = (now: number) => {
              const t = Math.min(1, (now - startTime) / duration);
              const eased = 1 - Math.pow(1 - t, 3);
              existing.marker.setLngLat([
                startLng + dLng * eased,
                startLat + dLat * eased,
              ]);
              if (t < 1) {
                existing.animFrame = requestAnimationFrame(step);
              } else {
                existing.animFrame = undefined;
              }
            };
            existing.animFrame = requestAnimationFrame(step);
          }
        }
      }
    }

    const idsKey = markers.map((m) => m.id).sort().join(",");
    if (idsKey && idsKey !== lastFittedIdsRef.current) {
      lastFittedIdsRef.current = idsKey;
      fitAllMarkersRef.current();
    }
  }, [markers, selectedMarkerId]);

  // Explicit focus on a marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusMarkerId) return;
    if (
      focusMarkerId === lastFocusIdRef.current &&
      focusSeq === lastFocusSeqRef.current
    ) {
      return;
    }
    const target = markers.find((m) => m.id === focusMarkerId);
    if (!target) return;
    lastFocusIdRef.current = focusMarkerId;
    lastFocusSeqRef.current = focusSeq;
    map.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 500,
    });
  }, [focusMarkerId, focusSeq, markers]);

  // Center fallback when no markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers.length > 0) return;
    const target = center || userLocation;
    if (!target) return;
    map.easeTo({ center: [target.lng, target.lat], zoom, duration: 400 });
  }, [center, userLocation, zoom, markers.length]);

  const hasRoadRoute = Boolean(roadRoutePoints && roadRoutePoints.length >= 2);
  const directPts = straightLine || polyline;
  const hasStraightLine = Boolean(directPts && directPts.length >= 2);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${heightClassName}`}
    >
      <div
        ref={containerRef}
        className={`h-full w-full ${interactivePicker ? "cursor-crosshair" : ""}`}
      />

      {navigationMode && ownPosition && (
        <div className="pointer-events-none absolute left-2 top-2 z-[400] rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#0B1F3A] shadow-sm backdrop-blur-sm sm:left-3 sm:top-3">
          {ownPosition.accuracyM != null
            ? ownPosition.accuracyM > 100
              ? `GPS ±${Math.round(ownPosition.accuracyM)} m (low)`
              : `GPS ±${Math.round(ownPosition.accuracyM)} m`
            : "GPS active"}
          {ownPosition.speed != null && ownPosition.speed >= 0.5
            ? ` • ${(ownPosition.speed * 3.6).toFixed(0)} km/h`
            : ""}
        </div>
      )}

      {tileError && (
        <div className="pointer-events-none absolute left-3 top-3 z-[400] max-w-[240px] rounded-lg border border-amber-200 bg-amber-50/95 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 shadow-sm">
          Map tiles could not load. Check your connection or zoom level.
        </div>
      )}

      {/* Top-right floating style & recenter controls */}
      <div className="pointer-events-auto absolute right-2 top-2 z-[400] flex flex-wrap items-center justify-end gap-1.5 sm:right-3 sm:top-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200/90 bg-white/95 p-0.5 text-[10px] font-bold shadow-sm backdrop-blur-sm sm:text-[11px]">
          <button
            type="button"
            onClick={() => setMapStyle("street")}
            className={`rounded-md px-2 py-1 transition sm:px-2.5 ${
              mapStyle === "street"
                ? "bg-[#0B1F3A] text-white"
                : "text-slate-600 hover:text-[#0B1F3A]"
            }`}
          >
            Street
          </button>
          <button
            type="button"
            onClick={() => setMapStyle("satellite")}
            className={`rounded-md px-2 py-1 transition sm:px-2.5 ${
              mapStyle === "satellite"
                ? "bg-[#0B1F3A] text-white"
                : "text-slate-600 hover:text-[#0B1F3A]"
            }`}
          >
            Satellite
          </button>
        </div>
        {navigationMode && (
          <>
            <button
              type="button"
              onClick={() => setHeadingUp((prev) => !prev)}
              title={headingUp ? "Switch to North-Up" : "Switch to Heading-Up"}
              className="rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 text-[10px] font-bold text-[#0B1F3A] shadow-sm backdrop-blur-sm transition hover:bg-slate-50 sm:px-2.5 sm:text-[11px]"
            >
              {headingUp ? "Heading Up" : "North Up"}
            </button>
            <button
              type="button"
              onClick={() => {
                const map = mapRef.current;
                const ml = maplibreRef.current;
                if (cameraMode === "overview") {
                  if (resumeTimerRef.current != null) {
                    window.clearTimeout(resumeTimerRef.current);
                    resumeTimerRef.current = null;
                  }
                  setFollowPaused(false);
                  followPausedRef.current = false;
                  cameraModeRef.current = "following-own";
                  setCameraMode("following-own");
                  const pos = sampleBufferedPosition(
                    ownBufferRef.current,
                    performance.now(),
                    NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS
                  );
                  if (map && pos) {
                    map.easeTo({
                      center: [pos.lng, pos.lat],
                      zoom: 17,
                      duration: reducedMotionRef.current ? 0 : 450,
                    });
                  }
                } else {
                  cameraModeRef.current = "overview";
                  setCameraMode("overview");
                  if (map && ml) {
                    map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
                    const bounds = new ml.LngLatBounds();
                    if (ownPosition) bounds.extend([ownPosition.lng, ownPosition.lat]);
                    if (destination) bounds.extend([destination.lng, destination.lat]);
                    if (roadRoutePoints) {
                      for (const [lat, lng] of roadRoutePoints) bounds.extend([lng, lat]);
                    }
                    if (!bounds.isEmpty()) {
                      map.fitBounds(bounds, {
                        padding: 48,
                        maxZoom: 16,
                        duration: reducedMotionRef.current ? 0 : 500,
                      });
                    }
                  }
                }
              }}
              className="rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 text-[10px] font-bold text-[#0B1F3A] shadow-sm backdrop-blur-sm transition hover:bg-slate-50 sm:px-2.5 sm:text-[11px]"
            >
              {cameraMode === "overview" ? "Follow" : "Overview"}
            </button>
          </>
        )}
        {(followPaused || cameraMode === "free") && (
          <button
            type="button"
            onClick={() => {
              if (resumeTimerRef.current != null) {
                window.clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = null;
              }
              setFollowPaused(false);
              followPausedRef.current = false;
              const map = mapRef.current;
              if (navigationMode) {
                cameraModeRef.current = "following-own";
                setCameraMode("following-own");
                const pos = sampleBufferedPosition(
                  ownBufferRef.current,
                  performance.now(),
                  NAV_CONFIG.OWN_MAX_EXTRAPOLATION_MS
                );
                if (map && pos) {
                  transitionUntilPerfRef.current =
                    performance.now() + (reducedMotionRef.current ? 0 : 460);
                  map.easeTo({
                    center: [pos.lng, pos.lat],
                    zoom: 17,
                    duration: reducedMotionRef.current ? 0 : 450,
                  });
                }
              } else if (remotePlumber) {
                cameraModeRef.current = "following-remote";
                setCameraMode("following-remote");
                const pos = sampleBufferedPosition(
                  remoteBufferRef.current,
                  performance.now(),
                  NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS
                );
                if (map && pos) {
                  map.easeTo({
                    center: [pos.lng, pos.lat],
                    zoom: Math.max(map.getZoom(), 15),
                    duration: reducedMotionRef.current ? 0 : 450,
                  });
                }
              } else {
                cameraModeRef.current = "overview";
                setCameraMode("overview");
                fitAllMarkers();
              }
            }}
            className="rounded-lg bg-[#0B1F3A] px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-[#132E54] sm:text-[11px]"
          >
            Recenter
          </button>
        )}
        {remotePlumber && !navigationMode && cameraMode !== "following-remote" && (
          <button
            type="button"
            onClick={() => {
              setFollowPaused(false);
              followPausedRef.current = false;
              cameraModeRef.current = "following-remote";
              setCameraMode("following-remote");
              const map = mapRef.current;
              const pos = sampleBufferedPosition(
                remoteBufferRef.current,
                performance.now(),
                NAV_CONFIG.REMOTE_MAX_EXTRAPOLATION_MS
              );
              if (map && pos) {
                map.easeTo({
                  center: [pos.lng, pos.lat],
                  zoom: Math.max(map.getZoom(), 15),
                  duration: reducedMotionRef.current ? 0 : 450,
                });
              }
            }}
            className="rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 text-[10px] font-bold text-[#0B1F3A] shadow-sm backdrop-blur-sm transition hover:bg-slate-50 sm:px-2.5 sm:text-[11px]"
          >
            Follow Plumber
          </button>
        )}
        {deviceHeading.needsPermission && ownPosition && (
          <button
            type="button"
            onClick={() => void deviceHeading.requestPermission()}
            className="rounded-lg border border-blue-200 bg-blue-50/95 px-2 py-1.5 text-[10px] font-bold text-blue-800 shadow-sm hover:bg-blue-100 sm:text-[11px]"
          >
            Enable Compass
          </button>
        )}
        {ownPosition && !navigationMode && (
          <button
            type="button"
            onClick={() => {
              const map = mapRef.current;
              if (!map) return;
              map.easeTo({
                center: [ownPosition.lng, ownPosition.lat],
                zoom: Math.max(map.getZoom(), 16),
                duration: reducedMotionRef.current ? 0 : 450,
              });
            }}
            title="Center on my location"
            className="rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 text-[10px] font-bold text-[#2563EB] shadow-sm backdrop-blur-sm transition hover:bg-blue-50 sm:px-2.5 sm:text-[11px]"
          >
            My Location
          </button>
        )}
        {markers.length > 0 && !navigationMode && (
          <button
            type="button"
            onClick={fitAllMarkers}
            title="Recenter map"
            className="rounded-lg border border-slate-200/90 bg-white/95 px-2 py-1.5 text-[10px] font-bold text-[#0B1F3A] shadow-sm backdrop-blur-sm transition hover:bg-slate-50 sm:px-2.5 sm:text-[11px]"
          >
            Fit Pins
          </button>
        )}
        {isDev && ownPosition && (
          <button
            type="button"
            onClick={() => setDiagOpen((v) => !v)}
            className="rounded-lg border border-purple-300 bg-purple-50/95 px-2 py-1.5 text-[10px] font-bold text-purple-900 shadow-sm hover:bg-purple-100 sm:px-2.5 sm:text-[11px]"
          >
            {diagOpen ? "Hide Diag" : "Diag"}
          </button>
        )}
      </div>

      {isDev && diagOpen && (
        <div className="pointer-events-auto absolute left-2 top-10 z-[410] max-h-60 w-72 overflow-auto rounded-lg border border-slate-700 bg-slate-900/95 p-2.5 font-mono text-[10px] leading-snug text-slate-100 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-bold text-amber-300">DEV MOVEMENT DIAG</span>
            <button
              type="button"
              onClick={() => {
                const blob = new Blob([JSON.stringify(diagLogRef.current, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `bin-map-diagnostics-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="rounded bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold text-slate-900 hover:bg-amber-300"
            >
              Export JSON
            </button>
          </div>
          <pre className="whitespace-pre-wrap break-all text-[9px] text-slate-200">
            {diagSnapshot ? JSON.stringify(diagSnapshot, null, 2) : "Waiting for GPS sample..."}
          </pre>
        </div>
      )}

      {/* Bottom-left subtle legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] flex max-w-[calc(100%-3.5rem)] flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-2 py-1 text-[10px] font-semibold text-[#0B1F3A] shadow-sm backdrop-blur-sm sm:bottom-3 sm:left-3 sm:gap-3 sm:px-2.5">
        <span className="inline-flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/map-pins/property-pin.svg"
            alt="Property"
            className="h-4 w-4 object-contain"
          />
          Property
        </span>
        <span className="inline-flex items-center gap-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/map-pins/plumber-pin.png"
            alt="Plumber"
            className="h-4 w-4 object-contain"
          />
          Plumber
        </span>
        {hasRoadRoute && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1 w-4 rounded-full bg-[#0B1F3A] ring-1 ring-[#F5B301]" />
            Road Route
          </span>
        )}
        {hasStraightLine && (
          <span className="inline-flex items-center gap-1 text-slate-600">
            <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-slate-500" />
            Direct Line
          </span>
        )}
      </div>
    </div>
  );
}

/** @deprecated Renamed to LiveMap; kept as an alias for compatibility. */
export const LiveLeafletMap = LiveMap;
