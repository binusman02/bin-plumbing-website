import type { MetadataRoute } from "next";
import { getGuides, getMarketplaceSettings, getServiceCategories } from "@/lib/marketplace";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://binplumbing.com.ng";
  const now = new Date();

  const staticRoutes = [
    "",
    "/services",
    "/areas",
    "/guides",
    "/how-it-works",
    "/about",
    "/gallery",
    "/request",
    "/join-as-plumber",
    "/contact",
    "/faq",
    "/privacy",
    "/terms",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? ("daily" as const) : ("weekly" as const),
    priority:
      route === ""
        ? 1.0
        : route === "/request" || route === "/services"
          ? 0.9
          : route === "/privacy" || route === "/terms"
            ? 0.4
            : 0.7,
  }));

  const [categories, settings, guides] = await Promise.all([
    getServiceCategories(true),
    getMarketplaceSettings(),
    getGuides(true),
  ]);

  const serviceEntries = categories
    .filter((c) => c.slug || c.title)
    .map((c) => ({
      url: `${baseUrl}/services/${c.slug || slugify(c.title)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

  const hasAddress = Boolean(settings.company_address?.trim());
  const areaEntries = hasAddress
    ? (settings.active_coverage_locations || []).map((area) => ({
        url: `${baseUrl}/areas/${slugify(area)}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }))
    : [];

  const guideEntries = guides.map((g) => ({
    url: `${baseUrl}/guides/${g.slug}`,
    lastModified: new Date(g.updated_at || g.created_at),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...serviceEntries, ...areaEntries, ...guideEntries];
}
