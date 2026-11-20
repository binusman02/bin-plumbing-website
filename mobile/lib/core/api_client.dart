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

  static Future<void> submitQuotation({
    required String ticketNumber,
    required double labourCharge,
    required double materialsCost,
    double transportCharge = 0,
    double otherCharges = 0,
    String? notes,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/quotations");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "ticketNumber": ticketNumber,
            "labourCharge": labourCharge,
            "materialsCost": materialsCost,
            "transportCharge": transportCharge,
            "otherCharges": otherCharges,
            if (notes != null && notes.isNotEmpty) "notes": notes,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Quotation failed (${res.statusCode}): ${res.body}");
    }
  }

  static Future<void> decideQuotation({
    required String quotationId,
    required String decision,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/quotations");
    final res = await http
        .patch(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({"quotationId": quotationId, "decision": decision}),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Decision failed (${res.statusCode}): ${res.body}");
    }
  }

  static Future<void> performJobAction({
    required String ticketOrId,
    required String action,
    List<String>? photos,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/jobs/${Uri.encodeComponent(ticketOrId)}/action",
    );
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "action": action,
            if (photos != null && photos.isNotEmpty) "photos": photos,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Job action failed (${res.statusCode}): ${res.body}");
    }
  }

  static Future<void> pushLiveLocation({
    required double lat,
    required double lng,
    double? accuracy,
    double? heading,
    double? speed,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/tracking/location",
    );
    await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "lat": lat,
            "lng": lng,
            if (accuracy != null) "accuracy": accuracy,
            if (heading != null) "heading": heading,
            if (speed != null) "speed": speed,
            "timestamp": DateTime.now().toUtc().toIso8601String(),
          }),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<void> stopLiveLocation() async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/tracking/location",
    );
    await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({"stopSharing": true}),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<void> recordPayment({
    required String ticketNumber,
    double? amount,
    String? proofUrl,
    String? transactionRef,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/payments");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "ticketNumber": ticketNumber,
            if (amount != null) "amount": amount,
            if (proofUrl != null) "proofUrl": proofUrl,
            if (transactionRef != null) "transactionRef": transactionRef,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Payment upload failed (${res.statusCode})");
    }
  }

  static Future<void> submitReview({
    required String ticketNumber,
    required int rating,
    required String comment,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/reviews");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "ticketNumber": ticketNumber,
            "rating": rating,
            "comment": comment,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Review failed (${res.statusCode})");
    }
  }

  static Future<Map<String, dynamic>?> fetchProfile({
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/profile?role=$role",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return null;
  }

  static Future<void> updateProfile(Map<String, dynamic> body) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/profile");
    final res = await http
        .patch(uri, headers: _authHeaders(), body: jsonEncode(body))
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Profile update failed (${res.statusCode})");
    }
  }

  static Future<String?> uploadAvatar({
    required List<int> bytes,
    required String filename,
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/profile/avatar?role=$role",
    );
    final req = http.MultipartRequest("POST", uri);
    final token = SupabaseConfig.client.auth.currentSession?.accessToken;
    if (token != null) {
      req.headers["Authorization"] = "Bearer $token";
    }
    req.fields["role"] = role;
    req.files.add(
      http.MultipartFile.fromBytes("file", bytes, filename: filename),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded["avatarUrl"]?.toString();
    }
    throw Exception("Avatar upload failed (${streamed.statusCode})");
  }

  static Future<String?> uploadRequestPhoto({
    required List<int> bytes,
    required String filename,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/request-photo");
    final req = http.MultipartRequest("POST", uri);
    req.files.add(
      http.MultipartFile.fromBytes("file", bytes, filename: filename),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded["url"]?.toString() ?? decoded["path"]?.toString();
    }
    return null;
  }

  static Future<Map<String, dynamic>?> fetchChatMessagesWithPresence({
    required String ticketNumber,
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/chat/presence?ticket=${Uri.encodeComponent(ticketNumber)}&role=$role",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return null;
  }

  static Future<void> sendChatMessage({
    required String ticketNumber,
    required String message,
    required String actorRole,
    Map<String, dynamic>? attachment,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/chat/message");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "ticketNumber": ticketNumber,
            "message": message,
            "actorRole": actorRole,
            if (attachment != null) "attachment": attachment,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception("Send message failed (${res.statusCode})");
    }
  }

  static Future<void> markChatRead({
    required String ticketNumber,
    required String role,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/chat/read");
    await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({"ticketNumber": ticketNumber, "viewerRole": role}),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<Map<String, dynamic>?> uploadChatAttachment({
    required List<int> bytes,
    required String filename,
    required String ticketNumber,
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/chat/upload?role=$role",
    );
    final req = http.MultipartRequest("POST", uri);
    final token = SupabaseConfig.client.auth.currentSession?.accessToken;
    if (token != null) {
      req.headers["Authorization"] = "Bearer $token";
    }
    req.fields["ticketNumber"] = ticketNumber;
    req.fields["role"] = role;
    req.files.add(
      http.MultipartFile.fromBytes("file", bytes, filename: filename),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded["attachment"] as Map<String, dynamic>?;
    }
    return null;
  }
}
