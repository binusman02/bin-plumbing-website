import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildIncidentDedupeKey,
  diagnoseIncidentHint,
  inferIncidentArea,
  reportSystemIncident,
  resetIncidentDedupeForTests,
  sanitizeIncidentText,
  withIncidentMonitor,
} from "../src/lib/ai-workforce/incident-monitor";

afterEach(() => {
  resetIncidentDedupeForTests();
});

describe("Bashir whole-system incident monitor", () => {
  it("sanitizes secrets and redacts tokens/passwords", () => {
    const raw =
      "Auth failed with Bearer abc.def.ghi token=sk_live_1234567890 password=mysecretpass jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const clean = sanitizeIncidentText(raw);
    assert.ok(!clean.includes("sk_live_1234567890"));
    assert.ok(!clean.includes("mysecretpass"));
    assert.ok(!clean.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.ok(clean.includes("[REDACTED]"));
  });

  it("infers the correct system area across web, portals, mobile, tracking, and admin", () => {
    assert.equal(inferIncidentArea("/api/customer/zainab/chat:POST"), "customer");
    assert.equal(inferIncidentArea("/api/mobile/requests:POST"), "mobile");
    assert.equal(inferIncidentArea("/api/tracking/snapshot:GET"), "tracking");
    assert.equal(inferIncidentArea("/api/mobile/payments:POST"), "payments");
    assert.equal(inferIncidentArea("/api/chat/message:POST"), "chat");
    assert.equal(inferIncidentArea("/api/public/amina/book:POST"), "public");
    assert.equal(inferIncidentArea("action:adminUpdatePlumberProfileAction", "/admin/plumbers"), "admin");
    assert.equal(inferIncidentArea("action:updateProfileAction:plumber", "/plumber"), "plumber");
  });

  it("produces clear plain-English diagnosis hints without developer jargon", () => {
    const schemaHint = diagnoseIncidentHint(
      "Could not find the 'availability' column of 'plumbers' in the schema cache"
    ).toLowerCase();
    assert.ok(schemaHint.includes("missing") && schemaHint.includes("column"));
    assert.ok(!schemaHint.includes("postgrest"));

    const permHint = diagnoseIncidentHint("new row violates row-level security policy");
    assert.ok(permHint.toLowerCase().includes("permissions"));
    assert.ok(!permHint.includes("RLS"));

    assert.ok(diagnoseIncidentHint("Deepgram timeout ETIMEDOUT").toLowerCase().includes("too long"));
    assert.ok(diagnoseIncidentHint("Storage bucket upload rejected").toLowerCase().includes("upload"));
  });

  it("filters benign browser noise and Next.js redirect control signals and deduplicates repeated incidents", async () => {
    const noise = await reportSystemIncident({
      source: "client:window_error",
      errorMessage: "ResizeObserver loop limit exceeded",
    });
    assert.equal(noise.recorded, false);
    assert.equal(noise.skippedReason, "benign_browser_noise");

    const redirectSignal = await reportSystemIncident({
      source: "client:unhandled_rejection",
      errorMessage: "NEXT_REDIRECT",
      routePath: "/customer?tab=profile",
    });
    assert.equal(redirectSignal.recorded, false);
    assert.equal(redirectSignal.skippedReason, "benign_browser_noise");

    const notFoundSignal = await reportSystemIncident({
      source: "client:unhandled_rejection",
      errorMessage: "NEXT_NOT_FOUND",
    });
    assert.equal(notFoundSignal.recorded, false);
    assert.equal(notFoundSignal.skippedReason, "benign_browser_noise");

    const key1 = buildIncidentDedupeKey("/api/mobile/requests", "Failed row 999123 insert");
    const key2 = buildIncidentDedupeKey("/api/mobile/requests", "Failed row 444555 insert");
    assert.equal(key1, key2);
  });

  it("withIncidentMonitor catches uncaught handler exceptions and returns clean 500 JSON", async () => {
    const handler = withIncidentMonitor("/api/test/crash", "customer", async () => {
      throw new Error("Simulated customer portal DB crash");
    });
    const res = await handler();
    assert.equal(res.status, 500);
    const json = (await res.json()) as { error?: string };
    assert.equal(json.error, "Internal server error");
  });
});
