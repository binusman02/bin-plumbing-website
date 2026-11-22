import "dart:async";
import "dart:math" as math;

import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:flutter_tts/flutter_tts.dart";
import "package:geolocator/geolocator.dart" as geo;
import "package:latlong2/latlong.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class NavigationPage extends StatefulWidget {
  final String ticket;
  final String customerName;
  final double destinationLat;
  final double destinationLng;
  final Stream<geo.Position>? positionStream;
  final geo.Position? initialPosition;
  final Future<void> Function() onArrived;

  const NavigationPage({
    super.key,
    required this.ticket,
    required this.customerName,
    required this.destinationLat,
    required this.destinationLng,
    required this.onArrived,
    this.positionStream,
    this.initialPosition,
  });

  @override
  State<NavigationPage> createState() => _NavigationPageState();
}

class _NavigationPageState extends State<NavigationPage> {
  static const MethodChannel _wakelockChannel = MethodChannel(
    "com.flowguard.plumbing/wakelock",
  );
  static const Distance _distanceCalc = Distance();

  final FlutterTts _tts = FlutterTts();
  StreamSubscription<geo.Position>? _posSub;

  RoadRouteData? _route;
  List<LatLng> _fullPoints = const [];
  List<LatLng> _trimmedPoints = const [];
  List<double> _stepEndDistancesM = const [];
  double _totalRouteDistanceM = 0.0;

  int _currentStepIndex = 0;
  final Set<String> _spokenVoiceKeys = <String>{};
  bool _muted = false;
  int _recenterTrigger = 0;

  geo.Position? _currentPos;
  double _remainingDistanceM = 0.0;
  double _remainingDurationS = 0.0;
  double _distanceToNextManeuverM = 0.0;

  int _offRouteConsecutiveFixes = 0;
  DateTime? _lastRerouteAt;
  bool _loadingRoute = true;
  bool _arrivalPromptShown = false;
  bool _submittingArrival = false;

  @override
  void initState() {
    super.initState();
    _currentPos = widget.initialPosition;
    _setKeepScreenOn(true);
    _initTts();
    _loadRoute(
      fromLat: widget.initialPosition?.latitude,
      fromLng: widget.initialPosition?.longitude,
    );
    _startListening();
  }

  @override
  void dispose() {
    _posSub?.cancel();
    _tts.stop();
    _setKeepScreenOn(false);
    super.dispose();
  }

  Future<void> _setKeepScreenOn(bool enable) async {
    try {
      await _wakelockChannel.invokeMethod("setKeepScreenOn", {
        "enable": enable,
      });
    } catch (_) {}
  }

  Future<void> _initTts() async {
    try {
      await _tts.setLanguage("en-US");
      await _tts.setSpeechRate(0.5);
      await _tts.setPitch(1.0);
    } catch (_) {}
  }

  void _startListening() {
    final stream =
        widget.positionStream ??
        geo.Geolocator.getPositionStream(
          locationSettings: geo.AndroidSettings(
            accuracy: geo.LocationAccuracy.high,
            distanceFilter: 5,
            foregroundNotificationConfig: const geo.ForegroundNotificationConfig(
              notificationTitle: "FlowGuard Live Navigation",
              notificationText: "Turn-by-turn navigation active.",
              enableWakeLock: true,
            ),
          ),
        );
    _posSub = stream.listen(_onPosition);
  }

  Future<void> _loadRoute({double? fromLat, double? fromLng}) async {
    if (mounted) {
      setState(() => _loadingRoute = true);
    }
    try {
      double? lat = fromLat ?? _currentPos?.latitude;
      double? lng = fromLng ?? _currentPos?.longitude;
      if (lat == null || lng == null) {
        try {
          final pos = await geo.Geolocator.getCurrentPosition(
            locationSettings: const geo.LocationSettings(
              accuracy: geo.LocationAccuracy.high,
            ),
          );
          lat = pos.latitude;
          lng = pos.longitude;
          _currentPos = pos;
        } catch (_) {}
      }

      final route = await FlowGuardApiClient.fetchRoutePoints(
        ticket: widget.ticket,
        viewerRole: "plumber",
        fromLat: lat,
        fromLng: lng,
      );
      if (!mounted || route == null) {
        if (mounted) setState(() => _loadingRoute = false);
        return;
      }

      final pts = route.points
          .where((p) => p["lat"] != null && p["lng"] != null)
          .map((p) => LatLng(p["lat"]!, p["lng"]!))
          .toList();

      final stepEnds = <double>[];
      double running = 0.0;
      for (final step in route.steps) {
        running += step.distanceM;
        stepEnds.add(running);
      }
      final totalM = route.distanceM > 0
          ? route.distanceM
          : (pts.length >= 2 ? _polylineLength(pts) : running);

      setState(() {
        _route = route;
        _fullPoints = pts;
        _trimmedPoints = pts;
        _stepEndDistancesM = stepEnds;
        _totalRouteDistanceM = totalM;
        _currentStepIndex = 0;
        _spokenVoiceKeys.clear();
        _offRouteConsecutiveFixes = 0;
        _remainingDistanceM = totalM;
        _remainingDurationS = route.durationS;
        _loadingRoute = false;
      });

      if (_currentPos != null) {
        _onPosition(_currentPos!);
      } else {
        _updateCurrentStepDisplay(null);
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loadingRoute = false);
      }
    }
  }

  double _polylineLength(List<LatLng> pts) {
    double sum = 0.0;
    for (int i = 0; i < pts.length - 1; i++) {
      sum += _distanceCalc.as(LengthUnit.Meter, pts[i], pts[i + 1]);
    }
    return sum;
  }

  _SnapResult _snapToPolyline(LatLng pos, List<LatLng> pts) {
    if (pts.isEmpty) {
      return _SnapResult(
        snappedPoint: pos,
        segmentIndex: 0,
        distanceFromRouteM: 0.0,
        progressAlongRouteM: 0.0,
      );
    }
    if (pts.length == 1) {
      return _SnapResult(
        snappedPoint: pts.first,
        segmentIndex: 0,
        distanceFromRouteM: _distanceCalc.as(LengthUnit.Meter, pos, pts.first),
        progressAlongRouteM: 0.0,
      );
    }

    double bestDistM = double.infinity;
    LatLng bestPoint = pts.first;
    int bestSeg = 0;
    double bestProgressM = 0.0;
    double cumulativeM = 0.0;

    final cosLat = math.cos(pos.latitude * math.pi / 180.0);
    for (int i = 0; i < pts.length - 1; i++) {
      final a = pts[i];
      final b = pts[i + 1];
      final segLenM = _distanceCalc.as(LengthUnit.Meter, a, b);

      final ax = (a.longitude - pos.longitude) * cosLat;
      final ay = a.latitude - pos.latitude;
      final bx = (b.longitude - pos.longitude) * cosLat;
      final by = b.latitude - pos.latitude;
      final dx = bx - ax;
      final dy = by - ay;
      final denom = dx * dx + dy * dy;
      double t = 0.0;
      if (denom > 1e-12) {
        t = (-(ax * dx + ay * dy) / denom).clamp(0.0, 1.0);
      }
      final proj = LatLng(
        a.latitude + t * (b.latitude - a.latitude),
        a.longitude + t * (b.longitude - a.longitude),
      );
      final dM = _distanceCalc.as(LengthUnit.Meter, pos, proj);
      if (dM < bestDistM) {
        bestDistM = dM;
        bestPoint = proj;
        bestSeg = i;
        bestProgressM = cumulativeM + t * segLenM;
      }
      cumulativeM += segLenM;
    }

    return _SnapResult(
      snappedPoint: bestPoint,
      segmentIndex: bestSeg,
      distanceFromRouteM: bestDistM,
      progressAlongRouteM: bestProgressM,
    );
  }

  void _onPosition(geo.Position pos) {
    if (!mounted) return;
    _currentPos = pos;
    final current = LatLng(pos.latitude, pos.longitude);

    // 1. Check destination arrival within 50 m.
    final distToDest = _distanceCalc.as(
      LengthUnit.Meter,
      current,
      LatLng(widget.destinationLat, widget.destinationLng),
    );
    if (distToDest <= 50.0 && !_arrivalPromptShown && !_submittingArrival) {
      _arrivalPromptShown = true;
      _promptArrivalConfirm();
    }

    if (_fullPoints.length < 2) {
      setState(() {
        _remainingDistanceM = distToDest;
      });
      return;
    }

    // 2. Snap to route polyline and trim driven portion.
    final snap = _snapToPolyline(current, _fullPoints);
    final trimmed = <LatLng>[
      snap.snappedPoint,
      ..._fullPoints.sublist(snap.segmentIndex + 1),
    ];

    final remainingM = math.max(
      0.0,
      _totalRouteDistanceM - snap.progressAlongRouteM,
    );
    final fractionRemaining = _totalRouteDistanceM > 1.0
        ? (remainingM / _totalRouteDistanceM).clamp(0.0, 1.0)
        : 0.0;
    final totalDur = _route?.durationS ?? 0.0;
    final remainingS = totalDur * fractionRemaining;

    // 3. Off-route detection (> 50 m for 3 consecutive fixes, max once every 15 s).
    if (snap.distanceFromRouteM > 50.0) {
      _offRouteConsecutiveFixes++;
      if (_offRouteConsecutiveFixes >= 3) {
        final now = DateTime.now();
        if (_lastRerouteAt == null ||
            now.difference(_lastRerouteAt!) >= const Duration(seconds: 15)) {
          _lastRerouteAt = now;
          _offRouteConsecutiveFixes = 0;
          _loadRoute(fromLat: pos.latitude, fromLng: pos.longitude);
          return;
        }
      }
    } else {
      _offRouteConsecutiveFixes = 0;
    }

    // 4. Advance step when within 25 m of maneuver point or snapped progress passes step end.
    final steps = _route?.steps ?? const <RouteStepData>[];
    int stepIdx = _currentStepIndex;
    while (stepIdx < steps.length - 1) {
      final step = steps[stepIdx];
      final passedProgress =
          stepIdx < _stepEndDistancesM.length &&
          snap.progressAlongRouteM >= _stepEndDistancesM[stepIdx];
      bool withinManeuver = false;
      if (step.maneuverLat != null && step.maneuverLng != null && stepIdx > 0) {
        final dManeuver = _distanceCalc.as(
          LengthUnit.Meter,
          current,
          LatLng(step.maneuverLat!, step.maneuverLng!),
        );
        withinManeuver = dManeuver <= 25.0;
      }
      if (passedProgress || withinManeuver) {
        stepIdx++;
      } else {
        break;
      }
    }

    setState(() {
      _trimmedPoints = trimmed;
      _remainingDistanceM = remainingM;
      _remainingDurationS = remainingS;
      _currentStepIndex = stepIdx;
    });

    _updateCurrentStepDisplay(current);
  }

  void _updateCurrentStepDisplay(LatLng? current) {
    final steps = _route?.steps ?? const <RouteStepData>[];
    if (steps.isEmpty) {
      setState(() => _distanceToNextManeuverM = _remainingDistanceM);
      return;
    }
    final idx = _currentStepIndex.clamp(0, steps.length - 1);
    final step = steps[idx];
    double distToManeuver = step.distanceM;
    if (current != null &&
        step.maneuverLat != null &&
        step.maneuverLng != null) {
      distToManeuver = _distanceCalc.as(
        LengthUnit.Meter,
        current,
        LatLng(step.maneuverLat!, step.maneuverLng!),
      );
    }
    setState(() => _distanceToNextManeuverM = distToManeuver);

    // Trigger voice instructions once when remaining distance <= distanceAlongGeometry.
    for (int vIdx = 0; vIdx < step.voice.length; vIdx++) {
      final voice = step.voice[vIdx];
      if (voice.text.trim().isEmpty) continue;
      final key = "$idx:$vIdx";
      if (!_spokenVoiceKeys.contains(key) &&
          distToManeuver <= voice.distanceAlongGeometry) {
        _spokenVoiceKeys.add(key);
        if (!_muted) {
          _tts.speak(voice.text);
        }
      }
    }
  }

  Future<void> _promptArrivalConfirm() async {
    if (!mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("You've arrived"),
        content: const Text("You've arrived. Confirm?"),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text("Not yet"),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text("Confirm Arrival"),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _confirmArrived();
    }
  }

  Future<void> _confirmArrived() async {
    if (_submittingArrival) return;
    setState(() => _submittingArrival = true);
    try {
      await widget.onArrived();
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _submittingArrival = false);
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text("Could not confirm arrival: $e")));
      }
    }
  }

  IconData _maneuverIcon(String? type, String? modifier) {
    final t = (type ?? "").toLowerCase();
    final m = (modifier ?? "").toLowerCase();
    if (t == "arrive") return Icons.flag_rounded;
    if (t == "depart") return Icons.navigation_rounded;
    if (t.contains("roundabout") || t.contains("rotary")) {
      return Icons.roundabout_right_rounded;
    }
    if (m.contains("uturn")) return Icons.u_turn_left_rounded;
    if (m.contains("sharp left")) return Icons.turn_sharp_left_rounded;
    if (m.contains("slight left")) return Icons.turn_slight_left_rounded;
    if (m.contains("left")) return Icons.turn_left_rounded;
    if (m.contains("sharp right")) return Icons.turn_sharp_right_rounded;
    if (m.contains("slight right")) return Icons.turn_slight_right_rounded;
    if (m.contains("right")) return Icons.turn_right_rounded;
    if (t == "fork") return Icons.fork_right_rounded;
    if (t == "merge") return Icons.merge_rounded;
    return Icons.straight_rounded;
  }

  String _formatDistance(double meters) {
    if (meters >= 1000) {
      return "${(meters / 1000).toStringAsFixed(1)} km";
    }
    final rounded = (meters / 10).round() * 10;
    return "$rounded m";
  }

  String _formatEta(double seconds) {
    final mins = math.max(1, (seconds / 60).round());
    final arrival = DateTime.now().add(Duration(seconds: seconds.round()));
    final hh = arrival.hour.toString().padLeft(2, "0");
    final mm = arrival.minute.toString().padLeft(2, "0");
    return "$mins min ($hh:$mm)";
  }

  @override
  Widget build(BuildContext context) {
    final steps = _route?.steps ?? const <RouteStepData>[];
    final currentStep = steps.isNotEmpty
        ? steps[_currentStepIndex.clamp(0, steps.length - 1)]
        : null;
    final primaryText = (currentStep?.bannerPrimary?.isNotEmpty ?? false)
        ? currentStep!.bannerPrimary!
        : (currentStep?.instruction ?? "Follow route to ${widget.customerName}");
    final secondaryText = currentStep?.bannerSecondary;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: FlowGuardGoogleMap(
              customerLat: widget.destinationLat,
              customerLng: widget.destinationLng,
              routePoints: _trimmedPoints,
              height: double.infinity,
              allowFullscreen: false,
              followMe: true,
              enable3D: true,
              followZoom: 17.0,
              showPlumberMarker: false,
              showStyleControls: false,
              showDefaultCenterButton: false,
              recenterTrigger: _recenterTrigger,
              borderRadius: 0.0,
            ),
          ),

          // Top turn-by-turn instruction banner
          Positioned(
            top: MediaQuery.of(context).padding.top + 10,
            left: 12,
            right: 12,
            child: Material(
              color: FlowGuardTheme.navy,
              elevation: 8,
              borderRadius: BorderRadius.circular(18),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 14,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 52,
                      height: 52,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(
                        _maneuverIcon(
                          currentStep?.maneuverType,
                          currentStep?.maneuverModifier,
                        ),
                        color: Colors.white,
                        size: 32,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            _loadingRoute
                                ? "Calculating route..."
                                : _formatDistance(_distanceToNextManeuverM),
                            style: const TextStyle(
                              color: FlowGuardTheme.gold,
                              fontSize: 15,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            primaryText,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (secondaryText != null &&
                              secondaryText.trim().isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              secondaryText,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      icon: const Icon(Icons.close_rounded, color: Colors.white),
                      tooltip: "Exit Navigation",
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Bottom navigation control bar
          Positioned(
            bottom: MediaQuery.of(context).padding.bottom + 12,
            left: 12,
            right: 12,
            child: Material(
              color: Colors.white,
              elevation: 10,
              borderRadius: BorderRadius.circular(20),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                _formatEta(_remainingDurationS),
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: FlowGuardTheme.navy,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                "${_formatDistance(_remainingDistanceM)} remaining • ${widget.customerName}",
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: FlowGuardTheme.mutedText,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton.filledTonal(
                          onPressed: () {
                            setState(() => _recenterTrigger++);
                          },
                          icon: const Icon(Icons.my_location_rounded),
                          tooltip: "Recenter",
                        ),
                        const SizedBox(width: 6),
                        IconButton.filledTonal(
                          onPressed: () {
                            setState(() => _muted = !_muted);
                            if (_muted) {
                              _tts.stop();
                            }
                          },
                          icon: Icon(
                            _muted
                                ? Icons.volume_off_rounded
                                : Icons.volume_up_rounded,
                          ),
                          tooltip: _muted ? "Unmute Voice" : "Mute Voice",
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        onPressed: _submittingArrival ? null : _confirmArrived,
                        icon: _submittingArrival
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.location_on_rounded),
                        label: Text(
                          _submittingArrival
                              ? "Confirming arrival..."
                              : "I've arrived",
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.green.shade700,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
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

class _SnapResult {
  final LatLng snappedPoint;
  final int segmentIndex;
  final double distanceFromRouteM;
  final double progressAlongRouteM;

  const _SnapResult({
    required this.snappedPoint,
    required this.segmentIndex,
    required this.distanceFromRouteM,
    required this.progressAlongRouteM,
  });
}
