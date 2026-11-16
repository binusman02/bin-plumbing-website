"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Eye, EyeOff, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import {
  addGalleryItemAction,
  deleteGalleryItemAction,
  toggleGalleryPublishAction,
} from "@/app/actions/marketplace-actions";
import { formatDateTime } from "@/lib/currency";
import type { GalleryItemRecord } from "@/lib/marketplace";

interface GalleryManagerClientProps {
  initialItems: GalleryItemRecord[];
  categories: string[];
}

export function GalleryManagerClient({
  initialItems,
  categories,
}: GalleryManagerClientProps) {
  const [items, setItems] = useState<GalleryItemRecord[]>(initialItems);
  const [title, setTitle] = useState("");
  const [serviceCategory, setServiceCategory] = useState(categories[0] || "General Plumbing");
  const [location, setLocation] = useState("");
  const [published, setPublished] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !file) {
      setFeedback({ type: "error", text: "Please provide a title and select an image file." });
      return;
    }
    setFeedback(null);
    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("serviceCategory", serviceCategory);
    formData.set("location", location.trim());
    formData.set("published", String(published));
    formData.set("image", file);

    startTransition(async () => {
      const res = await addGalleryItemAction(formData);
      if (res.success && res.item) {
        setItems((prev) => [res.item!, ...prev]);
        setTitle("");
        setLocation("");
        setFile(null);
        setPublished(false);
        setFeedback({ type: "success", text: "Gallery photo uploaded." });
      } else {
        setFeedback({ type: "error", text: res.error || "Upload failed." });
      }
    });
  };

  const handleToggle = (item: GalleryItemRecord) => {
    startTransition(async () => {
      const nextState = !item.published;
      const res = await toggleGalleryPublishAction(item.id, nextState);
      if (res.success) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, published: nextState } : i))
        );
        setFeedback({
          type: "success",
          text: nextState ? "Photo published to public Gallery." : "Photo unpublished.",
        });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to update publish status." });
      }
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteGalleryItemAction(id);
      if (res.success) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        setFeedback({ type: "success", text: "Gallery photo deleted." });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to delete gallery photo." });
      }
    });
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div>
        <h2 className="text-xl font-bold text-[#0B1F3A]">Gallery CMS</h2>
        <p className="text-sm text-slate-500">
          Add real photos of completed jobs. They appear on the public Gallery only after you publish them.
        </p>
      </div>

      {/* Upload Card */}
      <form
        onSubmit={handleUpload}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h3 className="text-base font-bold text-[#0B1F3A]">Upload Completed Job Photo</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Job Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Overhead Tank Installation"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Service Category *
            </label>
            <ClassicSelect
              value={serviceCategory}
              onChange={setServiceCategory}
              options={categories.map((cat) => ({ value: cat, label: cat }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Location (Optional)
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Hotoro"
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Photo File (JPG/PNG/WEBP, max 5MB) *
            </label>
            <input
              type="file"
              accept="image/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full rounded-xl border border-slate-200 p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#0B1F3A] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
            />
            Publish immediately on public Gallery
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#F5B301] px-5 text-sm font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            <span>Add Photo</span>
          </button>
        </div>

        {feedback && (
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
              feedback.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </form>

      {/* Grid */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-base font-semibold text-slate-700">No gallery photos uploaded yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Upload completed job photos above and toggle Publish when ready.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
                <span
                  className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-bold ${
                    item.published
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-900/75 text-white"
                  }`}
                >
                  {item.published ? "Published" : "Draft"}
                </span>
              </div>
              <div className="p-4">
                <p className="text-sm font-bold text-[#0B1F3A]">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.service_category}
                  {item.location ? ` • ${item.location}` : ""}
                </p>
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(item.created_at)}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleToggle(item)}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                  >
                    {item.published ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" /> Unpublish
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" /> Publish
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleDelete(item.id)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 px-3 text-red-600 hover:bg-red-50"
                    aria-label="Delete photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
