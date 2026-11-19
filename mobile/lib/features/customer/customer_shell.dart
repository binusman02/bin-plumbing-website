import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/core/service_assets.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/customer/customer_request_detail_page.dart";
import "package:flowguard_plumbing/features/customer/new_request_sheet.dart";
import "package:flowguard_plumbing/features/shared/notifications_sheet.dart";
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
  String? _savedAddress;

  @override
  void initState() {
    super.initState();
    _loadCustomerData();
  }

  Future<void> _loadCustomerData() async {
    setState(() => _loading = true);
    try {
      final client = SupabaseConfig.client;

      final catRows = await client
          .from("service_categories")
          .select("*")
          .eq("is_active", true)
          .order("sort_order", ascending: true);

      final parsedCategories = catRows
          .where((r) => r["visible"] != false && r["active"] != false)
          .map((r) => ServiceCategoryItem.fromJson(r))
          .toList();

      final settingRow = await client
          .from("settings")
          .select("value")
          .eq("key", "marketplace_settings")
          .maybeSingle();

      BankDetailsData? bank;
      if (settingRow != null && settingRow["value"] is Map<String, dynamic>) {
        bank = BankDetailsData.fromSettingsValue(
          settingRow["value"] as Map<String, dynamic>,
        );
      }

      final customerRows = await client
          .from("customers")
          .select("id, full_name, phone, address")
          .eq("auth_user_id", widget.user.id)
          .limit(1);

      String customerId = "";
      String displayName =
          widget.user.userMetadata?["full_name"]?.toString() ?? "Customer";
      String phone = widget.user.phone ?? "";
      String? savedAddr;
      if (customerRows.isNotEmpty) {
        customerId = customerRows.first["id"]?.toString() ?? "";
        displayName =
            customerRows.first["full_name"]?.toString() ?? displayName;
        phone = customerRows.first["phone"]?.toString() ?? phone;
        savedAddr = customerRows.first["address"]?.toString();
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
          _savedAddress = savedAddr;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
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
        savedAddress: _savedAddress,
        categories: _categories,
        initialCategory: initialCategory,
        onCreated: _loadCustomerData,
      ),
    );
  }

  void _openAllCategoriesSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              "All Categories",
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 14),
            Flexible(
              child: GridView.builder(
                shrinkWrap: true,
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.92,
                ),
                itemCount: _categories.length,
                itemBuilder: (_, idx) {
                  final cat = _categories[idx];
                  return InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () {
                      Navigator.pop(ctx);
                      _openNewRequestSheet(cat.title);
                    },
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 54,
                          height: 54,
                          decoration: BoxDecoration(
                            color: FlowGuardTheme.surface,
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: FlowGuardTheme.border),
                          ),
                          child: Icon(
                            ServiceAssetHelper.resolveCategoryIcon(
                              cat.iconName.isNotEmpty ? cat.iconName : cat.title,
                            ),
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          cat.title,
                          maxLines: 2,
                          textAlign: TextAlign.center,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openRequestDetail(ServiceRequestItem req) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => CustomerRequestDetailPage(
          request: req,
          bankDetails: _bankDetails,
          onUpdated: _loadCustomerData,
          onOpenChat: () => setState(() => _tabIndex = 2),
        ),
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
        onViewAllCategories: _openAllCategoriesSheet,
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
        senderId: _customerId,
      ),
      _CustomerPaymentsTab(bankDetails: _bankDetails),
      _CustomerProfileTab(
        name: _customerName,
        email: widget.user.email ?? "",
        phone: _customerPhone,
        address: _savedAddress,
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
                width: 38,
                height: 38,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 10),
            const Text(
              "FlowGuard",
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
          ],
        ),
        actions: [
          NotificationsButton(
            role: "customer",
            onNavigateLink: (link) {
              if (link != null && link.contains("messages")) {
                setState(() => _tabIndex = 2);
              } else {
                setState(() => _tabIndex = 1);
              }
            },
          ),
          const SizedBox(width: 6),
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

class _CustomerHomeTab extends StatelessWidget {
  final String customerName;
  final bool loading;
  final List<ServiceCategoryItem> categories;
  final List<ServiceRequestItem> requests;
  final Future<void> Function() onRefresh;
  final void Function([String?]) onSelectCategory;
  final VoidCallback onViewAllCategories;
  final void Function(ServiceRequestItem) onOpenRequest;
  final VoidCallback onViewAllRequests;

  const _CustomerHomeTab({
    required this.customerName,
    required this.loading,
    required this.categories,
    required this.requests,
    required this.onRefresh,
    required this.onSelectCategory,
    required this.onViewAllCategories,
    required this.onOpenRequest,
    required this.onViewAllRequests,
  });

  @override
  Widget build(BuildContext context) {
    final activeRequests = requests.where((r) => r.isActive).toList();
    final recentRequests = requests.take(3).toList();
    final spotlight = categories.take(5).toList();

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
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
                  "Welcome, $customerName",
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: () => onSelectCategory(),
                  icon: const Icon(Icons.add),
                  label: const Text("New Plumbing Request"),
                ),
              ],
            ),
          ),
          if (loading) ...[
            const SizedBox(height: 28),
            const Center(child: CircularProgressIndicator()),
          ] else if (categories.isNotEmpty) ...[
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "All Categories",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                TextButton(
                  onPressed: onViewAllCategories,
                  child: const Text("View All >"),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 92,
              child: ScrollConfiguration(
                behavior: ScrollConfiguration.of(context)
                    .copyWith(scrollbars: false),
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (context, idx) {
                    final cat = categories[idx];
                    return InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => onSelectCategory(cat.title),
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
                              ),
                              child: Icon(
                                ServiceAssetHelper.resolveCategoryIcon(
                                  cat.iconName.isNotEmpty
                                      ? cat.iconName
                                      : cat.title,
                                ),
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
              height: 186,
              child: PageView.builder(
                controller: PageController(viewportFraction: 0.88),
                itemCount: spotlight.length,
                itemBuilder: (context, idx) {
                  final cat = spotlight[idx];
                  final assetPath = ServiceAssetHelper.resolveImageAsset(
                    cat.slug.isNotEmpty ? cat.slug : cat.title,
                  );
                  return Container(
                    margin: const EdgeInsets.only(right: 10),
                    clipBehavior: Clip.antiAlias,
                    decoration: BoxDecoration(
                      color: FlowGuardTheme.navy,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.asset(assetPath, fit: BoxFit.cover),
                        Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.black.withValues(alpha: 0.12),
                                FlowGuardTheme.navy.withValues(alpha: 0.55),
                                FlowGuardTheme.navyDark.withValues(alpha: 0.96),
                              ],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.92),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text(
                                  "FLOWGUARD",
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: FlowGuardTheme.navy,
                                  ),
                                ),
                              ),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
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
                                  const SizedBox(height: 10),
                                  ElevatedButton(
                                    onPressed: () =>
                                        onSelectCategory(cat.title),
                                    child: const Text("Request This Service"),
                                  ),
                                ],
                              ),
                            ],
                          ),
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
                  "Active Request",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                TextButton(
                  onPressed: onViewAllRequests,
                  child: const Text("View All"),
                ),
              ],
            ),
            InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => onOpenRequest(activeRequests.first),
              child: _RequestSummaryCard(request: activeRequests.first),
            ),
          ],
          if (recentRequests.length > 1) ...[
            const SizedBox(height: 18),
            const Text(
              "Recent Requests",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 8),
            ...recentRequests.skip(activeRequests.isNotEmpty ? 1 : 0).map(
                  (req) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => onOpenRequest(req),
                      child: _RequestSummaryCard(request: req),
                    ),
                  ),
                ),
          ],
        ],
      ),
    );
  }
}

class _CustomerRequestsTab extends StatefulWidget {
  final List<ServiceRequestItem> requests;
  final VoidCallback onNewRequest;
  final void Function(ServiceRequestItem) onOpenRequest;

  const _CustomerRequestsTab({
    required this.requests,
    required this.onNewRequest,
    required this.onOpenRequest,
  });

  @override
  State<_CustomerRequestsTab> createState() => _CustomerRequestsTabState();
}

class _CustomerRequestsTabState extends State<_CustomerRequestsTab> {
  String _filter = "All";

  @override
  Widget build(BuildContext context) {
    final filtered = widget.requests.where((r) {
      if (_filter == "Active") return r.isActive;
      if (_filter == "Needs Action") {
        return r.status == "awaiting_final_payment" ||
            r.status == "work_completed" ||
            r.status == "scheduled";
      }
      if (_filter == "Completed") return r.status == "completed";
      return true;
    }).toList();

    const filters = ["All", "Active", "Needs Action", "Completed"];

    return Column(
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
          child: Row(
            children: filters.map((f) {
              final selected = _filter == f;
              return Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(f),
                  selected: selected,
                  onSelected: (_) => setState(() => _filter = f),
                  selectedColor: FlowGuardTheme.navy,
                  labelStyle: TextStyle(
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : FlowGuardTheme.navy,
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(
                          Icons.assignment_outlined,
                          size: 48,
                          color: FlowGuardTheme.mutedText,
                        ),
                        const SizedBox(height: 12),
                        Text(
                          "No $_filter Requests",
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton(
                          onPressed: widget.onNewRequest,
                          child: const Text("New Plumbing Request"),
                        ),
                      ],
                    ),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, idx) {
                    final req = filtered[idx];
                    return InkWell(
                      borderRadius: BorderRadius.circular(18),
                      onTap: () => widget.onOpenRequest(req),
                      child: _RequestSummaryCard(request: req),
                    );
                  },
                ),
        ),
      ],
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
              const SizedBox(height: 8),
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
  final String? address;

  const _CustomerProfileTab({
    required this.name,
    required this.email,
    required this.phone,
    this.address,
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
                const SizedBox(height: 6),
                Text(
                  phone,
                  style: const TextStyle(
                    fontSize: 13,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ],
              if (email.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  email,
                  style: const TextStyle(
                    fontSize: 13,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ],
              if (address != null && address!.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  address!,
                  style: const TextStyle(
                    fontSize: 13,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: () async {
                  final token = GoogleServicesBootstrap.fcmToken;
                  if (token != null) {
                    await FlowGuardApiClient.deactivateDeviceToken(token)
                        .catchError((_) {});
                  }
                  await SupabaseConfig.client.auth.signOut();
                },
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
