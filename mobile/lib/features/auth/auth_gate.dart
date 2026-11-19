import "package:flutter/material.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/customer/customer_shell.dart";
import "package:flowguard_plumbing/features/plumber/plumber_shell.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    if (!SupabaseConfig.isConfigured) {
      return const _MissingConfigScreen();
    }

    return StreamBuilder<AuthState>(
      stream: SupabaseConfig.client.auth.onAuthStateChange,
      builder: (context, snapshot) {
        final session =
            snapshot.data?.session ?? SupabaseConfig.client.auth.currentSession;

        if (session == null) {
          return const SignInScreen();
        }

        final role =
            (session.user.appMetadata["role"] ?? "customer").toString();

        if (role == "plumber") {
          return PlumberShell(user: session.user);
        }

        if (role == "admin") {
          return _AdminWebRedirectScreen(email: session.user.email ?? "");
        }

        return CustomerShell(user: session.user);
      },
    );
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    final identifier = _emailController.text.trim();
    final password = _passwordController.text;
    if (identifier.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = "Enter your email/phone and password.");
      return;
    }

    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    try {
      await SupabaseConfig.client.auth.signInWithPassword(
        email: identifier,
        password: password,
      );
    } on AuthException catch (err) {
      if (mounted) {
        setState(() => _errorMessage = err.message);
      }
    } catch (_) {
      if (mounted) {
        setState(
          () => _errorMessage = "Unable to sign in right now. Please try again.",
        );
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });
    try {
      await GoogleAuthHelper.signInWithGoogle();
    } on AuthException catch (err) {
      if (mounted) setState(() => _errorMessage = err.message);
    } catch (_) {
      if (mounted) {
        setState(() => _errorMessage = "Google sign-in failed. Please try again.");
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FlowGuardTheme.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: FlowGuardTheme.border),
                  boxShadow: [
                    BoxShadow(
                      color: FlowGuardTheme.navy.withValues(alpha: 0.06),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: ClipOval(
                        child: Image.asset(
                          "assets/images/flowguard-icon.jpg",
                          width: 72,
                          height: 72,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      "FlowGuard Plumbing",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      "Sign in to your Customer or Technician account",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 13,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _emailController,
                      keyboardType: TextInputType.emailAddress,
                      decoration: const InputDecoration(
                        labelText: "Email Address",
                        hintText: "you@example.com",
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _passwordController,
                      obscureText: _obscurePassword,
                      decoration: InputDecoration(
                        labelText: "Password",
                        suffixIcon: IconButton(
                          onPressed: () {
                            setState(
                              () => _obscurePassword = !_obscurePassword,
                            );
                          },
                          icon: Icon(
                            _obscurePassword
                                ? Icons.visibility_outlined
                                : Icons.visibility_off_outlined,
                          ),
                        ),
                      ),
                    ),
                    if (_errorMessage != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFEE2E2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _errorMessage!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF991B1B),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: _loading ? null : _signIn,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text("Sign In"),
                    ),
                    const SizedBox(height: 10),
                    OutlinedButton.icon(
                      onPressed: _loading ? null : _signInWithGoogle,
                      icon: const Icon(Icons.g_mobiledata_rounded, size: 24),
                      label: const Text("Continue with Google"),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        foregroundColor: FlowGuardTheme.navy,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    TextButton(
                      onPressed: () {
                        launchUrl(
                          Uri.parse("${SupabaseConfig.webBaseUrl}/request"),
                          mode: LaunchMode.externalApplication,
                        );
                      },
                      child: const Text(
                        "Submit a Guest Request on Web",
                        style: TextStyle(
                          color: FlowGuardTheme.navy,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _AdminWebRedirectScreen extends StatelessWidget {
  final String email;

  const _AdminWebRedirectScreen({required this.email});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.admin_panel_settings_outlined,
                    size: 56,
                    color: FlowGuardTheme.navy,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    "Admin Operations Portal",
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    "Signed in as $email. Full admin dispatch & financial tools run on your web dashboard.",
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: FlowGuardTheme.mutedText),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: () {
                      launchUrl(
                        Uri.parse("${SupabaseConfig.webBaseUrl}/admin"),
                        mode: LaunchMode.externalApplication,
                      );
                    },
                    child: const Text("Open Admin Web Portal"),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: () => SupabaseConfig.client.auth.signOut(),
                    child: const Text("Sign Out"),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _MissingConfigScreen extends StatelessWidget {
  const _MissingConfigScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.settings_outlined, size: 52, color: FlowGuardTheme.navy),
                SizedBox(height: 16),
                Text(
                  "Supabase Config Required",
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  "Run with --dart-define=SUPABASE_URL=... and --dart-define=SUPABASE_ANON_KEY=...",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: FlowGuardTheme.mutedText),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
