import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:geolocator/geolocator.dart";
import "package:intl/intl.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_state_badges.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/plumber/plumber_job_detail_page.dart";
import "package:flowguard_plumbing/features/shared/notifications_sheet.dart";
import "package:flowguard_plumbing/features/shared/profile_and_edit_pages.dart";
import "package:flowguard_plumbing/features/shared/ticket_chat_view.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class PlumberShell extends StatefulWidget {
  final User user;

  const PlumberShell({super.key, required this.user});

  @override
  State<PlumberShell> createState() => _PlumberShellState();
}

class _PlumberShellState extends State<PlumberShell> {
  int _tabIndex = 0;
  String _jobFilter = "all"; // all | active | completed
  bool _loading = true;
  bool _isAvailable = false;
  String _gpsStatus = "GPS off";
  String _plumberName = "Technician";
  String? _plumberId;
  String? _plumberPhone;
  String? _avatarUrl;
  String? _address;
  String? _bankName;
  String? _accountNumber;
  String? _accountName;
  String _verificationStatus = "approved";
  double _rating = 5.0;
  double _verifiedEarnings = 0;
  List<ServiceRequestItem> _jobs = [];
  Map<String, String> _tripStates = {};
  List<Map<String, dynamic>> _earningsLedger = [];
  String? _loadError;

  @override
  void initState() {
    super.initState();
    _loadPlumberData();
  }

  Future<void> _loadPlumberData() async {
    setState(() {
      _loading = true;
      _loadError = null;
    });
    try {
      final client = SupabaseConfig.client;
      final initialResults = await Future.wait([
        FlowGuardApiClient.fetchProfile(role: "plumber"),
        FlowGuardApiClient.fetchPaymentsAndBank(role: "plumber"),
      ]);
      final profileResp = initialResults[0];
      final payData = initialResults[1] ?? <String, dynamic>{};
      final row = profileResp?["profile"] as Map<String, dynamic>?;

      if (row != null) {
        _plumberId = row["id"]?.toString();
        _plumberName = row["full_name"]?.toString() ?? "Technician";
        _plumberPhone = row["phone"]?.toString();
        _address = (row["address"] ?? row["residential_location"])?.toString();
        _avatarUrl = row["avatar_url"]?.toString();
        _bankName = row["bank_name"]?.toString();
        _accountNumber = row["account_number"]?.toString();
        _accountName = row["account_name"]?.toString();
        _isAvailable = row["is_available"] == true;
        _verificationStatus =
            row["verification_status"]?.toString() ?? "approved";
        final parsedRating = (row["rating"] as num?)?.toDouble();
        if (parsedRating != null && parsedRating > 0) {
          _rating = parsedRating;
        }
      } else {
        final plumberRows = await client
            .from("plumbers")
            .select(
              "id, full_name, phone, residential_location, avatar_url, is_available, verification_status, rating",
            )
            .eq("auth_user_id", widget.user.id)
            .limit(1);
        if (plumberRows.isNotEmpty) {
          final fallback = plumberRows.first;
          _plumberId = fallback["id"]?.toString();
          _plumberName = fallback["full_name"]?.toString() ?? "Technician";
          _plumberPhone = fallback["phone"]?.toString();
          _address = fallback["residential_location"]?.toString();
          _avatarUrl = fallback["avatar_url"]?.toString();
          _isAvailable = fallback["is_available"] == true;
          _verificationStatus =
              fallback["verification_status"]?.toString() ?? "approved";
          final parsedRating = (fallback["rating"] as num?)?.toDouble();
          if (parsedRating != null && parsedRating > 0) {
            _rating = parsedRating;
          }
        }
      }

      final jobList = <ServiceRequestItem>[];
      final tripMap = <String, String>{};
      final ledger = <Map<String, dynamic>>[];
      double earningsTotal = 0;

      if (_plumberId != null) {
        final rows = await client
            .from("service_requests")
            .select()
            .eq("assigned_plumber_id", _plumberId!)
            .order("created_at", ascending: false);

        final reqIds = <String>[];
        for (final r in rows) {
          if (r["deleted_at"] != null) continue;
          final item = ServiceRequestItem.fromJson(r);
          jobList.add(item);
          reqIds.add(item.id);
        }

        if (reqIds.isNotEmpty) {
          final histRows = await client
              .from("request_history")
              .select("request_id, action, created_at")
              .inFilter("request_id", reqIds)
              .order("created_at", ascending: true);
          final grouped = <String, List<dynamic>>{};
          for (final h in histRows) {
            final rid = (h["request_id"] ?? "").toString();
            grouped.putIfAbsent(rid, () => []).add(h);
          }
          for (final j in jobList) {
            tripMap[j.id] = _deriveTripState(grouped[j.id] ?? const []);
          }
        }

        final rawPayments = payData["payments"] as List? ?? [];
        for (final p in rawPayments) {
          if (p is! Map<String, dynamic>) continue;
          final payable = (p["plumber_payable"] as num?)?.toDouble() ??
              (p["total_payment"] as num?)?.toDouble() ??
              0;
          final verified = p["verification_status"] == "verified";
          if (verified) {
            earningsTotal += payable;
          }
          ledger.add({
            "ticket": (p["ticket_number"] ?? "").toString(),
            "amount": payable,
            "approved": verified,
            "created_at": (p["created_at"] ?? "").toString(),
          });
        }
      }

      if (mounted) {
        setState(() {
          _jobs = jobList;
          _tripStates = tripMap;
          _earningsLedger = ledger;
          _verifiedEarnings = earningsTotal;
          _loading = false;
          _loadError = null;
        });
      }
      await _checkGpsStatus();
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _loadError = "Unable to load technician data. Check your connection.";
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

  Future<void> _checkGpsStatus() async {
    if (!_isAvailable && _jobs.every((j) => !j.isActive)) {
      if (mounted) setState(() => _gpsStatus = "GPS off");
      return;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) setState(() => _gpsStatus = "Permission required");
      return;
    }
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) {
      if (mounted) setState(() => _gpsStatus = "Location unavailable");
      return;
    }
    if (mounted) setState(() => _gpsStatus = "Location active");
  }

  Future<void> _toggleDuty() async {
    if (_plumberId == null) return;
    final next = !_isAvailable;
    setState(() => _isAvailable = next);
    try {
      await SupabaseConfig.client
          .from("plumbers")
          .update({"is_available": next})
          .eq("id", _plumberId!);
      if (!next) {
        await FlowGuardApiClient.stopLiveLocation().catchError((_) {});
      }
      await _checkGpsStatus();
    } catch (_) {
      if (mounted) {
        setState(() => _isAvailable = !next);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Could not update duty status.")),
        );
      }
    }
  }

  void _openJobDetail(ServiceRequestItem job) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => PlumberJobDetailPage(
          job: job,
          plumberId: _plumberId ?? "",
          plumberName: _plumberName,
          onUpdated: _loadPlumberData,
          onOpenChat: () => setState(() => _tabIndex = 2),
        ),
      ),
    );
  }

  void _handleNotificationLink(String? link) {
    if (link == null || link.isEmpty) return;
    if (link.contains("chat") || link.contains("message")) {
      setState(() => _tabIndex = 2);
      return;
    }
    if (link.contains("earnings") || link.contains("payment")) {
      setState(() => _tabIndex = 3);
      return;
    }
    final matchingJob = _jobs.where((j) => link.contains(j.ticketNumber)).firstOrNull;
    if (matchingJob != null) {
      _openJobDetail(matchingJob);
      return;
    }
    setState(() => _tabIndex = 1);
  }

  _DynamicCta _resolveDynamicCta(ServiceRequestItem? activeJob) {
    if (!_isAvailable && activeJob == null) {
      return _DynamicCta(
        title: "You are currently Off Duty",
        subtitle: "Go On Duty so Kano dispatch can assign nearby plumbing jobs.",
        buttonLabel: "Go On Duty",
        onTap: _toggleDuty,
      );
    }
    if (activeJob == null) {
      return _DynamicCta(
        title: "Waiting for Jobs",
        subtitle: "You are On Duty. New assignments will appear here immediately.",
        buttonLabel: "Refresh Dispatch",
        onTap: _loadPlumberData,
        secondaryStyle: true,
      );
    }

    final tripState = _tripStates[activeJob.id] ?? "idle";
    String label = "Open Active Job";
    String title = "${activeJob.ticketNumber} • ${activeJob.problemCategory}";
    String subtitle = activeJob.addressInKano;

    if (activeJob.status == "in_progress") {
      label = "Mark Work Complete";
      subtitle = "Upload completion photos & close repair";
    } else if (activeJob.status == "work_completed" ||
        activeJob.status == "awaiting_final_payment") {
      label = "View Job Status";
      subtitle = "Awaiting payment verification";
    } else if (activeJob.status == "approved") {
      label = "Start Work";
      subtitle = "Customer approved quotation — ready for repair";
    } else if (activeJob.status == "quoted" ||
        activeJob.status == "awaiting_approval" ||
        activeJob.status == "quotation_submitted") {
      label = "View Submitted Quote";
      subtitle = "Waiting for customer approval";
    } else if (tripState == "on_the_way") {
      label = "Arrived at Property";
      subtitle = "Live trip in progress to ${activeJob.addressInKano}";
    } else if (tripState == "arrived") {
      label = "Prepare Quotation";
      subtitle = "Arrived on site — submit itemised labour & materials";
    } else if (activeJob.status == "scheduled" ||
        activeJob.status == "inspection_required") {
      label = "Start Trip";
      subtitle = "Begin navigation & live GPS tracking to customer";
    } else {
      label = "Review Assignment";
      subtitle = "New job assigned at ${activeJob.addressInKano}";
    }

    return _DynamicCta(
      title: title,
      subtitle: subtitle,
      buttonLabel: label,
      onTap: () => _openJobDetail(activeJob),
    );
  }

  Future<void> _signOut() async {
    final token = GoogleServicesBootstrap.fcmToken;
    if (token != null) {
      await FlowGuardApiClient.deactivateDeviceToken(token).catchError((_) {});
    }
    await SupabaseConfig.client.auth.signOut();
  }

  void _openEarningsReceipt(Map<String, dynamic> row, NumberFormat naira) {
    final ticket = row["ticket"] as String;
    final amount = "₦${naira.format(row["amount"] as double)}";
    final status =
        (row["approved"] as bool) ? "Approved / Payable" : "Pending Approval";
    final created = (row["created_at"] as String).split("T").first;
    final receiptText =
        "FLOWGUARD PLUMBING PAYOUT RECEIPT\nTicket: $ticket\nTechnician: $_plumberName\nAmount: $amount\nStatus: $status\nDate: $created";

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(22, 4, 22, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              "FlowGuard Payout Receipt",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: FlowGuardTheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: FlowGuardTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Ticket: $ticket",
                    style: const TextStyle(
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text("Technician: $_plumberName"),
                  Text("Amount: $amount"),
                  Text("Status: $status"),
                  if (created.isNotEmpty) Text("Date: $created"),
                ],
              ),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: receiptText));
                Navigator.pop(ctx);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text("Receipt copied — ready to print or share."),
                  ),
                );
              },
              icon: const Icon(Icons.print_outlined),
              label: const Text("Copy / Print Receipt", maxLines: 1),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeJob = _jobs.where((j) => j.isActive).firstOrNull;
    final assignedCount = _jobs.where((j) => j.isActive).length;
    final completedCount = _jobs.where((j) => j.status == "completed").length;
    final naira = NumberFormat("#,##0");
    final cta = _resolveDynamicCta(activeJob);

    final filteredJobs = _jobs.where((j) {
      if (_jobFilter == "active") return j.isActive;
      if (_jobFilter == "completed") return j.status == "completed";
      return true;
    }).toList();

    final pages = [
      // 1. HOME TAB
      RefreshIndicator(
        onRefresh: _loadPlumberData,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          children: [
            // Duty & GPS Status Card
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
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "Hello, $_plumberName",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Row(
                              children: [
                                Icon(
                                  _gpsStatus == "Location active"
                                      ? Icons.gps_fixed_rounded
                                      : Icons.gps_not_fixed_rounded,
                                  size: 14,
                                  color: _gpsStatus == "Location active"
                                      ? const Color(0xFF059669)
                                      : FlowGuardTheme.mutedText,
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    _gpsStatus,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w600,
                                      color: FlowGuardTheme.mutedText,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: _toggleDuty,
                        borderRadius: BorderRadius.circular(999),
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: _isAvailable
                                ? const Color(0xFFD1FAE5)
                                : const Color(0xFFF1F5F9),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _isAvailable ? "ON DUTY" : "OFF DUTY",
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              color: _isAvailable
                                  ? const Color(0xFF065F46)
                                  : const Color(0xFF475569),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),

            const SizedBox(height: 14),

            // Single Dynamic Contextual Next Action Card
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: FlowGuardTheme.navy,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "NEXT ACTION",
                    style: TextStyle(
                      color: FlowGuardTheme.gold,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    cta.title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    cta.subtitle,
                    style: const TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontSize: 12.5,
                    ),
                  ),
                  const SizedBox(height: 14),
                  SizedBox(
                    width: double.infinity,
                    child: cta.secondaryStyle
                        ? OutlinedButton(
                            onPressed: cta.onTap,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: Colors.white,
                              side: const BorderSide(color: Color(0xFF475569)),
                            ),
                            child: Text(
                              cta.buttonLabel,
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                            ),
                          )
                        : ElevatedButton(
                            onPressed: cta.onTap,
                            child: Text(
                              cta.buttonLabel,
                              maxLines: 1,
                              softWrap: false,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 4 Compact KPI Tiles (Secondary to active work)
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.95,
              children: [
                _StatTile(label: "Assigned Jobs", value: "$assignedCount"),
                _StatTile(label: "Completed Jobs", value: "$completedCount"),
                _StatTile(
                  label: "Verified Earnings",
                  value: "₦${naira.format(_verifiedEarnings)}",
                ),
                _StatTile(
                  label: "Rating",
                  value: "${_rating.toStringAsFixed(1)} ★",
                ),
              ],
            ),

            const SizedBox(height: 18),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "Assigned Jobs",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                TextButton(
                  onPressed: () => setState(() => _tabIndex = 1),
                  child: const Text("View All >", maxLines: 1),
                ),
              ],
            ),
            const SizedBox(height: 4),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_jobs.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(
                  child: Text(
                    "No jobs assigned yet.",
                    style: TextStyle(color: FlowGuardTheme.mutedText),
                  ),
                ),
              )
            else
              ..._jobs.take(5).map((job) => _jobTile(job)),
          ],
        ),
      ),

      // 2. JOBS TAB
      Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
            child: Row(
              children: [
                _filterChip("All", "all"),
                const SizedBox(width: 8),
                _filterChip("Active", "active"),
                const SizedBox(width: 8),
                _filterChip("Completed", "completed"),
              ],
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _loadPlumberData,
              child: filteredJobs.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 90),
                        Center(
                          child: Text(
                            "No jobs in this filter.",
                            style: TextStyle(color: FlowGuardTheme.mutedText),
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: filteredJobs.length,
                      itemBuilder: (_, idx) => _jobTile(filteredJobs[idx]),
                    ),
            ),
          ),
        ],
      ),

      // 3. MESSAGES TAB
      TicketChatView(
        tickets: _jobs,
        senderRole: "plumber",
        senderName: _plumberName,
        senderId: _plumberId ?? "",
      ),

      // 4. EARNINGS TAB
      RefreshIndicator(
        onRefresh: _loadPlumberData,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: FlowGuardTheme.navy,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "VERIFIED EARNINGS",
                    style: TextStyle(
                      color: FlowGuardTheme.gold,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    "₦${naira.format(_verifiedEarnings)}",
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    "$completedCount completed jobs • $_verificationStatus technician",
                    style: const TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              "Quotation & Payout Ledger",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 8),
            if (_earningsLedger.isEmpty)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(
                  child: Text(
                    "No quotations or payouts recorded yet.",
                    style: TextStyle(color: FlowGuardTheme.mutedText),
                  ),
                ),
              )
            else
              ..._earningsLedger.map(
                (row) => InkWell(
                  onTap: () => _openEarningsReceipt(row, naira),
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: FlowGuardTheme.border),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              row["ticket"] as String,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              (row["approved"] as bool)
                                  ? "Approved • Tap for receipt"
                                  : "Pending approval • Tap for receipt",
                              style: const TextStyle(
                                fontSize: 12,
                                color: FlowGuardTheme.mutedText,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          "₦${naira.format(row["amount"] as double)}",
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),

      // 5. PROFILE TAB
      FlowGuardProfileView(
        role: "plumber",
        fullName: _plumberName,
        phone: _plumberPhone ?? "",
        email: widget.user.email ?? "",
        location: _address ?? "Kano State, Nigeria",
        avatarUrl: _avatarUrl,
        isVerifiedTechnician: _verificationStatus == "approved",
        rating: _rating,
        bankName: _bankName,
        accountNumber: _accountNumber,
        accountName: _accountName,
        onProfileUpdated: _loadPlumberData,
        onSignOut: _signOut,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Row(
          children: [
            ClipOval(
              child: Image.asset(
                "assets/images/flowguard-icon.jpg",
                width: 36,
                height: 36,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              "FlowGuard Technician",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
          ],
        ),
        actions: [
          NotificationsButton(
            role: "plumber",
            onNavigateLink: _handleNotificationLink,
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: InkWell(
              onTap: () => setState(() => _tabIndex = 4),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: FlowGuardTheme.gold, width: 1.5),
                ),
                child: ClipOval(
                  child: _avatarUrl != null && _avatarUrl!.isNotEmpty
                      ? Image.network(
                          _avatarUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Image.asset(
                            "assets/images/flowguard-icon.jpg",
                            fit: BoxFit.cover,
                          ),
                        )
                      : Image.asset(
                          "assets/images/flowguard-icon.jpg",
                          fit: BoxFit.cover,
                        ),
                ),
              ),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (_loadError != null)
            MaterialBanner(
              backgroundColor: const Color(0xFFFEF2F2),
              content: Text(
                _loadError!,
                style: const TextStyle(
                  color: Color(0xFF991B1B),
                  fontWeight: FontWeight.w600,
                  fontSize: 13,
                ),
              ),
              actions: [
                TextButton(
                  onPressed: _loadPlumberData,
                  child: const Text("Retry"),
                ),
              ],
            ),
          Expanded(child: IndexedStack(index: _tabIndex, children: pages)),
        ],
      ),
      bottomNavigationBar: ValueListenableBuilder<int>(
        valueListenable: AppStateBadges.unreadMessagesCount,
        builder: (context, unreadMsgs, _) => NavigationBar(
          selectedIndex: _tabIndex,
          onDestinationSelected: (idx) => setState(() => _tabIndex = idx),
          destinations: [
            const NavigationDestination(
              icon: Icon(Icons.home_outlined),
              label: "Home",
            ),
            const NavigationDestination(
              icon: Icon(Icons.work_outline),
              label: "Jobs",
            ),
            NavigationDestination(
              icon: Badge(
                isLabelVisible: unreadMsgs > 0,
                label: Text(unreadMsgs > 9 ? "9+" : "$unreadMsgs"),
                child: const Icon(Icons.chat_outlined),
              ),
              label: "Messages",
            ),
            const NavigationDestination(
              icon: Icon(Icons.wallet_outlined),
              label: "Earnings",
            ),
            const NavigationDestination(
              icon: Icon(Icons.person_outline),
              label: "Profile",
            ),
          ],
        ),
      ),
    );
  }

  Widget _filterChip(String label, String key) {
    final selected = _jobFilter == key;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => setState(() => _jobFilter = key),
      selectedColor: FlowGuardTheme.navy,
      labelStyle: TextStyle(
        color: selected ? Colors.white : FlowGuardTheme.navy,
        fontWeight: FontWeight.w700,
        fontSize: 12,
      ),
    );
  }

  Widget _jobTile(ServiceRequestItem job) {
    final badge = StatusBadgeMeta.fromStatus(job.status);
    return InkWell(
      onTap: () => _openJobDetail(job),
      borderRadius: BorderRadius.circular(18),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: FlowGuardTheme.border),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        job.ticketNumber,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: FlowGuardTheme.navy,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: badge.background,
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          badge.label,
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: badge.foreground,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    job.problemCategory,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    job.addressInKano,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: FlowGuardTheme.mutedText,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: FlowGuardTheme.mutedText),
          ],
        ),
      ),
    );
  }
}

class _DynamicCta {
  final String title;
  final String subtitle;
  final String buttonLabel;
  final VoidCallback onTap;
  final bool secondaryStyle;

  const _DynamicCta({
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
    required this.onTap,
    this.secondaryStyle = false,
  });
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;

  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: FlowGuardTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            label.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: FlowGuardTheme.mutedText,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            value,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: FlowGuardTheme.navy,
            ),
          ),
        ],
      ),
    );
  }
}
