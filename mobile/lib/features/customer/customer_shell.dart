import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:image_picker/image_picker.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_state_badges.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/core/service_assets.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/customer/customer_request_detail_page.dart";
import "package:flowguard_plumbing/features/customer/new_request_sheet.dart";
import "package:flowguard_plumbing/features/shared/notifications_sheet.dart";
import "package:flowguard_plumbing/features/shared/profile_and_edit_pages.dart";
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
  List<Map<String, dynamic>> _payments = [];
  BankDetailsData? _bankDetails;
  String _customerId = "";
  String _customerName = "Customer";
  String _customerPhone = "";
  String? _savedAddress;
  String? _avatarUrl;

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
          .where(
            (r) =>
                r["visible"] != false &&
                r["active"] != false &&
                r["deleted_at"] == null,
          )
          .map((r) => ServiceCategoryItem.fromJson(r))
          .toList();

      final payAndBank = await FlowGuardApiClient.fetchPaymentsAndBank(
        role: "customer",
      );
      BankDetailsData? bank;
      if (payAndBank["bankDetails"] is Map<String, dynamic>) {
        bank = BankDetailsData.fromSettingsValue(
          payAndBank["bankDetails"] as Map<String, dynamic>,
        );
      }
      final rawPayments = payAndBank["payments"] as List? ?? [];
      final parsedPayments =
          rawPayments.whereType<Map<String, dynamic>>().toList();

      final profileResp = await FlowGuardApiClient.fetchProfile(
        role: "customer",
      );
      final profileMap = profileResp?["profile"] as Map<String, dynamic>?;

      String customerId = profileMap?["id"]?.toString() ?? "";
      String displayName = profileMap?["full_name"]?.toString() ??
          widget.user.userMetadata?["full_name"]?.toString() ??
          "Customer";
      String phone =
          profileMap?["phone"]?.toString() ?? widget.user.phone ?? "";
      String? savedAddr = profileMap?["address"]?.toString();
      String? avatarUrl = profileMap?["avatar_url"]?.toString();

      if (customerId.isEmpty) {
        final customerRows = await client
            .from("customers")
            .select("id, full_name, phone, address, avatar_url")
            .eq("auth_user_id", widget.user.id)
            .limit(1);
        if (customerRows.isNotEmpty) {
          customerId = customerRows.first["id"]?.toString() ?? "";
          displayName =
              customerRows.first["full_name"]?.toString() ?? displayName;
          phone = customerRows.first["phone"]?.toString() ?? phone;
          savedAddr = customerRows.first["address"]?.toString();
          avatarUrl = customerRows.first["avatar_url"]?.toString();
        }
      }

      final reqList = <ServiceRequestItem>[];
      if (customerId.isNotEmpty) {
        final rows = await client
            .from("service_requests")
            .select()
            .eq("customer_id", customerId)
            .order("created_at", ascending: false);
        for (final row in rows) {
          if (row["deleted_at"] == null) {
            reqList.add(ServiceRequestItem.fromJson(row));
          }
        }
      }

      if (mounted) {
        setState(() {
          _categories = parsedCategories;
          _requests = reqList;
          _payments = parsedPayments;
          _bankDetails = bank;
          _customerId = customerId;
          _customerName = displayName;
          _customerPhone = phone;
          _savedAddress = savedAddr;
          _avatarUrl = avatarUrl;
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
      _CustomerPaymentsTab(
        bankDetails: _bankDetails,
        requests: _requests,
        payments: _payments,
        onUploaded: _loadCustomerData,
      ),
      FlowGuardProfileView(
        role: "customer",
        fullName: _customerName,
        phone: _customerPhone,
        email: widget.user.email ?? "",
        location: _savedAddress ?? "Kano State, Nigeria",
        avatarUrl: _avatarUrl,
        onProfileUpdated: _loadCustomerData,
        onSignOut: () async {
          final token = GoogleServicesBootstrap.fcmToken;
          if (token != null) {
            await FlowGuardApiClient.deactivateDeviceToken(token)
                .catchError((_) {});
          }
          await SupabaseConfig.client.auth.signOut();
        },
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
              if (link == null || link.isEmpty) return;
              if (link.contains("messages")) {
                setState(() => _tabIndex = 2);
                return;
              }
              if (link.contains("payments")) {
                setState(() => _tabIndex = 3);
                return;
              }
              final match =
                  _requests.where((r) => link.contains(r.ticketNumber)).firstOrNull;
              if (match != null) {
                _openRequestDetail(match);
                return;
              }
              setState(() => _tabIndex = 1);
            },
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
      body: IndexedStack(index: _tabIndex, children: pages),
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
              icon: Icon(Icons.assignment_outlined),
              label: "Requests",
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
              icon: Icon(Icons.credit_card_outlined),
              label: "Payments",
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
}

class _CustomerHomeTab extends StatefulWidget {
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
  State<_CustomerHomeTab> createState() => _CustomerHomeTabState();
}

class _CustomerHomeTabState extends State<_CustomerHomeTab> {
  late final PageController _spotlightController;
  int _spotlightPage = 0;

  @override
  void initState() {
    super.initState();
    _spotlightController = PageController(viewportFraction: 0.90);
  }

  @override
  void dispose() {
    _spotlightController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final activeRequests = widget.requests.where((r) => r.isActive).toList();
    final recentRequests = widget.requests.take(3).toList();
    final spotlight = widget.categories.take(5).toList();

    return RefreshIndicator(
      onRefresh: widget.onRefresh,
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
                  "Welcome, ${widget.customerName}",
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: () => widget.onSelectCategory(),
                  icon: const Icon(Icons.add),
                  label: const Text(
                    "New Plumbing Request",
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          if (widget.loading) ...[
            const SizedBox(height: 28),
            const Center(child: CircularProgressIndicator()),
          ] else if (widget.categories.isNotEmpty) ...[
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
                  onPressed: widget.onViewAllCategories,
                  child: const Text("View All >", maxLines: 1),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              height: 100,
              child: ScrollConfiguration(
                behavior: ScrollConfiguration.of(context)
                    .copyWith(scrollbars: false),
                child: ListView.separated(
                  physics: const BouncingScrollPhysics(),
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
              height: 196,
              child: PageView.builder(
                controller: _spotlightController,
                padEnds: false,
                physics: const BouncingScrollPhysics(),
                onPageChanged: (p) => setState(() => _spotlightPage = p),
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
                                    style: ElevatedButton.styleFrom(
                                      minimumSize: const Size(0, 40),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 16,
                                        vertical: 8,
                                      ),
                                    ),
                                    onPressed: () =>
                                        widget.onSelectCategory(cat.title),
                                    child: const Text(
                                      "Request This Service",
                                      maxLines: 1,
                                    ),
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
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: _spotlightPage > 0
                      ? () => _spotlightController.previousPage(
                            duration: const Duration(milliseconds: 260),
                            curve: Curves.easeOut,
                          )
                      : null,
                  icon: const Icon(Icons.chevron_left_rounded, size: 20),
                ),
                ...List.generate(
                  spotlight.length,
                  (i) => Container(
                    width: _spotlightPage == i ? 18 : 6,
                    height: 6,
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    decoration: BoxDecoration(
                      color: _spotlightPage == i
                          ? FlowGuardTheme.navy
                          : FlowGuardTheme.border,
                      borderRadius: BorderRadius.circular(999),
                    ),
                  ),
                ),
                IconButton(
                  visualDensity: VisualDensity.compact,
                  onPressed: _spotlightPage < spotlight.length - 1
                      ? () => _spotlightController.nextPage(
                            duration: const Duration(milliseconds: 260),
                            curve: Curves.easeOut,
                          )
                      : null,
                  icon: const Icon(Icons.chevron_right_rounded, size: 20),
                ),
              ],
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
                  onPressed: widget.onViewAllRequests,
                  child: const Text("View All", maxLines: 1),
                ),
              ],
            ),
            InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: () => widget.onOpenRequest(activeRequests.first),
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
                      onTap: () => widget.onOpenRequest(req),
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
            r.status == "awaiting_approval" ||
            r.status == "quotation_submitted" ||
            r.status == "quoted";
      }
      if (_filter == "Completed") return r.status == "completed";
      if (_filter == "Cancelled") return r.status == "cancelled";
      return true;
    }).toList();

    const filters = ["All", "Active", "Needs Action", "Completed", "Cancelled"];

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

class _CustomerPaymentsTab extends StatefulWidget {
  final BankDetailsData? bankDetails;
  final List<ServiceRequestItem> requests;
  final List<Map<String, dynamic>> payments;
  final Future<void> Function() onUploaded;

  const _CustomerPaymentsTab({
    this.bankDetails,
    required this.requests,
    required this.payments,
    required this.onUploaded,
  });

  @override
  State<_CustomerPaymentsTab> createState() => _CustomerPaymentsTabState();
}

class _CustomerPaymentsTabState extends State<_CustomerPaymentsTab> {
  bool _uploading = false;
  String? _selectedTicket;

  @override
  void initState() {
    super.initState();
    _syncDefaultTicket();
  }

  @override
  void didUpdateWidget(covariant _CustomerPaymentsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncDefaultTicket();
  }

  void _syncDefaultTicket() {
    final valid = widget.requests.any((r) => r.ticketNumber == _selectedTicket);
    if (!valid && widget.requests.isNotEmpty) {
      _selectedTicket =
          (widget.requests.where((r) => r.isActive).firstOrNull ??
                  widget.requests.first)
              .ticketNumber;
    }
  }

  Future<void> _uploadProof() async {
    final activeReq = widget.requests
            .where((r) => r.ticketNumber == _selectedTicket)
            .firstOrNull ??
        widget.requests.where((r) => r.isActive).firstOrNull ??
        widget.requests.firstOrNull;
    if (activeReq == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            "Submit a plumbing request before uploading payment proof.",
          ),
        ),
      );
      return;
    }

    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 80,
      maxWidth: 1400,
    );
    if (picked == null) return;

    setState(() => _uploading = true);
    try {
      final bytes = await picked.readAsBytes();
      final url = await FlowGuardApiClient.uploadRequestPhoto(
        bytes: bytes,
        filename: picked.name,
      );
      await FlowGuardApiClient.recordPayment(
        ticketNumber: activeReq.ticketNumber,
        proofUrl: url,
      );
      await widget.onUploaded();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              "Proof of payment uploaded for ${activeReq.ticketNumber}.",
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Upload failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bank = widget.bankDetails;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Official FlowGuard Bank Details Card
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: FlowGuardTheme.navy,
            borderRadius: BorderRadius.circular(22),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "OFFICIAL FLOWGUARD BANK DETAILS",
                style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.0,
                  color: FlowGuardTheme.gold,
                ),
              ),
              const SizedBox(height: 12),
              if (bank?.isConfigured == true) ...[
                Text(
                  bank!.bankName,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  bank.accountName,
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFFCBD5E1),
                  ),
                ),
                const SizedBox(height: 14),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Row(
                    children: [
                      Text(
                        bank.accountNumber,
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.2,
                          color: Colors.white,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        onPressed: () {
                          Clipboard.setData(
                            ClipboardData(text: bank.accountNumber),
                          );
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text("Account number copied"),
                            ),
                          );
                        },
                        icon: const Icon(
                          Icons.copy_rounded,
                          color: FlowGuardTheme.gold,
                        ),
                      ),
                    ],
                  ),
                ),
              ] else
                const Text(
                  "Bank transfer details will appear here once configured in Admin Settings.",
                  style: TextStyle(fontSize: 13, color: Color(0xFFCBD5E1)),
                ),
            ],
          ),
        ),

        const SizedBox(height: 16),

        if (widget.requests.isNotEmpty) ...[
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: _selectedTicket,
            decoration: const InputDecoration(
              labelText: "Select Request / Ticket for Payment",
            ),
            items: widget.requests
                .map(
                  (r) => DropdownMenuItem(
                    value: r.ticketNumber,
                    child: Text(
                      "${r.ticketNumber} • ${r.problemCategory}",
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                )
                .toList(),
            onChanged: (v) => setState(() => _selectedTicket = v),
          ),
          const SizedBox(height: 14),
        ],

        // Single Box directly below card: "Upload Proof of Payment"
        InkWell(
          onTap: _uploading ? null : _uploadProof,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: FlowGuardTheme.navy.withValues(alpha: 0.35),
                width: 1.5,
              ),
            ),
            child: Column(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF1F5F9),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: _uploading
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        )
                      : const Icon(
                          Icons.cloud_upload_outlined,
                          size: 28,
                          color: FlowGuardTheme.navy,
                        ),
                ),
                const SizedBox(height: 12),
                const Text(
                  "Upload Proof of Payment",
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "Tap to select your bank transfer receipt photo",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ],
            ),
          ),
        ),

        if (widget.payments.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text(
            "Payment History & Verification",
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: FlowGuardTheme.navy,
            ),
          ),
          const SizedBox(height: 8),
          ...widget.payments.map((p) {
            final status = (p["verification_status"] ?? "pending").toString();
            final ticket = (p["ticket_number"] ?? "").toString();
            final total = (p["total_payment"] as num?)?.toDouble() ?? 0;
            final isVerified = status == "verified";
            final isRejected = status == "rejected";
            return Container(
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
                        ticket,
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        "₦${total.toStringAsFixed(0)} • ${status.toUpperCase()}",
                        style: const TextStyle(
                          fontSize: 12,
                          color: FlowGuardTheme.mutedText,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: isVerified
                          ? const Color(0xFFD1FAE5)
                          : isRejected
                              ? const Color(0xFFFEE2E2)
                              : const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      isVerified
                          ? "Verified"
                          : isRejected
                              ? "Rejected"
                              : "Pending",
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: isVerified
                            ? const Color(0xFF065F46)
                            : isRejected
                                ? const Color(0xFF991B1B)
                                : const Color(0xFF92400E),
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }
}
