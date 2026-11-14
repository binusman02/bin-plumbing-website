import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Camera } from "lucide-react";
import { getAllGalleryItems } from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Project Gallery",
  description:
    "Published project photos from Bin Plumbing Services Ltd completed plumbing installations and repairs.",
  alternates: { canonical: "/gallery" },
};

export default async function GalleryPage() {
  const items = await getAllGalleryItems();
  const published = items.filter((item) => item.published);

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
          {published.length === 0 ? (
            <div className="rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-12 text-center">
              <Camera className="mx-auto mb-3 h-10 w-10 text-[#66778C]" />
              <h2 className="text-lg font-bold text-[#0B1F3A]">
                No published project photos yet
              </h2>
              <p className="mt-2 text-sm text-[#4B5B70]">
                Photos are added here after completed jobs are reviewed and published by our team.
              </p>
              <Link
                href="/request"
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-[#F5B301] px-6 text-sm font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                Request a Plumber
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {published.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-[#E3E8EF] bg-white shadow-sm"
                >
                  <div className="relative aspect-[4/3] w-full bg-[#F4F6F9]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#F5B301]">
                      {item.service_category}
                    </p>
                    <h2 className="mt-1 text-lg font-bold text-[#0B1F3A]">{item.title}</h2>
                    {item.location && (
                      <p className="mt-1 text-sm text-[#4B5B70]">{item.location}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
