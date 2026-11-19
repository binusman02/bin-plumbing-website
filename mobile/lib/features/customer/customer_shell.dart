import "dart:async";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/customer/customer_request_detail_sheet.dart";
import "package:flowguard_plumbing/features/customer/new_request_sheet.dart";
import "package:flowguard_plumbing/features/shared/ticket_chat_view.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class CustomerShell extends StatefulWidget {
  final User user;

  const CustomerShell({super.key, required this.user});

  @override
  State<CustomerShell> createState() => _CustomerShellState();
}

class _CustomerShellState extends State<CustomerShell> {
  int _tabIndex = 0;
  bool _loading = true;
  List<ServiceCategoryItem> _categories = [];
  List<ServiceRequestItem> _requests = [];
  BankDetailsData? _bankDetails;
  String _customerId = "";
  String _customerName = "Customer";
  String _customerPhone = "";

  @override
  void initState() {
    super.initState();
    _loadCustomerData();
  }

  Future<void> _loadCustomerData() async {
    setState(() => _loading = true);
    try {
      final client = SupabaseConfig.client;
      final settingsRows = await client
          .from("marketplace_settings")
          .select("service_categories, bank_name, bank_account_name, bank_account_number")
          .limit(1);

      final parsedCategories = <ServiceCategoryItem>[];
      BankDetailsData? bank;
      if (settingsRows.isNotEmpty) {
        final settings = settingsRows.first;
        bank = BankDetailsData.fromSettings(settings);
        final raw = settings["service_categories"];
        if (raw is List) {
          for (final entry in raw) {
            if (entry is Map<String, dynamic> &&
                entry["active"] != false &&
                entry["visible"] != false) {
              parsedCategories.add(ServiceCategoryItem.fromJson(entry));
            }
          }
        }
      }

      final customerRows = await client
          .from("customers")
          .select("id, full_name, phone")
          .eq("auth_user_id", widget.user.id)
          .limit(1);

      String customerId = "";
      String displayName =
          widget.user.userMetadata?["full_name"]?.toString() ?? "Customer";
      String phone = widget.user.phone ?? "";
      if (customerRows.isNotEmpty) {
        customerId = customerRows.first["id"]?.toString() ?? "";
        displayName =
            customerRows.first["full_name"]?.toString() ?? displayName;
        phone = customerRows.first["phone"]?.toString() ?? phone;
      }

      final reqList = <ServiceRequestItem>[];
      if (customerId.isNotEmpty) {
        final rows = await client
            .from("service_requests")
            .select()
            .eq("customer_id", customerId)
            .order("created_at", ascending: false);
        for (final row in rows) {
          reqList.add(ServiceRequestItem.fromJson(row));
        }
      }

      if (mounted) {
        setState(() {
          _categories = parsedCategories;
          _requests = reqList;
          _bankDetails = bank;
          _customerId = customerId;
          _customerName = displayName;
          _customerPhone = phone;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _openNewRequestSheet([String? initialCategory]) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => NewRequestSheet(
        customerId: _customerId,
        customerName: _customerName,
        customerPhone: _customerPhone,
        categories: _categories,
        initialCategory: initialCategory,
        onCreated: _loadCustomerData,
      ),
    );
  }

  void _openRequestDetail(ServiceRequestItem req) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => CustomerRequestDetailSheet(
        request: req,
        bankDetails: _bankDetails,
        onUpdated: _loadCustomerData,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      _CustomerHomeTab(
        customerName: _customerName,
        loading: _loading,
        categories: _categories,
        requests: _requests,
        onRefresh: _loadCustomerData,
        onSelectCategory: _openNewRequestSheet,
        onOpenRequest: _openRequestDetail,
        onViewAllRequests: () => setState(() => _tabIndex = 1),
      ),
      _CustomerRequestsTab(
        requests: _requests,
        onNewRequest: () => _openNewRequestSheet(),
        onOpenRequest: _openRequestDetail,
      ),
      TicketChatView(
        tickets: _requests,
        senderRole: "customer",
        senderName: _customerName,
      ),
      _CustomerPaymentsTab(bankDetails: _bankDetails),
      _CustomerProfileTab(
        name: _customerName,
        email: widget.user.email ?? "",
        phone: _customerPhone,
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
              "FlowGuard Plumbing",
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadCustomerData,
            icon: const Icon(Icons.refresh_rounded),
            tooltip: "Refresh",
          ),
        ],
      ),
      body: pages[_tabIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tabIndex,
        onDestinationSelected: (idx) => setState(() => _tabIndex = idx),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: "Home"),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            label: "Requests",
          ),
          NavigationDestination(
            icon: Icon(Icons.chat_outlined),
            label: "Messages",
          ),
          NavigationDestination(
            icon: Icon(Icons.credit_card_outlined),
            label: "Payments",
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

class _CustomerHomeTab extends StatefulWidget {
  final String customerName;
  final bool loading;
  final List<ServiceCategoryItem> categories;
  final List<ServiceRequestItem> requests;
  final Future<void> Function() onRefresh;
  final void Function([String?]) onSelectCategory;
  final void Function(ServiceRequestItem) onOpenRequest;
  final VoidCallback onViewAllRequests;

  const _CustomerHomeTab({
    required this.customerName,
    required this.loading,
    required this.categories,
    required this.requests,
    required this.onRefresh,
    required this.onSelectCategory,
    required this.onOpenRequest,
    required this.onViewAllRequests,
  });

  @override
  State<_CustomerHomeTab> createState() => _CustomerHomeTabState();
}

class _CustomerHomeTabState extends State<_CustomerHomeTab> {
  final PageController _spotlightController = PageController(viewportFraction: 0.88);
  Timer? _autoSlideTimer;
  int _spotlightPage = 0;

  @override
  void initState() {
    super.initState();
    _autoSlideTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      final count = widget.categories.take(5).length;
      if (!mounted || count <= 1 || !_spotlightController.hasClients) return;
      final next = (_spotlightPage + 1) % count;
      _spotlightController.animateToPage(
        next,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _autoSlideTimer?.cancel();
    _spotlightController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeRequests = widget.requests.where((r) => r.isActive).toList();
    final spotlight = widget.categories.take(5).toList();

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
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
                const Text(
                  "FLOWGUARD CUSTOMER",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.8,
                    color: FlowGuardTheme.gold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  "Welcome, ${widget.customerName}",
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: () => widget.onSelectCategory(),
                  icon: const Icon(Icons.add),
                  label: const Text("New Plumbing Request"),
                ),
              ],
            ),
          ),
          if (widget.loading) ...[
            const SizedBox(height: 24),
            const Center(child: CircularProgressIndicator()),
          ] else if (widget.categories.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              "All Categories",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 92,
              child: ScrollConfiguration(
                behavior: ScrollConfiguration.of(context).copyWith(scrollbars: false),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: widget.categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, idx) {
                  final cat = widget.categories[idx];
                  return InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => widget.onSelectCategory(cat.title),
                    child: SizedBox(
                      width: 74,
                      child: Column(
                        children: [
                          Container(
                            width: 54,
                            height: 54,
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: FlowGuardTheme.border),
                              boxShadow: [
                                BoxShadow(
                                  color: FlowGuardTheme.navy.withValues(alpha: 0.05),
                                  blurRadius: 8,
                                  offset: const Offset(0, 3),
                                ),
                              ],
                            ),
                            child: const Icon(
                              Icons.plumbing_rounded,
                              size: 24,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            cat.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 11,
                              height: 1.15,
                              fontWeight: FontWeight.w600,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              "Service Spotlight",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 156,
              child: PageView.builder(
                controller: _spotlightController,
                onPageChanged: (i) => setState(() => _spotlightPage = i),
                itemCount: spotlight.length,
                itemBuilder: (context, idx) {
                  final cat = spotlight[idx];
                  return Container(
                    margin: const EdgeInsets.only(right: 10),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [FlowGuardTheme.navy, FlowGuardTheme.navyDark],
                      ),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: const Text(
                                "FLOWGUARD",
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: FlowGuardTheme.gold,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              cat.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ],
                        ),
                        ElevatedButton(
                          onPressed: () => widget.onSelectCategory(cat.title),
                          child: const Text("Request This Service"),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
          if (activeRequests.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "Active Service Request",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                TextButton(
                  onPressed: widget.onViewAllRequests,
                  child: const Text("View All"),
                ),
              ],
            ),
            InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => widget.onOpenRequest(activeRequests.first),
              child: _RequestSummaryCard(request: activeRequests.first),
            ),
          ],
        ],
      ),
    );
  }
}

class _CustomerRequestsTab extends StatelessWidget {
  final List<ServiceRequestItem> requests;
  final VoidCallback onNewRequest;
  final void Function(ServiceRequestItem) onOpenRequest;

  const _CustomerRequestsTab({
    required this.requests,
    required this.onNewRequest,
    required this.onOpenRequest,
  });

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.assignment_outlined, size: 48, color: FlowGuardTheme.mutedText),
              const SizedBox(height: 12),
              const Text(
                "No Service Requests Yet",
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: FlowGuardTheme.navy,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: onNewRequest,
                child: const Text("Request This Service"),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: requests.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, idx) {
        final req = requests[idx];
        return InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => onOpenRequest(req),
          child: _RequestSummaryCard(request: req),
        );
      },
    );
  }
}

class _RequestSummaryCard extends StatelessWidget {
  final ServiceRequestItem request;

  const _RequestSummaryCard({required this.request});

  @override
  Widget build(BuildContext context) {
    final badge = StatusBadgeMeta.fromStatus(request.status);
    return Container(
      padding: const EdgeInsets.all(14),
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
              Text(
                request.ticketNumber,
                style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              Container(
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
          const SizedBox(height: 6),
          Text(
            request.problemCategory.isNotEmpty
                ? request.problemCategory
                : request.propertyType,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: FlowGuardTheme.navy,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            request.addressInKano,
            style: const TextStyle(fontSize: 12, color: FlowGuardTheme.mutedText),
          ),
        ],
      ),
    );
  }
}

class _CustomerPaymentsTab extends StatelessWidget {
  final BankDetailsData? bankDetails;

  const _CustomerPaymentsTab({this.bankDetails});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: FlowGuardTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Official FlowGuard Bank Details",
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              const SizedBox(height: 6),
              if (bankDetails?.isConfigured == true) ...[
                Text("Bank: ${bankDetails!.bankName}"),
                Text("Account Name: ${bankDetails!.accountName}"),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      bankDetails!.accountNumber,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () {
                        Clipboard.setData(
                          ClipboardData(text: bankDetails!.accountNumber),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text("Account number copied")),
                        );
                      },
                      icon: const Icon(Icons.copy_rounded),
                    ),
                  ],
                ),
              ] else
                const Text(
                  "Bank transfer details will appear here once configured in Admin Settings.",
                  style: TextStyle(fontSize: 13, color: FlowGuardTheme.mutedText),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CustomerProfileTab extends StatelessWidget {
  final String name;
  final String email;
  final String phone;

  const _CustomerProfileTab({
    required this.name,
    required this.email,
    required this.phone,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: FlowGuardTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              if (phone.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  phone,
                  style: const TextStyle(fontSize: 13, color: FlowGuardTheme.mutedText),
                ),
              ],
              if (email.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  email,
                  style: const TextStyle(fontSize: 13, color: FlowGuardTheme.mutedText),
                ),
              ],
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: () => SupabaseConfig.client.auth.signOut(),
                icon: const Icon(Icons.logout_rounded),
                label: const Text("Sign Out"),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(46),
                  foregroundColor: FlowGuardTheme.navy,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
