import assert from "node:assert/strict";
import test from "node:test";
import {
  detectInvitedAgents,
  detectPrimarySpeaker,
  parseStructuredMeetingOutput,
} from "../src/lib/ai-workforce/meeting";
import {
  assignAgentVoices,
  cleanTextForSpeech,
  getElevenLabsVoiceId,
  stripAudioTags,
} from "../src/lib/ai-workforce/voice-profiles";

test("AI Workforce Live Team Meeting", async (t) => {
  await t.test("1. Inviting specialists by name or 'everyone' adds them to the room", () => {
    const withTwo = detectInvitedAgents("Sadiq, bring Bashir and Faruk in", [
      "operations_manager",
    ]);
    assert.deepEqual(withTwo.sort(), ["engineering_ai", "operations_manager", "research_ai"]);

    const withAll = detectInvitedAgents("Include everyone for weekly sync", [
      "operations_manager",
    ]);
    assert.equal(withAll.length, 5);
  });

  await t.test("2. Direct addressing routes straight to the named specialist", () => {
    const room = ["operations_manager", "engineering_ai", "sales_ai"] as const;
    assert.equal(
      detectPrimarySpeaker("@Bashir what caused the map bug?", [...room]),
      "engineering_ai"
    );
    assert.equal(
      detectPrimarySpeaker("Amina, how are leads looking today?", [...room]),
      "sales_ai"
    );
    assert.equal(
      detectPrimarySpeaker("Sadiq, bring Faruk in", [...room]),
      "operations_manager"
    );
  });

  await t.test("3. Parses structured JSON reply + raised hands and ignores speaker self-hand", () => {
    const parsed = parseStructuredMeetingOutput(
      JSON.stringify({
        reply: "Map config looks good now.",
        raisedHands: [
          { agentId: "engineering_ai", kind: "suggestion", topic: "Self should be ignored" },
          { agentId: "customer_support_ai", kind: "question", topic: "Confirm reply tone?" },
        ],
      }),
      ["operations_manager", "engineering_ai", "customer_support_ai"],
      "engineering_ai"
    );

    assert.equal(parsed.reply, "Map config looks good now.");
    assert.equal(parsed.raisedHands.length, 1);
    assert.equal(parsed.raisedHands[0].agentId, "customer_support_ai");
    assert.equal(parsed.raisedHands[0].kind, "question");
  });

  await t.test("4. Assigns 5 distinct natural voices matching each agent's persona", () => {
    const mockVoices = [
      { name: "Microsoft David - English (United States)", lang: "en-US" },
      { name: "Microsoft Abeo Online (Natural) - English (Nigeria)", lang: "en-NG" },
      { name: "Microsoft Ezinne Online (Natural) - English (Nigeria)", lang: "en-NG" },
      { name: "Microsoft Jenny Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Microsoft Andrew Online (Natural) - English (United States)", lang: "en-US" },
      { name: "Microsoft Steffan Online (Natural) - English (United States)", lang: "en-US" },
    ];
    const assigned = assignAgentVoices(mockVoices);
    const chosenNames = Object.values(assigned).map((v) => v.voice?.name);
    assert.equal(new Set(chosenNames).size, 5);
    assert.match(assigned.operations_manager.voice?.name || "", /Abeo/i);
    assert.match(assigned.sales_ai.voice?.name || "", /Ezinne/i);
    assert.match(assigned.customer_support_ai.voice?.name || "", /Jenny/i);
    assert.match(assigned.research_ai.voice?.name || "", /Andrew/i);
    assert.match(assigned.engineering_ai.voice?.name || "", /Steffan/i);
  });

  await t.test("5. Assigns 5 distinct ElevenLabs voice IDs with optional env overrides", () => {
    const ids = [
      getElevenLabsVoiceId("operations_manager", {}),
      getElevenLabsVoiceId("sales_ai", {}),
      getElevenLabsVoiceId("customer_support_ai", {}),
      getElevenLabsVoiceId("research_ai", {}),
      getElevenLabsVoiceId("engineering_ai", {}),
    ];
    assert.equal(new Set(ids).size, 5);
    assert.equal(
      getElevenLabsVoiceId("sales_ai", { ELEVENLABS_VOICE_AMINA: "custom-amina-id" }),
      "custom-amina-id"
    );
  });

  await t.test("6. Strips audio tags for display while preserving them for ElevenLabs v3", () => {
    const tagged = "[chuckles] Ha, close enough — Amina here, Boss. [short pause] Quick update.";
    assert.equal(
      stripAudioTags(tagged),
      "Ha, close enough — Amina here, Boss. Quick update."
    );
    assert.equal(
      cleanTextForSpeech(tagged, { keepAudioTags: true }),
      "[chuckles] Ha, close enough — Amina here, Boss. [short pause] Quick update."
    );
  });

  await t.test("7. Keeps floor with active specialist on follow-ups so Sadiq does not interrupt", () => {
    const room = ["operations_manager", "sales_ai", "engineering_ai"] as const;
    // Follow-up without naming anyone stays with Amina
    assert.equal(
      detectPrimarySpeaker("Okay, send me that draft", [...room], undefined, "sales_ai"),
      "sales_ai"
    );
    // Explicitly naming Sadiq switches back to Sadiq
    assert.equal(
      detectPrimarySpeaker("Sadiq, what do you think?", [...room], undefined, "sales_ai"),
      "operations_manager"
    );
  });
});
