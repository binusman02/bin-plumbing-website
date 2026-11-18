import type { MetadataRoute } from "next";
import {
  getAllGalleryItems,
  getGuides,
  getMarketplaceSettings,
  getServiceCategories,
} from "@/lib/marketplace";
import { SITE_URL, slugifySeo } from "@/lib/seo";
import { resolveSharpServiceImage } from "@/lib/service-images";

const STATIC_BASELINE_DATE = new Date("2026-11-15T00:00:00.000Z");

function toSafeDate(value: string | undefined | null, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categories, settings, guides, galleryItems] = await Promise.all([
    getServiceCategories(true),
    getMarketplaceSettings(),
    getGuides(true),
    getAllGalleryItems(true),
  ]);

  const settingsRecord = settings as unknown as { updated_at?: string };
  const settingsDate = toSafeDate(settingsRecord?.updated_at, STATIC_BASELINE_DATE);

  const latestGuideDate = guides.reduce<Date>((latest, g) => {
    const d = toSafeDate(g.updated_at || g.created_at, STATIC_BASELINE_DATE);
    return d.getTime() > latest.getTime() ? d : latest;
  }, STATIC_BASELINE_DATE);

  const latestGalleryDate = galleryItems.reduce<Date>((latest, item) => {
    const d = toSafeDate(
      (item as unknown as { updated_at?: string; created_at?: string }).updated_at || item.created_at,
      STATIC_BASELINE_DATE
    );
    return d.getTime() > latest.getTime() ? d : latest;
  }, STATIC_BASELINE_DATE);

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
    lastModified:
      route === "/gallery"
        ? latestGalleryDate
        : route === "" || route === "/services" || route === "/areas"
          ? settingsDate
          : STATIC_BASELINE_DATE,
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
      lastModified: latestGuideDate,
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
      lastModified: latestGuideDate,
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

  const galleryImages = galleryItems
    .map((g) => g.image_url)
    .filter((u): u is string => Boolean(u))
    .map((u) =>
      u.startsWith("http") ? u : `${SITE_URL}${u.startsWith("/") ? "" : "/"}${u}`
    );

  const serviceImageUrls = Array.from(
    new Set(
      categories
        .filter((c) => c.visible !== false && c.active !== false)
        .map((c) => resolveSharpServiceImage(c.image, c.slug))
        .map((u) => (u.startsWith("http") ? u : `${SITE_URL}${u}`))
    )
  );

  const enrichedStaticRoutes = staticRoutes.map((entry) => {
    if (entry.url === `${SITE_URL}/gallery` && galleryImages.length > 0) {
      return { ...entry, images: galleryImages };
    }
    if (entry.url === `${SITE_URL}/services` && serviceImageUrls.length > 0) {
      return { ...entry, images: serviceImageUrls };
    }
    return entry;
  });

  const serviceEntries: MetadataRoute.Sitemap = categories
    .filter((c) => c.slug || c.title)
    .map((c) => {
      const catRec = c as unknown as { updated_at?: string; created_at?: string };
      const imgPath = resolveSharpServiceImage(c.image, c.slug);
      const imgUrl = imgPath.startsWith("http") ? imgPath : `${SITE_URL}${imgPath}`;
      return {
        url: `${SITE_URL}/services/${c.slug || slugifySeo(c.title || "")}`,
        lastModified: toSafeDate(catRec.updated_at || catRec.created_at, settingsDate),
        changeFrequency: "weekly" as const,
        priority: 0.85,
        images: [imgUrl],
      };
    });

  const areaEntries: MetadataRoute.Sitemap = (
    settings.active_coverage_locations || []
  ).map((area) => ({
    url: `${SITE_URL}/areas/${slugifySeo(area)}`,
    lastModified: settingsDate,
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
