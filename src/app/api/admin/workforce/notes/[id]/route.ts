import { NextResponse } from "next/server";
import { reconcileStaleWorkforceState } from "@/lib/ai-workforce/workforce-sync";
import { requireAdminUser } from "@/lib/security";
import { getServiceSupabase } from "@/lib/supabase/admin";

function extractTicketFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/\bBP-\d{6}-\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function extractApprovalIdFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/Approval ID:\s*([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdminUser();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Note ID is required." }, { status: 400 });
  }

  await reconcileStaleWorkforceState().catch(() => {});

  const supabase = getServiceSupabase();
  const { data: noteRow, error: noteErr } = await supabase
    .from("ai_team_notes")
    .select("id, from_agent, to_agent, task_id, ticket_number, note, created_at")
    .eq("id", id)
    .maybeSingle();

  if (noteErr || !noteRow) {
    return NextResponse.json({ error: "Team note not found." }, { status: 404 });
  }

  const ticketNumber =
    (noteRow.ticket_number ? String(noteRow.ticket_number).trim().toUpperCase() : null) ||
    extractTicketFromText(String(noteRow.note || ""));

  let taskRow: Record<string, unknown> | null = null;
  if (noteRow.task_id) {
    const { data } = await supabase
      .from("ai_tasks")
      .select("*")
      .eq("id", String(noteRow.task_id))
      .maybeSingle();
    taskRow = (data as Record<string, unknown> | null) ?? null;
  } else if (ticketNumber) {
    const { data: matchingTasks } = await supabase
      .from("ai_tasks")
      .select("*")
      .ilike("title", `%${ticketNumber}%`)
      .order("created_at", { ascending: false })
      .limit(5);
    const list = (matchingTasks || []) as Array<Record<string, unknown>>;
    taskRow =
      list.find((t) => String(t.assigned_agent_id || "") === String(noteRow.from_agent || "")) ??
      list[0] ??
      null;
  }

  const resolvedTaskId = taskRow?.id ? String(taskRow.id) : noteRow.task_id ? String(noteRow.task_id) : null;
  const embeddedApprovalId = extractApprovalIdFromText(
    taskRow ? String(taskRow.output_summary || taskRow.deliverable || "") : null
  );

  // Gather related tasks (if ticket_number spans multiple agents e.g. Amina + Zainab + Sadiq)
  const relatedTaskIds = new Set<string>();
  if (resolvedTaskId) relatedTaskIds.add(resolvedTaskId);

  let ticketTasks: Array<Record<string, unknown>> = [];
  if (ticketNumber) {
    const { data } = await supabase
      .from("ai_tasks")
      .select("*")
      .ilike("title", `%${ticketNumber}%`)
      .order("created_at", { ascending: true })
      .limit(20);
    ticketTasks = (data || []) as Array<Record<string, unknown>>;
    for (const t of ticketTasks) {
      if (t.id) relatedTaskIds.add(String(t.id));
    }
  }

  const taskIdList = Array.from(relatedTaskIds);

  // Approvals linked by task_id, embeddedApprovalId, or ticketNumber
  const approvalQueries: Promise<Array<Record<string, unknown>>>[] = [];
  if (taskIdList.length > 0) {
    approvalQueries.push(
      Promise.resolve(
        supabase
          .from("ai_approvals")
          .select("*")
          .in("task_id", taskIdList)
          .order("created_at", { ascending: false })
          .limit(20)
      ).then((r) => (r.data || []) as Array<Record<string, unknown>>)
    );
  }
  if (embeddedApprovalId) {
    approvalQueries.push(
      Promise.resolve(
        supabase.from("ai_approvals").select("*").eq("id", embeddedApprovalId).limit(1)
      ).then((r) => (r.data || []) as Array<Record<string, unknown>>)
    );
  }
  if (ticketNumber) {
    approvalQueries.push(
      Promise.resolve(
        supabase
          .from("ai_approvals")
          .select("*")
          .eq("target_resource", ticketNumber)
          .order("created_at", { ascending: false })
          .limit(20)
      ).then((r) => (r.data || []) as Array<Record<string, unknown>>)
    );
  }

  const approvalResults = await Promise.all(approvalQueries);
  const approvalMap = new Map<string, Record<string, unknown>>();
  for (const group of approvalResults) {
    for (const row of group) {
      if (row.id) approvalMap.set(String(row.id), row);
    }
  }
  const approvals = Array.from(approvalMap.values())
    .sort((a, b) => {
      const aPend = a.status === "pending" ? 0 : 1;
      const bPend = b.status === "pending" ? 0 : 1;
      if (aPend !== bPend) return aPend - bPend;
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })
    .map((row) => ({
      id: String(row.id),
      taskId: row.task_id ? String(row.task_id) : null,
      requestedByAgent: String(row.requested_by_agent),
      toolName: String(row.tool_name),
      targetResource: String(row.target_resource),
      actionSummary: String(row.action_summary),
      payload: (row.payload as Record<string, unknown>) || {},
      payloadHash: String(row.payload_hash),
      reason: String(row.reason),
      evidence: row.evidence ? String(row.evidence) : null,
      expectedEffect: row.expected_effect ? String(row.expected_effect) : null,
      status: String(row.status),
      approverEmail: row.approver_email ? String(row.approver_email) : null,
      decisionNote: row.decision_note ? String(row.decision_note) : null,
      executionResult: row.execution_result ?? null,
      decidedAt: row.decided_at ? String(row.decided_at) : null,
      executedAt: row.executed_at ? String(row.executed_at) : null,
      expiresAt: String(row.expires_at),
      createdAt: String(row.created_at),
    }));

  const approvalIds = approvals.map((a) => a.id);

  // Fetch events, tool executions, related notes, related reports, and live ticket snapshot in parallel
  const [eventsRes, execByTaskRes, execByApprovalRes, notesRes, reportsRes, ticketRes, quotesRes, paymentsRes] =
    await Promise.all([
      taskIdList.length > 0
        ? supabase
            .from("ai_task_events")
            .select("id, task_id, agent_id, event_type, message, created_at")
            .in("task_id", taskIdList)
            .order("created_at", { ascending: true })
            .limit(40)
        : Promise.resolve({ data: [] }),
      taskIdList.length > 0
        ? supabase
            .from("ai_tool_executions")
            .select("id, task_id, approval_id, agent_id, tool_name, tier, validated_scope, redacted_args, status, result_summary, created_at")
            .in("task_id", taskIdList)
            .order("created_at", { ascending: true })
            .limit(40)
        : Promise.resolve({ data: [] }),
      approvalIds.length > 0
        ? supabase
            .from("ai_tool_executions")
            .select("id, task_id, approval_id, agent_id, tool_name, tier, validated_scope, redacted_args, status, result_summary, created_at")
            .in("approval_id", approvalIds)
            .order("created_at", { ascending: true })
            .limit(40)
        : Promise.resolve({ data: [] }),
      ticketNumber
        ? supabase
            .from("ai_team_notes")
            .select("id, from_agent, to_agent, task_id, ticket_number, note, created_at")
            .eq("ticket_number", ticketNumber)
            .order("created_at", { ascending: true })
            .limit(30)
        : resolvedTaskId
          ? supabase
              .from("ai_team_notes")
              .select("id, from_agent, to_agent, task_id, ticket_number, note, created_at")
              .eq("task_id", resolvedTaskId)
              .order("created_at", { ascending: true })
              .limit(30)
          : Promise.resolve({ data: [noteRow] }),
      taskIdList.length > 0
        ? supabase
            .from("ai_reports")
            .select("id, task_id, agent_id, message, urgency, feedback, feedback_note, delivered_at")
            .in("task_id", taskIdList)
            .order("delivered_at", { ascending: false })
            .limit(20)
        : ticketNumber
          ? supabase
              .from("ai_reports")
              .select("id, task_id, agent_id, message, urgency, feedback, feedback_note, delivered_at")
              .ilike("message", `%${ticketNumber}%`)
              .order("delivered_at", { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),
      ticketNumber
        ? supabase
            .from("service_requests")
            .select("id, ticket_number, customer_name, customer_phone, customer_email, problem_category, problem_type, issue_description, city_lga, address, urgency, status, assigned_plumber_id, assigned_technician, quoted_amount, payment_status, customer_lat, customer_lng, created_at, updated_at")
            .eq("ticket_number", ticketNumber)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ticketNumber
        ? supabase
            .from("quotations")
            .select("id, plumber_name, total_customer_cost, status, created_at")
            .eq("ticket_number", ticketNumber)
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      ticketNumber
        ? supabase
            .from("payments")
            .select("id, amount, status, payment_method, created_at")
            .eq("ticket_number", ticketNumber)
            .order("created_at", { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
    ]);

  // Deduplicate tool executions
  const execMap = new Map<string, Record<string, unknown>>();
  for (const row of [...(execByTaskRes.data || []), ...(execByApprovalRes.data || [])]) {
    const r = row as Record<string, unknown>;
    if (r.id) execMap.set(String(r.id), r);
  }
  const toolExecutions = Array.from(execMap.values()).sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );

  return NextResponse.json({
    note: noteRow,
    ticketNumber,
    task: taskRow
      ? {
          id: String(taskRow.id),
          title: String(taskRow.title || ""),
          description: String(taskRow.description || ""),
          assignedAgentId: String(taskRow.assigned_agent_id || ""),
          priority: String(taskRow.priority || "normal"),
          status: String(taskRow.status || ""),
          deliverable: taskRow.deliverable ? String(taskRow.deliverable) : null,
          outputSummary: taskRow.output_summary ? String(taskRow.output_summary) : null,
          evidence: Array.isArray(taskRow.evidence) ? taskRow.evidence : [],
          lessons: Array.isArray(taskRow.lessons) ? taskRow.lessons : [],
          qaStatus: taskRow.qa_status ? String(taskRow.qa_status) : null,
          qaNotes: taskRow.qa_notes ? String(taskRow.qa_notes) : null,
          errorMessage: taskRow.error_message ? String(taskRow.error_message) : null,
          createdAt: String(taskRow.created_at || ""),
          completedAt: taskRow.completed_at ? String(taskRow.completed_at) : null,
        }
      : null,
    relatedTasks: ticketTasks.map((t) => ({
      id: String(t.id),
      title: String(t.title || ""),
      assignedAgentId: String(t.assigned_agent_id || ""),
      status: String(t.status || ""),
      priority: String(t.priority || "normal"),
      outputSummary: t.output_summary ? String(t.output_summary) : null,
      createdAt: String(t.created_at || ""),
    })),
    taskEvents: eventsRes.data || [],
    toolExecutions,
    approvals,
    relatedNotes: notesRes.data || [],
    relatedReports: reportsRes.data || [],
    ticket: ticketRes.data || null,
    quotations: quotesRes.data || [],
    payments: paymentsRes.data || [],
  });
}
