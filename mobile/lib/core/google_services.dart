import "package:firebase_core/firebase_core.dart";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:google_sign_in/google_sign_in.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_flavor.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";

class GoogleServicesBootstrap {
  static bool firebaseReady = false;
  static String? fcmToken;

  static const String googleWebClientId = String.fromEnvironment(
    "GOOGLE_WEB_CLIENT_ID",
    defaultValue:
        "1080146694782-q3ep6g62oqh5q0e1duv7cggn3qou230g.apps.googleusercontent.com",
  );

  /// Safely initializes Firebase & FCM when google-services.json is configured.
  static Future<void> initialize() async {
    try {
      await Firebase.initializeApp();
      firebaseReady = true;
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      fcmToken = await messaging.getToken();
      messaging.onTokenRefresh.listen((newToken) {
        fcmToken = newToken;
        if (SupabaseConfig.client.auth.currentSession != null) {
          FlowGuardApiClient.registerDeviceToken(
            fcmToken: newToken,
            appFlavor:
                AppFlavorConfig.isTechnician ? "technician" : "customer",
          ).catchError((_) {});
        }
      });
    } catch (_) {
      firebaseReady = false;
    }
  }
}

class GoogleAuthHelper {
  static Future<AuthResponse> signInWithGoogle() async {
    final googleSignIn = GoogleSignIn(
      scopes: const ["email", "profile"],
      serverClientId: GoogleServicesBootstrap.googleWebClientId.isNotEmpty
          ? GoogleServicesBootstrap.googleWebClientId
          : null,
    );

    final googleUser = await googleSignIn.signIn();
    if (googleUser == null) {
      throw const AuthException("Google sign-in was cancelled.");
    }

    final googleAuth = await googleUser.authentication;
    final idToken = googleAuth.idToken;
    if (idToken == null) {
      throw const AuthException(
        "Missing Google ID token. Configure GOOGLE_WEB_CLIENT_ID.",
      );
    }

    return SupabaseConfig.client.auth.signInWithIdToken(
      provider: OAuthProvider.google,
      idToken: idToken,
      accessToken: googleAuth.accessToken,
    );
  }
}
