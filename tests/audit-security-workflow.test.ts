import test from "node:test";
import assert from "node:assert/strict";
import {
  signCustomerSessionToken,
  signPlumberSessionToken,
  verifyCustomerSessionToken,
  verifyPlumberSessionToken,
} from "../src/lib/customer-session";
import { validateJobTransition } from "../src/lib/job-lifecycle";
import {
  computeAuthorizedPaymentAmount,
  isValidInternalProofPath,
  shouldMarkJobCompleted,
} from "../src/lib/payment-integrity";
import { validateFileMagicBytes } from "../src/lib/security";

test("session tokens: signs, verifies, and rejects tampered or cross-role tokens", () => {
  process.env.AUTH_SESSION_SECRET = "audit-test-secret-at-least-32-chars!!";
  const custToken = signCustomerSessionToken("cust-123");
  const plumberToken = signPlumberSessionToken("plumb-456");

  assert.deepEqual(verifyCustomerSessionToken(custToken), { customerId: "cust-123" });
  assert.deepEqual(verifyPlumberSessionToken(plumberToken), { accountId: "plumb-456" });

  // Cross-role must fail
  assert.equal(verifyPlumberSessionToken(custToken), null);
  assert.equal(verifyCustomerSessionToken(plumberToken), null);

  // Tampered signature must fail
  const [payload, sig] = custToken.split(".");
  assert.equal(verifyCustomerSessionToken(`${payload}.${sig}x`), null);
});

test("job lifecycle: enforces status transitions, quote approval, trip lock, and idempotency", () => {
  // Terminal statuses cannot be accepted or started
  assert.equal(
    validateJobTransition({
      action: "accept",
      currentStatus: "completed",
      hasApprovedQuotation: true,
      hasAnyQuotation: true,
      tripStarted: false,
    }).allowed,
    false
  );
  assert.equal(
    validateJobTransition({
      action: "start_work",
      currentStatus: "cancelled",
      hasApprovedQuotation: true,
      hasAnyQuotation: true,
      tripStarted: true,
    }).allowed,
    false
  );

  // Cannot start work when quotation exists but is not approved
  const unapprovedWork = validateJobTransition({
    action: "start_work",
    currentStatus: "scheduled",
    hasApprovedQuotation: false,
    hasAnyQuotation: true,
    tripStarted: true,
  });
  assert.equal(unapprovedWork.allowed, false);

  // Cannot complete work before starting it
  assert.equal(
    validateJobTransition({
      action: "complete_work",
      currentStatus: "scheduled",
      hasApprovedQuotation: true,
      hasAnyQuotation: true,
      tripStarted: true,
    }).allowed,
    false
  );

  // Cannot mark arrived before starting trip
  assert.equal(
    validateJobTransition({
      action: "arrived",
      currentStatus: "scheduled",
      hasApprovedQuotation: false,
      hasAnyQuotation: false,
      tripStarted: false,
    }).allowed,
    false
  );

  // Valid complete_work from in_progress succeeds; repeat is idempotent
  assert.equal(
    validateJobTransition({
      action: "complete_work",
      currentStatus: "in_progress",
      hasApprovedQuotation: true,
      hasAnyQuotation: true,
      tripStarted: true,
    }).nextStatus,
    "work_completed"
  );
  assert.equal(
    validateJobTransition({
      action: "complete_work",
      currentStatus: "work_completed",
      hasApprovedQuotation: true,
      hasAnyQuotation: true,
      tripStarted: true,
    }).idempotent,
    true
  );
});

test("payment integrity: server balance calculation, proof path validation, and completion rule", () => {
  assert.equal(isValidInternalProofPath("/api/chat/file/1732-abc-receipt.jpg"), true);
  assert.equal(isValidInternalProofPath("https://evil.example.com/fake.jpg"), false);
  assert.equal(isValidInternalProofPath("/api/chat/file/../../secret"), false);

  const fullPay = computeAuthorizedPaymentAmount({
    approvedQuoteTotal: 38000,
    alreadyPaidTotal: 0,
  });
  assert.equal(fullPay.ok, true);
  if (fullPay.ok) assert.equal(fullPay.amount, 38000);

  const overPay = computeAuthorizedPaymentAmount({
    approvedQuoteTotal: 38000,
    alreadyPaidTotal: 20000,
    requestedAmount: 25000,
  });
  assert.equal(overPay.ok, false);

  assert.equal(shouldMarkJobCompleted({ approvedQuoteTotal: 38000, verifiedPaidTotal: 20000 }), false);
  assert.equal(shouldMarkJobCompleted({ approvedQuoteTotal: 38000, verifiedPaidTotal: 38000 }), true);
});

test("upload security: validates real magic bytes and rejects spoofed payloads", () => {
  const validJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
  const validPdf = Buffer.from("%PDF-1.7\n");
  const spoofedHtmlAsJpg = Buffer.from("<script>alert(1)</script>");

  assert.equal(validateFileMagicBytes(validJpg, ".jpg").valid, true);
  assert.equal(validateFileMagicBytes(validPng, ".png").valid, true);
  assert.equal(validateFileMagicBytes(validPdf, ".pdf").valid, true);
  assert.equal(validateFileMagicBytes(spoofedHtmlAsJpg, ".jpg").valid, false);
  assert.equal(validateFileMagicBytes(spoofedHtmlAsJpg, ".pdf").valid, false);
});
