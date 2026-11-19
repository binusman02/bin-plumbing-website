import "package:flutter_test/flutter_test.dart";
import "package:flowguard_plumbing/main.dart";

void main() {
  testWidgets("FlowGuardApp renders auth gate cleanly", (WidgetTester tester) async {
    await tester.pumpWidget(const FlowGuardApp());
    expect(find.text("Supabase Config Required"), findsOneWidget);
  });
}
