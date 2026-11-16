"use client";

import { useState, useTransition } from "react";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Plus,
  Sparkles,
} from "lucide-react";
import { ClassicSelect } from "@/components/ui/ClassicSelect";
import type { GuideArticleStatus, GuideRecord } from "@/lib/marketplace";
import { seedDraftGuidesAction, upsertGuideAction } from "@/app/actions/marketplace-actions";

interface GuidesManagerClientProps {
  initialGuides: GuideRecord[];
}

const BLOG_IMAGE_PRESETS = [
  {
    label: "Water Pump Controller",
    url: "/images/blog/water-pump-pressure-controller-kano.jpg",
  },
  {
    label: "New House PPR Pipework",
    url: "/images/blog/ppr-pipework-new-house-kano.jpg",
  },
  {
    label: "PPR Riser & Drainage",
    url: "/images/blog/ppr-riser-pipe-installation-kano.jpg",
  },
  {
    label: "Drainage Chamber",
    url: "/images/blog/underground-drainage-chamber-kano.jpg",
  },
  {
    label: "Shower Mixer Installation",
    url: "/images/blog/bathroom-shower-mixer-installation-kano.jpg",
  },
  {
    label: "Kitchen Sink & Tap",
    url: "/images/blog/kitchen-sink-tap-installation-kano.jpg",
  },
  {
    label: "Toilet Pan Connector",
    url: "/images/blog/toilet-pan-connector-repair-kano.jpg",
  },
  {
    label: "Water Tank Fitting",
    url: "/images/gallery/real-work-water-tank-fitting.jpg",
  },
  {
    label: "External Pipe & Valve",
    url: "/images/gallery/real-work-external-pipe-valve.jpg",
  },
  {
    label: "Emergency Pipe Repair",
    url: "/images/services/real-work-pipe-repair.png",
  },
  {
    label: "Plumbing Tools",
    url: "/images/gallery/real-work-tools-equipment.jpg",
  },
];

const SERVICE_SLUG_OPTIONS = [
  { value: "", label: "None / General" },
  { value: "pipe-installation-repairs", label: "Pipe Installation & Repairs" },
  { value: "leak-detection-repairs", label: "Leak Detection & Repairs" },
  { value: "water-pump-installation-repair", label: "Water Pump Installation & Repair" },
  { value: "water-tank-installation", label: "Water Tank Installation" },
  { value: "bathroom-toilet-plumbing", label: "Bathroom & Toilet Plumbing" },
  { value: "drainage-unblocking", label: "Drainage & Unblocking" },
];

function toSlug(val: string): string {
  return val
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function statusBadgeClass(status: GuideArticleStatus) {
  if (status === "published") return "bg-emerald-50 text-emerald-700";
  if (status === "review") return "bg-amber-50 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

export function GuidesManagerClient({ initialGuides }: GuidesManagerClientProps) {
  const [guides, setGuides] = useState<GuideRecord[]>(initialGuides);
  const [editing, setEditing] = useState<Partial<GuideRecord> | null>(null);
  const [editorTab, setEditorTab] = useState<"en" | "ha" | "seo">("en");
  const [keywordsText, setKeywordsText] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const openEditor = (guide: Partial<GuideRecord>) => {
    setEditing(guide);
    setKeywordsText(
      Array.isArray(guide.supporting_keywords)
        ? guide.supporting_keywords.join(", ")
        : ""
    );
    setEditorTab("en");
  };

  const handleSeedDrafts = () => {
    setFeedback(null);
    startTransition(async () => {
      const res = await seedDraftGuidesAction();
      if (res.success && res.guides) {
        setGuides((prev) => {
          const map = new Map(prev.map((g) => [g.id, g]));
          for (const g of res.guides!) map.set(g.id, g);
          return Array.from(map.values());
        });
        setFeedback(
          `${res.guides.length} bilingual EN/HA draft articles seeded (marked Needs owner review, unpublished).`
        );
      } else {
        setFeedback(res.error || "Could not seed bilingual drafts.");
      }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const enTitle = (editing.en_title ?? editing.title ?? "").trim();
    const haTitle = (editing.ha_title ?? "").trim();
    const enSlug = toSlug(editing.en_slug ?? editing.slug ?? enTitle);
    const haSlug = toSlug(editing.ha_slug ?? "");

    if (!enTitle && !haTitle) {
      setFeedback("Enter at least an English or Hausa article title.");
      return;
    }
    if (editing.en_status === "published" && (!enTitle || !enSlug)) {
      setFeedback("English title and slug are required before publishing the English version.");
      return;
    }
    if (editing.ha_status === "published" && (!haTitle || !haSlug)) {
      setFeedback("Hausa title and slug are required before publishing the Hausa version.");
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const supportingKeywords = keywordsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await upsertGuideAction({
        id: editing.id,
        slug: enSlug || haSlug,
        title: enTitle || haTitle,
        summary: (editing.en_summary ?? editing.summary ?? "").trim(),
        content: editing.en_content ?? editing.content ?? "",
        category: editing.category?.trim() || "Plumbing Guide",
        status:
          editing.en_status === "published" || editing.ha_status === "published"
            ? "published"
            : "draft",
        needs_owner_review: editing.needs_owner_review !== false,
        en_title: enTitle,
        en_slug: enSlug,
        en_summary: (editing.en_summary || "").trim(),
        en_content: editing.en_content || "",
        en_seo_title: (editing.en_seo_title || "").trim(),
        en_meta_description: (editing.en_meta_description || "").trim(),
        en_image_alt: (editing.en_image_alt || "").trim(),
        en_status: editing.en_status || "draft",
        ha_title: haTitle,
        ha_slug: haSlug,
        ha_summary: (editing.ha_summary || "").trim(),
        ha_content: editing.ha_content || "",
        ha_seo_title: (editing.ha_seo_title || "").trim(),
        ha_meta_description: (editing.ha_meta_description || "").trim(),
        ha_image_alt: (editing.ha_image_alt || "").trim(),
        ha_status: editing.ha_status || "draft",
        featured_image: (editing.featured_image || "").trim(),
        image_attribution: (editing.image_attribution || "").trim(),
        target_service_slug: (editing.target_service_slug || "").trim(),
        main_keyword: (editing.main_keyword || "").trim(),
        supporting_keywords: supportingKeywords,
        author_name: (editing.author_name || "Bin Plumbing Editorial Team").trim(),
        published_at: editing.published_at || null,
      });

      if (res.success && res.guide) {
        setGuides((prev) => {
          const idx = prev.findIndex((g) => g.id === res.guide!.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = res.guide!;
            return next;
          }
          return [res.guide!, ...prev];
        });
        setEditing(null);
        setFeedback("Bilingual article saved.");
      } else {
        setFeedback(res.error || "Failed to save article.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#0B1F3A]">
            Bilingual Blog &amp; Guides CMS (English + Hausa)
          </h1>
          <p className="text-sm text-slate-500">
            Manage English (/en/blog) and Hausa (/ha/blog) versions from one article record. Drafts remain unpublished until reviewed.
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
            Seed 12 Bilingual Drafts
          </button>
          <button
            type="button"
            onClick={() =>
              openEditor({
                category: "Plumbing Guide",
                en_title: "",
                en_slug: "",
                en_summary: "",
                en_content: "",
                en_seo_title: "",
                en_meta_description: "",
                en_image_alt: "",
                en_status: "draft",
                ha_title: "",
                ha_slug: "",
                ha_summary: "",
                ha_content: "",
                ha_seo_title: "",
                ha_meta_description: "",
                ha_image_alt: "",
                ha_status: "draft",
                featured_image: "",
                image_attribution: "Bin Plumbing Services Ltd",
                target_service_slug: "",
                main_keyword: "",
                supporting_keywords: [],
                author_name: "Bin Plumbing Editorial Team",
                needs_owner_review: true,
              })
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#F5B301] px-4 text-xs font-bold text-[#07152B] hover:bg-[#e5a700]"
          >
            <Plus className="h-4 w-4" />
            New Bilingual Article
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
        <form
          onSubmit={handleSave}
          className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              {editing.id ? "Edit Bilingual Article" : "Create Bilingual Article"}
            </h2>
            <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setEditorTab("en")}
                className={`rounded-md px-3 py-1.5 ${
                  editorTab === "en"
                    ? "bg-[#0B1F3A] text-white"
                    : "text-slate-600 hover:text-[#0B1F3A]"
                }`}
              >
                English (/en/blog)
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("ha")}
                className={`rounded-md px-3 py-1.5 ${
                  editorTab === "ha"
                    ? "bg-[#0B1F3A] text-white"
                    : "text-slate-600 hover:text-[#0B1F3A]"
                }`}
              >
                Hausa (/ha/blog)
              </button>
              <button
                type="button"
                onClick={() => setEditorTab("seo")}
                className={`rounded-md px-3 py-1.5 ${
                  editorTab === "seo"
                    ? "bg-[#0B1F3A] text-white"
                    : "text-slate-600 hover:text-[#0B1F3A]"
                }`}
              >
                Shared SEO &amp; Media
              </button>
            </div>
          </div>

          {editorTab === "en" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    English Title
                  </label>
                  <input
                    value={editing.en_title || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditing({
                        ...editing,
                        en_title: val,
                        en_slug: editing.en_slug || toSlug(val),
                      });
                    }}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    English Slug (/en/blog/...)
                  </label>
                  <input
                    value={editing.en_slug || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, en_slug: toSlug(e.target.value) })
                    }
                    placeholder="e.g. water-pump-repair-kano"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    English SEO Title ({(editing.en_seo_title || "").length}/65)
                  </label>
                  <input
                    value={editing.en_seo_title || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, en_seo_title: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    English Publish Status
                  </label>
                  <ClassicSelect
                    value={editing.en_status || "draft"}
                    onChange={(val) =>
                      setEditing({
                        ...editing,
                        en_status: val as GuideArticleStatus,
                      })
                    }
                    options={[
                      { value: "draft", label: "Draft (Unpublished)" },
                      { value: "review", label: "In Review" },
                      { value: "published", label: "Published" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  English Meta Description ({(editing.en_meta_description || "").length}/160)
                </label>
                <input
                  value={editing.en_meta_description || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, en_meta_description: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  English Summary
                </label>
                <input
                  value={editing.en_summary || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, en_summary: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  English Image Alt Text
                </label>
                <input
                  value={editing.en_image_alt || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, en_image_alt: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  English Content (use ## for H2, ### for H3, - for bullets)
                </label>
                <textarea
                  rows={10}
                  value={editing.en_content || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, en_content: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 p-3 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {editorTab === "ha" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Hausa Title
                  </label>
                  <input
                    value={editing.ha_title || ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditing({
                        ...editing,
                        ha_title: val,
                        ha_slug: editing.ha_slug || toSlug(val),
                      });
                    }}
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Hausa Slug (/ha/blog/...)
                  </label>
                  <input
                    value={editing.ha_slug || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, ha_slug: toSlug(e.target.value) })
                    }
                    placeholder="e.g. gyaran-injin-ruwa-kano"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Hausa SEO Title ({(editing.ha_seo_title || "").length}/65)
                  </label>
                  <input
                    value={editing.ha_seo_title || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, ha_seo_title: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Hausa Publish Status
                  </label>
                  <ClassicSelect
                    value={editing.ha_status || "draft"}
                    onChange={(val) =>
                      setEditing({
                        ...editing,
                        ha_status: val as GuideArticleStatus,
                      })
                    }
                    options={[
                      { value: "draft", label: "Draft (Unpublished)" },
                      { value: "review", label: "In Review" },
                      { value: "published", label: "Published" },
                    ]}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hausa Meta Description ({(editing.ha_meta_description || "").length}/160)
                </label>
                <input
                  value={editing.ha_meta_description || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, ha_meta_description: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hausa Summary
                </label>
                <input
                  value={editing.ha_summary || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, ha_summary: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hausa Image Alt Text
                </label>
                <input
                  value={editing.ha_image_alt || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, ha_image_alt: e.target.value })
                  }
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Hausa Content (use ## for H2, ### for H3, - for bullets)
                </label>
                <textarea
                  rows={10}
                  value={editing.ha_content || ""}
                  onChange={(e) =>
                    setEditing({ ...editing, ha_content: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-200 p-3 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {editorTab === "seo" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Category
                  </label>
                  <input
                    value={editing.category || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Target Service Page
                  </label>
                  <ClassicSelect
                    value={editing.target_service_slug || ""}
                    onChange={(val) =>
                      setEditing({ ...editing, target_service_slug: val })
                    }
                    options={SERVICE_SLUG_OPTIONS}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Main Keyword
                  </label>
                  <input
                    value={editing.main_keyword || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, main_keyword: e.target.value })
                    }
                    placeholder="e.g. pumping machine repair in Kano"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Author
                  </label>
                  <input
                    value={editing.author_name || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, author_name: e.target.value })
                    }
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Supporting Keywords (comma-separated)
                </label>
                <input
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Featured Image URL
                  </label>
                  <input
                    value={editing.featured_image || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, featured_image: e.target.value })
                    }
                    placeholder="/images/blog/..."
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Image Attribution / Source
                  </label>
                  <input
                    value={editing.image_attribution || ""}
                    onChange={(e) =>
                      setEditing({ ...editing, image_attribution: e.target.value })
                    }
                    placeholder="Bin Plumbing Services Ltd field work"
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Quick-Pick Authentic Bin Plumbing Photos
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BLOG_IMAGE_PRESETS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          featured_image: preset.url,
                          image_attribution:
                            editing.image_attribution || "Bin Plumbing Services Ltd field work",
                        })
                      }
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        editing.featured_image === preset.url
                          ? "border-[#0B1F3A] bg-[#0B1F3A] text-white"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={editing.needs_owner_review !== false}
              onChange={(e) =>
                setEditing({ ...editing, needs_owner_review: e.target.checked })
              }
            />
            Needs owner review before publishing
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
              {isPending ? "Saving..." : "Save Bilingual Article"}
            </button>
          </div>
        </form>
      )}

      {guides.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <BookOpen className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">No articles yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Click &ldquo;Seed 12 Bilingual Drafts&rdquo; to load the Kano English &amp; Hausa starter drafts for review.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {guides.map((guide) => (
            <div
              key={guide.id}
              className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#0B1F3A]">
                    {guide.en_title || guide.title}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                      guide.en_status
                    )}`}
                  >
                    EN: {guide.en_status}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(
                      guide.ha_status
                    )}`}
                  >
                    HA: {guide.ha_status}
                  </span>
                  {guide.needs_owner_review && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-800">
                      Needs owner review
                    </span>
                  )}
                </div>
                {guide.ha_title && (
                  <p className="flex items-center gap-1 text-xs font-medium text-slate-600">
                    <Globe className="h-3 w-3 text-[#F5B301]" />
                    Hausa: {guide.ha_title}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {guide.category}
                  {guide.en_slug ? ` • /en/blog/${guide.en_slug}` : ""}
                  {guide.ha_slug ? ` • /ha/blog/${guide.ha_slug}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {guide.en_status === "published" && guide.en_slug && (
                  <a
                    href={`/en/blog/${guide.en_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    EN
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {guide.ha_status === "published" && guide.ha_slug && (
                  <a
                    href={`/ha/blog/${guide.ha_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    HA
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => openEditor(guide)}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
                >
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
