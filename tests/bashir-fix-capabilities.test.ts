import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApprovalService, InMemoryApprovalStore } from "../src/lib/ai-workforce/approvals";
import { InMemoryToolExecutionLogger, ToolGateway } from "../src/lib/ai-workforce/tool-gateway";
import {
  GitHubApiConnector,
  LocalSafeRepoConnector,
  registerEngineeringTools,
  validateDraftPrFileChanges,
} from "../src/lib/ai-workforce/specialists/engineering";

describe("Bashir safe repairs and real Draft PR code fixes", () => {
  it("gates eng_repair_system_state behind Owner approval (amber tier) and validates repairType", async () => {
    const store = new InMemoryApprovalStore();
    const gateway = new ToolGateway(new ApprovalService(store), new InMemoryToolExecutionLogger());
    registerEngineeringTools(gateway, new LocalSafeRepoConnector());

    const invalid = await gateway.invoke({
      ctx: { agentId: "engineering_ai", actorUserId: "u1", actorEmail: "bashir@flowguard.com.ng" },
      toolName: "eng_repair_system_state",
      rawInput: { repairType: "drop_database", summary: "bad" },
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, "failed");

    const queued = await gateway.invoke({
      ctx: { agentId: "engineering_ai", actorUserId: "u1", actorEmail: "bashir@flowguard.com.ng" },
      toolName: "eng_repair_system_state",
      rawInput: {
        repairType: "clear_noise_incidents",
        summary: "Clear harmless NEXT_REDIRECT alerts from the task list.",
      },
    });
    assert.equal(queued.ok, true);
    assert.equal(queued.status, "pending_approval");
    assert.equal(queued.tier, "amber");
    assert.ok(queued.approvalId);
  });

  it("blocks restricted file paths, secret keys in patches, and protected branches in eng_prepare_pr", () => {
    const blockedPath = validateDraftPrFileChanges([
      { path: ".env.local", content: "FOO=bar" },
    ]);
    assert.equal(blockedPath.ok, false);

    const secretPatch = validateDraftPrFileChanges([
      { path: "src/lib/example.ts", content: "const k = 'sk_live_secretkeymaterial12345';" },
    ]);
    assert.equal(secretPatch.ok, false);

    const clean = validateDraftPrFileChanges([
      { path: "src/lib/example.ts", content: "export const ok = true;\n", reason: "Fix export" },
    ]);
    assert.equal(clean.ok, true);
    if (clean.ok) assert.equal(clean.files.length, 1);
  });

  it("GitHubApiConnector commits real fileChanges onto a feature branch and opens a Draft PR", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method || "GET";
      calls.push({ url: u, method, body: typeof init?.body === "string" ? init.body : undefined });

      if (u.endsWith("/git/ref/heads/master")) {
        return new Response(JSON.stringify({ object: { sha: "base-sha-123" } }), { status: 200 });
      }
      if (u.endsWith("/git/refs") && method === "POST") {
        return new Response(JSON.stringify({ ref: "refs/heads/fix/test-patch" }), { status: 201 });
      }
      if (u.includes("/contents/src/lib/sample.ts?ref=")) {
        return new Response(JSON.stringify({ sha: "existing-file-sha" }), { status: 200 });
      }
      if (u.endsWith("/contents/src/lib/sample.ts") && method === "PUT") {
        return new Response(JSON.stringify({ content: { sha: "new-file-sha" } }), { status: 200 });
      }
      if (u.endsWith("/pulls") && method === "POST") {
        return new Response(
          JSON.stringify({ html_url: "https://github.com/binusman02/bin-plumbing-website/pull/99" }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ message: "unexpected" }), { status: 404 });
    }) as typeof fetch;

    try {
      const connector = new GitHubApiConnector("gh-test-token", "binusman02/bin-plumbing-website");
      const out = await connector.prepareDraftPr({
        branchName: "fix/test-patch",
        title: "Fix sample helper",
        summary: "Handles edge case cleanly",
        testEvidence: "npm test 117/117 passed",
        changedFiles: ["src/lib/sample.ts"],
        fileChanges: [
          {
            path: "src/lib/sample.ts",
            content: "export const fixed = true;\n",
            reason: "Handle edge case cleanly",
          },
        ],
      });

      assert.equal(out.ok, true);
      assert.deepEqual(out.committedFiles, ["src/lib/sample.ts"]);
      assert.equal(out.draftPrUrl, "https://github.com/binusman02/bin-plumbing-website/pull/99");
      const putCall = calls.find((c) => c.method === "PUT" && c.url.includes("src/lib/sample.ts"));
      assert.ok(putCall);
      assert.ok(putCall.body?.includes("existing-file-sha"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
