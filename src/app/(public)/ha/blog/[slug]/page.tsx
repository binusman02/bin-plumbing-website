import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticleView } from "@/components/blog/BlogArticleView";
import {
  getBlogPostBySlug,
  getMarketplaceSettings,
  getPublishedBlogPosts,
  getServiceCategories,
} from "@/lib/marketplace";

export const instant = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug("ha", slug);

  if (!post) {
    return {
      title: "Ba A Samu Labarin Ba",
      robots: { index: false, follow: false },
    };
  }

  const rawTitle = post.ha_seo_title || post.ha_title;
  const rawDesc = post.ha_meta_description || post.ha_summary || post.ha_title;
  const title = rawTitle.length > 65 ? `${rawTitle.slice(0, 62)}...` : rawTitle;
  const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157)}...` : rawDesc;
  const hasEn = post.en_status === "published" && Boolean(post.en_slug.trim());

  return {
    title: { absolute: rawTitle.includes("Bin Plumbing") ? rawTitle : `${title} | Bin Plumbing Services Ltd` },
    description,
    alternates: {
      canonical: `/ha/blog/${post.ha_slug}`,
      ...(hasEn
        ? {
            languages: {
              "en-NG": `/en/blog/${post.en_slug}`,
              ha: `/ha/blog/${post.ha_slug}`,
              "x-default": `/en/blog/${post.en_slug}`,
            },
          }
        : {}),
    },
    openGraph: {
      title,
      description,
      url: `/ha/blog/${post.ha_slug}`,
      locale: "ha_NG",
      type: "article",
      ...(post.featured_image
        ? {
            images: [
              {
                url: post.featured_image,
                alt: post.ha_image_alt || post.ha_title,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(post.featured_image ? { images: [post.featured_image] } : {}),
    },
  };
}

export default async function HausaBlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const [post, allPosts, settings, services] = await Promise.all([
    getBlogPostBySlug("ha", slug),
    getPublishedBlogPosts("ha"),
    getMarketplaceSettings(),
    getServiceCategories(true),
  ]);

  if (!post) {
    notFound();
  }

  const targetService = post.target_service_slug
    ? services.find((s) => s.slug === post.target_service_slug) || null
    : null;
  const relatedPosts = allPosts.filter((p) => p.id !== post.id).slice(0, 3);

  return (
    <BlogArticleView
      lang="ha"
      post={post}
      companyName={settings.company_name}
      targetService={targetService}
      relatedPosts={relatedPosts}
    />
  );
}
