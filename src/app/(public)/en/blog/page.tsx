import type { Metadata } from "next";
import { BlogIndexView } from "@/components/blog/BlogIndexView";
import { getPublishedBlogPosts } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Plumbing Guides & Blog for Kano Homes",
  description:
    "Practical plumbing guides for Kano homeowners and facility managers: water pump troubleshooting, pipe leaks, water tank care, toilet repair, and drainage.",
  alternates: {
    canonical: "/en/blog",
    languages: {
      "en-NG": "/en/blog",
      ha: "/ha/blog",
      "x-default": "/en/blog",
    },
  },
  openGraph: {
    title: "Plumbing Guides & Blog for Kano Homes | Bin Plumbing Services Ltd",
    description:
      "Practical plumbing guides on water pumps, leak prevention, water tanks, and drainage from Bin Plumbing Services Ltd in Kano.",
    url: "/en/blog",
    locale: "en_NG",
    type: "website",
  },
};

export default async function EnglishBlogIndexPage() {
  const posts = await getPublishedBlogPosts("en");
  return <BlogIndexView lang="en" posts={posts} />;
}
