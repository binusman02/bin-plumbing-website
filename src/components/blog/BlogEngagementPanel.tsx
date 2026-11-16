"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  Heart,
  MessageCircle,
  Send,
  Share2,
} from "lucide-react";
import type { BlogComment, GuideEngagement } from "@/lib/blog-engagement";

interface BlogEngagementPanelProps {
  guideId: string;
  lang: "en" | "ha";
  title: string;
  articleUrl: string;
  initialEngagement: GuideEngagement;
}

export function BlogEngagementPanel({
  guideId,
  lang,
  title,
  articleUrl,
  initialEngagement,
}: BlogEngagementPanelProps) {
  const isHausa = lang === "ha";
  const [views, setViews] = useState(initialEngagement.views);
  const [likes, setLikes] = useState(initialEngagement.likes);
  const [comments, setComments] = useState<BlogComment[]>(
    initialEngagement.comments || []
  );
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [copied, setCopied] = useState(false);

  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedNotice, setSubmittedNotice] = useState(false);

  useEffect(() => {
    try {
      const likedKey = `bp_blog_liked_${guideId}`;
      setLiked(window.localStorage.getItem(likedKey) === "1");

      const viewedKey = `bp_blog_viewed_${guideId}`;
      const alreadyViewed = Boolean(window.sessionStorage.getItem(viewedKey));
      if (!alreadyViewed) {
        window.sessionStorage.setItem(viewedKey, "1");
      }

      const reqPromise = alreadyViewed
        ? fetch(`/api/blog/engagement?guideId=${encodeURIComponent(guideId)}`, {
            cache: "no-store",
          })
        : fetch("/api/blog/engagement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "view", guideId }),
          });

      reqPromise
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.engagement) {
            setViews(res.engagement.views);
            setLikes(res.engagement.likes);
            if (Array.isArray(res.engagement.comments)) {
              setComments(res.engagement.comments);
            }
          }
        })
        .catch(() => {});
    } catch {
      // Ignore storage errors
    }
  }, [guideId]);

  const handleToggleLike = async () => {
    if (liking) return;
    setLiking(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikes((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      window.localStorage.setItem(`bp_blog_liked_${guideId}`, nextLiked ? "1" : "0");
      const res = await fetch("/api/blog/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: nextLiked ? "like" : "unlike",
          guideId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof data?.engagement?.likes === "number") {
          setLikes(data.engagement.likes);
        }
      }
    } catch {
      // Keep optimistic count
    } finally {
      setLiking(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(articleUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmittedNotice(false);
    if (name.trim().length < 2 || text.trim().length < 3) {
      setError(
        isHausa
          ? "Da fatan za a rubuta suna da tsokaci (akalla haruffa 3)."
          : "Please enter your name and a comment (at least 3 characters)."
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/blog/engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comment",
          guideId,
          name: name.trim(),
          area: area.trim(),
          text: text.trim(),
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || (isHausa ? "Ba a iya tura tsokaci ba." : "Failed to post comment."));
        return;
      }
      if (Array.isArray(data?.engagement?.comments)) {
        setComments(data.engagement.comments);
      }
      setText("");
      setSubmittedNotice(true);
    } catch {
      setError(isHausa ? "Matsalar sadarwa. A sake gwadawa." : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`${title} — ${articleUrl}`)}`;

  return (
    <section
      id="comments"
      className="mt-10 space-y-8 rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm md:p-8"
    >
      {/* Interactive Bar: Views, Likes, Comments count, Share */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E3E8EF] pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleToggleLike}
            disabled={liking}
            className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
              liked
                ? "border-rose-200 bg-rose-50 text-rose-600"
                : "border-[#E3E8EF] bg-[#F4F6F9] text-[#0B1F3A] hover:border-[#F5B301]"
            }`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-rose-500 text-rose-500" : ""}`} />
            <span>{likes}</span>
            <span>{isHausa ? (liked ? "An So" : "So") : liked ? "Liked" : "Like"}</span>
          </button>

          <a
            href="#comment-form"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E3E8EF] bg-[#F4F6F9] px-4 text-sm font-medium text-[#0B1F3A] hover:border-[#F5B301]"
          >
            <MessageCircle className="h-4 w-4 text-[#0B1F3A]" />
            <span>{comments.length}</span>
            <span>{isHausa ? "Tsokaci" : comments.length === 1 ? "Comment" : "Comments"}</span>
          </a>

          <span className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-50 px-3.5 text-sm text-[#5B6675]">
            <Eye className="h-4 w-4" />
            <span>{views}</span>
            <span>{isHausa ? "Kallo" : views === 1 ? "View" : "Views"}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <Share2 className="h-3.5 w-3.5" />
            WhatsApp
          </a>
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E3E8EF] bg-white px-3 text-xs font-semibold text-[#0B1F3A] hover:bg-slate-50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                {isHausa ? "An Kwafa" : "Copied"}
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                {isHausa ? "Kwafi Link" : "Copy Link"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Comment Form */}
      <form id="comment-form" onSubmit={handleCommentSubmit} className="space-y-4">
        <div>
          <h3 className="font-heading text-xl font-bold text-[#0B1F3A]">
            {isHausa ? "Bar Tambaya ko Tsokaci" : "Leave a Question or Comment"}
          </h3>
          <p className="mt-1 text-sm text-[#5B6675]">
            {isHausa
              ? "Kuna da tambaya kan wannan matsalar a Kano? Ku rubuta mana a kasa."
              : "Have a question about this plumbing issue in Kano? Share your thoughts below."}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            placeholder={isHausa ? "Sunanka *" : "Your Name *"}
            className="h-11 rounded-lg border border-[#D4DCE6] bg-white px-3.5 text-sm text-[#0B1F3A] outline-none focus:border-[#F5B301]"
          />
          <input
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={60}
            placeholder={isHausa ? "Unguwa a Kano (misali: Tarauni)" : "Area in Kano (optional, e.g. Tarauni)"}
            className="h-11 rounded-lg border border-[#D4DCE6] bg-white px-3.5 text-sm text-[#0B1F3A] outline-none focus:border-[#F5B301]"
          />
        </div>

        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={800}
          required
          placeholder={
            isHausa
              ? "Rubuta tsokacinka ko tambayarka anan..."
              : "Write your comment or plumbing question here..."
          }
          className="w-full rounded-lg border border-[#D4DCE6] bg-white p-3.5 text-sm text-[#0B1F3A] outline-none focus:border-[#F5B301]"
        />

        {error && (
          <p className="text-xs font-medium text-rose-600">{error}</p>
        )}
        {submittedNotice && (
          <p className="text-xs font-medium text-emerald-700">
            {isHausa
              ? "Mun gode! An wallafa tsokacinka."
              : "Thank you! Your comment has been posted."}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B1F3A] px-5 text-sm font-semibold text-white transition hover:bg-[#132E54] disabled:opacity-60"
        >
          <Send className="h-4 w-4 text-[#F5B301]" />
          {submitting
            ? isHausa
              ? "Ana aikawa..."
              : "Posting..."
            : isHausa
            ? "Aika Tsokaci"
            : "Post Comment"}
        </button>
      </form>

      {/* Comments List */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#5B6675]">
          {isHausa
            ? `Tsokacin Masu Karatu (${comments.length})`
            : `Reader Comments (${comments.length})`}
        </h4>
        {comments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#D4DCE6] bg-[#F8FAFC] p-4 text-sm text-[#5B6675]">
            {isHausa
              ? "Babu tsokaci tukuna. Ku zama na farko da za su yi tambaya ko tsokaci!"
              : "No comments yet. Be the first to ask a question or share your experience."}
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-[#E3E8EF] bg-[#F8FAFC] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-xs font-bold text-[#F5B301]">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-[#0B1F3A]">
                      {c.name}
                    </span>
                    {c.area && (
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#5B6675] border border-[#E3E8EF]">
                        {c.area}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-[#5B6675]">
                    {new Date(c.created_at).toLocaleDateString("en-NG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-[#2C3A4B]">
                  {c.text}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
