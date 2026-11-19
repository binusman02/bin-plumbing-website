import "package:flutter/material.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/auth/splash_screen.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SupabaseConfig.initialize();
  await GoogleServicesBootstrap.initialize();
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
      home: const SplashScreen(),
    );
  }
}
