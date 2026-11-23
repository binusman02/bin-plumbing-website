export type JobAction =
  | "accept"
  | "start_trip"
  | "arrived"
  | "start_work"
  | "complete_work";

export interface JobTransitionInput {
  action: JobAction;
  currentStatus: string;
  hasApprovedQuotation: boolean;
  hasAnyQuotation: boolean;
  tripStarted: boolean;
}

export interface JobTransitionResult {
  allowed: boolean;
  idempotent?: boolean;
  nextStatus?: "scheduled" | "in_progress" | "work_completed";
  error?: string;
}

const TERMINAL_STATUSES = new Set(["completed", "cancelled"]);

export function validateJobTransition(input: JobTransitionInput): JobTransitionResult {
  const status = String(input.currentStatus || "new").toLowerCase().trim();

  if (TERMINAL_STATUSES.has(status)) {
    return {
      allowed: false,
      error: `Cannot perform '${input.action}' on a ${status} job.`,
    };
  }

  switch (input.action) {
    case "accept": {
      if (status === "scheduled") {
        return { allowed: true, idempotent: true, nextStatus: "scheduled" };
      }
      if (!["new", "qualified", "assigned"].includes(status)) {
        return {
          allowed: false,
          error: `Job cannot be accepted from status '${status}'.`,
        };
      }
      return { allowed: true, nextStatus: "scheduled" };
    }

    case "start_trip": {
      if (input.tripStarted) {
        return { allowed: true, idempotent: true };
      }
      if (!["assigned", "scheduled", "in_progress"].includes(status)) {
        return {
          allowed: false,
          error: `Cannot start trip from status '${status}'.`,
        };
      }
      return { allowed: true };
    }

    case "arrived": {
      if (!input.tripStarted) {
        return {
          allowed: false,
          error: "Trip must be started before marking arrival.",
        };
      }
      return { allowed: true };
    }

    case "start_work": {
      if (status === "in_progress") {
        return { allowed: true, idempotent: true, nextStatus: "in_progress" };
      }
      if (!["assigned", "scheduled"].includes(status)) {
        return {
          allowed: false,
          error: `Work cannot be started from status '${status}'.`,
        };
      }
      if (input.hasAnyQuotation && !input.hasApprovedQuotation) {
        return {
          allowed: false,
          error: "Customer must approve the itemised quotation before starting work.",
        };
      }
      return { allowed: true, nextStatus: "in_progress" };
    }

    case "complete_work": {
      if (status === "work_completed" || status === "awaiting_final_payment") {
        return { allowed: true, idempotent: true, nextStatus: "work_completed" };
      }
      if (status !== "in_progress") {
        return {
          allowed: false,
          error: "Work must be started ('in_progress') before marking complete.",
        };
      }
      return { allowed: true, nextStatus: "work_completed" };
    }
  }
}
