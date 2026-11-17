import type { Metadata } from "next";
import { BlogIndexView } from "@/components/blog/BlogIndexView";
import { getPublishedBlogPosts } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Shawarwarin Gyaran Famfo da Injin Ruwa (Hausa)",
  description:
    "Shawarwari da bayani cikin Hausa kan gyaran injin famfo, bututun ruwa mai yoyo, tankin ruwa, bandaki, da magudanar ruwa a Kano.",
  alternates: {
    canonical: "/ha/blog",
    languages: {
      "en-NG": "/en/blog",
      ha: "/ha/blog",
      "x-default": "/en/blog",
    },
  },
  openGraph: {
    title: "Shawarwarin Gyaran Famfo a Kano (Hausa) | FlowGuard Plumbing Enterprises",
    description:
      "Bayani cikin harshen Hausa kan gyaran injin ruwa, bututu, bandaki, da magudanar ruwa a Kano.",
    url: "/ha/blog",
    locale: "ha_NG",
    type: "website",
  },
};

export default async function HausaBlogIndexPage() {
  const posts = await getPublishedBlogPosts("ha");
  return <BlogIndexView lang="ha" posts={posts} />;
}
