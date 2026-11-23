import assert from "node:assert/strict";
import test from "node:test";
import {
  checkModelEligibility,
  runWithFreeFirstModel,
  type ModelRouteConfig,
} from "../src/lib/ai-workforce/model-adapter";
import {
  InMemoryTaskStore,
  WorkforceOrchestrator,
  routeInstructionToAgent,
} from "../src/lib/ai-workforce/orchestrator";

test("AI Workforce Stage 2 — Free-First Model Policy & Orchestration", async (t) => {
  await t.test("1. Paid model route is blocked under $0.00 global spend cap", () => {
    const paidRoute: ModelRouteConfig = {
      routeId: "paid-pro",
      provider: "openai_compatible",
      modelId: "gpt-6-sol",
      billingTier: "paid",
      envKeyName: "PAID_API_KEY",
      baseUrl: "https://api.example.com/v1",
      dataTermsVerified: true,
      notes: "Paid tier",
    };

    const res = checkModelEligibility(paidRoute, {
      allowPaid: true,
      env: { PAID_API_KEY: "sk-test-123" },
    });

    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.code, "PAID_SPEND_BLOCKED");
    }
  });

  await t.test("2. Missing free API key fails safely without paid fallback", async () => {
    const res = await runWithFreeFirstModel(
      {
        agentId: "research_ai",
        routeId: "mimo-v2-6-flash-free",
        systemPrompt: "Research prompt",
        userPrompt: "Find Kano plumbing trends",
        maxTokens: 500,
      },
      {
        "mimo-v2-6-flash-free": {
          routeId: "mimo-v2-6-flash-free",
          provider: "openai_compatible",
          modelId: "mimo-v2.6-flash",
          billingTier: "free",
          envKeyName: "UNSET_MIMO_KEY_FOR_TEST",
          baseUrl: "https://api.example.com/v1",
          dataTermsVerified: false,
          notes: "Test",
        },
      }
    );

    assert.equal(res.ok, false);
    assert.equal(res.code, "NO_ELIGIBLE_FREE_MODEL");
  });

  await t.test("3. Daily run cap blocks excessive agent runs", async () => {
    const res = await runWithFreeFirstModel({
      agentId: "sales_ai",
      routeId: "free-first-default",
      systemPrompt: "Sales",
      userPrompt: "Qualify lead",
      maxTokens: 500,
      dailyRunCount: 50,
      dailyRunLimit: 50,
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, "DAILY_LIMIT_REACHED");
  });

  await t.test("4. Operations Manager routes instructions to the right specialist", () => {
    assert.equal(routeInstructionToAgent("Fix the Next.js build error on branch"), "engineering_ai");
    assert.equal(routeInstructionToAgent("Research competitor SEO keywords in Kano"), "research_ai");
    assert.equal(routeInstructionToAgent("Qualify new website leads and draft follow-up"), "sales_ai");
    assert.equal(routeInstructionToAgent("Triage urgent burst pipe customer complaint"), "customer_support_ai");
    assert.equal(routeInstructionToAgent("Give me a daily operations summary"), "operations_manager");
  });

  await t.test("5. Orchestrator creates durable task, runs scoped model, and records events", async () => {
    const store = new InMemoryTaskStore();
    const orchestrator = new WorkforceOrchestrator(store);

    const task = await orchestrator.dispatchInstruction({
      requesterId: "owner-1",
      title: "Competitor check",
      instruction: "Research competitor plumbing pricing in Kano",
      modelRunner: async (req) => {
        assert.equal(req.agentId, "research_ai");
        assert.ok(req.systemPrompt.includes("research_web_search"));
        return {
          ok: true,
          text: "Sourced report ready for review.",
          provider: "google",
          modelId: "gemini-3-flash-preview",
          inputTokens: 120,
          outputTokens: 45,
          latencyMs: 310,
        };
      },
    });

    assert.equal(task.assignedAgentId, "research_ai");
    assert.equal(task.status, "completed");
    assert.equal(task.outputSummary, "Sourced report ready for review.");
    assert.equal(store.events.length, 2);
    assert.equal(store.events[0].eventType, "routed");
    assert.equal(store.events[1].eventType, "completed");
  });

  await t.test("6. Orchestrator fails safely on provider outage and supports cancellation", async () => {
    const store = new InMemoryTaskStore();
    const orchestrator = new WorkforceOrchestrator(store);

    const failedTask = await orchestrator.dispatchInstruction({
      requesterId: "owner-1",
      title: "Draft email",
      instruction: "Qualify new lead from website enquiry",
      modelRunner: async () => ({
        ok: false,
        code: "PROVIDER_ERROR",
        error: "Upstream 429 rate limited",
      }),
    });

    assert.equal(failedTask.status, "failed");
    assert.equal(failedTask.errorMessage, "Upstream 429 rate limited");

    const queued = await store.createTask({
      id: "task-cancel-1",
      title: "Queued work",
      description: "Test cancel",
      requesterId: "owner-1",
      assignedAgentId: "sales_ai",
      parentTaskId: null,
      priority: "normal",
      status: "queued",
      outputSummary: null,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    });

    const cancelled = await orchestrator.cancelTask(queued.id);
    assert.equal(cancelled?.status, "cancelled");
  });

  await t.test("7. Agreed model routes assign MiMo V2.6 Flash and Recursive Flint per agent", async () => {
    const { listAgentDefinitions } = await import("../src/lib/ai-workforce/registry");
    const byId = Object.fromEntries(listAgentDefinitions().map((a) => [a.id, a]));
    assert.equal(byId.operations_manager.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.sales_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.customer_support_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.research_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.engineering_ai.modelRoute, "flint-recursive-eval");
  });
});
