import { NextRequest, NextResponse } from "next/server";
import {
  getBlogEngagementMap,
  saveBlogEngagementMap,
  type BlogComment,
} from "@/lib/blog-engagement";

export async function GET(req: NextRequest) {
  const guideId = req.nextUrl.searchParams.get("guideId")?.trim();
  const map = await getBlogEngagementMap();
  const headers = {
    "Cache-Control": "public, max-age=10, stale-while-revalidate=30",
  };
  if (guideId) {
    return NextResponse.json(
      {
        guideId,
        engagement: map[guideId] || { views: 0, likes: 0, comments: [] },
      },
      { headers }
    );
  }
  return NextResponse.json({ engagementMap: map }, { headers });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action?: "view" | "like" | "unlike" | "comment";
      guideId?: string;
      name?: string;
      area?: string;
      text?: string;
      lang?: "en" | "ha";
    };

    const guideId = (body.guideId || "").trim();
    const action = body.action;
    if (!guideId || !action) {
      return NextResponse.json(
        { error: "guideId and action are required." },
        { status: 400 }
      );
    }

    const map = await getBlogEngagementMap();
    const current = map[guideId] || { views: 0, likes: 0, comments: [] };

    if (action === "view") {
      current.views += 1;
    } else if (action === "like") {
      current.likes += 1;
    } else if (action === "unlike") {
      current.likes = Math.max(0, current.likes - 1);
    } else if (action === "comment") {
      const name = (body.name || "").trim().slice(0, 60);
      const area = (body.area || "").trim().slice(0, 60);
      const text = (body.text || "").trim().slice(0, 800);
      if (name.length < 2 || text.length < 3) {
        return NextResponse.json(
          { error: "Please enter your name and a comment (at least 3 characters)." },
          { status: 400 }
        );
      }
      const comment: BlogComment = {
        id: `cmt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        ...(area ? { area } : {}),
        text,
        lang: body.lang === "ha" ? "ha" : "en",
        created_at: new Date().toISOString(),
      };
      current.comments = [comment, ...current.comments].slice(0, 100);
    } else {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    map[guideId] = current;
    const ok = await saveBlogEngagementMap(map);
    if (!ok) {
      return NextResponse.json(
        { error: "Could not persist engagement right now." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, guideId, engagement: current });
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }
}
