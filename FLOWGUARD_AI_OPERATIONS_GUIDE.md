# FLOWGUARD AI WORKFORCE — OPERATIONS GUIDE

## 1. Accessing the Private Owner Console
- Sign in to the FlowGuard Admin Portal (`/admin/login`) with your verified owner/admin account.
- Open **AI Workforce** (`/admin/workforce`) from the sidebar (or mobile navigation).
- Customers and plumbers cannot access `/admin/workforce` or `/api/admin/workforce/*` (returns `403 Forbidden`).

## 2. Instructing the Operations Manager
1. Enter an instruction in **Instruct AI Operations Manager**.
2. Leave the selector on **Auto-route via Operations Manager** (or choose a specific specialist).
3. Click **Send Instruction** to create a durable task in `ai_tasks` and run the scoped agent.

## 3. Reviewing & Approving Amber Actions
1. Open the **Approvals** tab in `/admin/workforce`.
2. Inspect the requesting agent, target resource, exact JSON payload, and SHA-256 `payloadHash`.
3. Click **Approve & Execute** to run the action once, or **Reject** to permanently cancel it.

## 4. Monitoring Spend & Audit Trail
- Open **Models & Audit** to verify the `$0.00` global paid spend cap, active free model routes, and recent `ai_audit_logs`.
