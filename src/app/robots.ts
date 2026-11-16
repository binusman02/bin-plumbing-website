import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/admin",
          "/api/",
          "/customer/",
          "/customer",
          "/plumber/",
          "/plumber",
          "/tracking/",
          "/tracking",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
