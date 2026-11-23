import "package:flutter/material.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_flavor.dart";
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

        return _RoleValidatedPortal(user: session.user);
      },
    );
  }
}

class _RoleValidatedPortal extends StatefulWidget {
  final User user;

  const _RoleValidatedPortal({required this.user});

  @override
  State<_RoleValidatedPortal> createState() => _RoleValidatedPortalState();
}

class _RoleValidatedPortalState extends State<_RoleValidatedPortal> {
  bool _checking = true;
  bool _authorized = false;
  String? _statusMessage;

  @override
  void initState() {
    super.initState();
    _validateAccess();
  }

  @override
  void didUpdateWidget(covariant _RoleValidatedPortal oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.user.id != widget.user.id) {
      _validateAccess();
    }
  }

  Future<void> _validateAccess() async {
    setState(() {
      _checking = true;
      _authorized = false;
      _statusMessage = null;
    });

    final rawRole = widget.user.appMetadata["role"]?.toString();
    String role = rawRole ?? "";

    // If app_metadata.role isn't set, verify against admin_users / plumbers before assuming customer
    if (role.isEmpty) {
      try {
        final adminRows = await SupabaseConfig.client
            .from("admin_users")
            .select("id")
            .eq("auth_user_id", widget.user.id)
            .limit(1);
        if (adminRows.isNotEmpty) {
          role = "admin";
        }
      } catch (_) {}
    }

    if (AppFlavorConfig.isTechnician) {
      if (role.isNotEmpty && role != "plumber") {
        setState(() {
          _checking = false;
          _statusMessage =
              "This account is not approved as a FlowGuard Technician.";
        });
        return;
      }

      try {
        final rows = await SupabaseConfig.client
            .from("plumbers")
            .select("verification_status, deleted_at")
            .eq("auth_user_id", widget.user.id)
            .limit(1);
        final activeRow = rows.isNotEmpty && rows.first["deleted_at"] == null
            ? rows.first
            : null;
        final status = activeRow != null
            ? (activeRow["verification_status"] ?? "pending_review").toString()
            : "pending_review";
        if (status != "approved") {
          if (mounted) {
            setState(() {
              _checking = false;
              _statusMessage =
                  "Your technician application status is '$status'. Access unlocks once approved by an administrator.";
            });
          }
          return;
        }
      } catch (_) {
        if (mounted) {
          setState(() {
            _checking = false;
            _statusMessage = "Unable to verify technician approval status.";
          });
        }
        return;
      }
    } else {
      // No role in app_metadata: make sure this is not a technician account.
      if (role.isEmpty) {
        try {
          final plumberRows = await SupabaseConfig.client
              .from("plumbers")
              .select("id")
              .eq("auth_user_id", widget.user.id)
              .limit(1);
          if (plumberRows.isNotEmpty) role = "plumber";
        } catch (_) {}
      }
      if (role == "plumber" || role == "admin") {
        if (mounted) {
          setState(() {
            _checking = false;
            _statusMessage = role == "plumber"
                ? "Please use the FlowGuard Technician app for plumber accounts."
                : "Please use the Admin Web Portal for administrator accounts.";
          });
        }
        return;
      }
    }

    final token = GoogleServicesBootstrap.fcmToken;
    if (token != null && token.isNotEmpty) {
      FlowGuardApiClient.registerDeviceToken(
        fcmToken: token,
        appFlavor: AppFlavorConfig.isTechnician ? "technician" : "customer",
      ).catchError((_) {});
    }

    if (mounted) {
      setState(() {
        _checking = false;
        _authorized = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (!_authorized) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(
                      Icons.verified_user_outlined,
                      size: 52,
                      color: FlowGuardTheme.navy,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      AppFlavorConfig.isTechnician
                          ? "Technician Access Required"
                          : "Customer App Access",
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      _statusMessage ?? "Access denied for this account.",
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: FlowGuardTheme.mutedText),
                    ),
                    const SizedBox(height: 20),
                    ElevatedButton(
                      onPressed: () async {
                        final token = GoogleServicesBootstrap.fcmToken;
                        if (token != null) {
                          await FlowGuardApiClient.deactivateDeviceToken(token)
                              .catchError((_) {});
                        }
                        await SupabaseConfig.client.auth.signOut();
                      },
                      child: const Text("Sign Out & Switch Account"),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    return AppFlavorConfig.isTechnician
        ? PlumberShell(user: widget.user)
        : CustomerShell(user: widget.user);
  }
}

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _identifierController = TextEditingController();
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _obscurePassword = true;
  bool _loading = false;
  bool _createAccountMode = false;
  String? _errorMessage;
  String? _infoMessage;

  @override
  void dispose() {
    _identifierController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final identifier = _identifierController.text.trim();
    final password = _passwordController.text;
    if (identifier.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = "Enter your phone/email and password.");
      return;
    }

    setState(() {
      _loading = true;
      _errorMessage = null;
      _infoMessage = null;
    });

    try {
      if (_createAccountMode && AppFlavorConfig.isCustomer) {
        final fullName = _nameController.text.trim();
        final phone = _phoneController.text.trim();
        if (!identifier.contains("@")) {
          setState(() => _errorMessage =
              "Create your account with an email address. You can sign in with your phone number afterwards.");
          return;
        }
        if (fullName.length < 2 || phone.length < 10) {
          setState(() => _errorMessage = "Enter your full name and phone number.");
          return;
        }
        await SupabaseConfig.client.auth.signUp(
          email: identifier.toLowerCase(),
          password: password,
          data: {"full_name": fullName, "phone": phone},
        );
        if (mounted) {
          setState(() {
            _infoMessage =
                "Account created. Check your email to confirm if required, or sign in.";
            _createAccountMode = false;
          });
        }
        return;
      }

      if (identifier.contains("@")) {
        await SupabaseConfig.client.auth.signInWithPassword(
          email: identifier.toLowerCase(),
          password: password,
        );
      } else {
        final refreshToken = await FlowGuardApiClient.signInWithPhoneServer(
          identifier: identifier,
          password: password,
          expectedRole: AppFlavorConfig.expectedRole,
        );
        await SupabaseConfig.client.auth.setSession(refreshToken);
      }
    } on AuthException catch (err) {
      if (mounted) setState(() => _errorMessage = err.message);
    } catch (err) {
      if (mounted) {
        setState(
          () => _errorMessage = err.toString().replaceFirst("Exception: ", ""),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _forgotPassword() async {
    final raw = _identifierController.text.trim();
    if (raw.isEmpty) {
      setState(() => _errorMessage = "Enter your email or phone first.");
      return;
    }
    if (!raw.contains("@")) {
      setState(
        () => _errorMessage =
            "Please enter your registered email address to receive a password reset link.",
      );
      return;
    }
    setState(() {
      _loading = true;
      _errorMessage = null;
      _infoMessage = null;
    });
    try {
      await SupabaseConfig.client.auth.resetPasswordForEmail(raw.toLowerCase());
      if (mounted) {
        setState(() => _infoMessage = "If an account exists, a reset link was sent.");
      }
    } catch (_) {
      if (mounted) {
        setState(() => _infoMessage = "If an account exists, a reset link was sent.");
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _signInWithGoogle() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
      _infoMessage = null;
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
            padding: const EdgeInsets.all(20),
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
                          width: 74,
                          height: 74,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      AppFlavorConfig.appTitle,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      AppFlavorConfig.isTechnician
                          ? "Sign in with your approved technician account"
                          : (_createAccountMode
                              ? "Create your customer account"
                              : "Sign in with phone number or email"),
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 13,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                    const SizedBox(height: 22),
                    if (_createAccountMode && AppFlavorConfig.isCustomer) ...[
                      TextField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: "Full Name",
                        ),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: "Phone Number",
                          hintText: "0806...",
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: _identifierController,
                      keyboardType: _createAccountMode
                          ? TextInputType.emailAddress
                          : TextInputType.text,
                      decoration: InputDecoration(
                        labelText: _createAccountMode
                            ? "Email Address"
                            : "Phone Number or Email",
                        hintText: _createAccountMode
                            ? "you@example.com"
                            : "0806... or you@example.com",
                      ),
                    ),
                    const SizedBox(height: 12),
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
                    if (!_createAccountMode)
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: _loading ? null : _forgotPassword,
                          child: const Text(
                            "Forgot Password?",
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                        ),
                      )
                    else
                      const SizedBox(height: 14),
                    if (_errorMessage != null) ...[
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
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
                    if (_infoMessage != null) ...[
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFD1FAE5),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _infoMessage!,
                          style: const TextStyle(
                            fontSize: 12,
                            color: Color(0xFF065F46),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                    ElevatedButton(
                      onPressed: _loading ? null : _submit,
                      child: _loading
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Text(_createAccountMode ? "Create Account" : "Sign In"),
                    ),
                    if (!AppFlavorConfig.isTechnician) ...[
                      const SizedBox(height: 12),
                      OutlinedButton(
                        onPressed: _loading ? null : _signInWithGoogle,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(48),
                          side: const BorderSide(color: FlowGuardTheme.border),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              width: 22,
                              height: 22,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text(
                                "G",
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 14,
                                  color: Color(0xFF4285F4),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            const Text(
                              "Continue with Google",
                              maxLines: 1,
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    if (AppFlavorConfig.isCustomer)
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _createAccountMode = !_createAccountMode;
                            _errorMessage = null;
                            _infoMessage = null;
                          });
                        },
                        child: Text(
                          _createAccountMode
                              ? "Already have an account? Sign In"
                              : "New customer? Create an account",
                          style: const TextStyle(
                            color: FlowGuardTheme.navy,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      )
                    else
                      TextButton(
                        onPressed: () {
                          launchUrl(
                            Uri.parse("${SupabaseConfig.webBaseUrl}/join-as-plumber"),
                            mode: LaunchMode.externalApplication,
                          );
                        },
                        child: const Text(
                          "Apply as a Plumber on Web",
                          style: TextStyle(
                            color: FlowGuardTheme.navy,
                            fontWeight: FontWeight.w700,
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
