import assert from "node:assert/strict";
import test from "node:test";
import {
  detectInvitedAgents,
  detectPrimarySpeaker,
  parseStructuredMeetingOutput,
} from "../src/lib/ai-workforce/meeting";

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
});
