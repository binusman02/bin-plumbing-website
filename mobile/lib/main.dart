import "package:flutter/material.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/auth/auth_gate.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseConfig.initialize();
  runApp(const FlowGuardApp());
}

class FlowGuardApp extends StatelessWidget {
  const FlowGuardApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: "FlowGuard Plumbing",
      debugShowCheckedModeBanner: false,
      theme: FlowGuardTheme.light(),
      home: const AuthGate(),
    );
  }
}
