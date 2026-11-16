export const SITE_NAME = "Bin Plumbing Services Ltd";
export const SITE_SHORT_NAME = "Bin Plumbing";
export const PRIMARY_MARKET = "Kano State, Nigeria";

/**
 * Single configurable production base URL.
 * Defaults to https://binplumbing.com.ng so canonicals, sitemaps,
 * Open Graph URLs, and structured data never split across domains.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com.ng"
).replace(/\/+$/, "");

export function canonicalUrl(path = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return clean === "/" ? SITE_URL : `${SITE_URL}${clean}`;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export function buildBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export function slugifySeo(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
