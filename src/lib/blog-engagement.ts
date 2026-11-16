import { getServiceSupabase } from "@/lib/supabase/admin";

export interface BlogComment {
  id: string;
  name: string;
  area?: string;
  text: string;
  lang: "en" | "ha";
  created_at: string;
}

export interface GuideEngagement {
  views: number;
  likes: number;
  comments: BlogComment[];
}

export type BlogEngagementMap = Record<string, GuideEngagement>;

const SETTINGS_KEY = "blog_engagement";

function normalizeEngagementEntry(raw: unknown): GuideEngagement {
  if (!raw || typeof raw !== "object") {
    return { views: 0, likes: 0, comments: [] };
  }
  const obj = raw as Record<string, unknown>;
  const commentsRaw = Array.isArray(obj.comments) ? obj.comments : [];
  const comments: BlogComment[] = commentsRaw
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === "object"))
    .map((c) => ({
      id: String(c.id || ""),
      name: String(c.name || "Reader").slice(0, 60),
      area: c.area ? String(c.area).slice(0, 60) : undefined,
      text: String(c.text || "").slice(0, 800),
      lang: (c.lang === "ha" ? "ha" : "en") as "en" | "ha",
      created_at: String(c.created_at || new Date().toISOString()),
    }))
    .filter((c) => Boolean(c.id && c.text.trim()));

  return {
    views: Math.max(0, Number(obj.views) || 0),
    likes: Math.max(0, Number(obj.likes) || 0),
    comments,
  };
}

export async function getBlogEngagementMap(): Promise<BlogEngagementMap> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", SETTINGS_KEY)
      .maybeSingle();

    if (error || !data || !data.value || typeof data.value !== "object") {
      return {};
    }

    const rawMap = data.value as Record<string, unknown>;
    const result: BlogEngagementMap = {};
    for (const [guideId, entry] of Object.entries(rawMap)) {
      result[guideId] = normalizeEngagementEntry(entry);
    }
    return result;
  } catch {
    return {};
  }
}

export async function getGuideEngagement(guideId: string): Promise<GuideEngagement> {
  const map = await getBlogEngagementMap();
  return map[guideId] || { views: 0, likes: 0, comments: [] };
}

export async function saveBlogEngagementMap(map: BlogEngagementMap): Promise<boolean> {
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("settings").upsert(
    {
      key: SETTINGS_KEY,
      value: map,
      description: "Blog views, likes, and reader comments",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
  return !error;
}
