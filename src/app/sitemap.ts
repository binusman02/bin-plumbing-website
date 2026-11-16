import type { MetadataRoute } from "next";
import {
  getAllGalleryItems,
  getGuides,
  getMarketplaceSettings,
  getServiceCategories,
} from "@/lib/marketplace";
import { SITE_URL, slugifySeo } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/services",
    "/areas",
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
    url: `${SITE_URL}${route}`,
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

  const blogIndexRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/en/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: {
        languages: {
          "en-NG": `${SITE_URL}/en/blog`,
          ha: `${SITE_URL}/ha/blog`,
        },
      },
    },
    {
      url: `${SITE_URL}/ha/blog`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
      alternates: {
        languages: {
          "en-NG": `${SITE_URL}/en/blog`,
          ha: `${SITE_URL}/ha/blog`,
        },
      },
    },
  ];

  const [categories, settings, guides, galleryItems] = await Promise.all([
    getServiceCategories(true),
    getMarketplaceSettings(),
    getGuides(true),
    getAllGalleryItems(true),
  ]);

  const galleryImages = galleryItems
    .map((g) => g.image_url)
    .filter((u): u is string => Boolean(u))
    .map((u) =>
      u.startsWith("http") ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`
    );

  const enrichedStaticRoutes = staticRoutes.map((entry) =>
    entry.url === `${SITE_URL}/gallery` && galleryImages.length > 0
      ? { ...entry, images: galleryImages }
      : entry
  );

  const serviceEntries: MetadataRoute.Sitemap = categories
    .filter((c) => c.slug || c.title)
    .map((c) => ({
      url: `${SITE_URL}/services/${c.slug || slugifySeo(c.title || "")}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    }));

  const areaEntries: MetadataRoute.Sitemap = (
    settings.active_coverage_locations || []
  ).map((area) => ({
    url: `${SITE_URL}/areas/${slugifySeo(area)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.75,
  }));

  const blogArticleEntries: MetadataRoute.Sitemap = [];
  for (const g of guides) {
    const enReady = g.en_status === "published" && Boolean(g.en_slug.trim());
    const haReady = g.ha_status === "published" && Boolean(g.ha_slug.trim());
    const lastModified = new Date(g.updated_at || g.created_at);
    const alternates =
      enReady && haReady
        ? {
            languages: {
              "en-NG": `${SITE_URL}/en/blog/${g.en_slug}`,
              ha: `${SITE_URL}/ha/blog/${g.ha_slug}`,
            },
          }
        : undefined;

    if (enReady) {
      blogArticleEntries.push({
        url: `${SITE_URL}/en/blog/${g.en_slug}`,
        lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
        ...(alternates ? { alternates } : {}),
        ...(g.featured_image
          ? {
              images: [
                g.featured_image.startsWith("http")
                  ? g.featured_image
                  : `${SITE_URL}${g.featured_image}`,
              ],
            }
          : {}),
      });
    }
    if (haReady) {
      blogArticleEntries.push({
        url: `${SITE_URL}/ha/blog/${g.ha_slug}`,
        lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
        ...(alternates ? { alternates } : {}),
        ...(g.featured_image
          ? {
              images: [
                g.featured_image.startsWith("http")
                  ? g.featured_image
                  : `${SITE_URL}${g.featured_image}`,
              ],
            }
          : {}),
      });
    }
  }

  return [
    ...enrichedStaticRoutes,
    ...blogIndexRoutes,
    ...serviceEntries,
    ...areaEntries,
    ...blogArticleEntries,
  ];
}
