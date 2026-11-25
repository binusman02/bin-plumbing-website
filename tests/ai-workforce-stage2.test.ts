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
    assert.equal(task.status, "closed");
    assert.equal(task.outputSummary, "Sourced report ready for review.");
    assert.ok(store.events.some((e) => e.eventType === "routed"));
    assert.ok(store.events.some((e) => e.eventType === "closed"));
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
    const { DEFAULT_MODEL_ROUTES } = await import("../src/lib/ai-workforce/model-adapter");
    const byId = Object.fromEntries(listAgentDefinitions().map((a) => [a.id, a]));
    assert.equal(byId.operations_manager.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.sales_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.customer_support_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.research_ai.modelRoute, "mimo-v2-6-flash-free");
    assert.equal(byId.engineering_ai.modelRoute, "free-first-default");

    const geminiOk = checkModelEligibility(DEFAULT_MODEL_ROUTES["free-first-default"], {
      env: { GOOGLE_GENERATIVE_AI_API_KEY: "AIza_test" },
    });
    assert.equal(geminiOk.ok, true);

    const mimoOk = checkModelEligibility(DEFAULT_MODEL_ROUTES["mimo-v2-6-flash-free"], {
      env: { AI_GATEWAY_API_KEY: "vck_test_mimo" },
    });
    assert.equal(mimoOk.ok, true);

    const flintOk = checkModelEligibility(DEFAULT_MODEL_ROUTES["flint-recursive-eval"], {
      env: { AI_GATEWAY_API_KEY_FLINT: "vck_test_flint" },
    });
    assert.equal(flintOk.ok, true);
  });

  await t.test("8. Free fallback chain retries transient errors, falls back to next free route, and skips paid", async () => {
    const {
      DEFAULT_MODEL_ROUTES,
      getFreeFallbackChain,
      runWithFreeFirstModel,
    } = await import("../src/lib/ai-workforce/model-adapter");

    const routesWithPaid = {
      ...DEFAULT_MODEL_ROUTES,
      "paid-route": {
        routeId: "paid-route",
        provider: "openai_compatible" as const,
        modelId: "paid-model",
        billingTier: "paid" as const,
        envKeyName: "PAID_KEY",
        dataTermsVerified: true,
        notes: "Paid test route",
      },
    };

    const chain = getFreeFallbackChain("free-first-default", routesWithPaid, {
      GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
      AI_GATEWAY_API_KEY: "m-key",
      PAID_KEY: "p-key",
    });
    assert.deepEqual(
      chain.map((c) => c.route.routeId),
      ["free-first-default", "mimo-v2-6-flash-free"]
    );

    const attempts: string[] = [];
    const res = await runWithFreeFirstModel(
      {
        agentId: "engineering_ai",
        routeId: "free-first-default",
        systemPrompt: "Test",
        userPrompt: "Hello",
        maxTokens: 400,
        timeoutMs: 5000,
      },
      routesWithPaid,
      {
        env: {
          GOOGLE_GENERATIVE_AI_API_KEY: "g-key",
          AI_GATEWAY_API_KEY: "m-key",
        },
        routeExecutor: async (_req, route) => {
          attempts.push(route.routeId);
          if (route.routeId === "free-first-default") {
            return {
              ok: false,
              code: "PROVIDER_ERROR",
              error: "The operation was aborted due to timeout",
            };
          }
          return {
            ok: true,
            text: "Fallback MiMo answered.",
            provider: route.provider,
            modelId: route.modelId,
          };
        },
      }
    );

    assert.equal(res.ok, true);
    assert.equal(res.text, "Fallback MiMo answered.");
    // Retried free-first-default once on timeout, then fell back to mimo-v2-6-flash-free
    assert.deepEqual(attempts, [
      "free-first-default",
      "free-first-default",
      "mimo-v2-6-flash-free",
    ]);
  });
});
