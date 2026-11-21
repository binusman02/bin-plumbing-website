import "dart:convert";
import "package:http/http.dart" as http;
import "package:http_parser/http_parser.dart";
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

  static MediaType _resolveMediaType(String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith(".png")) return MediaType("image", "png");
    if (lower.endsWith(".webp")) return MediaType("image", "webp");
    if (lower.endsWith(".gif")) return MediaType("image", "gif");
    if (lower.endsWith(".pdf")) return MediaType("application", "pdf");
    if (lower.endsWith(".m4a")) return MediaType("audio", "mp4");
    if (lower.endsWith(".aac")) return MediaType("audio", "aac");
    if (lower.endsWith(".mp3")) return MediaType("audio", "mpeg");
    if (lower.endsWith(".wav")) return MediaType("audio", "wav");
    if (lower.endsWith(".ogg")) return MediaType("audio", "ogg");
    return MediaType("image", "jpeg");
  }

  static String authenticatedFileUrl(String rawUrl) {
    if (rawUrl.isEmpty) return "";
    return rawUrl.startsWith("http")
        ? rawUrl
        : "${SupabaseConfig.webBaseUrl}${rawUrl.startsWith("/") ? "" : "/"}$rawUrl";
  }

  static Map<String, String>? fileAuthHeaders(String resolvedUrl) {
    if (resolvedUrl.isEmpty) return null;
    final token = _accessToken;
    if (token == null || token.isEmpty) return null;
    if (resolvedUrl.startsWith(SupabaseConfig.webBaseUrl) ||
        resolvedUrl.startsWith("/")) {
      return {"Authorization": "Bearer $token"};
    }
    return null;
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
    return {"items": [], "unreadCount": 0};
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
            "action": markAll ? "read_all" : "read",
            if (notificationId != null) "notificationId": notificationId,
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

  static Future<List<Map<String, double>>> fetchRoutePoints({
    required String ticket,
    required String viewerRole,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/tracking/route?ticket=${Uri.encodeComponent(ticket)}&as=$viewerRole",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 10));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final raw = data["points"] ?? data["routePoints"] ?? data["coordinates"];
      if (raw is List) {
        final pts = <Map<String, double>>[];
        for (final p in raw) {
          if (p is List && p.length >= 2) {
            pts.add({
              "lat": (p[0] as num).toDouble(),
              "lng": (p[1] as num).toDouble(),
            });
          } else if (p is Map && p["lat"] != null && p["lng"] != null) {
            pts.add({
              "lat": (p["lat"] as num).toDouble(),
              "lng": (p["lng"] as num).toDouble(),
            });
          }
        }
        return pts;
      }
    }
    return const [];
  }

  static Future<void> createServiceRequest({
    required String problemCategory,
    required String propertyType,
    required String priority,
    required String address,
    required String issueDescription,
    List<String> photos = const [],
    double? customerLat,
    double? customerLng,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/requests");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "problemCategory": problemCategory,
            "propertyType": propertyType,
            "priority": priority,
            "address": address,
            "issueDescription": issueDescription,
            "photos": photos,
            if (customerLat != null) "customerLat": customerLat,
            if (customerLng != null) "customerLng": customerLng,
          }),
        )
        .timeout(const Duration(seconds: 18));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final err = _extractError(res.body, "Could not submit plumbing request.");
      throw Exception(err);
    }
  }

  static Future<void> cancelServiceRequest({
    required String ticketNumber,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/requests");
    final res = await http
        .patch(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({"ticketNumber": ticketNumber, "action": "cancel"}),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(_extractError(res.body, "Could not cancel request."));
    }
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
      throw Exception(_extractError(res.body, "Quotation submission failed."));
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
      throw Exception(_extractError(res.body, "Decision failed."));
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
      throw Exception(_extractError(res.body, "Job action failed."));
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
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "lat": lat,
            "lng": lng,
            if (accuracy != null) "accuracy": accuracy,
            if (heading != null) "heading": heading,
            if (speed != null) "speed": speed,
            "timestamp": DateTime.now().millisecondsSinceEpoch,
          }),
        )
        .timeout(const Duration(seconds: 10));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(_extractError(res.body, "Location rejected."));
    }
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

  static Future<Map<String, dynamic>> fetchPaymentsAndBank({
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/payments?role=$role",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return {"bankDetails": null, "payments": []};
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
      throw Exception(_extractError(res.body, "Payment upload failed."));
    }
  }

  static Future<List<Map<String, dynamic>>> fetchReviews({
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/reviews?role=$role",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      final raw = data["reviews"];
      if (raw is List) {
        return raw.whereType<Map<String, dynamic>>().toList();
      }
    }
    return const [];
  }

  static Future<void> submitReview({
    required String ticketNumber,
    required int rating,
    required String comment,
    String? serviceCategory,
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
            if (serviceCategory != null) "serviceCategory": serviceCategory,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(_extractError(res.body, "Review submission failed."));
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
      throw Exception(_extractError(res.body, "Profile update failed."));
    }
  }

  static Future<void> changePassword({
    required String role,
    required String currentPassword,
    required String newPassword,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/mobile/profile");
    final res = await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "role": role,
            "currentPassword": currentPassword,
            "newPassword": newPassword,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(_extractError(res.body, "Password update failed."));
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
    final token = _accessToken;
    if (token != null) {
      req.headers["Authorization"] = "Bearer $token";
    }
    req.fields["role"] = role;
    req.files.add(
      http.MultipartFile.fromBytes(
        "file",
        bytes,
        filename: filename,
        contentType: _resolveMediaType(filename),
      ),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      return decoded["avatarUrl"]?.toString();
    }
    throw Exception(_extractError(body, "Avatar upload failed."));
  }

  static Future<String> uploadRequestPhoto({
    required List<int> bytes,
    required String filename,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/request-photo");
    final req = http.MultipartRequest("POST", uri);
    final token = _accessToken;
    if (token != null) {
      req.headers["Authorization"] = "Bearer $token";
    }
    req.files.add(
      http.MultipartFile.fromBytes(
        "file",
        bytes,
        filename: filename,
        contentType: _resolveMediaType(filename),
      ),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      final url = decoded["url"]?.toString() ?? decoded["path"]?.toString();
      if (url != null && url.isNotEmpty) return url;
    }
    throw Exception(_extractError(body, "File upload failed."));
  }

  static Future<Map<String, dynamic>> fetchConversations({
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/mobile/conversations?role=$role",
    );
    final res = await http
        .get(uri, headers: _authHeaders())
        .timeout(const Duration(seconds: 12));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return jsonDecode(res.body) as Map<String, dynamic>;
    }
    return {"conversations": [], "totalUnread": 0};
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
    String? recipientRole,
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
            if (recipientRole != null) "recipientRole": recipientRole,
            if (attachment != null) "attachment": attachment,
          }),
        )
        .timeout(const Duration(seconds: 15));
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw Exception(_extractError(res.body, "Could not send message."));
    }
  }

  static Future<void> markChatRead({
    required String ticketNumber,
    required String role,
    String? peerRole,
  }) async {
    final uri = Uri.parse("${SupabaseConfig.webBaseUrl}/api/chat/read");
    await http
        .post(
          uri,
          headers: _authHeaders(),
          body: jsonEncode({
            "ticketNumber": ticketNumber,
            "viewerRole": role,
            if (peerRole != null) "peerRole": peerRole,
          }),
        )
        .timeout(const Duration(seconds: 10));
  }

  static Future<Map<String, dynamic>> uploadChatAttachment({
    required List<int> bytes,
    required String filename,
    required String ticketNumber,
    required String role,
  }) async {
    final uri = Uri.parse(
      "${SupabaseConfig.webBaseUrl}/api/chat/upload?role=$role",
    );
    final req = http.MultipartRequest("POST", uri);
    final token = _accessToken;
    if (token != null) {
      req.headers["Authorization"] = "Bearer $token";
    }
    req.fields["ticketNumber"] = ticketNumber;
    req.fields["role"] = role;
    req.files.add(
      http.MultipartFile.fromBytes(
        "file",
        bytes,
        filename: filename,
        contentType: _resolveMediaType(filename),
      ),
    );
    final streamed = await req.send().timeout(const Duration(seconds: 20));
    final body = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 200 && streamed.statusCode < 300) {
      final decoded = jsonDecode(body) as Map<String, dynamic>;
      if (decoded["attachment"] is Map<String, dynamic>) {
        return decoded["attachment"] as Map<String, dynamic>;
      }
      return {
        "url": decoded["url"]?.toString() ?? "",
        "name": decoded["name"]?.toString() ?? filename,
        "size": decoded["size"] ?? bytes.length,
        "mimeType": decoded["mimeType"]?.toString() ?? "",
      };
    }
    throw Exception(_extractError(body, "Attachment upload failed."));
  }

  static String _extractError(String rawBody, String fallback) {
    try {
      final decoded = jsonDecode(rawBody);
      if (decoded is Map && decoded["error"] != null) {
        return decoded["error"].toString();
      }
    } catch (_) {}
    return fallback;
  }
}
