import assert from "node:assert/strict";
import test from "node:test";
import {
  ApprovalService,
  InMemoryApprovalStore,
  computePayloadHash,
} from "../src/lib/ai-workforce/approvals";
import {
  InMemoryToolExecutionLogger,
  ToolGateway,
  redactSensitiveArgs,
} from "../src/lib/ai-workforce/tool-gateway";

function setupGateway() {
  const store = new InMemoryApprovalStore();
  const approvals = new ApprovalService(store);
  const logger = new InMemoryToolExecutionLogger();
  const gateway = new ToolGateway(approvals, logger);

  let paymentSideEffectCount = 0;
  let emailSideEffectCount = 0;

  gateway.registerTool({
    name: "verify_payment",
    description: "Verify payment",
    tier: "amber",
    requiredScope: "admin:payments:verify",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      if (typeof obj.ticketNumber !== "string" || typeof obj.decision !== "string") {
        return { ok: false, error: "Invalid input" };
      }
      return { ok: true, data: { ticketNumber: obj.ticketNumber, decision: obj.decision } };
    },
    async execute(input) {
      paymentSideEffectCount += 1;
      return { verified: input.ticketNumber, count: paymentSideEffectCount };
    },
  });

  gateway.registerTool({
    name: "sales_send_email",
    description: "Send outbound sales email",
    tier: "amber",
    requiredScope: "sales:email:send",
    validateInput(raw) {
      const obj = (raw || {}) as Record<string, unknown>;
      if (typeof obj.to !== "string" || typeof obj.body !== "string") {
        return { ok: false, error: "Invalid input" };
      }
      return { ok: true, data: { to: obj.to, body: obj.body } };
    },
    async execute(input) {
      emailSideEffectCount += 1;
      return { sentTo: input.to, count: emailSideEffectCount };
    },
  });

  gateway.registerTool({
    name: "eng_merge_pr",
    description: "Merge PR to protected branch",
    tier: "red",
    requiredScope: "eng:pr:merge",
    validateInput(raw) {
      return { ok: true, data: (raw || {}) as Record<string, unknown> };
    },
    async execute() {
      throw new Error("RED TOOL SHOULD NEVER EXECUTE");
    },
  });

  return {
    store,
    approvals,
    logger,
    gateway,
    getPaymentCount: () => paymentSideEffectCount,
    getEmailCount: () => emailSideEffectCount,
  };
}

test("AI Workforce Security & Approvals (Stage 1)", async (t) => {
  await t.test("1. Amber action creates pending approval without executing side effect", async () => {
    const { gateway, getPaymentCount } = setupGateway();
    const res = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: { ticketNumber: "BP-1001", decision: "verified" },
      targetResource: "BP-1001",
    });

    assert.equal(res.ok, true);
    assert.equal(res.status, "pending_approval");
    assert.ok(res.approvalId);
    assert.equal(getPaymentCount(), 0);
  });

  await t.test("2. Agent cannot approve its own request", async () => {
    const { gateway, getPaymentCount } = setupGateway();
    const req = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: { ticketNumber: "BP-1002", decision: "verified" },
    });

    const selfApprove = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "approve",
      approver: {
        actorType: "agent",
        userId: "operations_manager",
        email: "ops@ai.local",
      },
    });

    assert.equal(selfApprove.ok, false);
    assert.equal(selfApprove.code, "SELF_APPROVAL_FORBIDDEN");
    assert.equal(getPaymentCount(), 0);
  });

  await t.test("3. Expired approval cannot execute", async () => {
    const store = new InMemoryApprovalStore();
    const approvals = new ApprovalService(store);
    const createdAt = new Date("2026-11-23T10:00:00Z");
    const rec = await approvals.createApprovalRequest(
      {
        requestedByAgent: "operations_manager",
        toolName: "verify_payment",
        targetResource: "BP-1003",
        actionSummary: "Verify payment",
        payload: { ticketNumber: "BP-1003", decision: "verified" },
        reason: "Customer uploaded proof",
        ttlSeconds: 60,
      },
      createdAt
    );

    let executed = false;
    const expiredRes = await approvals.decideAndExecute({
      approvalId: rec.id,
      decision: "approve",
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
      now: new Date("2026-11-23T10:05:00Z"),
      executor: async () => {
        executed = true;
        return { ok: true };
      },
    });

    assert.equal(expiredRes.ok, false);
    assert.equal(expiredRes.code, "EXPIRED");
    assert.equal(executed, false);
  });

  await t.test("4. Changed payload invalidates prior approval via hash mismatch", async () => {
    const { gateway, store, getPaymentCount } = setupGateway();
    const req = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: { ticketNumber: "BP-1004", decision: "verified" },
    });

    // Simulate payload tampering or stale hash expectation
    const wrongHash = computePayloadHash("verify_payment", "BP-1004", {
      ticketNumber: "BP-9999",
      decision: "verified",
    });
    const res = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "approve",
      expectedPayloadHash: wrongHash,
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
    });

    assert.equal(res.ok, false);
    assert.equal(res.code, "PAYLOAD_HASH_MISMATCH");
    assert.equal(getPaymentCount(), 0);
    const saved = await store.findById(req.approvalId!);
    assert.equal(saved?.status, "pending");
  });

  await t.test("5. Duplicate approval does not repeat side effect (idempotency)", async () => {
    const { gateway, getPaymentCount } = setupGateway();
    const req = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: { ticketNumber: "BP-1005", decision: "verified" },
    });

    const first = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "approve",
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
    });
    const second = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "approve",
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
    });

    assert.equal(first.ok, true);
    assert.equal(first.approval?.status, "executed");
    assert.equal(second.ok, false);
    assert.equal(second.code, "ALREADY_DECIDED");
    assert.equal(getPaymentCount(), 1);
  });

  await t.test("6. Rejected approval cannot be retried as approved", async () => {
    const { gateway, getPaymentCount } = setupGateway();
    const req = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "verify_payment",
      rawInput: { ticketNumber: "BP-1006", decision: "verified" },
    });

    const rejectRes = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "reject",
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
    });
    const retryRes = await gateway.decideApproval({
      approvalId: req.approvalId!,
      decision: "approve",
      approver: { actorType: "owner", userId: "owner-1", email: "owner@flowguard.com.ng" },
    });

    assert.equal(rejectRes.ok, true);
    assert.equal(rejectRes.approval?.status, "rejected");
    assert.equal(retryRes.ok, false);
    assert.equal(retryRes.code, "ALREADY_DECIDED");
    assert.equal(getPaymentCount(), 0);
  });

  await t.test("7. Operations Manager cannot bypass specialist tool allowlist", async () => {
    const { gateway, getEmailCount } = setupGateway();
    const res = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "sales_send_email",
      rawInput: { to: "lead@example.com", body: "Hello" },
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(getEmailCount(), 0);
  });

  await t.test("8. Red-tier action is unconditionally blocked", async () => {
    const { gateway } = setupGateway();
    const res = await gateway.invoke({
      ctx: {
        agentId: "engineering_ai",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "eng_merge_pr",
      rawInput: { pr: 42 },
    });

    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(res.tier, "red");
  });

  await t.test("9. Sensitive keys are redacted from tool execution logs", () => {
    const redacted = redactSensitiveArgs({
      ticketNumber: "BP-1009",
      apiKey: "super-secret-value",
      nested: { password: "123", token: "abc", safeField: "ok" },
    });
    assert.equal(redacted.ticketNumber, "BP-1009");
    assert.equal(redacted.apiKey, "[REDACTED]");
    assert.deepEqual(redacted.nested, {
      password: "[REDACTED]",
      token: "[REDACTED]",
      safeField: "ok",
    });
  });

  await t.test("10. Stage 1A: Legacy /api/ai/chat route is retired (410 Gone)", async () => {
    const { POST, GET } = await import("../src/app/api/ai/chat/route");
    const postRes = await POST();
    const getRes = await GET();
    assert.equal(postRes.status, 410);
    assert.equal(getRes.status, 410);
    const body = await postRes.json();
    assert.equal(body.retired, true);
  });
});
