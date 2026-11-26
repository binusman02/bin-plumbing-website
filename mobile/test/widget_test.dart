import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:flowguard_plumbing/features/auth/auth_gate.dart";
import "package:flowguard_plumbing/features/shared/receipt_and_quote_sheets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

void main() {
  testWidgets("AuthGate renders config notice when unconfigured", (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: FlowGuardTheme.light(),
        home: const AuthGate(),
      ),
    );
    expect(find.text("Supabase Config Required"), findsOneWidget);
  });

  test("Quote and payment labels stay aligned with PWA/Web statuses", () {
    expect(formatQuoteApprovalLabel("approved"), "Approved");
    expect(formatQuoteApprovalLabel("rejected"), "Declined");
    expect(formatQuoteApprovalLabel("pending"), "Pending");

    expect(isPaymentConfirmedStatus("verified"), true);
    expect(isPaymentConfirmedStatus("confirmed"), true);
    expect(isPaymentConfirmedStatus("pending"), false);

    expect(formatPaymentStatusLabel("verified"), "Paid");
    expect(formatPaymentStatusLabel("confirmed"), "Paid");
    expect(formatPaymentStatusLabel("rejected"), "Declined");
  });

  test("QuotationData parses embedded line items, revision, and strips marker from notes", () {
    final quote = QuotationData.fromJson({
      "id": "q1",
      "ticket_number": "FG-101",
      "labour_charge": 15000,
      "materials_cost": 12000,
      "transport_charge": 2000,
      "other_charges": 0,
      "total_amount": 29000,
      "customer_approval_status": "rejected",
      "revision_number": 2,
      "notes": "Clean installation note\n<!--BP_QUOTE_ITEMS:[{\"name\":\"PPR Pipe\",\"quantity\":3,\"unitPrice\":4000}]-->",
    });
    expect(quote.revisionNumber, 2);
    expect(quote.approvalStatus, "rejected");
    expect(quote.notes, "Clean installation note");
    expect(quote.items.length, 1);
    expect(quote.items.first.name, "PPR Pipe");
    expect(quote.items.first.amount, 12000);
  });
}
