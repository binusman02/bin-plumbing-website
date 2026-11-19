import "package:flutter/material.dart";
import "package:flutter_test/flutter_test.dart";
import "package:flowguard_plumbing/features/auth/auth_gate.dart";
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
}
