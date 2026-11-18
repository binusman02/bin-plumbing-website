export const SERVICE_IMAGE_PRESETS: Array<{ label: string; url: string }> = [
  {
    label: "Surface & Wall PPR Pipe Installation (Kano)",
    url: "/images/services/surface-ppr-pipe-installation-kano.jpg",
  },
  {
    label: "Underground & Subfloor Pipe Leak Repair",
    url: "/images/services/real-work-pipe-repair.png",
  },
  {
    label: "Underground Drainage & Inspection Chamber",
    url: "/images/services/underground-drainage-chamber-installation-kano.jpg",
  },
  {
    label: "Bathroom Shower Mixer & Sanitaryware",
    url: "/images/services/bathroom-shower-water-heater-installation-kano.jpg",
  },
  {
    label: "Kitchen Sink & Gooseneck Mixer Tap",
    url: "/images/services/kitchen-sink-tap-installation-kano.jpg",
  },
  {
    label: "Overhead Poly Water Storage Tanks & Tower",
    url: "/images/services/overhead-water-tank-installation-kano.png",
  },
  {
    label: "Water Pump & Automatic Pressure Controller",
    url: "/images/services/water-pump-pressure-controller-setup-kano.jpg",
  },
  {
    label: "Multi-Storey PPR Riser & Waste Stack",
    url: "/images/services/multi-storey-ppr-riser-piping-kano.jpg",
  },
  {
    label: "PPR Isolation Valves & Preventative Servicing",
    url: "/images/services/ppr-valve-fitting-maintenance-kano.png",
  },
];

const VERIFIED_LOCAL_IMAGES = new Set<string>([
  "/images/services/surface-ppr-pipe-installation-kano.jpg",
  "/images/services/real-work-pipe-repair.png",
  "/images/services/underground-drainage-chamber-installation-kano.jpg",
  "/images/services/bathroom-shower-water-heater-installation-kano.jpg",
  "/images/services/kitchen-sink-tap-installation-kano.jpg",
  "/images/services/overhead-water-tank-installation-kano.png",
  "/images/services/water-pump-pressure-controller-setup-kano.jpg",
  "/images/services/multi-storey-ppr-riser-piping-kano.jpg",
  "/images/services/ppr-valve-fitting-maintenance-kano.png",
  "/images/services/pipework-roughin.jpg",
  "/images/gallery/real-work-tap-servicing.png",
  "/images/gallery/real-work-subfloor-pipe-repair.png",
  "/images/gallery/real-work-toilet-line-repair.jpg",
  "/images/gallery/real-work-tools-equipment.jpg",
  "/images/about/plumbing-installation-standards.jpg",
]);

const SLUG_TO_SEO_IMAGE: Record<string, string> = {
  "pipe-installation-repairs":
    "/images/services/surface-ppr-pipe-installation-kano.jpg",
  "leak-detection-repairs": "/images/services/real-work-pipe-repair.png",
  "drainage-blockage-issues":
    "/images/services/underground-drainage-chamber-installation-kano.jpg",
  "bathroom-toilet-plumbing":
    "/images/services/bathroom-shower-water-heater-installation-kano.jpg",
  "kitchen-plumbing":
    "/images/services/kitchen-sink-tap-installation-kano.jpg",
  "water-storage-supply-systems":
    "/images/services/overhead-water-tank-installation-kano.png",
  "pump-installation-repairs":
    "/images/services/water-pump-pressure-controller-setup-kano.jpg",
  "commercial-plumbing":
    "/images/services/multi-storey-ppr-riser-piping-kano.jpg",
  "plumbing-maintenance":
    "/images/services/ppr-valve-fitting-maintenance-kano.png",
};

const SLUG_TO_SEO_ALT: Record<string, string> = {
  "pipe-installation-repairs":
    "Green PPR surface and wall water pipe installation in Kano by FlowGuard Plumbing Enterprises",
  "leak-detection-repairs":
    "Underground and subfloor leaking water pipe repair in Kano by FlowGuard Plumbing Enterprises",
  "drainage-blockage-issues":
    "Underground PVC drainage pipework and inspection chamber installation in Kano",
  "bathroom-toilet-plumbing":
    "Bathroom shower mixer and sanitaryware plumbing installation in Kano",
  "kitchen-plumbing":
    "Stainless steel kitchen sink and gooseneck mixer tap installation on granite countertop in Kano",
  "water-storage-supply-systems":
    "Technician installing overhead poly water storage tanks and PPR supply risers on an elevated steel stand in Kano",
  "pump-installation-repairs":
    "Surface water pump and automatic pressure controller connected to water storage tank in Kano",
  "commercial-plumbing":
    "Multi-storey building green PPR riser and PVC waste stack plumbing installation in Kano",
  "plumbing-maintenance":
    "Plumbing technician servicing green PPR isolation valves and standpipe fittings in Kano",
};

/**
 * Resolves a guaranteed-valid service image URL.
 * - Keeps uploaded `/api/gallery/file/...` or `https://...` URLs and verified local assets.
 * - Automatically maps any dead/legacy `/images/...` path (such as old DB defaults
 *   like `/images/services/leak-detection.jpg`) to its sharp Kano photo by slug.
 */
export function resolveSharpServiceImage(
  image?: string | null,
  slug?: string | null
): string {
  const clean = image?.trim() || "";
  const cleanSlug = slug?.trim() || "";

  if (
    clean &&
    (clean.startsWith("/api/") ||
      clean.startsWith("http://") ||
      clean.startsWith("https://") ||
      VERIFIED_LOCAL_IMAGES.has(clean))
  ) {
    return clean;
  }

  if (cleanSlug && SLUG_TO_SEO_IMAGE[cleanSlug]) {
    return SLUG_TO_SEO_IMAGE[cleanSlug];
  }

  return "/images/services/surface-ppr-pipe-installation-kano.jpg";
}

/**
 * Returns descriptive SEO alt text, preferring any custom alt text saved by the Admin.
 */
export function resolveServiceImageAlt(
  slug?: string | null,
  title?: string | null,
  customAlt?: string | null
): string {
  if (customAlt && customAlt.trim()) {
    return customAlt.trim();
  }
  const cleanSlug = slug?.trim() || "";
  if (cleanSlug && SLUG_TO_SEO_ALT[cleanSlug]) {
    return SLUG_TO_SEO_ALT[cleanSlug];
  }
  const cleanTitle = title?.trim() || "Plumbing service";
  return `${cleanTitle} in Kano — FlowGuard Plumbing Enterprises`;
}
