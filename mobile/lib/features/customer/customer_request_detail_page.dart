import "dart:async";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:image_picker/image_picker.dart";
import "package:intl/intl.dart";
import "package:latlong2/latlong.dart";
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

class _CustomerRequestDetailPageState extends State<CustomerRequestDetailPage> {
  late ServiceRequestItem _request;
  QuotationData? _quote;
  bool _loadingQuote = true;
  bool _busy = false;
  double? _plumberLat;
  double? _plumberLng;
  String? _plumberPhone;
  List<LatLng> _routePoints = [];
  String _trackingStateLabel = "Property pinned";
  bool _tripLive = false;
  int _reviewRating = 5;
  final _reviewController = TextEditingController();
  bool _reviewSubmitted = false;
  Timer? _pollTimer;

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
    _loadDetails();
    if (_request.isActive) {
      _pollTimer = Timer.periodic(
        const Duration(seconds: 10),
        (_) => _loadDetails(),
      );
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _reviewController.dispose();
    super.dispose();
  }

  Future<void> _loadDetails() async {
    await Future.wait([_refreshRequestRow(), _loadQuote(), _refreshTracking()]);
  }

  Future<void> _refreshRequestRow() async {
    try {
      final row = await SupabaseConfig.client
          .from("service_requests")
          .select()
          .eq("id", _request.id)
          .maybeSingle();
      if (row != null && mounted) {
        setState(() => _request = ServiceRequestItem.fromJson(row));
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
    if (_request.status == "cancelled") return;
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
      final tripState = (job["tripState"] ?? "idle").toString();
      final pLat = (plumber?["lat"] as num?)?.toDouble();
      final pLng = (plumber?["lng"] as num?)?.toDouble();
      final isLive =
          (tripState == "on_the_way" || tripState == "arrived") &&
              pLat != null &&
              pLng != null;

      List<LatLng> routePts = _routePoints;
      if (isLive) {
        final rawPts = await FlowGuardApiClient.fetchRoutePoints(
          ticket: _request.ticketNumber,
          viewerRole: "customer",
        );
        if (rawPts.isNotEmpty) {
          routePts =
              rawPts.map((p) => LatLng(p["lat"]!, p["lng"]!)).toList();
        }
      }

      if (mounted) {
        setState(() {
          _tripLive = isLive;
          _plumberLat = isLive ? pLat : null;
          _plumberLng = isLive ? pLng : null;
          _routePoints = routePts;
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
            _request.status == "work_completed" ||
            _quote?.approvalStatus == "approved");
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

            // 2. Embedded Map (~50% height when not cancelled)
            if (!isCancelled) ...[
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
                        Text(
                          _quote!.approvalStatus.toUpperCase(),
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: FlowGuardTheme.navy,
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
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("rejected"),
                              child: const Text("Decline", maxLines: 1),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("approved"),
                              child: const Text("Approve Quote", maxLines: 1),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],

            // 6. Official Bank Transfer & Receipt Upload
            if (showPaymentCard && widget.bankDetails?.isConfigured == true) ...[
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
                    const Text(
                      "Official Bank Transfer",
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text("Bank: ${widget.bankDetails!.bankName}"),
                    Text("Account Name: ${widget.bankDetails!.accountName}"),
                    Row(
                      children: [
                        Text(
                          "Account No: ${widget.bankDetails!.accountNumber}",
                          style: const TextStyle(fontWeight: FontWeight.w800),
                        ),
                        IconButton(
                          onPressed: () {
                            Clipboard.setData(
                              ClipboardData(
                                text: widget.bankDetails!.accountNumber,
                              ),
                            );
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text("Account number copied"),
                              ),
                            );
                          },
                          icon: const Icon(Icons.copy, size: 18),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton.icon(
                            onPressed: () => _uploadReceipt(ImageSource.camera),
                            icon: const Icon(Icons.camera_alt_outlined),
                            label: const Text("Snap Receipt", maxLines: 1),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton.icon(
                            onPressed: () =>
                                _uploadReceipt(ImageSource.gallery),
                            icon: const Icon(Icons.upload_file_outlined),
                            label: const Text("Upload Receipt", maxLines: 1),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
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
}
