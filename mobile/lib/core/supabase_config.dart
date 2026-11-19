import "package:supabase_flutter/supabase_flutter.dart";

class SupabaseConfig {
  static const String url = String.fromEnvironment(
    "SUPABASE_URL",
    defaultValue: "",
  );

  static const String anonKey = String.fromEnvironment(
    "SUPABASE_ANON_KEY",
    defaultValue: "",
  );

  static const String webBaseUrl = String.fromEnvironment(
    "WEB_BASE_URL",
    defaultValue: "https://flowguard-ng.vercel.app",
  );

  static bool get isConfigured => url.isNotEmpty && anonKey.isNotEmpty;

  static Future<void> initialize() async {
    if (!isConfigured) return;
    await Supabase.initialize(
      url: url,
      publishableKey: anonKey,
    );
  }

  static SupabaseClient get client => Supabase.instance.client;
}
