import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { getAllGalleryItems } from "@/lib/marketplace";
import { PublicGalleryClient } from "@/components/public/PublicGalleryClient";

export const metadata: Metadata = {
  title: "Project Gallery",
  description:
    "Published project photos from FlowGuard Plumbing Enterprises completed plumbing installations and repairs.",
  alternates: { canonical: "/gallery" },
  openGraph: {
    title: "Project Gallery | FlowGuard Plumbing Enterprises",
    description:
      "Published project photos from FlowGuard Plumbing Enterprises completed plumbing installations and repairs.",
    url: "/gallery",
    type: "website",
  },
};

export default async function GalleryPage() {
  "use cache";
  cacheLife("minutes");
  cacheTag("gallery");
  const published = await getAllGalleryItems(true);

  return (
    <div className="bg-white">
      <section className="bg-[#07152B] py-14 text-white md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#F5B301]">
            Gallery
          </p>
          <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-white md:text-5xl">
            Completed Work Gallery
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#C9D3E0] md:text-lg">
            Photos of completed plumbing jobs published by our team.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-24">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <PublicGalleryClient items={published} />
        </div>
      </section>
    </div>
  );
}
