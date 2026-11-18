const LOW_RES_IMAGE_REPLACEMENTS: Record<string, string> = {
  "/images/gallery/real-work-kitchen-sink-tap.jpg":
    "/images/blog/kitchen-sink-tap-installation-kano.jpg",
  "/images/gallery/real-work-water-tank-fitting.jpg":
    "/images/blog/ppr-riser-pipe-installation-kano.jpg",
  "/images/gallery/real-work-external-pipe-valve.jpg":
    "/images/blog/water-pump-pressure-controller-kano.jpg",
  "/images/gallery/real-work-residential-building.jpg":
    "/images/blog/ppr-pipework-new-house-kano.jpg",
};

const SLUG_FALLBACK_IMAGES: Record<string, string> = {
  "kitchen-plumbing": "/images/blog/kitchen-sink-tap-installation-kano.jpg",
  "water-storage-supply-systems":
    "/images/blog/ppr-riser-pipe-installation-kano.jpg",
  "pump-installation-repairs":
    "/images/blog/water-pump-pressure-controller-kano.jpg",
  "commercial-plumbing": "/images/blog/ppr-pipework-new-house-kano.jpg",
};

/**
 * Replaces legacy low-resolution (270x360 / 239x360) service thumbnails
 * with high-resolution (1200x1600 / 720x960) Kano plumbing photos, even when
 * category records are loaded from cached database settings.
 */
export function resolveSharpServiceImage(
  image?: string | null,
  slug?: string | null
): string {
  const clean = image?.trim() || "";
  if (clean && LOW_RES_IMAGE_REPLACEMENTS[clean]) {
    return LOW_RES_IMAGE_REPLACEMENTS[clean];
  }
  if (!clean && slug && SLUG_FALLBACK_IMAGES[slug]) {
    return SLUG_FALLBACK_IMAGES[slug];
  }
  return clean || "/images/services/pipework-roughin.jpg";
}
