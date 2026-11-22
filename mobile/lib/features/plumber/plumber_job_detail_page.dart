import "dart:async";
import "dart:math" as math;
import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart";
import "package:latlong2/latlong.dart";
import "package:image_picker/image_picker.dart";
import "package:intl/intl.dart";
import "package:sensors_plus/sensors_plus.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/plumber/navigation_page.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
import "package:flowguard_plumbing/features/shared/voice_note_widgets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class PlumberJobDetailPage extends StatefulWidget {
  final ServiceRequestItem job;
  final String plumberId;
  final String plumberName;
  final VoidCallback onUpdated;
  final VoidCallback onOpenChat;

  const PlumberJobDetailPage({
    super.key,
    required this.job,
    required this.plumberId,
    required this.plumberName,
    required this.onUpdated,
    required this.onOpenChat,
  });

  @override
  State<PlumberJobDetailPage> createState() => _PlumberJobDetailPageState();
}

class _PlumberJobDetailPageState extends State<PlumberJobDetailPage> {
  late ServiceRequestItem _job;
  QuotationData? _quote;
  bool _loading = true;
  bool _busy = false;
  String _tripState = "idle"; // idle | on_the_way | arrived
  double? _plumberLat;
  double? _plumberLng;
  List<LatLng> _routePoints = [];
  String _gpsMessage = "GPS standby";
  bool _gpsError = false;
  StreamSubscription<Position>? _gpsSub;
  StreamSubscription<GyroscopeEvent>? _gyroSub;
  final StreamController<Position> _navPositionController =
      StreamController<Position>.broadcast();
  Position? _lastPosition;
  DateTime? _lastServerPushAt;
  double? _fusedHeading;
  DateTime? _lastGyroAt;
  bool _disposed = false;
  List<dynamic> _history = [];
  final List<String> _uploadedPhotoNames = [];
  String? _loadError;

  final _labourCtrl = TextEditingController();
  final _materialsCtrl = TextEditingController(text: "0");
  final _transportCtrl = TextEditingController();
  final _otherCtrl = TextEditingController(text: "0");
  final _notesCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _job = widget.job;
    _loadJobDetails();
  }

  @override
  void dispose() {
    _disposed = true;
    if (_gpsSub != null) {
      // Leaving the page ends sharing so the customer never sees a stale pin.
      FlowGuardApiClient.stopLiveLocation().catchError((_) {});
    }
    _gpsSub?.cancel();
    _gyroSub?.cancel();
    _navPositionController.close();
    _labourCtrl.dispose();
    _materialsCtrl.dispose();
    _transportCtrl.dispose();
    _otherCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadJobDetails() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final client = SupabaseConfig.client;
      final reqRow = await client
          .from("service_requests")
          .select()
          .eq("id", _job.id)
          .maybeSingle();

      if (reqRow != null) {
        _job = ServiceRequestItem.fromJson(reqRow);
      }

      final histRows = await client
          .from("request_history")
          .select("action, created_at")
          .eq("request_id", _job.id)
          .order("created_at", ascending: true);
      _history = List<dynamic>.from(histRows);
      _tripState = _deriveTripState(_history);

      final quoteRows = await client
          .from("quotations")
          .select()
          .eq("ticket_number", _job.ticketNumber)
          .order("created_at", ascending: false)
          .limit(1);

      QuotationData? loadedQuote;
      if (quoteRows.isNotEmpty) {
        loadedQuote = QuotationData.fromJson(quoteRows.first);
      }

      final snap = await FlowGuardApiClient.fetchTrackingSnapshot(
        viewerRole: "plumber",
        ticket: _job.ticketNumber,
      );
      final plumbersList = snap?["plumbers"] as List?;
      final plumberMap = (plumbersList != null && plumbersList.isNotEmpty)
          ? plumbersList.first as Map<String, dynamic>
          : snap?["plumber"] as Map<String, dynamic>?;

      List<LatLng> routePts = _routePoints;
      if (_tripState == "on_the_way") {
        final routeData = await FlowGuardApiClient.fetchRoutePoints(
          ticket: _job.ticketNumber,
          viewerRole: "plumber",
          fromLat: _plumberLat,
          fromLng: _plumberLng,
        );
        if (routeData != null && routeData.points.isNotEmpty) {
          routePts = routeData.points
              .map((p) => LatLng(p["lat"]!, p["lng"]!))
              .toList();
        }
      }

      if (mounted) {
        setState(() {
          _quote = loadedQuote;
          _plumberLat = (plumberMap?["lat"] as num?)?.toDouble() ?? _plumberLat;
          _plumberLng = (plumberMap?["lng"] as num?)?.toDouble() ?? _plumberLng;
          _routePoints = routePts;
          _loading = false;
        });
      }

      if (_disposed || !mounted) return;
      if (_tripState == "on_the_way" && _job.isActive) {
        await _startGpsStream();
      } else {
        await _stopGpsStream(disableSharing: false);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = "Unable to load job details. Check your connection.";
        });
      }
    }
  }

  String _deriveTripState(List<dynamic> history) {
    for (int i = history.length - 1; i >= 0; i--) {
      final item = history[i];
      if (item is Map) {
        final action = (item["action"] ?? item["event"] ?? "").toString();
        if (action == "arrived") return "arrived";
        if (action == "trip_started") return "on_the_way";
        if (action == "trip_cancelled") return "idle";
      }
    }
    return "idle";
  }

  Future<bool> _ensureLocationPermission() async {
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      if (mounted) {
        setState(() {
          _gpsError = true;
          _gpsMessage = "Device GPS is turned off. Enable Location to track.";
        });
      }
      return false;
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) {
        setState(() {
          _gpsError = true;
          _gpsMessage = "Location permission denied. Grant access in Settings.";
        });
      }
      return false;
    }
    return true;
  }

  Future<void> _startGpsStream() async {
    final ok = await _ensureLocationPermission();
    if (!ok || _disposed || !mounted) return;

    await _gpsSub?.cancel();
    await _gyroSub?.cancel();
    _lastGyroAt = DateTime.now();
    _gyroSub = gyroscopeEventStream().listen(
      (event) {
        final now = DateTime.now();
        final dt = _lastGyroAt == null
            ? 0.0
            : now.difference(_lastGyroAt!).inMilliseconds / 1000.0;
        _lastGyroAt = now;
        if (_fusedHeading != null && dt > 0 && dt < 0.5) {
          final deltaDeg = -(event.z * (180.0 / math.pi)) * dt;
          _fusedHeading = (_fusedHeading! + deltaDeg + 360.0) % 360.0;
        }
      },
      onError: (_) {},
    );
    if (mounted) {
      setState(() {
        _gpsError = false;
        _gpsMessage = "Live GPS streaming to customer & dispatch";
      });
    }

    try {
      final initial = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      await _pushLocation(initial);
    } catch (_) {}

    if (_disposed || !mounted) return;
    _gpsSub = Geolocator.getPositionStream(
      locationSettings: AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5,
        // Foreground service keeps tracking alive when the screen locks.
        foregroundNotificationConfig: const ForegroundNotificationConfig(
          notificationTitle: "FlowGuard trip in progress",
          notificationText: "Sharing your live location with the customer",
          enableWakeLock: true,
        ),
      ),
    ).listen(
      (pos) => _pushLocation(pos),
      onError: (_) {
        if (mounted) {
          setState(() {
            _gpsError = true;
            _gpsMessage = "GPS signal lost — retrying automatically";
          });
        }
      },
    );
  }

  Future<void> _stopGpsStream({bool disableSharing = true}) async {
    await _gpsSub?.cancel();
    _gpsSub = null;
    await _gyroSub?.cancel();
    _gyroSub = null;
    if (disableSharing) {
      await FlowGuardApiClient.stopLiveLocation().catchError((_) {});
    }
    if (mounted) {
      setState(() {
        _gpsError = false;
        _gpsMessage = _tripState == "arrived"
            ? "Arrived — live trip tracking stopped"
            : "GPS standby";
      });
    }
  }

  Future<void> _pushLocation(Position pos) async {
    _lastPosition = pos;
    if (!_navPositionController.isClosed) {
      _navPositionController.add(pos);
    }
    if (pos.heading >= 0 && pos.speed > 0.8) {
      _fusedHeading = pos.heading;
    } else {
      _fusedHeading ??= (pos.heading >= 0 ? pos.heading : 0.0);
    }
    if (mounted) {
      setState(() {
        _plumberLat = pos.latitude;
        _plumberLng = pos.longitude;
        _gpsError = false;
        _gpsMessage =
            "Live GPS active (${pos.accuracy.round()}m accuracy)";
      });
    }
    final now = DateTime.now();
    if (_lastServerPushAt != null &&
        now.difference(_lastServerPushAt!) <
            const Duration(milliseconds: 2500)) {
      return;
    }
    _lastServerPushAt = now;
    try {
      await FlowGuardApiClient.pushLiveLocation(
        lat: pos.latitude,
        lng: pos.longitude,
        accuracy: pos.accuracy,
        heading: _fusedHeading,
        speed: pos.speed,
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _gpsError = true;
          _gpsMessage = "Offline — will resend on the next GPS update";
        });
      }
    }
  }

  Future<void> _performAction(String action, {List<String>? photos}) async {
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.performJobAction(
        ticketOrId: _job.ticketNumber,
        action: action,
        photos: photos,
      );
      await _loadJobDetails();
      widget.onUpdated();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Update failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openNavigationPage() async {
    if (_job.customerLat == null || _job.customerLng == null || !mounted) {
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NavigationPage(
          ticket: _job.ticketNumber,
          customerName: _job.customerName ?? "Customer",
          destinationLat: _job.customerLat!,
          destinationLng: _job.customerLng!,
          positionStream: _navPositionController.stream,
          initialPosition: _lastPosition,
          onArrived: _handleArrived,
        ),
      ),
    );
  }

  Future<void> _handleStartTrip() async {
    final ok = await _ensureLocationPermission();
    if (!ok) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(_gpsMessage)),
        );
      }
      return;
    }
    await _performAction("start_trip");
    if (mounted && _tripState == "on_the_way") {
      await _openNavigationPage();
    }
  }

  Future<void> _handleArrived() async {
    // Only stop tracking once the server has accepted "arrived".
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.performJobAction(
        ticketOrId: _job.ticketNumber,
        action: "arrived",
      );
      await _stopGpsStream(disableSharing: true);
      await _loadJobDetails();
      widget.onUpdated();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Update failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  double _parseNum(TextEditingController c) =>
      double.tryParse(c.text.trim().replaceAll(",", "")) ?? 0;

  double get _quoteTotal =>
      _parseNum(_labourCtrl) +
      _parseNum(_materialsCtrl) +
      _parseNum(_transportCtrl) +
      _parseNum(_otherCtrl);

  Future<void> _submitQuotation() async {
    if (_quoteTotal <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Enter at least one charge above ₦0.")),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.submitQuotation(
        ticketNumber: _job.ticketNumber,
        labourCharge: _parseNum(_labourCtrl),
        materialsCost: _parseNum(_materialsCtrl),
        transportCharge: _parseNum(_transportCtrl),
        otherCharges: _parseNum(_otherCtrl),
        notes: _notesCtrl.text.trim(),
      );
      await _loadJobDetails();
      widget.onUpdated();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Quotation submitted for customer & admin review."),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not submit quote: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadJobPhoto(ImageSource source) async {
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 78,
        maxWidth: 1400,
      );
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      final url = await FlowGuardApiClient.uploadRequestPhoto(
        bytes: bytes,
        filename: picked.name,
      );
      if (mounted) {
        setState(() => _uploadedPhotoNames.add(url));
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Uploaded ${picked.name}")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Photo upload failed: $e")),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final badge = StatusBadgeMeta.fromStatus(_job.status);
    final naira = NumberFormat("#,##0");

    return Scaffold(
      appBar: AppBar(
        title: Text(_job.ticketNumber),
        actions: [
          IconButton(
            tooltip: "Refresh job",
            onPressed: _loadJobDetails,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadJobDetails,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 36),
                children: [
                  if (_loadError != null) ...[
                    Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFEF2F2),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: const Color(0xFFFECACA)),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _loadError!,
                              style: const TextStyle(
                                color: Color(0xFF991B1B),
                                fontWeight: FontWeight.w600,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: _loadJobDetails,
                            child: const Text("Retry"),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  // Header Card
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: FlowGuardTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                _job.problemCategory,
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w800,
                                  color: FlowGuardTheme.navy,
                                ),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 5,
                              ),
                              decoration: BoxDecoration(
                                color: badge.background,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                badge.label,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: badge.foreground,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            const Icon(
                              Icons.person_outline,
                              size: 16,
                              color: FlowGuardTheme.mutedText,
                            ),
                            const SizedBox(width: 6),
                            Text(
                              _job.customerName ?? "Customer",
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            const SizedBox(width: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 2,
                              ),
                              decoration: BoxDecoration(
                                color: _job.priority == "urgent"
                                    ? const Color(0xFFFEE2E2)
                                    : const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _job.priority.toUpperCase(),
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: _job.priority == "urgent"
                                      ? const Color(0xFF991B1B)
                                      : FlowGuardTheme.mutedText,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(
                              Icons.location_on_outlined,
                              size: 16,
                              color: FlowGuardTheme.mutedText,
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                (_job.status == "completed" ||
                                        _job.status == "cancelled")
                                    ? "Customer location hidden after job completion for privacy."
                                    : _job.addressInKano,
                                style: const TextStyle(
                                  fontSize: 13,
                                  color: FlowGuardTheme.mutedText,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          _job.description,
                          style: const TextStyle(
                            fontSize: 13,
                            height: 1.45,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                        ..._job.photos
                            .where((p) => VoiceNoteBubblePlayer.isAudioUrl(p))
                            .map((v) => VoiceNoteBubblePlayer(rawUrl: v)),
                        if (_job.photos
                            .any((p) => !VoiceNoteBubblePlayer.isAudioUrl(p))) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            height: 82,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              itemCount: _job.photos
                                  .where(
                                    (p) => !VoiceNoteBubblePlayer.isAudioUrl(p),
                                  )
                                  .length,
                              separatorBuilder: (_, __) =>
                                  const SizedBox(width: 8),
                              itemBuilder: (_, idx) {
                                final imgs = _job.photos
                                    .where(
                                      (p) =>
                                          !VoiceNoteBubblePlayer.isAudioUrl(p),
                                    )
                                    .toList();
                                return ClipRRect(
                                  borderRadius: BorderRadius.circular(12),
                                  child: Image.network(
                                    FlowGuardApiClient.authenticatedFileUrl(
                                      imgs[idx],
                                    ),
                                    headers: FlowGuardApiClient.fileAuthHeaders(
                                      FlowGuardApiClient.authenticatedFileUrl(
                                        imgs[idx],
                                      ),
                                    ),
                                    width: 82,
                                    height: 82,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: 82,
                                      height: 82,
                                      color: const Color(0xFFF1F5F9),
                                      child: const Icon(Icons.image_outlined),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            if (_job.customerPhone != null &&
                                _job.customerPhone!.isNotEmpty)
                              Expanded(
                                child: OutlinedButton.icon(
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 10,
                                      vertical: 12,
                                    ),
                                  ),
                                  onPressed: () => launchUrl(
                                    Uri.parse("tel:${_job.customerPhone}"),
                                  ),
                                  icon: const Icon(Icons.phone_outlined, size: 18),
                                  label: const Text(
                                    "Call Customer",
                                    maxLines: 1,
                                    softWrap: false,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ),
                            if (_job.customerPhone != null &&
                                _job.customerPhone!.isNotEmpty)
                              const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 12,
                                  ),
                                ),
                                onPressed: () {
                                  Navigator.pop(context);
                                  widget.onOpenChat();
                                },
                                icon: const Icon(
                                  Icons.chat_bubble_outline,
                                  size: 18,
                                ),
                                label: const Text(
                                  "Chat",
                                  maxLines: 1,
                                  softWrap: false,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 14),

                  if (_job.status != "completed" &&
                      _job.status != "cancelled") ...[
                  // Embedded In-App Map & GPS Status
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: FlowGuardTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              "Property & Route Map",
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: _gpsError
                                    ? const Color(0xFFFEE2E2)
                                    : _tripState == "on_the_way"
                                        ? const Color(0xFFD1FAE5)
                                        : const Color(0xFFF1F5F9),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                _tripState == "on_the_way"
                                    ? "ON THE WAY"
                                    : _tripState == "arrived"
                                        ? "ARRIVED"
                                        : "STANDBY",
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: _gpsError
                                      ? const Color(0xFF991B1B)
                                      : _tripState == "on_the_way"
                                          ? const Color(0xFF065F46)
                                          : FlowGuardTheme.navy,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _gpsMessage,
                          style: TextStyle(
                            fontSize: 12,
                            color: _gpsError
                                ? const Color(0xFFB91C1C)
                                : FlowGuardTheme.mutedText,
                          ),
                        ),
                        const SizedBox(height: 10),
                        FlowGuardGoogleMap(
                          customerLat: _job.customerLat,
                          customerLng: _job.customerLng,
                          plumberLat: _plumberLat,
                          plumberLng: _plumberLng,
                          plumberLabel: widget.plumberName,
                          routePoints: _routePoints,
                          height: 240,
                          allowFullscreen: true,
                          followMe: _tripState == "on_the_way",
                          enable3D: _tripState == "on_the_way",
                        ),
                        if (_tripState == "on_the_way" &&
                            _job.customerLat != null &&
                            _job.customerLng != null) ...[
                          const SizedBox(height: 10),
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: _openNavigationPage,
                              icon: const Icon(Icons.navigation_rounded, size: 18),
                              label: const Text(
                                "Resume navigation",
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: FlowGuardTheme.navy,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  ],

                  const SizedBox(height: 16),

                  // Contextual Next Action Section
                  _buildDynamicWorkflowCard(naira),
                ],
              ),
            ),
    );
  }

  Widget _buildDynamicWorkflowCard(NumberFormat naira) {
    if (_job.status == "completed" || _job.status == "cancelled") {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFECFDF5),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: const Color(0xFFA7F3D0)),
        ),
        child: Row(
          children: [
            const Icon(Icons.verified_rounded, color: Color(0xFF059669)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                _job.status == "completed"
                    ? "Job closed and verified. Earnings reflected in your Earnings tab."
                    : "This service request was cancelled.",
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF065F46),
                ),
              ),
            ),
          ],
        ),
      );
    }

    if (_job.status == "new" ||
        _job.status == "pending" ||
        _job.status == "contacted") {
      return _actionCard(
        title: "New Job Assignment",
        subtitle:
            "Review the customer's address and issue above, then accept to schedule.",
        buttonLabel: "Accept Assignment",
        onPressed: _busy ? null : () => _performAction("accept"),
      );
    }

    if ((_job.status == "scheduled" ||
            _job.status == "inspection_required") &&
        _tripState == "idle") {
      return _actionCard(
        title: "Ready to Travel",
        subtitle:
            "Start your trip to share live GPS tracking with the customer until arrival.",
        buttonLabel: "Start Trip",
        onPressed: _busy ? null : _handleStartTrip,
      );
    }

    if (_tripState == "on_the_way") {
      return _actionCard(
        title: "En Route to Property",
        subtitle:
            "Your live location is visible to the customer. Tap below once you arrive on site.",
        buttonLabel: "Arrived at Property",
        onPressed: _busy ? null : _handleArrived,
      );
    }

    if ((_tripState == "arrived" ||
            _job.status == "scheduled" ||
            _job.status == "inspection_required" ||
            _job.status == "quotation_submitted") &&
        (_quote == null || _quote!.approvalStatus == "rejected")) {
      return _buildQuotationBuilder(naira);
    }

    if ((_job.status == "quoted" ||
            _job.status == "awaiting_approval" ||
            _job.status == "quotation_submitted") &&
        _quote != null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: FlowGuardTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Quotation Submitted",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              "Total: ₦${naira.format(_quote!.totalAmount)} • Approval: ${_quote!.approvalStatus.toUpperCase()}",
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              "Waiting for customer approval before starting repair work.",
              style: TextStyle(fontSize: 12, color: FlowGuardTheme.mutedText),
            ),
            if (_quote!.approvalStatus == "approved") ...[
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _busy ? null : () => _performAction("start_work"),
                  child: const Text("Start Work", maxLines: 1),
                ),
              ),
            ],
          ],
        ),
      );
    }

    if (_job.status == "approved") {
      return _actionCard(
        title: "Quotation Approved",
        subtitle:
            "Customer approved the quotation. Begin the plumbing repair now.",
        buttonLabel: "Start Work",
        onPressed: _busy ? null : () => _performAction("start_work"),
      );
    }

    if (_job.status == "in_progress") {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: FlowGuardTheme.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "Work in Progress",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              "Upload before/after photos of the completed repair, then mark work complete.",
              style: TextStyle(fontSize: 12, color: FlowGuardTheme.mutedText),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _uploadJobPhoto(ImageSource.camera),
                    icon: const Icon(Icons.camera_alt_outlined, size: 18),
                    label: const Text("Camera"),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy
                        ? null
                        : () => _uploadJobPhoto(ImageSource.gallery),
                    icon: const Icon(Icons.photo_library_outlined, size: 18),
                    label: const Text("Gallery"),
                  ),
                ),
              ],
            ),
            if (_uploadedPhotoNames.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                "${_uploadedPhotoNames.length} photo(s) uploaded",
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF059669),
                ),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _busy
                    ? null
                    : () {
                        if (_uploadedPhotoNames.isEmpty) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                "Upload at least one work photo before marking complete.",
                              ),
                            ),
                          );
                          return;
                        }
                        _performAction(
                          "complete_work",
                          photos: _uploadedPhotoNames,
                        );
                      },
                child: const Text("Mark Work Complete", maxLines: 1),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: FlowGuardTheme.border),
      ),
      child: const Text(
        "Work marked complete. Awaiting payment verification and final closure.",
        style: TextStyle(
          fontWeight: FontWeight.w700,
          color: FlowGuardTheme.navy,
        ),
      ),
    );
  }

  Widget _actionCard({
    required String title,
    required String subtitle,
    required String buttonLabel,
    required VoidCallback? onPressed,
  }) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: FlowGuardTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: FlowGuardTheme.navy,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: const TextStyle(fontSize: 12, color: FlowGuardTheme.mutedText),
          ),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: onPressed,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(
                    buttonLabel,
                    maxLines: 1,
                    softWrap: false,
                    overflow: TextOverflow.ellipsis,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuotationBuilder(NumberFormat naira) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: FlowGuardTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            "Prepare Itemised Quotation (₦)",
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: FlowGuardTheme.navy,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Inspect the property and enter transparent labour and materials costs.",
            style: TextStyle(fontSize: 12, color: FlowGuardTheme.mutedText),
          ),
          const SizedBox(height: 12),
          _numField("Labour Charge (₦)", _labourCtrl),
          const SizedBox(height: 10),
          _numField("Materials Cost (₦)", _materialsCtrl),
          const SizedBox(height: 10),
          _numField("Transport Charge (₦)", _transportCtrl),
          const SizedBox(height: 10),
          _numField("Other Charges (₦)", _otherCtrl),
          const SizedBox(height: 10),
          TextField(
            controller: _notesCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: "Inspection Notes / Parts Breakdown",
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: FlowGuardTheme.surface,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "Quotation Total",
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                Text(
                  "₦${naira.format(_quoteTotal)}",
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: FlowGuardTheme.navy,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          ElevatedButton(
            onPressed: _busy ? null : _submitQuotation,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text("Submit Quotation"),
          ),
        ],
      ),
    );
  }

  Widget _numField(String label, TextEditingController controller) {
    return TextField(
      controller: controller,
      keyboardType: TextInputType.number,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(labelText: label),
    );
  }
}
