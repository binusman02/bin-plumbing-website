import "dart:async";
import "dart:math" as math;
import "package:flutter/material.dart";
import "package:flowguard_plumbing/core/app_flavor.dart";
import "package:flowguard_plumbing/features/auth/auth_gate.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  late final AnimationController _motionController;
  late final AnimationController _introController;
  late final Animation<double> _fade;
  late final Animation<double> _scale;
  Timer? _navTimer;

  @override
  void initState() {
    super.initState();
    _motionController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();

    _introController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 850),
    );
    _fade = CurvedAnimation(parent: _introController, curve: Curves.easeOut);
    _scale = Tween<double>(begin: 0.84, end: 1.0).animate(
      CurvedAnimation(parent: _introController, curve: Curves.easeOutCubic),
    );
    _introController.forward();

    _navTimer = Timer(const Duration(milliseconds: 1900), () {
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        PageRouteBuilder<void>(
          pageBuilder: (_, __, ___) => const AuthGate(),
          transitionsBuilder: (_, animation, __, child) =>
              FadeTransition(opacity: animation, child: child),
          transitionDuration: const Duration(milliseconds: 420),
        ),
      );
    });
  }

  @override
  void dispose() {
    _navTimer?.cancel();
    _motionController.dispose();
    _introController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: FlowGuardTheme.navyDark,
      body: Stack(
        fit: StackFit.expand,
        children: [
          AnimatedBuilder(
            animation: _motionController,
            builder: (context, _) => CustomPaint(
              painter: _FlowGuardSplashPainter(progress: _motionController.value),
            ),
          ),
          Center(
            child: FadeTransition(
              opacity: _fade,
              child: ScaleTransition(
                scale: _scale,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedBuilder(
                      animation: _motionController,
                      builder: (context, child) {
                        final pulse =
                            1.0 + 0.03 * math.sin(_motionController.value * 2 * math.pi);
                        return Transform.scale(scale: pulse, child: child);
                      },
                      child: Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(color: FlowGuardTheme.gold, width: 2.5),
                          boxShadow: [
                            BoxShadow(
                              color: FlowGuardTheme.gold.withValues(alpha: 0.28),
                              blurRadius: 32,
                              spreadRadius: 2,
                            ),
                          ],
                        ),
                        child: ClipOval(
                          child: Image.asset(
                            "assets/images/flowguard-icon.jpg",
                            width: 100,
                            height: 100,
                            fit: BoxFit.cover,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    Text(
                      AppFlavorConfig.appTitle,
                      style: const TextStyle(
                        fontSize: 25,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.2,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      AppFlavorConfig.isTechnician
                          ? "TECHNICIAN DISPATCH • KANO"
                          : "RELIABLE PLUMBING • KANO",
                      style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 2.1,
                        color: FlowGuardTheme.gold,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FlowGuardSplashPainter extends CustomPainter {
  final double progress;

  _FlowGuardSplashPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height * 0.45);
    final ringPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6;

    for (var i = 0; i < 3; i++) {
      final phase = (progress + i * 0.33) % 1.0;
      final radius = 72.0 + phase * 140.0;
      final alpha = (1.0 - phase) * 0.22;
      ringPaint.color = FlowGuardTheme.gold.withValues(alpha: alpha);
      canvas.drawCircle(center, radius, ringPaint);
    }

    final wavePaint = Paint()
      ..color = FlowGuardTheme.navy.withValues(alpha: 0.72)
      ..style = PaintingStyle.fill;

    final path = Path()..moveTo(0, size.height * 0.78);
    for (double x = 0; x <= size.width; x += 12) {
      final y = size.height * 0.78 +
          math.sin((x / size.width * 2 * math.pi) + (progress * 2 * math.pi)) * 14;
      path.lineTo(x, y);
    }
    path
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, wavePaint);
  }

  @override
  bool shouldRepaint(covariant _FlowGuardSplashPainter oldDelegate) =>
      oldDelegate.progress != progress;
}
