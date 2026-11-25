import assert from "node:assert/strict";
import test from "node:test";
import { ApprovalService, InMemoryApprovalStore } from "../src/lib/ai-workforce/approvals";
import { registerAdminWorkforceTools } from "../src/lib/ai-workforce/admin-tools";
import {
  MAX_MEETING_FOLLOW_UPS,
  parseWrapUpOutput,
  runTeamMeetingTurn,
} from "../src/lib/ai-workforce/meeting";
import { InMemoryTaskStore, WorkforceOrchestrator } from "../src/lib/ai-workforce/orchestrator";
import { reportToOwner } from "../src/lib/ai-workforce/owner-report";
import {
  InMemoryTeamBoardAndMemoryStore,
  TEAM_MEMORY_NAMESPACE,
  recordTeamNote,
  sanitizeMemoryFact,
  saveTaskMemories,
} from "../src/lib/ai-workforce/team-memory";
import { InMemoryToolExecutionLogger, ToolGateway } from "../src/lib/ai-workforce/tool-gateway";

test("AI Workforce Teamwork, Memory, Handoffs, Owner Reports & Meetings", async (t) => {
  await t.test("Step 1: Handoff tools set parentTaskId and block self-handoff, loops, and depth > 2", async () => {
    const gateway = new ToolGateway(
      new ApprovalService(new InMemoryApprovalStore()),
      new InMemoryToolExecutionLogger()
    );
    const seen: Array<{ parentTaskId: string | null; depth: number; chain: string[] }> = [];
    registerAdminWorkforceTools(gateway, {
      handoffRunner: async (p) => {
        seen.push({
          parentTaskId: p.parentTaskId,
          depth: p.handoffDepth,
          chain: p.handoffChain,
        });
        return {
          id: "child-task-1",
          parentTaskId: p.parentTaskId,
          assignedAgentId: p.targetAgentId,
          status: "completed",
          outputSummary: "Amina drafted the Nassarawa follow-up.",
          errorMessage: null,
        };
      },
    });

    // Sadiq -> Amina succeeds with parentTaskId & depth 1
    const ok = await gateway.invoke({
      ctx: {
        agentId: "operations_manager",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
        taskId: "parent-task-1",
        handoffDepth: 0,
        handoffChain: [],
      },
      toolName: "workforce_request_specialist_run",
      rawInput: {
        targetAgentId: "sales_ai",
        title: "Qualify Nassarawa lead",
        instruction: "Check enquiries and draft follow-up.",
      },
    });
    assert.equal(ok.ok, true);
    assert.equal(seen[0].parentTaskId, "parent-task-1");
    assert.equal(seen[0].depth, 1);

    // Non-Sadiq cannot call workforce_request_specialist_run
    const nonSadiq = await gateway.invoke({
      ctx: {
        agentId: "sales_ai",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
      },
      toolName: "workforce_request_specialist_run",
      rawInput: {
        targetAgentId: "research_ai",
        title: "Check competitor",
        instruction: "Search competitors.",
      },
    });
    assert.equal(nonSadiq.ok, false);
    assert.equal(nonSadiq.status, "blocked");

    // Self-handoff blocked
    const selfHandoff = await gateway.invoke({
      ctx: {
        agentId: "sales_ai",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
        taskId: "t-self",
      },
      toolName: "workforce_create_task",
      rawInput: {
        targetAgentId: "sales_ai",
        title: "Self task",
        instruction: "Loop back",
      },
    });
    assert.equal(selfHandoff.ok, false);

    // Loop blocked
    const loop = await gateway.invoke({
      ctx: {
        agentId: "research_ai",
        actorUserId: "owner-1",
        actorEmail: "owner@flowguard.com.ng",
        handoffDepth: 1,
        handoffChain: ["operations_manager", "sales_ai"],
      },
      toolName: "workforce_create_task",
      rawInput: {
        targetAgentId: "sales_ai",
        title: "Back to Amina",
        instruction: "Loop",
      },
    });
    assert.equal(loop.ok, false);

    // Depth >= 2 blocked
    const tooDeep = await gateway.invoke({
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
        title: "Depth 3",
        instruction: "Should fail",
      },
    });
    assert.equal(tooDeep.ok, false);
  });

  await t.test("Steps 2 & 3: Shared team notes + agent memory (max 3 facts, secret redaction)", async () => {
    const store = new InMemoryTeamBoardAndMemoryStore();
    await recordTeamNote({ fromAgent: "customer_support_ai", toAgent: "operations_manager", note: "Urgent leak in Nassarawa" }, store);
    await recordTeamNote({ fromAgent: "research_ai", toAgent: null, note: "Kano demand up 20%" }, store);
    await recordTeamNote({ fromAgent: "sales_ai", toAgent: "engineering_ai", note: "Private note for Bashir" }, store);

    const sadiqNotes = await store.listNotesForAgent("operations_manager", 10);
    assert.equal(sadiqNotes.length, 2); // Zainab->Sadiq + Research->All

    // Secrets are rejected by sanitizeMemoryFact
    assert.equal(sanitizeMemoryFact("Use key sk_live_1234567890abcdef"), null);
    assert.equal(sanitizeMemoryFact("password=supersecretvalue"), null);

    await saveTaskMemories(
      {
        agentId: "sales_ai",
        namespace: "ns_sales_ai",
        taskId: "task-mem-1",
        outputText:
          "Cleared 3 duplicate leads in Nassarawa. Drafted 2 follow-up emails for approval. Priority area is Tarauni. Fourth sentence should be ignored.",
        shareWithTeam: true,
      },
      store
    );
    const salesMemories = await store.loadMemories("sales_ai", "ns_sales_ai", 10);
    const ownCount = salesMemories.filter((m) => m.namespace === "ns_sales_ai").length;
    const sharedCount = salesMemories.filter((m) => m.namespace === TEAM_MEMORY_NAMESPACE).length;
    assert.equal(ownCount, 3);
    assert.equal(sharedCount, 1);
  });

  await t.test("Step 4: reportToOwner skips no-change & child handoffs, flags urgent alerts, and orchestrator calls it", async () => {
    const sent: Array<{ type: string; title: string; body?: string }> = [];
    const mockNotify = async (input: { type: string; title: string; body?: string }) => {
      sent.push({ type: input.type, title: input.title, body: input.body });
      return null;
    };

    // Routine no-change skipped
    const r1 = await reportToOwner(
      { agentId: "sales_ai", status: "completed", summary: "Checked enquiries, nothing new today." },
      mockNotify as never
    );
    assert.equal(r1.sent, false);

    // Intermediate handoff child skipped
    const r2 = await reportToOwner(
      { agentId: "research_ai", status: "completed", summary: "Found 3 competitors.", isHandoffChild: true },
      mockNotify as never
    );
    assert.equal(r2.sent, false);

    // Urgent alert sends stronger alert
    const r3 = await reportToOwner(
      {
        agentId: "customer_support_ai",
        status: "urgent",
        urgent: true,
        summary: "Burst pipe flooding kitchen in Nassarawa (BP-261125-1111).",
      },
      mockNotify as never
    );
    assert.equal(r3.sent, true);
    assert.equal(sent[0].type, "ai_urgent_alert");
    assert.match(sent[0].title, /^\[URGENT\] Zainab:/);

    // Orchestrator integrates notes, memory, and reportToOwner
    const taskStore = new InMemoryTaskStore();
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const orch = new WorkforceOrchestrator(taskStore, teamStore, mockNotify as never);
    let capturedPrompt = "";
    await recordTeamNote({ fromAgent: "research_ai", toAgent: null, note: "SEO traffic rose in Bompai." }, teamStore);

    const task = await orch.dispatchInstruction({
      requesterId: "owner-1",
      title: "Draft Bompai follow-ups",
      instruction: "Check leads in Bompai and summarize.",
      targetAgentId: "sales_ai",
      modelRunner: async (req) => {
        capturedPrompt = req.systemPrompt;
        return {
          ok: true,
          text: "Cleared 2 duplicate leads in Bompai and prepared 1 follow-up draft.",
          provider: "openai_compatible",
          modelId: "xiaomi/mimo-v2.6-flash",
          inputTokens: 100,
          outputTokens: 25,
        };
      },
    });
    assert.equal(task.status, "completed");
    assert.match(capturedPrompt, /SEO traffic rose in Bompai/);
    assert.equal(sent.length, 2);
    assert.equal(sent[1].type, "ai_workforce_report");
  });

  await t.test("Step 5: Meeting allows up to 2 follow-ups from raised hands and wrap-up queues child tasks", async () => {
    const teamStore = new InMemoryTeamBoardAndMemoryStore();
    const reports: Array<{ title: string }> = [];
    let callCount = 0;

    const turnRes = await runTeamMeetingTurn({
      founderMessage: "Sadiq, how are leads looking?",
      participants: ["operations_manager", "sales_ai", "research_ai", "engineering_ai"],
      history: [],
      teamStore,
      modelRunner: async () => {
        callCount += 1;
        if (callCount === 1) {
          return {
            ok: true,
            text: JSON.stringify({
              reply: "Morning Boss, Amina cleared the duplicates and Faruk has SEO notes.",
              raisedHands: [
                { agentId: "sales_ai", kind: "suggestion", topic: "Take the Nassarawa lead" },
                { agentId: "research_ai", kind: "question", topic: "Check Tarauni keywords" },
                { agentId: "engineering_ai", kind: "suggestion", topic: "Should be capped at 2" },
              ],
            }),
          };
        }
        return { ok: true, text: "Sadiq, I can take that lead right away." };
      },
    });

    assert.equal(turnRes.followUpTurns.length, MAX_MEETING_FOLLOW_UPS);
    assert.equal(turnRes.followUpTurns[0].speakerId, "sales_ai");
    assert.equal(turnRes.followUpTurns[1].speakerId, "research_ai");

    // Wrap-up parses action items, creates queued tasks, and reports to Owner
    const parsedWrap = parseWrapUpOutput(
      JSON.stringify({
        summary: "Agreed on Nassarawa follow-up and Tarauni SEO check.",
        actionItems: [
          {
            ownerAgentId: "sales_ai",
            title: "Draft Nassarawa follow-up",
            instruction: "Prepare email draft for Nassarawa enquiry.",
          },
          {
            ownerAgentId: "research_ai",
            title: "Tarauni SEO check",
            instruction: "Research Tarauni plumbing keywords.",
          },
        ],
      })
    );
    assert.equal(parsedWrap.actionItems.length, 2);

    const createdItems: Array<{ owner: string; title: string }> = [];
    const wrapRes = await runTeamMeetingTurn({
      founderMessage: "Wrap up",
      participants: ["operations_manager", "sales_ai", "research_ai"],
      history: [],
      wrapUp: true,
      teamStore,
      notifyFn: (async (n: { title: string }) => {
        reports.push({ title: n.title });
        return null;
      }) as never,
      modelRunner: async () => ({
        ok: true,
        text: JSON.stringify({
          summary: "Wrapped up: Amina on Nassarawa leads, Faruk on Tarauni SEO.",
          actionItems: parsedWrap.actionItems,
        }),
      }),
      persistWrapUpTasks: async ({ actionItems }) => {
        for (const item of actionItems) {
          createdItems.push({ owner: item.ownerAgentId, title: item.title });
        }
        return 1 + actionItems.length;
      },
    });

    assert.equal(wrapRes.wrappedUpTasksCreated, 3);
    assert.equal(createdItems.length, 2);
    assert.equal(reports.length, 1);
  });
});
