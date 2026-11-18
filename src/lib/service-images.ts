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

const LEGACY_IMAGE_REPLACEMENTS: Record<string, string> = {
  "/images/services/pipework-roughin.jpg":
    "/images/services/surface-ppr-pipe-installation-kano.jpg",
  "/images/gallery/copper-pipework-roughin.jpg":
    "/images/services/surface-ppr-pipe-installation-kano.jpg",
  "/images/services/drainage-under-sink.jpg":
    "/images/services/underground-drainage-chamber-installation-kano.jpg",
  "/images/services/bathroom-sanitaryware.jpg":
    "/images/services/bathroom-shower-water-heater-installation-kano.jpg",
  "/images/services/tap-fittings-repair.jpg":
    "/images/services/ppr-valve-fitting-maintenance-kano.png",
  "/images/gallery/real-work-kitchen-sink-tap.jpg":
    "/images/services/kitchen-sink-tap-installation-kano.jpg",
  "/images/gallery/real-work-water-tank-fitting.jpg":
    "/images/services/overhead-water-tank-installation-kano.png",
  "/images/gallery/real-work-external-pipe-valve.jpg":
    "/images/services/water-pump-pressure-controller-setup-kano.jpg",
  "/images/gallery/real-work-residential-building.jpg":
    "/images/services/multi-storey-ppr-riser-piping-kano.jpg",
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
 * Resolves the highest-clarity, SEO-named real Kano plumbing photo for a
 * service category or gallery item, overriding legacy stock or low-res paths.
 */
export function resolveSharpServiceImage(
  image?: string | null,
  slug?: string | null
): string {
  const cleanSlug = slug?.trim() || "";
  if (cleanSlug && SLUG_TO_SEO_IMAGE[cleanSlug]) {
    return SLUG_TO_SEO_IMAGE[cleanSlug];
  }
  const clean = image?.trim() || "";
  if (clean && LEGACY_IMAGE_REPLACEMENTS[clean]) {
    return LEGACY_IMAGE_REPLACEMENTS[clean];
  }
  return clean || "/images/services/surface-ppr-pipe-installation-kano.jpg";
}

/**
 * Returns descriptive, natural SEO alt text for each plumbing service image.
 */
export function resolveServiceImageAlt(
  slug?: string | null,
  title?: string | null
): string {
  const cleanSlug = slug?.trim() || "";
  if (cleanSlug && SLUG_TO_SEO_ALT[cleanSlug]) {
    return SLUG_TO_SEO_ALT[cleanSlug];
  }
  const cleanTitle = title?.trim() || "Plumbing service";
  return `${cleanTitle} in Kano — FlowGuard Plumbing Enterprises`;
}
