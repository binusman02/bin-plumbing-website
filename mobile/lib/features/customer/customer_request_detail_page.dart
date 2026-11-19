import "dart:async";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:image_picker/image_picker.dart";
import "package:intl/intl.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
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
  QuotationData? _quote;
  bool _loadingQuote = true;
  bool _busy = false;
  double? _plumberLat;
  double? _plumberLng;
  String? _plumberPhone;
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
    _loadDetails();
    if (widget.request.isActive) {
      _pollTimer = Timer.periodic(
        const Duration(seconds: 12),
        (_) => _refreshTracking(),
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
    await Future.wait([_loadQuote(), _refreshTracking()]);
  }

  Future<void> _loadQuote() async {
    try {
      final rows = await SupabaseConfig.client
          .from("quotations")
          .select()
          .eq("ticket_number", widget.request.ticketNumber)
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
    try {
      final snap = await FlowGuardApiClient.fetchTrackingSnapshot(
        viewerRole: "customer",
        ticket: widget.request.ticketNumber,
      );
      if (snap == null || !mounted) return;
      final jobs = snap["jobs"];
      if (jobs is List && jobs.isNotEmpty) {
        final job = jobs.first as Map<String, dynamic>;
        final tripState = (job["tripState"] ?? "").toString();
        final plumber = job["plumber"] as Map<String, dynamic>?;
        final isLive = tripState == "on_the_way" &&
            plumber != null &&
            plumber["lat"] != null &&
            plumber["lng"] != null;
        setState(() {
          _tripLive = isLive;
          _plumberLat = isLive ? (plumber["lat"] as num).toDouble() : null;
          _plumberLng = isLive ? (plumber["lng"] as num).toDouble() : null;
          _plumberPhone = job["plumberPhone"]?.toString();
          _trackingStateLabel = isLive
              ? "Technician is on the way (Live GPS)"
              : (widget.request.assignedTechnician != null
                  ? "Technician assigned — journey not started yet"
                  : "Awaiting technician assignment");
        });
      }
    } catch (_) {}
  }

  int _currentStageIndex() {
    final s = widget.request.status;
    if (s == "completed") return 5;
    if (s == "in_progress" || s == "work_completed" || s == "awaiting_final_payment") {
      return 4;
    }
    if (_quote != null || s == "approved") return 3;
    if (_tripLive) return 2;
    if (widget.request.assignedTechnician != null || s == "scheduled" || s == "qualified") {
      return 1;
    }
    return 0;
  }

  Future<void> _decideQuote(String decision) async {
    if (_quote == null || _busy) return;
    setState(() => _busy = true);
    try {
      await SupabaseConfig.client
          .from("quotations")
          .update({"customer_approval_status": decision})
          .eq("id", _quote!.id);
      if (decision == "approved") {
        await SupabaseConfig.client
            .from("service_requests")
            .update({"status": "approved"})
            .eq("id", widget.request.id);
      }
      await _loadQuote();
      widget.onUpdated();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _uploadReceipt(ImageSource source) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: source, imageQuality: 80);
    if (file == null || !mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text("Receipt '${file.name}' selected for verification."),
      ),
    );
  }

  Future<void> _submitReview() async {
    if (_busy || _reviewSubmitted) return;
    setState(() => _busy = true);
    try {
      await SupabaseConfig.client.from("reviews").insert({
        "request_id": widget.request.id,
        "ticket_number": widget.request.ticketNumber,
        "customer_name": widget.request.customerName ?? "Customer",
        "service_category": widget.request.problemCategory,
        "rating": _reviewRating,
        "comment": _reviewController.text.trim(),
        "status": "pending",
      });
      if (mounted) {
        setState(() => _reviewSubmitted = true);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final badge = StatusBadgeMeta.fromStatus(widget.request.status);
    final activeStage = _currentStageIndex();
    final mapHeight = MediaQuery.of(context).size.height * 0.52;
    final naira = NumberFormat.currency(
      locale: "en_NG",
      symbol: "₦",
      decimalDigits: 0,
    );
    final showPaymentCard =
        widget.request.status == "awaiting_final_payment" ||
            widget.request.status == "work_completed" ||
            _quote?.approvalStatus == "approved";

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.request.ticketNumber,
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
                fontWeight: FontWeight.w700,
                color: badge.foreground,
              ),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 6-Stage Progress Stepper
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: FlowGuardTheme.border),
            ),
            child: Row(
              children: List.generate(_stages.length, (i) {
                final done = i <= activeStage;
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
                          size: 12,
                          color: done ? FlowGuardTheme.gold : Colors.white,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _stages[i],
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 9.5,
                          fontWeight: done ? FontWeight.w700 : FontWeight.w500,
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
          // Prominent Embedded Live Tracking Map (50-60% height)
          if (widget.request.customerLat != null &&
              widget.request.customerLng != null) ...[
            FlowGuardGoogleMap(
              height: mapHeight.clamp(280, 420),
              allowFullscreen: true,
              customerLat: widget.request.customerLat,
              customerLng: widget.request.customerLng,
              plumberLat: _plumberLat,
              plumberLng: _plumberLng,
              plumberLabel: widget.request.assignedTechnician,
            ),
            const SizedBox(height: 8),
            Text(
              _trackingStateLabel,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: _tripLive ? const Color(0xFF065F46) : FlowGuardTheme.mutedText,
              ),
            ),
            const SizedBox(height: 14),
          ],
          // Assigned Technician + Call & Chat
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: FlowGuardTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.request.assignedTechnician ?? "Technician Assignment Pending",
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "${widget.request.problemCategory} • ${widget.request.addressInKano}",
                  style: const TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (_plumberPhone != null && _plumberPhone!.isNotEmpty) ...[
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => launchUrl(Uri.parse("tel:$_plumberPhone")),
                          icon: const Icon(Icons.phone_outlined),
                          label: const Text("Call"),
                        ),
                      ),
                      const SizedBox(width: 10),
                    ],
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {
                          Navigator.pop(context);
                          widget.onOpenChat();
                        },
                        icon: const Icon(Icons.chat_outlined),
                        label: const Text("Chat"),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          // Itemised Quotation
          if (_loadingQuote)
            const Center(child: CircularProgressIndicator())
          else if (_quote != null)
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
                    "Itemised Quotation",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("Labour"),
                      Text(naira.format(_quote!.labourCharge)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("Materials"),
                      Text(naira.format(_quote!.materialsCost)),
                    ],
                  ),
                  if (_quote!.transportCharge > 0) ...[
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text("Transport"),
                        Text(naira.format(_quote!.transportCharge)),
                      ],
                    ),
                  ],
                  const Divider(height: 18),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        "Total",
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        naira.format(_quote!.totalAmount),
                        style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                    ],
                  ),
                  if (_quote!.approvalStatus == "pending") ...[
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed:
                                _busy ? null : () => _decideQuote("rejected"),
                            child: const Text("Decline"),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: ElevatedButton(
                            onPressed:
                                _busy ? null : () => _decideQuote("approved"),
                            child: const Text("Approve Quote"),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          if (showPaymentCard && widget.bankDetails?.isConfigured == true) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: FlowGuardTheme.gold),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Official Bank Transfer",
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          "${widget.bankDetails!.bankName}\n${widget.bankDetails!.accountNumber}",
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
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
                        icon: const Icon(Icons.copy_rounded),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  ElevatedButton.icon(
                    onPressed: () => _uploadReceipt(ImageSource.gallery),
                    icon: const Icon(Icons.upload_file_rounded),
                    label: const Text("Upload Payment Receipt"),
                  ),
                ],
              ),
            ),
          ],
          if (widget.request.status == "completed" && !_reviewSubmitted) ...[
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
                    "Rate Your Service",
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  Row(
                    children: List.generate(5, (i) {
                      final star = i + 1;
                      return IconButton(
                        onPressed: () => setState(() => _reviewRating = star),
                        icon: Icon(
                          star <= _reviewRating
                              ? Icons.star_rounded
                              : Icons.star_border_rounded,
                          color: FlowGuardTheme.gold,
                          size: 30,
                        ),
                      );
                    }),
                  ),
                  TextField(
                    controller: _reviewController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      hintText: "Share feedback on your technician...",
                    ),
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _busy ? null : _submitReview,
                    child: const Text("Submit Review"),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
