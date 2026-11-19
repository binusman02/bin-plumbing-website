import "dart:convert";
import "package:http/http.dart" as http;
import "package:flowguard_plumbing/core/supabase_config.dart";

class FlowGuardApiClient {
  static String? get _accessToken =>
      SupabaseConfig.client.auth.currentSession?.accessToken;

  static Map<String, String> _authHeaders() {
    final token = _accessToken;
    return {
      "Content-Type": "application/json",
      if (token != null && token.isNotEmpty) "Authorization": "Bearer $token",
    };
  }

  static Future<String> resolveLoginIdentifier({
    required String identifier,
    required String expectedRole,
  }) async {
    final clean = identifier.trim();
    if (clean.contains("@")) return clean.toLowerCase();

    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/auth/resolve-identifier",
    );
    final res = await http
        .post(
          uri,
          headers: const {"Content-Type": "application/json"},
          body: jsonEncode({
            "identifier": clean,
            "expectedRole": expectedRole,
          }),
        )
        .timeout(const Duration(seconds: 12));

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 200 && res.statusCode < 300 && data["email"] != null) {
      return data["email"].toString();
    }
    throw Exception(data["error"]?.toString() ?? "Invalid sign-in details.");
  }

  static Future<void> registerDeviceToken({
    required String fcmToken,
    required String appFlavor,
  }) async {
    if (fcmToken.isEmpty || _accessToken == null) return;
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/device-token",
    );
    await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "fcmToken": fcmToken,
            "appFlavor": appFlavor,
            "platform": "android",
          }),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<void> deactivateDeviceToken(String fcmToken) async {
    if (fcmToken.isEmpty || _accessToken == null) return;
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/device-token",
    );
    await http
        .delete(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({"fcmToken": fcmToken}),
        )
        .timeout(const Duration(seconds: 8));
  }

  static Future<Map<String, dynamic>> fetchNotifications({
    required String role,
    int limit = 30,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/notifications?role=$role&limit=$limit",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return {"notifications": [], "unreadCount": 0};
  }

  static Future<void> markNotificationRead({
    required String role,
    String? notificationId,
    bool markAll = false,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/notifications");
    await http
        .patch(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "role": role,
            "action": markAll ? "mark_all_read" : "mark_read",
            if (notificationId != null) "id": notificationId,
          }),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<Map<String, dynamic>?> fetchTrackingSnapshot({
    required String viewerRole,
    String? ticket,
  }) async {
    final query = [
      "as=$viewerRole",
      if (ticket != null && ticket.isNotEmpty)
        "ticket=${Uri.encodeComponent(ticket)}",
    ].join("&");
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/tracking/snapshot?$query",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return null;
  }
}
