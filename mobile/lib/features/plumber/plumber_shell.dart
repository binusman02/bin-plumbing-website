import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:url_launcher/url_launcher.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
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
  bool _loading = true;
  bool _isAvailable = false;
  String _gpsStatus = "GPS off";
  String _plumberName = "Technician";
  String? _plumberId;
  List<ServiceRequestItem> _jobs = [];

  @override
  void initState() {
    super.initState();
    _loadPlumberData();
  }

  Future<void> _loadPlumberData() async {
    setState(() => _loading = true);
    try {
      final client = SupabaseConfig.client;
      final plumberRows = await client
          .from("plumbers")
          .select("id, full_name, is_available")
          .eq("auth_user_id", widget.user.id)
          .limit(1);

      if (plumberRows.isNotEmpty) {
        final row = plumberRows.first;
        _plumberId = row["id"]?.toString();
        _plumberName = row["full_name"]?.toString() ?? "Technician";
        _isAvailable = row["is_available"] == true;
      }

      final jobList = <ServiceRequestItem>[];
      if (_plumberId != null) {
        final rows = await client
            .from("service_requests")
            .select()
            .eq("assigned_plumber_id", _plumberId!)
            .order("created_at", ascending: false);
        for (final row in rows) {
          jobList.add(ServiceRequestItem.fromJson(row));
        }
      }

      if (mounted) {
        setState(() {
          _jobs = jobList;
          _loading = false;
        });
      }
      await _checkGpsStatus();
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _checkGpsStatus() async {
    if (!_isAvailable && _jobs.every((j) => !j.isActive)) {
      if (mounted) setState(() => _gpsStatus = "GPS off");
      return;
    }
    final permission = await Geolocator.checkPermission();
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
    await SupabaseConfig.client
        .from("plumbers")
        .update({"is_available": next})
        .eq("id", _plumberId!);
    await _checkGpsStatus();
  }

  Future<void> _updateJobStatus(ServiceRequestItem job, String nextStatus) async {
    await SupabaseConfig.client
        .from("service_requests")
        .update({"status": nextStatus})
        .eq("id", job.id);
    await _loadPlumberData();
  }

  void _openJobSheet(ServiceRequestItem job) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              "${job.ticketNumber} • ${job.problemCategory}",
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 6),
            Text(job.addressInKano),
            const SizedBox(height: 8),
            Text(
              job.description,
              style: const TextStyle(fontSize: 13, color: FlowGuardTheme.mutedText),
            ),
            const SizedBox(height: 16),
            if (job.customerPhone != null && job.customerPhone!.isNotEmpty)
              OutlinedButton.icon(
                onPressed: () {
                  launchUrl(Uri.parse("tel:${job.customerPhone}"));
                },
                icon: const Icon(Icons.phone_outlined),
                label: Text("Call ${job.customerName ?? 'Customer'}"),
              ),
            if (job.customerLat != null && job.customerLng != null) ...[
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () {
                  launchUrl(
                    Uri.parse(
                      "https://www.google.com/maps/dir/?api=1&destination=${job.customerLat},${job.customerLng}",
                    ),
                    mode: LaunchMode.externalApplication,
                  );
                },
                icon: const Icon(Icons.navigation_outlined),
                label: const Text("Navigate in Google Maps"),
              ),
            ],
            if (job.status == "scheduled" || job.status == "approved") ...[
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _updateJobStatus(job, "in_progress");
                },
                child: const Text("Start Work"),
              ),
            ] else if (job.status == "in_progress") ...[
              const SizedBox(height: 10),
              ElevatedButton(
                onPressed: () {
                  Navigator.pop(ctx);
                  _updateJobStatus(job, "work_completed");
                },
                child: const Text("Mark Work Complete"),
              ),
            ],
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final activeJob = _jobs.where((j) => j.isActive).firstOrNull;
    final completedCount = _jobs.where((j) => j.status == "completed").length;

    final pages = [
      RefreshIndicator(
        onRefresh: _loadPlumberData,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
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
                      Text(
                        _gpsStatus,
                        style: const TextStyle(
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
                          color: _isAvailable
                              ? const Color(0xFFD1FAE5)
                              : const Color(0xFFF1F5F9),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          _isAvailable ? "ON DUTY" : "OFF DUTY",
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: _isAvailable
                                ? const Color(0xFF065F46)
                                : const Color(0xFF475569),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  ElevatedButton(
                    onPressed: _toggleDuty,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isAvailable
                          ? const Color(0xFFECFDF5)
                          : FlowGuardTheme.gold,
                      foregroundColor: _isAvailable
                          ? const Color(0xFF065F46)
                          : FlowGuardTheme.navyDark,
                    ),
                    child: Text(_isAvailable ? "Go Off Duty" : "Go On Duty"),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            GridView.count(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.75,
              children: [
                _StatTile(label: "Assigned Jobs", value: "${_jobs.length}"),
                _StatTile(label: "Completed", value: "$completedCount"),
              ],
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: CircularProgressIndicator())
            else if (activeJob == null)
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Column(
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 36,
                      color: FlowGuardTheme.gold,
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      "No Active Job",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _isAvailable
                          ? "You are On Duty. New assignments will appear here."
                          : "Switch to On Duty above to receive assignments.",
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 12,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                  ],
                ),
              )
            else
              InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => _openJobSheet(activeJob),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: FlowGuardTheme.gold),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Active Job • ${activeJob.ticketNumber}",
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(activeJob.addressInKano),
                      if (activeJob.customerLat != null &&
                          activeJob.customerLng != null) ...[
                        const SizedBox(height: 12),
                        ElevatedButton.icon(
                          onPressed: () {
                            launchUrl(
                              Uri.parse(
                                "https://www.google.com/maps/dir/?api=1&destination=${activeJob.customerLat},${activeJob.customerLng}",
                              ),
                              mode: LaunchMode.externalApplication,
                            );
                          },
                          icon: const Icon(Icons.navigation_outlined),
                          label: const Text("Navigate to Property"),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
      ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: _jobs.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, idx) {
          final job = _jobs[idx];
          return ListTile(
            onTap: () => _openJobSheet(job),
            tileColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: FlowGuardTheme.border),
            ),
            title: Text(
              "${job.ticketNumber} • ${job.problemCategory}",
              style: const TextStyle(
                fontWeight: FontWeight.w700,
                color: FlowGuardTheme.navy,
              ),
            ),
            subtitle: Text(job.addressInKano),
            trailing: const Icon(Icons.chevron_right_rounded),
          );
        },
      ),
      TicketChatView(
        tickets: _jobs,
        senderRole: "plumber",
        senderName: _plumberName,
      ),
      ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _StatTile(label: "Completed Jobs", value: "$completedCount"),
        ],
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _plumberName,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: () => SupabaseConfig.client.auth.signOut(),
              icon: const Icon(Icons.logout_rounded),
              label: const Text("Sign Out"),
            ),
          ],
        ),
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
                width: 32,
                height: 32,
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
      ),
      body: pages[_tabIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (idx) => setState(() => _tabIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: "Home"),
          NavigationDestination(icon: Icon(Icons.work_outline), label: "Jobs"),
          NavigationDestination(
            icon: Icon(Icons.chat_outlined),
            label: "Messages",
          ),
          NavigationDestination(
            icon: Icon(Icons.wallet_outlined),
            label: "Earnings",
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            label: "Profile",
          ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  final String label;
  final String value;

  const _StatTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
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
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: FlowGuardTheme.navy,
            ),
          ),
        ],
      ),
    );
  }
}
