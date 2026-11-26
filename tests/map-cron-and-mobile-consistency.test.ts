import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  createDefaultWebResearchProvider,
  TavilyWebResearchProvider,
} from "../src/lib/ai-workforce/specialists/research";
import {
  isAuthorizedCronRequest,
  resolveRoutineKind,
} from "../src/lib/ai-workforce/routine-runner";
import { MAP_CONFIG } from "../src/lib/map-config";

describe("System consistency: maps, Tavily key fallback, and scheduled workforce crons", () => {
  it("supports both TAVILY_API_KEY and TAVILY_APT_KEY fallback in research provider", () => {
    const primary = createDefaultWebResearchProvider({ TAVILY_API_KEY: "tvly-primary" });
    assert.ok(primary instanceof TavilyWebResearchProvider);

    const typoFallback = createDefaultWebResearchProvider({ TAVILY_APT_KEY: "tvly-fallback" });
    assert.ok(typoFallback instanceof TavilyWebResearchProvider);
  });

  it("maps cron schedule slugs to workforce routine kinds and enforces CRON_SECRET", () => {
    assert.equal(resolveRoutineKind("chase-overdue"), "chase_overdue");
    assert.equal(resolveRoutineKind("morning-standup"), "morning_standup");
    assert.equal(resolveRoutineKind("eod-report"), "eod_report");
    assert.equal(resolveRoutineKind("weekly-review"), "weekly_review");
    assert.equal(resolveRoutineKind("unknown"), null);

    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret-123";
    try {
      const okReq = new Request("https://flowguard-ng.vercel.app/api/cron/workforce/chase-overdue", {
        headers: { Authorization: "Bearer test-cron-secret-123" },
      });
      const badReq = new Request("https://flowguard-ng.vercel.app/api/cron/workforce/chase-overdue", {
        headers: { Authorization: "Bearer wrong-secret" },
      });
      assert.equal(isAuthorizedCronRequest(okReq), true);
      assert.equal(isAuthorizedCronRequest(badReq), false);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });

  it("provides valid Vercel Schedules config for all 4 Sadiq daily/weekly routines", () => {
    const raw = fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      schedules?: Record<string, { schedule: string; path: string; timezone?: string }>;
    };
    assert.ok(parsed.schedules);
    assert.equal(
      parsed.schedules["sadiq-chase-overdue"]?.path,
      "/api/cron/workforce/chase-overdue"
    );
    assert.equal(
      parsed.schedules["sadiq-morning-standup"]?.path,
      "/api/cron/workforce/morning-standup"
    );
    assert.equal(
      parsed.schedules["sadiq-eod-report"]?.path,
      "/api/cron/workforce/eod-report"
    );
    assert.equal(
      parsed.schedules["sadiq-weekly-review"]?.path,
      "/api/cron/workforce/weekly-review"
    );
  });

  it("includes free HTTPS fallback raster tiles in MAP_CONFIG for Web, PWA, and Mobile", () => {
    assert.ok(MAP_CONFIG.streetUrl.startsWith("https://"));
    assert.ok(MAP_CONFIG.streetFallbackUrl.startsWith("https://"));
    assert.ok(MAP_CONFIG.satelliteUrl.startsWith("https://"));
  });
});
