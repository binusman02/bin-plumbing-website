"use client";

import { useState, useTransition } from "react";
import { BookOpen, CheckCircle2, Plus, Sparkles } from "lucide-react";
import type { GuideRecord } from "@/lib/marketplace";
import { seedDraftGuidesAction, upsertGuideAction } from "@/app/actions/marketplace-actions";

interface GuidesManagerClientProps {
  initialGuides: GuideRecord[];
}

export function GuidesManagerClient({ initialGuides }: GuidesManagerClientProps) {
  const [guides, setGuides] = useState<GuideRecord[]>(initialGuides);
  const [editing, setEditing] = useState<Partial<GuideRecord> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSeedDrafts = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await seedDraftGuidesAction();
      if (res.success && res.guides) {
        setGuides((prev) => {
          const map = new Map(prev.map((g) => [g.slug, g]));
          for (const g of res.guides!) map.set(g.slug, g);
          return Array.from(map.values());
        });
        setFeedback("6 draft outlines seeded (marked Needs owner review, unpublished).");
      } else {
        setFeedback(res.error || "Could not seed draft outlines.");
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.title?.trim() || !editing?.slug?.trim()) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await upsertGuideAction({
        id: editing.id,
        slug: editing.slug!.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        title: editing.title!.trim(),
        summary: editing.summary?.trim() || "",
        content: editing.content || "",
        category: editing.category?.trim() || "Plumbing Guide",
        status: editing.status === "published" ? "published" : "draft",
        needs_owner_review: editing.needs_owner_review !== false,
      });
      if (res.success && res.guide) {
        setGuides((prev) => {
          const idx = prev.findIndex((g) => g.id === res.guide!.id || g.slug === res.guide!.slug);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.guide!;
            return next;
          }
          return [res.guide!, ...prev];
        });
        setEditing(null);
        setFeedback("Guide saved.");
      } else {
        setFeedback(res.error || "Failed to save guide.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Guides & Articles CMS</h1>
          <p className="text-sm text-slate-500">
            Drafts remain unpublished until reviewed by the owner and switched to Published.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSeedDrafts}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-[#0B1F3A] hover:bg-slate-50"
          >
            <Sparkles className="h-4 w-4 text-[#F5B301]" />
            Seed 6 Draft Outlines
          </button>
          <button
            type="button"
            onClick={() =>
              setEditing({
                title: "",
                slug: "",
                category: "Plumbing Guide",
                summary: "",
                content: "",
                status: "draft",
                needs_owner_review: true,
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5B301] px-4 text-xs font-bold text-[#07152B] hover:bg-[#e5a700]"
          >
            <Plus className="h-4 w-4" />
            New Guide
          </button>
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {editing && (
        <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-[#0B1F3A]">
            {editing.id ? "Edit Guide" : "Create Guide"}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Title</label>
              <input
                required
                value={editing.title || ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">URL Slug</label>
              <input
                required
                value={editing.slug || ""}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                placeholder="e.g. water-tank-care"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-mono"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Category</label>
              <input
                value={editing.category || ""}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
              <select
                value={editing.status || "draft"}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as "draft" | "published",
                  })
                }
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
              >
                <option value="draft">Draft (Unpublished)</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Summary</label>
            <input
              value={editing.summary || ""}
              onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Body (use ## for section headings)
            </label>
            <textarea
              rows={8}
              value={editing.content || ""}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              className="w-full rounded-lg border border-slate-200 p-3 text-sm font-mono"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={editing.needs_owner_review !== false}
              onChange={(e) =>
                setEditing({ ...editing, needs_owner_review: e.target.checked })
              }
            />
            Needs owner review
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="h-10 rounded-xl bg-[#0B1F3A] px-5 text-xs font-bold text-white"
            >
              {isPending ? "Saving..." : "Save Guide"}
            </button>
          </div>
        </form>
      )}

      {guides.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <BookOpen className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">No guides yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Click &ldquo;Seed 6 Draft Outlines&rdquo; to load starter outlines marked Needs owner review.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {guides.map((guide) => (
            <div key={guide.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#0B1F3A]">{guide.title}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase ${
                      guide.status === "published"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {guide.status}
                  </span>
                  {guide.needs_owner_review && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      Needs owner review
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">/{guide.slug} • {guide.category}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(guide)}
                className="h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
