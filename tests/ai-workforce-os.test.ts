import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalService, InMemoryApprovalStore } from "../src/lib/ai-workforce/approvals";
import { registerAdminWorkforceTools } from "../src/lib/ai-workforce/admin-tools";
import {
  createStructuredHandoff,
  InMemoryHandoffStore,
  markOverdueHandoffs,
  respondToHandoff,
} from "../src/lib/ai-workforce/handoffs";
import { parseWrapUpOutput } from "../src/lib/ai-workforce/meeting";
import {
  DEFAULT_MODEL_ROUTES,
  GLOBAL_PAID_SPEND_CAP_USD,
} from "../src/lib/ai-workforce/model-adapter";
import {
  InMemoryTaskStore,
  WorkforceOrchestrator,
} from "../src/lib/ai-workforce/orchestrator";
import { InMemoryReportStore } from "../src/lib/ai-workforce/owner-report";
import {
  runBriefingRoutine,
  runOverdueChaseRoutine,
} from "../src/lib/ai-workforce/routines";
import { computeAgentScorecards } from "../src/lib/ai-workforce/scorecard";
import {
  runRoleSopChecklist,
  validateScopeForAgent,
  verifyToolClaimsInText,
} from "../src/lib/ai-workforce/sops";
import {
  InMemoryTeamBoardAndMemoryStore,
  playbookNamespace,
  savePlaybookRule,
} from "../src/lib/ai-workforce/team-memory";
import {
  InMemoryToolExecutionLogger,
  ToolGateway,
} from "../src/lib/ai-workforce/tool-gateway";
import {
  computeDueAtFromPriority,
  IllegalTaskTransitionError,
  transitionTask,
} from "../src/lib/ai-workforce/work-orders";

function noopNotify() {
  return async () => ({ id: "notif-1" });
}

test("FlowGuard AI Workforce Company Operating System rules", async (t) => {
  await t.test(
    "1. Illegal status jumps are rejected, throw IllegalTaskTransitionError, and log rejection",
    async () => {
      const store = new InMemoryTaskStore();
      const nowIso = new Date().toISOString();
      await store.createTask({
        id: "wo-illegal-1",
        title: "Verify Nassarawa job",
        description: "Check job card",
        requesterId: "owner-1",
        assignedAgentId: "customer_support_ai",
        ownerAgent: "customer_support_ai",
        createdBy: "owner-1",
        priority: "normal",
        status: "queued",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await assert.rejects(
        () =>
          transitionTask({
            store,
            taskId: "wo-illegal-1",
            toStatus: "closed",
          }),
        IllegalTaskTransitionError
      );

      assert.equal(store.rejectionLogs.length, 1);
      assert.equal(store.rejectionLogs[0].fromStatus, "queued");
      assert.equal(store.rejectionLogs[0].toStatus, "closed");
      const unchanged = await store.findTask("wo-illegal-1");
      assert.equal(unchanged?.status, "queued");
    }
  );

  await t.test(
    "2. Cannot submit without deliverable and cannot close without reported + lessons; SLA computed from priority",
    async () => {
      const base = new Date("2026-11-25T10:00:00.000Z");
      assert.equal(computeDueAtFromPriority("urgent", base), "2026-11-25T10:15:00.000Z");
      assert.equal(computeDueAtFromPriority("high", base), "2026-11-25T12:00:00.000Z");
      assert.equal(computeDueAtFromPriority("normal", base), "2026-11-26T10:00:00.000Z");
      assert.equal(computeDueAtFromPriority("low", base), "2026-11-28T10:00:00.000Z");

      const store = new InMemoryTaskStore();
      const nowIso = base.toISOString();
      await store.createTask({
        id: "wo-guards-1",
        title: "Check pipe issue",
        description: "Review report",
        requesterId: "owner-1",
        assignedAgentId: "customer_support_ai",
        priority: "urgent",
        status: "in_progress",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await assert.rejects(
        () =>
          transitionTask({
            store,
            taskId: "wo-guards-1",
            toStatus: "submitted",
            deliverable: "   ",
          }),
        /without a deliverable/
      );

      await transitionTask({
        store,
        taskId: "wo-guards-1",
        toStatus: "submitted",
        deliverable: "Verified ticket notes and recommended plumber dispatch.",
      });
      await transitionTask({ store, taskId: "wo-guards-1", toStatus: "qa_review" });
      await transitionTask({ store, taskId: "wo-guards-1", toStatus: "approved_by_ops" });

      // Cannot jump directly to closed or close without lessons
      await assert.rejects(
        () =>
          transitionTask({
            store,
            taskId: "wo-guards-1",
            toStatus: "closed",
          }),
        IllegalTaskTransitionError
      );

      await transitionTask({
        store,
        taskId: "wo-guards-1",
        toStatus: "reported",
        reportId: "rep-1",
      });

      await assert.rejects(
        () =>
          transitionTask({
            store,
            taskId: "wo-guards-1",
            toStatus: "closed",
            lessons: [],
          }),
        /without saved lessons/
      );

      const { task: closed } = await transitionTask({
        store,
        taskId: "wo-guards-1",
        toStatus: "closed",
        lessons: ["Urgent dispatch checked within 15-min SLA."],
      });
      assert.equal(closed.status, "closed");
      assert.ok(closed.completedAt);
    }
  );

  await t.test(
    "3. Out-of-scope agent assignment is rejected by code and re-routed through Sadiq",
    async () => {
      const scope = validateScopeForAgent({
        targetAgentId: "sales_ai",
        title: "Fix TypeScript migration bug",
        instruction: "Fix the Next.js API route bug and run npm test.",
      });
      assert.equal(scope.inScope, false);
      assert.equal(scope.recommendedAgent, "engineering_ai");

      const taskStore = new InMemoryTaskStore();
      const teamStore = new InMemoryTeamBoardAndMemoryStore();
      const reportStore = new InMemoryReportStore();
      const orch = new WorkforceOrchestrator(
        taskStore,
        teamStore,
        noopNotify() as never,
        reportStore
      );

      const task = await orch.dispatchInstruction({
        requesterId: "owner-1",
        title: "Fix TypeScript migration bug",
        instruction: "Fix the Next.js API route bug and run npm test.",
        targetAgentId: "sales_ai",
        modelRunner: async () => ({
          ok: true,
          text: "Diagnosed the TypeScript route handler and verified npm test (86/86 passed).",
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 80,
          outputTokens: 30,
        }),
      });

      assert.equal(task.assignedAgentId, "engineering_ai");
      assert.equal(task.ownerAgent, "engineering_ai");
      assert.ok(
        taskStore.events.some(
          (e) => e.taskId === task.id && e.message.includes("Out-of-scope")
        )
      );
    }
  );

  await t.test(
    "4. Structured handoffs require accept/decline with reason, auto-mark overdue, and enforce chain limits",
    async () => {
      const hStore = new InMemoryHandoffStore();
      await assert.rejects(
        () =>
          createStructuredHandoff(
            {
              from: "sales_ai",
              to: "sales_ai",
              taskId: "t-1",
              context: "ctx",
              ask: "ask",
            },
            hStore
          ),
        /Self-handoff/
      );

      const pastDue = "2026-11-24T09:00:00.000Z";
      const h1 = await createStructuredHandoff(
        {
          from: "operations_manager",
          to: "sales_ai",
          taskId: "t-2",
          context: "Lead in Tarauni",
          ask: "Draft intro email",
          dueAt: "2026-11-26T12:00:00.000Z",
        },
        hStore
      );

      await assert.rejects(
        () =>
          respondToHandoff(
            {
              handoffId: h1.id,
              receiverAgent: "sales_ai",
              decision: "decline",
              reason: "  ",
            },
            hStore
          ),
        /requires a reason/
      );

      const accepted = await respondToHandoff(
        {
          handoffId: h1.id,
          receiverAgent: "sales_ai",
          decision: "accept",
        },
        hStore
      );
      assert.equal(accepted?.status, "accepted");

      const hOverdue = await createStructuredHandoff(
        {
          from: "sales_ai",
          to: "research_ai",
          taskId: "t-3",
          context: "Commercial lead",
          ask: "Check Kano industrial market",
          dueAt: pastDue,
        },
        hStore
      );
      const marked = await markOverdueHandoffs(hStore, new Date("2026-11-25T10:00:00.000Z"));
      assert.equal(marked.length, 1);
      assert.equal(marked[0].id, hOverdue.id);
      assert.equal((await hStore.findHandoff(hOverdue.id))?.status, "overdue");

      // Gateway limits: max 2 handoff levels & no loops
      const gateway = new ToolGateway(
        new ApprovalService(new InMemoryApprovalStore()),
        new InMemoryToolExecutionLogger()
      );
      registerAdminWorkforceTools(gateway, {
        handoffRunner: async (p) => ({
          id: "child-ok",
          parentTaskId: p.parentTaskId,
          assignedAgentId: p.targetAgentId,
          status: "closed",
          outputSummary: "Done",
          errorMessage: null,
        }),
      });
      const deepRes = await gateway.invoke({
        ctx: {
          agentId: "research_ai",
          actorUserId: "owner-1",
          actorEmail: "owner@flowguard.com.ng",
          handoffDepth: 2,
          handoffChain: ["operations_manager", "sales_ai"],
        },
        toolName: "workforce_create_task",
        rawInput: {
          targetAgentId: "engineering_ai",
          title: "Too deep",
          instruction: "Should fail",
        },
      });
      assert.equal(deepRes.ok, false);
      assert.equal(deepRes.status, "failed");
      assert.match(deepRes.error || "", /Maximum handoff depth/);
    }
  );

  await t.test(
    "5. Overdue tasks trigger chase first, then escalate to Owner on second sweep",
    async () => {
      const taskStore = new InMemoryTaskStore();
      const handoffStore = new InMemoryHandoffStore();
      const teamStore = new InMemoryTeamBoardAndMemoryStore();
      const reportStore = new InMemoryReportStore();
      const sentNotifs: Array<{ title: string; type: string }> = [];

      await taskStore.createTask({
        id: "wo-overdue-1",
        title: "Follow up Bompai commercial inquiry",
        description: "Prepare follow-up",
        requesterId: "owner-1",
        assignedAgentId: "sales_ai",
        ownerAgent: "sales_ai",
        priority: "urgent",
        status: "in_progress",
        dueAt: "2026-11-25T08:00:00.000Z",
        createdAt: "2026-11-25T07:30:00.000Z",
        updatedAt: "2026-11-25T07:30:00.000Z",
      });

      const now = new Date("2026-11-25T10:00:00.000Z");
      const sweep1 = await runOverdueChaseRoutine({
        taskStore,
        handoffStore,
        teamStore,
        reportStore,
        notifyFn: (async (n: { title: string; type: string }) => {
          sentNotifs.push(n);
          return { id: "n-1" };
        }) as never,
        now,
      });

      assert.equal(sweep1.chasedTasks, 1);
      assert.equal(sweep1.escalatedToOwner, 0);
      assert.equal(sentNotifs.length, 0);
      assert.equal((await taskStore.findTask("wo-overdue-1"))?.chasedCount, 1);

      const sweep2 = await runOverdueChaseRoutine({
        taskStore,
        handoffStore,
        teamStore,
        reportStore,
        notifyFn: (async (n: { title: string; type: string }) => {
          sentNotifs.push(n);
          return { id: "n-2" };
        }) as never,
        now,
      });

      assert.equal(sweep2.chasedTasks, 0);
      assert.equal(sweep2.escalatedToOwner, 1);
      assert.equal(sentNotifs.length, 1);
      assert.equal(sentNotifs[0].type, "ai_urgent_alert");
      const reports = await reportStore.listReports(10);
      assert.equal(reports.length, 1);
    }
  );

  await t.test(
    "6. Claim check rewrites unverified sent/assigned/verified/fixed/paid claims",
    async () => {
      const checked = verifyToolClaimsInText({
        text: "I have sent the email, I have assigned plumber Musa, I have verified payment, I have fixed the route, and I have paid the refund.",
        executedTools: [],
      });
      assert.equal(checked.rewritten, true);
      assert.deepEqual(checked.flaggedClaims, [
        "sent",
        "assigned",
        "verified",
        "fixed/merged",
        "paid",
      ]);
      assert.doesNotMatch(checked.text, /I have sent|I have paid/i);
      assert.match(checked.text, /drafted \/ waiting approval \/ not done/);

      // Verified when tool DID execute
      const backed = verifyToolClaimsInText({
        text: "I have fixed the Next.js validation bug.",
        executedTools: ["eng_run_checks"],
      });
      assert.equal(backed.rewritten, false);
    }
  );

  await t.test(
    "7. Moving to reported requires a stored ai_reports record and saves ai_reports + notification",
    async () => {
      const store = new InMemoryTaskStore();
      const nowIso = new Date().toISOString();
      await store.createTask({
        id: "wo-rep-1",
        title: "Daily SEO brief",
        description: "Research keywords",
        requesterId: "owner-1",
        assignedAgentId: "research_ai",
        priority: "normal",
        status: "approved_by_ops",
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      await assert.rejects(
        () =>
          transitionTask({
            store,
            taskId: "wo-rep-1",
            toStatus: "reported",
          }),
        /without a stored ai_reports record/
      );

      const reportStore = new InMemoryReportStore();
      const taskStore2 = new InMemoryTaskStore();
      const teamStore2 = new InMemoryTeamBoardAndMemoryStore();
      const orch = new WorkforceOrchestrator(
        taskStore2,
        teamStore2,
        noopNotify() as never,
        reportStore
      );
      const finished = await orch.dispatchInstruction({
        requesterId: "owner-1",
        title: "Research Kano estate plumbing keywords",
        instruction: "Find SEO opportunities in Kano.",
        targetAgentId: "research_ai",
        modelRunner: async () => ({
          ok: true,
          text: "Found 3 Kano SEO targets. Source: https://flowguard.com.ng/services retrieved 2026-11-25.",
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 90,
          outputTokens: 35,
        }),
      });
      assert.equal(finished.status, "closed");
      const reports = await reportStore.listReports(10);
      assert.equal(reports.length, 1);
      assert.equal(reports[0].taskId, finished.id);
    }
  );

  await t.test(
    "8. Role SOP checklists enforce domain rules and block after 2 QA reworks",
    async () => {
      assert.equal(
        runRoleSopChecklist({
          agentId: "research_ai",
          deliverable: "Plumbers in Kano are busy.",
          evidence: [],
        }).passed,
        false
      );
      assert.equal(
        runRoleSopChecklist({
          agentId: "sales_ai",
          deliverable: "We promise fixed price ₦15,000 with 20% off today.",
          evidence: [],
        }).passed,
        false
      );
      assert.equal(
        runRoleSopChecklist({
          agentId: "customer_support_ai",
          deliverable: "Checked ticket BP-261125-1001 customer details and status.",
          evidence: [],
          instruction: "Read BP-261125-1001",
        }).passed,
        false
      );
      // Readiness summary mentioning triage & ownership rules must NOT false-trigger
      assert.equal(
        runRoleSopChecklist({
          agentId: "customer_support_ai",
          deliverable:
            "Customer support readiness confirmed: I verify customer_id ownership before reading private ticket details and escalate flooding or safety risks.",
          evidence: [],
          instruction: "Zainab: Customer Support & Triage Status",
        }).passed,
        true
      );
      assert.equal(
        runRoleSopChecklist({
          agentId: "engineering_ai",
          deliverable: "Issue fixed and resolved!",
          evidence: [],
        }).passed,
        false
      );

      const taskStore = new InMemoryTaskStore();
      const teamStore = new InMemoryTeamBoardAndMemoryStore();
      const reportStore = new InMemoryReportStore();
      const orch = new WorkforceOrchestrator(
        taskStore,
        teamStore,
        noopNotify() as never,
        reportStore
      );

      // Sales agent keeps promising fixed price -> 2 reworks -> blocked + Owner alerted
      const blocked = await orch.dispatchInstruction({
        requesterId: "owner-1",
        title: "Draft Tarauni sales quote follow-up",
        instruction: "Draft polite sales follow-up.",
        targetAgentId: "sales_ai",
        modelRunner: async () => ({
          ok: true,
          text: "Our fixed price is ₦25,000 for this job today.",
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 50,
          outputTokens: 20,
        }),
      });

      assert.equal(blocked.status, "blocked");
      assert.equal(blocked.reworkCount, 2);
      assert.equal(blocked.qaStatus, "rework");
      const reports = await reportStore.listReports(10);
      assert.equal(reports.length, 1);
      assert.equal(reports[0].urgency, "urgent");
    }
  );

  await t.test(
    "9. Playbook rules from feedback load into next agent prompt, weekly review saves lessons, and scorecard computes accurately",
    async () => {
      const teamStore = new InMemoryTeamBoardAndMemoryStore();
      const taskStore = new InMemoryTaskStore();
      const reportStore = new InMemoryReportStore();

      await savePlaybookRule(
        {
          agentId: "sales_ai",
          rule: "Always greet Kano estate managers respectfully by title.",
        },
        teamStore
      );

      const loaded = await teamStore.loadMemories("sales_ai", "ns_sales_ai", 10);
      assert.ok(loaded.some((m) => m.namespace === playbookNamespace("sales_ai")));

      const orch = new WorkforceOrchestrator(
        taskStore,
        teamStore,
        noopNotify() as never,
        reportStore
      );

      let promptSeen = "";
      await orch.dispatchInstruction({
        requesterId: "owner-1",
        title: "Draft estate outreach",
        instruction: "Prepare lead outreach.",
        targetAgentId: "sales_ai",
        modelRunner: async (req) => {
          promptSeen = req.systemPrompt;
          return {
            ok: true,
            text: "Prepared outreach draft for Kano estate manager approval.",
            provider: "openai_compatible",
            modelId: "xiaomi/mimo-v2.6-flash",
            inputTokens: 60,
            outputTokens: 20,
          };
        },
      });
      assert.match(promptSeen, /Always greet Kano estate managers respectfully by title/);

      await reportStore.saveReport({
        id: "r-fb-1",
        taskId: null,
        agentId: "sales_ai",
        message: "Outreach ready.",
        urgency: "normal",
        feedback: "up",
        deliveredAt: new Date().toISOString(),
      });

      const weekly = await runBriefingRoutine("weekly_review", {
        taskStore,
        teamStore,
        reportStore,
        notifyFn: noopNotify() as never,
      });
      assert.match(weekly.message, /Weekly Review:/);

      const cards = computeAgentScorecards(
        await taskStore.listTasks(20),
        await reportStore.listReports(20)
      );
      const amina = cards.find((c) => c.agentId === "sales_ai");
      assert.ok(amina);
      assert.equal(amina.tasksDone, 1);
      assert.equal(amina.thumbsUp, 1);
    }
  );

  await t.test(
    "10. Meeting wrap-up outputs structured owner_agent/due_at tasks and $0.00 spend cap remains enforced",
    async () => {
      const wrapRaw = JSON.stringify({
        summary: "Meeting complete. Next steps assigned.",
        actionItems: [
          {
            owner_agent: "sales_ai",
            title: "Follow up Bompai lead",
            instruction: "Draft Bompai follow-up email",
            due_at: "2026-11-26T10:00:00.000Z",
          },
        ],
      });
      const parsed = parseWrapUpOutput(wrapRaw);
      assert.equal(parsed.actionItems.length, 1);
      assert.equal(parsed.actionItems[0].ownerAgentId, "sales_ai");
      assert.equal(parsed.actionItems[0].dueAt, "2026-11-26T10:00:00.000Z");

      assert.equal(GLOBAL_PAID_SPEND_CAP_USD, 0);
      for (const route of Object.values(DEFAULT_MODEL_ROUTES)) {
        assert.equal(route.billingTier, "free");
      }
    }
  );
});
