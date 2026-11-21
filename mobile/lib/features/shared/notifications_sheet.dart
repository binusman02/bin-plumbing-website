import "dart:async";
import "package:firebase_messaging/firebase_messaging.dart";
import "package:flutter/material.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_state_badges.dart";
import "package:flowguard_plumbing/core/google_services.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class NotificationsButton extends StatefulWidget {
  final String role;
  final void Function(String? link)? onNavigateLink;

  const NotificationsButton({
    super.key,
    required this.role,
    this.onNavigateLink,
  });

  @override
  State<NotificationsButton> createState() => _NotificationsButtonState();
}

class _NotificationsButtonState extends State<NotificationsButton> {
  int _unreadCount = 0;
  Timer? _pollTimer;
  StreamSubscription<RemoteMessage>? _fcmSub;

  @override
  void initState() {
    super.initState();
    _refreshCount();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 45),
      (_) => _refreshCount(),
    );
    if (GoogleServicesBootstrap.firebaseReady) {
      _fcmSub = FirebaseMessaging.onMessage.listen((msg) {
        final type = (msg.data["type"] ?? "").toString();
        if (type == "new_message") {
          return;
        }
        _refreshCount();
        final title = msg.notification?.title;
        final body = msg.notification?.body;
        if (mounted && title != null && title.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                body != null && body.isNotEmpty ? "$title: $body" : title,
              ),
              action: SnackBarAction(
                label: "View",
                onPressed: _openCentre,
              ),
            ),
          );
        }
      });
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _fcmSub?.cancel();
    super.dispose();
  }

  Future<void> _refreshCount() async {
    try {
      final data = await FlowGuardApiClient.fetchNotifications(
        role: widget.role,
        limit: 20,
      );
      final count = (data["unreadCount"] as num?)?.toInt() ?? 0;
      AppStateBadges.unreadNotificationsCount.value = count;
      if (mounted) {
        setState(() => _unreadCount = count);
      }
    } catch (_) {}
  }

  void _openCentre() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => _NotificationCentreSheet(
        role: widget.role,
        onUpdated: _refreshCount,
        onNavigateLink: widget.onNavigateLink,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          onPressed: _openCentre,
          icon: const Icon(Icons.notifications_none_rounded, size: 26),
          tooltip: "Notifications",
        ),
        if (_unreadCount > 0)
          Positioned(
            right: 6,
            top: 6,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: const Color(0xFFDC2626),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _unreadCount > 9 ? "9+" : "$_unreadCount",
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _NotificationCentreSheet extends StatefulWidget {
  final String role;
  final VoidCallback onUpdated;
  final void Function(String? link)? onNavigateLink;

  const _NotificationCentreSheet({
    required this.role,
    required this.onUpdated,
    this.onNavigateLink,
  });

  @override
  State<_NotificationCentreSheet> createState() =>
      _NotificationCentreSheetState();
}

class _NotificationCentreSheetState extends State<_NotificationCentreSheet> {
  static final Map<String, List<NotificationItem>> _cachedByRole = {};
  bool _loading = true;
  List<NotificationItem> _items = [];

  @override
  void initState() {
    super.initState();
    final cached = _cachedByRole[widget.role];
    if (cached != null) {
      _items = List<NotificationItem>.from(cached);
      _loading = false;
    }
    _load();
  }

  Future<void> _load() async {
    if (_items.isEmpty && mounted) {
      setState(() => _loading = true);
    }
    try {
      final data = await FlowGuardApiClient.fetchNotifications(
        role: widget.role,
        limit: 40,
      );
      final raw = data["items"] ?? data["notifications"];
      final list = <NotificationItem>[];
      if (raw is List) {
        for (final entry in raw) {
          if (entry is Map<String, dynamic>) {
            list.add(NotificationItem.fromJson(entry));
          }
        }
      }
      _cachedByRole[widget.role] = list;
      final unread = (data["unreadCount"] as num?)?.toInt() ??
          list.where((e) => !e.isRead).length;
      AppStateBadges.unreadNotificationsCount.value = unread;
      if (mounted) {
        setState(() {
          _items = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markAllRead() async {
    AppStateBadges.unreadNotificationsCount.value = 0;
    try {
      await FlowGuardApiClient.markNotificationRead(
        role: widget.role,
        markAll: true,
      );
      await _load();
      widget.onUpdated();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: MediaQuery.of(context).size.height * 0.72,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "Notifications",
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                TextButton(
                  onPressed: _items.isEmpty ? null : _markAllRead,
                  child: const Text("Mark all read"),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                    ? const Center(
                        child: Text(
                          "No notifications yet.",
                          style: TextStyle(color: FlowGuardTheme.mutedText),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, idx) {
                          final item = _items[idx];
                          return ListTile(
                            onTap: () async {
                              if (!item.isRead) {
                                await FlowGuardApiClient.markNotificationRead(
                                  role: widget.role,
                                  notificationId: item.id,
                                );
                                widget.onUpdated();
                              }
                              if (context.mounted) {
                                Navigator.pop(context);
                                widget.onNavigateLink?.call(item.link);
                              }
                            },
                            tileColor: item.isRead
                                ? Colors.white
                                : const Color(0xFFFFFBEB),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                              side: const BorderSide(color: FlowGuardTheme.border),
                            ),
                            title: Text(
                              item.title,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            subtitle: Text(
                              item.body,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 12),
                            ),
                            trailing: item.isRead
                                ? null
                                : const Icon(
                                    Icons.circle,
                                    size: 10,
                                    color: FlowGuardTheme.gold,
                                  ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
