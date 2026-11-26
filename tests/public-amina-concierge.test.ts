import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryReportStore } from "../src/lib/ai-workforce/owner-report";
import {
  handlePublicAminaTurn,
  InMemoryPublicAminaStore,
  notifyCustomerOnPlumberAssigned,
  parseAminaConciergeOutput,
} from "../src/lib/ai-workforce/public-amina";
import {
  InMemoryTeamBoardAndMemoryStore,
  savePlaybookRule,
} from "../src/lib/ai-workforce/team-memory";

test("Public Amina Concierge: natural chat, voice sync, memory, Owner reporting, SOP guard & assignment notifications", async (t) => {
  await t.test("1. Strips META_JSON and markdown noise so customers see clean natural prose", () => {
    const parsed = parseAminaConciergeOutput(
      `Yes, we cover **Tarauni** and \`Nassarawa\`. Share your address whenever you're ready!
META_JSON: {"topicSummary":"Visitor asked about Tarauni coverage","shouldReportToOwner":true,"readyToBook":true,"bookingDraft":{"cityOrLga":"Tarauni"}}`
    );
    assert.equal(parsed.reply, "Yes, we cover Tarauni and Nassarawa. Share your address whenever you're ready!");
    assert.equal(parsed.topicSummary, "Visitor asked about Tarauni coverage");
    assert.equal(parsed.shouldReportToOwner, true);
    assert.equal(parsed.readyToBook, true);
    assert.equal(parsed.bookingDraft?.cityOrLga, "Tarauni");
  });

  await t.test("2. Syncs voice note history, applies Playbook rule, saves memory/team note & reports to Owner", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();
    const sentNotifs: Array<{ title: string; type: string }> = [];

    await savePlaybookRule(
      {
        agentId: "sales_ai",
        rule: "Always confirm Kano neighbourhood name warmly.",
      },
      teamStore
    );

    let promptSeen = "";
    const turn = await handlePublicAminaTurn({
      customerMessage: "My borehole pump stopped pumping water in Bompai.",
      source: "voice",
      store,
      teamStore,
      reportStore,
      notifyFn: (async (n: { title: string; type: string }) => {
        sentNotifs.push(n);
        return { id: "notif-1" };
      }) as never,
      modelRunner: async (req) => {
        promptSeen = req.systemPrompt;
        return {
          ok: true,
          text: `We definitely service borehole pumps in Bompai! Share your name, phone, email, and street address so I can book an inspection for you.\nMETA_JSON: {"topicSummary":"Bompai borehole pump stopped working","shouldReportToOwner":true,"readyToBook":true,"bookingDraft":{"cityOrLga":"Bompai","problemType":"Borehole & Pump Systems","issueSummary":"Borehole pump stopped pumping water","urgency":"standard"}}`,
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 120,
          outputTokens: 50,
        };
      },
    });

    assert.match(promptSeen, /Always confirm Kano neighbourhood name warmly/);
    assert.equal(turn.readyToBook, true);
    assert.equal(turn.messages.length, 2);
    assert.equal(turn.messages[0].source, "voice");
    assert.equal(turn.messages[1].role, "assistant");

    // Memory + Team note + Owner report recorded
    assert.ok(teamStore.memories.some((m) => m.namespace === "ns_sales_ai"));
    assert.ok(teamStore.notes.some((n) => n.fromAgent === "sales_ai"));
    const reports = await reportStore.listReports(5);
    assert.equal(reports.length, 1);
    assert.match(reports[0].message, /Bompai borehole pump stopped working/);
    assert.equal(sentNotifs.length, 1);

    // Reloading session with same token returns synced history
    const reloaded = await store.findSessionByToken(turn.sessionToken);
    assert.ok(reloaded);
    assert.equal((await store.listMessages(reloaded.id)).length, 2);
  });

  await t.test("3. Enforces Sales SOP guard against fixed-price promises and unverified claims", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();

    const turn = await handlePublicAminaTurn({
      customerMessage: "How much to fix a leaking kitchen sink?",
      store,
      teamStore,
      reportStore,
      notifyFn: (async () => ({ id: "n-1" })) as never,
      modelRunner: async () => ({
        ok: true,
        text: `Our fixed price is ₦12,000 and I have assigned plumber Musa already.\nMETA_JSON: {"topicSummary":"Asked kitchen sink leak cost","shouldReportToOwner":true,"readyToBook":false}`,
        provider: "openai_compatible",
        modelId: "xiaomi/mimo-v2.6-flash",
        inputTokens: 90,
        outputTokens: 30,
      }),
    });

    assert.doesNotMatch(turn.reply, /₦12,000|fixed price|assigned plumber/i);
    assert.match(turn.reply, /inspect on-site first/i);
    assert.doesNotMatch(turn.reply, /drafted \/ waiting approval \/ not done/i);
  });

  await t.test("3b. Rewrites 'I sent' naturally without leaking internal SOP markers to customers", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();

    const turn = await handlePublicAminaTurn({
      customerMessage: "How do I track my ticket?",
      store,
      teamStore,
      reportStore,
      notifyFn: (async () => ({ id: "n-track" })) as never,
      modelRunner: async () => ({
        ok: true,
        text: "You can follow your ticket straight through the tracking link I sent you.",
        provider: "openai_compatible",
        modelId: "xiaomi/mimo-v2.6-flash",
        inputTokens: 80,
        outputTokens: 25,
      }),
    });

    assert.doesNotMatch(turn.reply, /drafted \/ waiting approval \/ not done/i);
    assert.doesNotMatch(turn.reply, /\bi sent\b/i);
  });

  await t.test("4. Escalates urgent flooding visitor immediately to Owner", async () => {
    const store = new InMemoryPublicAminaStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reportStore = new InMemoryReportStore();
    const sentNotifs: Array<{ type: string; title: string }> = [];

    await handlePublicAminaTurn({
      customerMessage: "Urgent! Burst pipe flooding my kitchen in Nassarawa right now!",
      store,
      teamStore,
      reportStore,
      notifyFn: (async (n: { type: string; title: string }) => {
        sentNotifs.push(n);
        return { id: "n-urg" };
      }) as never,
      modelRunner: async () => ({
        ok: true,
        text: `Please shut off your main water stopcock and nearby sockets right away! Share your details below so I can book urgent dispatch.\nMETA_JSON: {"topicSummary":"Burst pipe flooding Nassarawa kitchen","shouldReportToOwner":true,"readyToBook":true}`,
        provider: "openai_compatible",
        modelId: "xiaomi/mimo-v2.6-flash",
        inputTokens: 100,
        outputTokens: 35,
      }),
    });

    assert.equal(sentNotifs.length, 1);
    assert.equal(sentNotifs[0].type, "ai_urgent_alert");
  });

  await t.test("5. Notifies customer via chat update, notification, and email when plumber is assigned", async () => {
    const store = new InMemoryPublicAminaStore();
    const session = await store.getOrCreateSession("amina_test_session_1");
    await store.updateSession(session.id, {
      ticketNumber: "BP-261126-4411",
      visitorEmail: "ahmed@example.com",
      visitorName: "Ahmed Bello",
    });

    const notifs: Array<{ recipientId: string; title: string; type: string }> = [];
    const emails: Array<{ to: string; subject: string; body: string }> = [];

    await notifyCustomerOnPlumberAssigned({
      ticketNumber: "BP-261126-4411",
      plumberName: "Ibrahim Danjuma",
      customerId: "cust-99",
      customerEmail: "ahmed@example.com",
      customerName: "Ahmed Bello",
      store,
      notifyFn: (async (n: { recipientId: string; title: string; type: string }) => {
        notifs.push(n);
        return { id: "n-cust" };
      }) as never,
      emailAdapter: {
        providerName: "resend",
        async sendApprovedEmail(input) {
          emails.push(input);
          return { ok: true, messageId: "email-1" };
        },
      },
    });

    assert.equal(notifs.length, 1);
    assert.equal(notifs[0].recipientId, "cust-99");
    assert.equal(notifs[0].type, "plumber_assigned");

    assert.equal(emails.length, 1);
    assert.equal(emails[0].to, "ahmed@example.com");
    assert.match(emails[0].body, /Ibrahim Danjuma/);

    const msgs = await store.listMessages(session.id);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].source, "assignment_update");
    assert.match(msgs[0].content, /Ibrahim Danjuma/);
    assert.match(msgs[0].content, /BP-261126-4411/);
  });

  await t.test("6. Preserves conversation history and answers thoughtfully even when DB read returns empty or model fails", async () => {
    const emptyReadStore: InMemoryPublicAminaStore = new InMemoryPublicAminaStore();
    emptyReadStore.listMessages = async () => [];

    let capturedMaxTokens = 0;
    let capturedPrompt = "";
    const turnWithModel = await handlePublicAminaTurn({
      customerMessage: "Do you cover Tarauni?",
      clientHistory: [
        { role: "customer", content: "I want to know about fluw gauard" },
        { role: "assistant", content: "FlowGuard connects you with vetted plumbers in Kano." },
      ],
      store: emptyReadStore,
      teamStore: new InMemoryTeamBoardAndMemoryStore(),
      reportStore: new InMemoryReportStore(),
      notifyFn: (async () => ({ id: "n-1" })) as never,
      modelRunner: async (req) => {
        capturedMaxTokens = req.maxTokens;
        capturedPrompt = req.userPrompt;
        return {
          ok: true,
          text: `Yes, we cover Tarauni and nearby Kano areas.\nMETA_JSON: {"topicSummary":"Tarauni coverage","shouldReportToOwner":false,"readyToBook":false}`,
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 100,
          outputTokens: 30,
        };
      },
    });

    assert.ok(capturedMaxTokens >= 1200);
    assert.match(capturedPrompt, /I want to know about fluw gauard/);
    assert.equal(turnWithModel.messages.length, 4);
    assert.equal(turnWithModel.messages[2].role, "customer");
    assert.equal(turnWithModel.messages[3].role, "assistant");

    const fallbackTurn = await handlePublicAminaTurn({
      customerMessage: "I want to know about fluw gauard",
      store: emptyReadStore,
      teamStore: new InMemoryTeamBoardAndMemoryStore(),
      reportStore: new InMemoryReportStore(),
      notifyFn: (async () => ({ id: "n-2" })) as never,
      modelRunner: async () => ({
        ok: false,
        code: "PROVIDER_ERROR",
        error: "Simulated provider timeout",
      }),
    });

    assert.match(fallbackTurn.reply, /FlowGuard Plumbing Enterprises/i);
    assert.match(fallbackTurn.reply, /itemised quote/i);
    assert.equal(fallbackTurn.messages.length, 2);
  });
});
