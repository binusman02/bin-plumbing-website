# FlowGuard Plumbing — Native Flutter App

Unified **Customer + Technician (Plumber)** Android & iOS codebase connected directly to FlowGuard's existing Supabase backend, **Google Maps SDK**, **Firebase Cloud Messaging (FCM)**, and **Google Sign-In**.

## 1. Prerequisites
1. Install the **Flutter SDK** (Windows):
   ```powershell
   winget install Google.Flutter
   ```
   *(Or download from https://docs.flutter.dev/get-started/install/windows and add `flutter\bin` to PATH.)*
2. Install **Android Studio** (Android SDK + Platform Tools) and verify with `flutter doctor`.

## 2. Google SDK Configuration
1. **Google Maps SDK (Android):**
   - Enable **Maps SDK for Android** in Google Cloud Console.
   - Pass your key via Gradle `manifestPlaceholders` (`GOOGLE_MAPS_API_KEY`) in `android/app/build.gradle` (or `local.properties`).
2. **Firebase Cloud Messaging (Push Notifications):**
   - Create/open your project in Firebase Console → add Android app (`com.flowguard.plumbing`), download **`google-services.json`**, and place it at `mobile/android/app/google-services.json`.
3. **Google Sign-In (Supabase Auth):**
   - Enable **Google** provider in **Supabase → Authentication → Providers** and pass your Google OAuth Web Client ID via `--dart-define=GOOGLE_WEB_CLIENT_ID=...`.

## 3. Running & Building
This app has two flavors: `customer` and `technician`. Always pass `--flavor customer` or `--flavor technician`.
Maps use OpenStreetMap-style tiles via `flutter_map` (no Google Maps key needed). Run commands from the project root.
From `mobile/`:

```powershell
flutter pub get

flutter run --flavor customer `
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY `
  --dart-define=GOOGLE_WEB_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com `
  --dart-define=WEB_BASE_URL=https://flowguard-ng.vercel.app

flutter build apk --release --flavor customer `
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY `
  --dart-define=GOOGLE_WEB_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID.apps.googleusercontent.com `
  --dart-define=WEB_BASE_URL=https://flowguard-ng.vercel.app
```
