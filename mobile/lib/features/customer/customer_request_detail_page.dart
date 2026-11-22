import "dart:async";
import "dart:math" as math;
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:image_picker/image_picker.dart";
import "package:intl/intl.dart";
import "package:latlong2/latlong.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
import "package:flowguard_plumbing/features/shared/voice_note_widgets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class CustomerRequestDetailPage extends StatefulWidget {
  final ServiceRequestItem request;
  final BankDetailsData? bankDetails;
  final VoidCallback onUpdated;
  final VoidCallback onOpenChat;

  const CustomerRequestDetailPage({
    super.key,
    required this.request,
    this.bankDetails,
    required this.onUpdated,
    required this.onOpenChat,
  });

  @override
  State<CustomerRequestDetailPage> createState() =>
      _CustomerRequestDetailPageState();
}

class _CustomerRequestDetailPageState extends State<CustomerRequestDetailPage>
    with SingleTickerProviderStateMixin {
  late ServiceRequestItem _request;
  QuotationData? _quote;
  bool _loadingQuote = true;
  bool _busy = false;
  double? _plumberLat;
  double? _plumberLng;
  double? _fromPlumberLat;
  double? _fromPlumberLng;
  double? _toPlumberLat;
  double? _toPlumberLng;
  late final AnimationController _markerAnimCtrl;
  String? _plumberPhone;
  List<LatLng> _routePoints = [];
  DateTime? _lastRouteFetchAt;
  double? _etaSeconds;
  double? _etaDistanceM;
  String _trackingStateLabel = "Property pinned";
  bool _tripLive = false;
  int _reviewRating = 5;
  final _reviewController = TextEditingController();
  bool _reviewSubmitted = false;
  bool _paymentSubmitted = false;
  String? _paymentStatus;
  Timer? _pollTimer;
  Timer? _snapshotTimer;
  RealtimeChannel? _trackingRtChannel;
  String? _subscribedPlumberId;

  static const List<String> _stages = [
    "Received",
    "Assigned",
    "On Way",
    "Quote",
    "In Work",
    "Done",
  ];

  @override
  void initState() {
    super.initState();
    _request = widget.request;
    _markerAnimCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..addListener(() {
        if (!mounted) return;
        if (_fromPlumberLat == null ||
            _fromPlumberLng == null ||
            _toPlumberLat == null ||
            _toPlumberLng == null) {
          return;
        }
        final t = Curves.easeInOut.transform(_markerAnimCtrl.value);
        setState(() {
          _plumberLat =
              _fromPlumberLat! + (_toPlumberLat! - _fromPlumberLat!) * t;
          _plumberLng =
              _fromPlumberLng! + (_toPlumberLng! - _fromPlumberLng!) * t;
        });
      });
    _loadDetails();
    if (_request.isActive) {
      _pollTimer = Timer.periodic(
        const Duration(seconds: 12),
        (_) => _loadDetails(),
      );
      _snapshotTimer = Timer.periodic(
        const Duration(seconds: 4),
        (_) {
          if (_request.isActive && _tripLive) {
            _refreshTracking();
          }
        },
      );
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _snapshotTimer?.cancel();
    _markerAnimCtrl.dispose();
    _trackingRtChannel?.unsubscribe();
    _reviewController.dispose();
    super.dispose();
  }

  void _animatePlumberTo(double lat, double lng) {
    if (_plumberLat == null || _plumberLng == null) {
      setState(() {
        _plumberLat = lat;
        _plumberLng = lng;
        _fromPlumberLat = lat;
        _fromPlumberLng = lng;
        _toPlumberLat = lat;
        _toPlumberLng = lng;
      });
      return;
    }
    if ((_plumberLat! - lat).abs() < 1e-7 &&
        (_plumberLng! - lng).abs() < 1e-7) {
      return;
    }
    _fromPlumberLat = _plumberLat;
    _fromPlumberLng = _plumberLng;
    _toPlumberLat = lat;
    _toPlumberLng = lng;
    _markerAnimCtrl.forward(from: 0.0);
  }

  void _ensureTrackingRealtime(String? plumberId) {
    if (plumberId == null ||
        plumberId.isEmpty ||
        !_request.isActive ||
        _subscribedPlumberId == plumberId) {
      return;
    }
    _subscribedPlumberId = plumberId;
    _trackingRtChannel?.unsubscribe();
    try {
      _trackingRtChannel = SupabaseConfig.client
          .channel("cust-track-$plumberId")
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: "public",
            table: "plumber_locations",
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: "plumber_id",
              value: plumberId,
            ),
            callback: (payload) {
              if (!mounted) return;
              final rec = payload.newRecord;
              final lat = (rec["lat"] as num?)?.toDouble();
              final lng = (rec["lng"] as num?)?.toDouble();
              final active = rec["is_sharing"] == true;
              if (active && lat != null && lng != null) {
                _animatePlumberTo(lat, lng);
                setState(() {
                  _tripLive = true;
                  _trackingStateLabel = "Technician live on map";
                });
              } else if (!active) {
                setState(() {
                  _tripLive = false;
                });
              }
            },
          )
          .subscribe();
    } catch (_) {}
  }

  Future<void> _loadDetails() async {
    await Future.wait([
      _refreshRequestRow(),
      _loadQuote(),
      _refreshTracking(),
      _loadExistingPayment(),
    ]);
  }

  Future<void> _loadExistingPayment() async {
    try {
      final rows = await SupabaseConfig.client
          .from("payments")
          .select("id, verification_status")
          .eq("ticket_number", _request.ticketNumber)
          .limit(1);
      if (rows.isNotEmpty && mounted) {
        setState(() {
          _paymentSubmitted = true;
          _paymentStatus =
              rows.first["verification_status"]?.toString() ?? "submitted";
        });
      }
    } catch (_) {}
  }

  Future<void> _refreshRequestRow() async {
    try {
      final row = await SupabaseConfig.client
          .from("service_requests")
          .select()
          .eq("id", _request.id)
          .maybeSingle();
      if (row != null && mounted) {
        setState(() {
          _request = ServiceRequestItem.fromJson(row);
          if (!_request.isActive) {
            _tripLive = false;
            _plumberLat = null;
            _plumberLng = null;
            _routePoints = const [];
            _etaSeconds = null;
            _etaDistanceM = null;
          }
        });
        if (!_request.isActive) {
          _pollTimer?.cancel();
          _snapshotTimer?.cancel();
          _trackingRtChannel?.unsubscribe();
          _trackingRtChannel = null;
        }
      }
    } catch (_) {}
  }

  Future<void> _loadQuote() async {
    try {
      final rows = await SupabaseConfig.client
          .from("quotations")
          .select()
          .eq("ticket_number", _request.ticketNumber)
          .order("created_at", ascending: false)
          .limit(1);
      if (mounted) {
        setState(() {
          _quote = rows.isNotEmpty ? QuotationData.fromJson(rows.first) : null;
          _loadingQuote = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _refreshTracking() async {
    if (!_request.isActive) return;
    try {
      final snap = await FlowGuardApiClient.fetchTrackingSnapshot(
        viewerRole: "customer",
        ticket: _request.ticketNumber,
      );
      if (snap == null || !mounted) return;
      final jobs = snap["jobs"] as List?;
      if (jobs == null || jobs.isEmpty) return;
      final job = jobs.first as Map<String, dynamic>;
      final plumber = job["plumber"] as Map<String, dynamic>?;
      final plumberId = plumber?["id"]?.toString();
      _ensureTrackingRealtime(plumberId);
      final tripState = (job["tripState"] ?? "idle").toString();
      final pLat = (plumber?["lat"] as num?)?.toDouble();
      final pLng = (plumber?["lng"] as num?)?.toDouble();
      final isLive =
          (tripState == "on_the_way" || tripState == "arrived") &&
              pLat != null &&
              pLng != null;

      List<LatLng> routePts = _routePoints;
      double? etaS = _etaSeconds;
      double? etaM = _etaDistanceM;
      final shouldRefreshRoute = isLive &&
          (_lastRouteFetchAt == null ||
              DateTime.now().difference(_lastRouteFetchAt!) >=
                  const Duration(seconds: 30));
      if (shouldRefreshRoute) {
        _lastRouteFetchAt = DateTime.now();
        final routeData = await FlowGuardApiClient.fetchRoutePoints(
          ticket: _request.ticketNumber,
          viewerRole: "customer",
        );
        if (routeData != null && routeData.points.isNotEmpty) {
          routePts = routeData.points
              .map((p) => LatLng(p["lat"]!, p["lng"]!))
              .toList();
          etaS = routeData.durationS;
          etaM = routeData.distanceM;
        }
      }

      if (mounted) {
        if (isLive) {
          _animatePlumberTo(pLat, pLng);
        }
        setState(() {
          _tripLive = isLive;
          if (!isLive) {
            _plumberLat = null;
            _plumberLng = null;
          }
          _routePoints = routePts;
          _etaSeconds = etaS;
          _etaDistanceM = etaM;
          _plumberPhone = job["plumberPhone"]?.toString() ??
              plumber?["phone"]?.toString();
          _trackingStateLabel = tripState == "arrived"
              ? "Technician has arrived at property"
              : isLive
                  ? (plumber?["statusLabel"]?.toString() ??
                      "Technician en route")
                  : (_request.assignedTechnician != null
                      ? "Technician assigned — trip not started yet"
                      : "Awaiting technician assignment");
        });
      }
    } catch (_) {}
  }

  int _currentStageIndex() {
    switch (_request.status) {
      case "completed":
        return 5;
      case "in_progress":
      case "work_completed":
      case "awaiting_final_payment":
        return 4;
      case "quoted":
      case "awaiting_approval":
      case "quotation_submitted":
      case "approved":
        return 3;
      case "scheduled":
      case "contacted":
      case "inspection_required":
        return _tripLive ? 2 : 1;
      default:
        return _request.assignedTechnician != null ? 1 : 0;
    }
  }

  Future<void> _decideQuote(String decision) async {
    if (_quote == null || _busy) return;
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.decideQuotation(
        quotationId: _quote!.id,
        decision: decision,
      );
      await _loadDetails();
      widget.onUpdated();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not update quote: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancelRequest() async {
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.cancelServiceRequest(
        ticketNumber: _request.ticketNumber,
      );
      await _refreshRequestRow();
      widget.onUpdated();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Request has been cancelled.")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Cancel failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadReceipt(ImageSource source) async {
    if (_paymentSubmitted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Payment proof has already been submitted for this ticket."),
        ),
      );
      return;
    }
    final picker = ImagePicker();
    final file = await picker.pickImage(source: source, imageQuality: 80);
    if (file == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final bytes = await file.readAsBytes();
      final url = await FlowGuardApiClient.uploadRequestPhoto(
        bytes: bytes,
        filename: file.name,
      );
      await FlowGuardApiClient.recordPayment(
        ticketNumber: _request.ticketNumber,
        amount: _quote?.totalAmount,
        proofUrl: url,
      );
      if (mounted) {
        setState(() {
          _paymentSubmitted = true;
          _paymentStatus = "pending";
        });
      }
      widget.onUpdated();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Proof of payment uploaded for admin verification."),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Receipt upload failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submitReview() async {
    if (_busy || _reviewSubmitted) return;
    setState(() => _busy = true);
    try {
      await FlowGuardApiClient.submitReview(
        ticketNumber: _request.ticketNumber,
        rating: _reviewRating,
        comment: _reviewController.text.trim(),
        serviceCategory: _request.problemCategory,
      );
      if (mounted) {
        setState(() => _reviewSubmitted = true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not submit review: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isCancelled = _request.status == "cancelled";
    final badge = StatusBadgeMeta.fromStatus(_request.status);
    final activeStage = _currentStageIndex();
    final mapHeight = MediaQuery.of(context).size.height * 0.50;
    final naira = NumberFormat.currency(
      locale: "en_NG",
      symbol: "₦",
      decimalDigits: 0,
    );
    final showPaymentCard = !isCancelled &&
        (_request.status == "awaiting_final_payment" ||
            _request.status == "work_completed");
    final canCancel = [
      "new",
      "pending",
      "contacted",
      "inspection_required",
    ].contains(_request.status);

    final voiceNotes = _request.photos
        .where((p) => VoiceNoteBubblePlayer.isAudioUrl(p))
        .toList();
    final imagePhotos = _request.photos
        .where((p) => !VoiceNoteBubblePlayer.isAudioUrl(p))
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(
          _request.ticketNumber,
          style: const TextStyle(
            fontWeight: FontWeight.w800,
            color: FlowGuardTheme.navy,
          ),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
      body: RefreshIndicator(
        onRefresh: _loadDetails,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            // 1. Cancelled Banner OR 6-Stage Progress Stepper
            if (isCancelled)
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: const Color(0xFFFECACA)),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.cancel_outlined, color: Color(0xFFDC2626)),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        "This plumbing request was cancelled and is not in any active workflow stage.",
                        style: TextStyle(
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF991B1B),
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: List.generate(_stages.length, (idx) {
                    final done = idx <= activeStage;
                    return Expanded(
                      child: Column(
                        children: [
                          CircleAvatar(
                            radius: 11,
                            backgroundColor: done
                                ? FlowGuardTheme.navy
                                : const Color(0xFFE2E8F0),
                            child: Icon(
                              done ? Icons.check : Icons.circle,
                              size: 11,
                              color: done
                                  ? FlowGuardTheme.gold
                                  : FlowGuardTheme.mutedText,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _stages[idx],
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight:
                                  done ? FontWeight.w800 : FontWeight.w500,
                              color: done
                                  ? FlowGuardTheme.navy
                                  : FlowGuardTheme.mutedText,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
            const SizedBox(height: 14),

            // 2. Embedded Map (~50% height while active)
            if (!isCancelled && _request.isActive) ...[
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: const BoxDecoration(
                  color: FlowGuardTheme.navy,
                  borderRadius:
                      BorderRadius.vertical(top: Radius.circular(18)),
                ),
                child: Row(
                  children: [
                    Icon(
                      _tripLive
                          ? Icons.gps_fixed_rounded
                          : Icons.place_outlined,
                      size: 16,
                      color: FlowGuardTheme.gold,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _trackingStateLabel,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    if (_tripLive &&
                        _etaSeconds != null &&
                        _etaSeconds! > 0) ...[
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: FlowGuardTheme.gold,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _etaDistanceM != null && _etaDistanceM! > 0
                              ? "ETA ${math.max(1, (_etaSeconds! / 60).round())} min • ${(_etaDistanceM! / 1000).toStringAsFixed(1)} km"
                              : "ETA ${math.max(1, (_etaSeconds! / 60).round())} min",
                          style: const TextStyle(
                            color: FlowGuardTheme.navy,
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              FlowGuardGoogleMap(
                customerLat: _request.customerLat,
                customerLng: _request.customerLng,
                plumberLat: _plumberLat,
                plumberLng: _plumberLng,
                plumberLabel: _request.assignedTechnician,
                routePoints: _routePoints,
                height: mapHeight,
                allowFullscreen: true,
              ),
              const SizedBox(height: 14),
            ],

            // 3. Assigned Technician + Call & Chat Actions
            if (_request.assignedTechnician != null &&
                _request.assignedTechnician!.isNotEmpty &&
                !isCancelled)
              Container(
                padding: const EdgeInsets.all(14),
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: FlowGuardTheme.navy,
                      child: Icon(
                        Icons.engineering_outlined,
                        color: FlowGuardTheme.gold,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _request.assignedTechnician!,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                          const Text(
                            "Assigned FlowGuard Technician",
                            style: TextStyle(
                              fontSize: 12,
                              color: FlowGuardTheme.mutedText,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (_plumberPhone != null && _plumberPhone!.isNotEmpty)
                      IconButton(
                        tooltip: "Call Technician",
                        onPressed: () =>
                            launchUrl(Uri.parse("tel:$_plumberPhone")),
                        icon: const Icon(
                          Icons.phone_outlined,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                    OutlinedButton.icon(
                      onPressed: () {
                        Navigator.pop(context);
                        widget.onOpenChat();
                      },
                      icon: const Icon(Icons.chat_bubble_outline, size: 16),
                      label: const Text("Chat", maxLines: 1),
                    ),
                  ],
                ),
              ),

            // 4. Request Summary & Voice Note / Photos
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: FlowGuardTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "${_request.problemCategory} • ${_request.propertyType}",
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      fontSize: 15,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _request.addressInKano,
                    style: const TextStyle(fontSize: 13),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    _request.description,
                    style: const TextStyle(
                      fontSize: 13,
                      color: FlowGuardTheme.mutedText,
                    ),
                  ),
                  if (voiceNotes.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    ...voiceNotes.map((v) => VoiceNoteBubblePlayer(rawUrl: v)),
                  ],
                  if (imagePhotos.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      height: 86,
                      child: ListView.separated(
                        scrollDirection: Axis.horizontal,
                        itemCount: imagePhotos.length,
                        separatorBuilder: (_, __) => const SizedBox(width: 8),
                        itemBuilder: (_, i) => ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Image.network(
                            FlowGuardApiClient.authenticatedFileUrl(
                              imagePhotos[i],
                            ),
                            headers: FlowGuardApiClient.fileAuthHeaders(
                              FlowGuardApiClient.authenticatedFileUrl(
                                imagePhotos[i],
                              ),
                            ),
                            width: 86,
                            height: 86,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              width: 86,
                              height: 86,
                              color: const Color(0xFFF1F5F9),
                              child: const Icon(Icons.image_outlined),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ],
                  if (canCancel) ...[
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFFDC2626),
                        ),
                        onPressed: _busy ? null : _cancelRequest,
                        icon: const Icon(Icons.cancel_outlined, size: 18),
                        label: const Text("Cancel Request", maxLines: 1),
                      ),
                    ),
                  ],
                ],
              ),
            ),

            // 5. Itemised Quotation Card
            if (!_loadingQuote && _quote != null && !isCancelled) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Itemised Quotation",
                          style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 3,
                          ),
                          decoration: BoxDecoration(
                            color: _quote!.approvalStatus == "approved"
                                ? const Color(0xFFD1FAE5)
                                : _quote!.approvalStatus == "rejected"
                                    ? const Color(0xFFFEE2E2)
                                    : const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _quote!.approvalStatus == "approved"
                                ? "Approved"
                                : _quote!.approvalStatus == "rejected"
                                    ? "Declined"
                                    : "Pending",
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: _quote!.approvalStatus == "approved"
                                  ? const Color(0xFF065F46)
                                  : _quote!.approvalStatus == "rejected"
                                      ? const Color(0xFF991B1B)
                                      : const Color(0xFF92400E),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    _costRow("Labour Charge", naira.format(_quote!.labourCharge)),
                    const SizedBox(height: 4),
                    _costRow(
                      "Materials Cost",
                      naira.format(_quote!.materialsCost),
                    ),
                    if (_quote!.transportCharge > 0) ...[
                      const SizedBox(height: 4),
                      _costRow(
                        "Transport",
                        naira.format(_quote!.transportCharge),
                      ),
                    ],
                    if (_quote!.otherCharges > 0) ...[
                      const SizedBox(height: 4),
                      _costRow(
                        "Other Charges",
                        naira.format(_quote!.otherCharges),
                      ),
                    ],
                    const Divider(height: 18),
                    _costRow(
                      "Total Amount",
                      naira.format(_quote!.totalAmount),
                      bold: true,
                    ),
                    if (_quote!.notes != null &&
                        _quote!.notes!.trim().isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        "Notes: ${_quote!.notes}",
                        style: const TextStyle(
                          fontSize: 12,
                          color: FlowGuardTheme.mutedText,
                        ),
                      ),
                    ],
                    if (_quote!.approvalStatus == "pending") ...[
                      const SizedBox(height: 14),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 12,
                                ),
                              ),
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("rejected"),
                              child: const Text(
                                "Decline",
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 12,
                                ),
                              ),
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("approved"),
                              child: const Text(
                                "Approve Quote",
                                maxLines: 1,
                                softWrap: false,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // 6. Bank Transfer Details & Confirmed-Only Receipt
            if (showPaymentCard && widget.bankDetails?.isConfigured == true) ...[
              const SizedBox(height: 14),
              Builder(
                builder: (context) {
                  final isPaid =
                      _paymentStatus == "verified" || _paymentStatus == "confirmed";
                  return Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(color: FlowGuardTheme.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text(
                              "Bank Transfer Details",
                              style: TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 15,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            if (isPaid)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFD1FAE5),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
                                  "Paid",
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                    color: Color(0xFF065F46),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        _transferInfoRow("Bank", widget.bankDetails!.bankName),
                        _transferInfoRow(
                          "Account Name",
                          widget.bankDetails!.accountName,
                        ),
                        _transferCopyRow(
                          "Account Number",
                          widget.bankDetails!.accountNumber,
                          "Account number copied",
                        ),
                        if (_quote != null && _quote!.totalAmount > 0)
                          _transferCopyRow(
                            "Amount",
                            "₦${naira.format(_quote!.totalAmount)}",
                            "Amount copied",
                            copyValue: _quote!.totalAmount.round().toString(),
                          ),
                        _transferCopyRow(
                          "Reference",
                          _request.ticketNumber,
                          "Reference copied",
                        ),
                        const SizedBox(height: 10),
                        if (_paymentSubmitted && isPaid) ...[
                          SizedBox(
                            width: double.infinity,
                            child: ElevatedButton.icon(
                              onPressed: () => _showOfficialReceipt(naira),
                              icon: const Icon(Icons.receipt_long_rounded, size: 18),
                              label: const Text(
                                "Official Receipt",
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
                        ] else if (_paymentSubmitted)
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: const Color(0xFFECFDF5),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: const Color(0xFFA7F3D0)),
                            ),
                            child: const Text(
                              "Payment receipt submitted. Official receipt unlocks once confirmed.",
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF065F46),
                              ),
                            ),
                          )
                        else
                          Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            style: OutlinedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 12,
                              ),
                            ),
                            onPressed: () => _uploadReceipt(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt_outlined, size: 17),
                            label: const Text(
                              "Snap Receipt",
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            style: ElevatedButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 12,
                              ),
                            ),
                            onPressed: () =>
                                _uploadReceipt(ImageSource.gallery),
                            icon: const Icon(Icons.upload_file_outlined, size: 17),
                            label: const Text(
                              "Upload Receipt",
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
                  );
                },
              ),
            ],

            // 7. Rating & Verified Review after Job Completion
            if (_request.status == "completed" && !_reviewSubmitted) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      "Rate Completed Plumbing Work",
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: List.generate(5, (idx) {
                        final star = idx + 1;
                        return IconButton(
                          onPressed: () => setState(() => _reviewRating = star),
                          icon: Icon(
                            star <= _reviewRating
                                ? Icons.star_rounded
                                : Icons.star_border_rounded,
                            color: FlowGuardTheme.gold,
                            size: 32,
                          ),
                        );
                      }),
                    ),
                    TextField(
                      controller: _reviewController,
                      maxLines: 2,
                      decoration: const InputDecoration(
                        labelText: "Share your experience",
                      ),
                    ),
                    const SizedBox(height: 10),
                    ElevatedButton(
                      onPressed: _busy ? null : _submitReview,
                      child: const Text("Submit Verified Review", maxLines: 1),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _costRow(String label, String value, {bool bold = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
            color: bold ? FlowGuardTheme.navy : FlowGuardTheme.mutedText,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
            color: FlowGuardTheme.navy,
          ),
        ),
      ],
    );
  }

  Widget _transferInfoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: FlowGuardTheme.mutedText,
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: FlowGuardTheme.navy,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _transferCopyRow(
    String label,
    String displayValue,
    String snackMsg, {
    String? copyValue,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: FlowGuardTheme.mutedText,
            ),
          ),
          const SizedBox(width: 8),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                displayValue,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              const SizedBox(width: 6),
              OutlinedButton.icon(
                onPressed: () {
                  Clipboard.setData(
                    ClipboardData(text: copyValue ?? displayValue),
                  );
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(snackMsg)),
                  );
                },
                icon: const Icon(Icons.copy, size: 13),
                label: const Text(
                  "Copy",
                  maxLines: 1,
                  softWrap: false,
                ),
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  minimumSize: const Size(0, 28),
                  textStyle: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  void _showOfficialReceipt(NumberFormat naira) {
    final isPaid =
        _paymentStatus == "verified" || _paymentStatus == "confirmed";
    if (!isPaid) return;
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "FlowGuard Plumbing",
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      "OFFICIAL RECEIPT",
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                    Text(
                      "#${_request.ticketNumber}",
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const Divider(height: 22),
            if (_quote != null) ...[
              _costRow("Materials", naira.format(_quote!.materialsCost)),
              const SizedBox(height: 6),
              _costRow("Labour", naira.format(_quote!.labourCharge)),
              if (_quote!.transportCharge > 0) ...[
                const SizedBox(height: 6),
                _costRow("Transport", naira.format(_quote!.transportCharge)),
              ],
              if (_quote!.otherCharges > 0) ...[
                const SizedBox(height: 6),
                _costRow("Other", naira.format(_quote!.otherCharges)),
              ],
              const Divider(height: 18),
              _costRow(
                "Total Paid",
                naira.format(_quote!.totalAmount),
                bold: true,
              ),
            ],
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFD1FAE5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Text(
                "Status: Paid (Confirmed by FlowGuard)",
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF065F46),
                ),
              ),
            ),
            const SizedBox(height: 14),
            ElevatedButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text(
                "Close",
                maxLines: 1,
                softWrap: false,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
