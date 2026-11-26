import assert from "node:assert/strict";
import test from "node:test";
import {
  buildZainabFallbackReply,
  customerSessionToken,
  handleCustomerZainabTurn,
  parseZainabOutput,
} from "../src/lib/ai-workforce/customer-zainab";
import { InMemoryReportStore } from "../src/lib/ai-workforce/owner-report";
import { InMemoryPublicAminaStore } from "../src/lib/ai-workforce/public-amina";
import { InMemoryTeamBoardAndMemoryStore } from "../src/lib/ai-workforce/team-memory";

test("Customer Portal Zainab Concierge: verified ticket context, voice sync, fallback & safety", async (t) => {
  await t.test("1. Strips META_JSON and markdown noise so customers see clean natural prose", () => {
    const parsed = parseZainabOutput(
      `Your technician **Mustapha** is assigned to BP-261126-9695. Tap Track Plumber on Overview once he starts his trip!
META_JSON: {"topicSummary":"Asked about plumber ETA on BP-261126-9695","shouldReportToOwner":false}`
    );
    assert.doesNotMatch(parsed.reply, /\*\*|META_JSON/);
    assert.match(parsed.reply, /Mustapha/);
    assert.equal(parsed.topicSummary, "Asked about plumber ETA on BP-261126-9695");
  });

  await t.test("2. Syncs voice messages, grounds on verified customer tickets & saves memory", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();
    const notifs: Array<{ type: string; title: string }> = [];
    let seenPrompt = "";

    const res = await handleCustomerZainabTurn({
      customerId: "cust-ilyasu-1",
      customerName: "Ilyasu Musa",
      customerMessage: "Who is assigned to my leaking sink ticket?",
      source: "voice",
      tickets: [
        {
          ticketNumber: "BP-261126-9695",
          status: "scheduled",
          problemCategory: "Leak Detection & Repair",
          address: "Tarauni, Kano",
          assignedTechnician: "Mustapha Aminu Usman",
          pendingQuoteTotalNgn: 18500,
        },
      ],
      store,
      teamStore,
      reportStore,
      notifyFn: (async (n: { type: string; title: string }) => {
        notifs.push(n);
        return { id: "n-1" };
      }) as never,
      modelRunner: async (req) => {
        seenPrompt = req.systemPrompt;
        return {
          ok: true,
          text: `Mustapha Aminu Usman is assigned to BP-261126-9695, Ilyasu, and there is a ₦18,500 quotation waiting for your review under My Requests.\nMETA_JSON: {"topicSummary":"Checked assigned plumber and quote on BP-261126-9695","shouldReportToOwner":true}`,
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 120,
          outputTokens: 35,
        };
      },
    });

    assert.equal(res.sessionToken, customerSessionToken("cust-ilyasu-1"));
    assert.match(seenPrompt, /BP-261126-9695/);
    assert.match(seenPrompt, /Mustapha Aminu Usman/);
    assert.equal(res.messages.length, 2);
    assert.equal(res.messages[0].source, "voice");
    assert.ok(teamStore.memories.some((m) => m.namespace === "ns_customer_support_ai"));
    assert.equal(notifs.length, 1);
  });

  await t.test("3. Escalates urgent flooding issue to Owner immediately", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();
    const notifs: Array<{ type: string; title: string }> = [];

    const res = await handleCustomerZainabTurn({
      customerId: "cust-urg-1",
      customerName: "Aisha",
      customerMessage: "Burst pipe flooding my bathroom right now!",
      tickets: [
        {
          ticketNumber: "BP-261126-7711",
          status: "new",
          problemCategory: "Emergency Plumbing",
          address: "Nassarawa",
          assignedTechnician: null,
        },
      ],
      store,
      teamStore,
      reportStore,
      notifyFn: (async (n: { type: string; title: string }) => {
        notifs.push(n);
        return { id: "n-urg" };
      }) as never,
      modelRunner: async () => ({
        ok: false,
        code: "PROVIDER_ERROR",
        error: "timeout",
      }),
    });

    assert.match(res.reply, /shut off your main water stopcock/i);
    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].type, "ai_urgent_alert");
  });

  await t.test("4. Fallback answers ticket status and pending quote cleanly", () => {
    const statusReply = buildZainabFallbackReply("Where is my plumber?", [
      {
        ticketNumber: "BP-261126-9695",
        status: "scheduled",
        problemCategory: "Leak",
        address: "Bompai",
        assignedTechnician: "Musa Bello",
      },
    ]);
    assert.match(statusReply, /Musa Bello/);
    assert.match(statusReply, /Track Plumber/i);

    const quoteReply = buildZainabFallbackReply("How do I see my quote?", [
      {
        ticketNumber: "BP-261126-9695",
        status: "quotation_submitted",
        problemCategory: "Leak",
        address: "Bompai",
        assignedTechnician: "Musa Bello",
        pendingQuoteTotalNgn: 25000,
      },
    ]);
    assert.match(quoteReply, /25,000/);
  });
});
