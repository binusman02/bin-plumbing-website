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
  const post = await getBlogPostBySlug("en", slug);

  if (!post) {
    return {
      title: "Article Not Found",
      robots: { index: false, follow: false },
    };
  }

  const rawTitle = post.en_seo_title || post.en_title;
  const rawDesc = post.en_meta_description || post.en_summary || post.en_title;
  const title = rawTitle.length > 65 ? `${rawTitle.slice(0, 62)}...` : rawTitle;
  const description = rawDesc.length > 160 ? `${rawDesc.slice(0, 157)}...` : rawDesc;
  const hasHa = post.ha_status === "published" && Boolean(post.ha_slug.trim());

  return {
    title: { absolute: rawTitle.includes("Bin Plumbing") ? rawTitle : `${title} | Bin Plumbing Services Ltd` },
    description,
    alternates: {
      canonical: `/en/blog/${post.en_slug}`,
      ...(hasHa
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
      url: `/en/blog/${post.en_slug}`,
      locale: "en_NG",
      type: "article",
      ...(post.featured_image
        ? {
            images: [
              {
                url: post.featured_image,
                alt: post.en_image_alt || post.en_title,
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

export default async function EnglishBlogArticlePage({ params }: Props) {
  const { slug } = await params;
  const [post, allPosts, settings, services] = await Promise.all([
    getBlogPostBySlug("en", slug),
    getPublishedBlogPosts("en"),
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
      lang="en"
      post={post}
      companyName={settings.company_name}
      targetService={targetService}
      relatedPosts={relatedPosts}
    />
  );
}
