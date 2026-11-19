# FlowGuard Plumbing — Native Flutter App

Unified **Customer + Technician (Plumber)** Android & iOS codebase connected directly to FlowGuard's existing Supabase backend.

## Prerequisites
1. Install the **Flutter SDK** (Windows):
   ```powershell
   winget install Google.Flutter
   ```
   *(Or download from https://docs.flutter.dev/get-started/install/windows and add `flutter\bin` to PATH.)*
2. Install **Android Studio** (Android SDK + Platform Tools) and run:
   ```powershell
   flutter doctor
   ```

## Running & Building
From the `mobile/` directory:

```powershell
flutter pub get

# Run in debug mode (connected Android phone or emulator)
flutter run `
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY `
  --dart-define=WEB_BASE_URL=https://flowguard-ng.vercel.app

# Build release Android APK
flutter build apk --release `
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co `
  --dart-define=SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY `
  --dart-define=WEB_BASE_URL=https://flowguard-ng.vercel.app
```
