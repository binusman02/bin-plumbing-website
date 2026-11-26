import "dart:async";
import "package:flutter/widgets.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";

/// Sub-second WhatsApp-style online presence via unified Supabase Realtime channel
/// ("bin-plumbing-live") + 25s backend heartbeat (70s TTL) + live broadcast signals.
class PresenceService with WidgetsBindingObserver {
  PresenceService._();
  static final PresenceService instance = PresenceService._();

  static const String sharedChannelName = "bin-plumbing-live";

  final ValueNotifier<Set<String>> onlineRoles = ValueNotifier<Set<String>>({});
  final ValueNotifier<Set<String>> onlineKeys = ValueNotifier<Set<String>>({});
  final ValueNotifier<Set<String>> onlineAdminIds = ValueNotifier<Set<String>>({});
  final ValueNotifier<Set<String>> onlinePlumberIds = ValueNotifier<Set<String>>({});
  final ValueNotifier<Set<String>> onlineCustomerIds = ValueNotifier<Set<String>>({});
  final ValueNotifier<int> stateVersion = ValueNotifier<int>(0);

  RealtimeChannel? _channel;
  Timer? _heartbeatTimer;
  String? _role;
  String? _actorId;
  bool _started = false;
  bool _subscribed = false;

  bool isRoleOnline(String role) => onlineRoles.value.contains(role);

  bool get isAdminOnline =>
      onlineRoles.value.contains("admin") || onlineAdminIds.value.isNotEmpty;

  bool isPlumberOnline(String? plumberId) {
    if (plumberId == null || plumberId.isEmpty) return false;
    return onlinePlumberIds.value.contains(plumberId) ||
        onlineKeys.value.contains("plumber:$plumberId");
  }

  bool isCustomerOnline(String? customerId) {
    if (customerId == null || customerId.isEmpty) return false;
    return onlineCustomerIds.value.contains(customerId) ||
        onlineKeys.value.contains("customer:$customerId");
  }

  bool isActorOnline(String role, String? id) {
    if (role == "admin") return isAdminOnline;
    if (role == "plumber") return isPlumberOnline(id);
    if (role == "customer") return isCustomerOnline(id);
    if (id != null && id.isNotEmpty && onlineKeys.value.contains("$role:$id")) {
      return true;
    }
    return isRoleOnline(role);
  }

  void start({required String role, required String actorId}) {
    if (_started && _role == role && _actorId == actorId) return;
    stop();
    _role = role;
    _actorId = actorId;
    _started = true;
    _subscribed = false;
    WidgetsBinding.instance.addObserver(this);

    try {
      final ch = SupabaseConfig.client.channel(
        sharedChannelName,
        opts: RealtimeChannelConfig(key: "$role:$actorId"),
      );
      _channel = ch
        ..onPresenceSync((_) => _syncState())
        ..onPresenceJoin((_) => _syncState())
        ..onPresenceLeave((_) => _syncState())
        ..subscribe((status, [_]) {
          final isSub = status == RealtimeSubscribeStatus.subscribed;
          _subscribed = isSub;
          if (isSub) {
            _trackOnline();
          }
        });
    } catch (_) {}

    FlowGuardApiClient.sendPresenceHeartbeat(role: role).catchError((_) {});
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      final r = _role;
      if (_started && r != null) {
        FlowGuardApiClient.sendPresenceHeartbeat(role: r).catchError((_) {});
        _trackOnline();
      }
    });
  }

  Future<void> broadcastEvent(
    String event,
    Map<String, dynamic> payload,
  ) async {
    final ch = _channel;
    if (ch == null || !_subscribed) return;
    try {
      await ch.sendBroadcastMessage(event: event, payload: payload);
    } catch (_) {}
  }

  void _syncState() {
    final ch = _channel;
    if (ch == null) return;
    try {
      final states = ch.presenceState();
      final roles = <String>{};
      final keys = <String>{};
      final admins = <String>{};
      final plumbers = <String>{};
      final customers = <String>{};

      for (final s in states) {
        if (s.key.isNotEmpty) keys.add(s.key);
        for (final p in s.presences) {
          final r = p.payload["role"]?.toString();
          final id = (p.payload["userId"] ?? p.payload["id"])?.toString();
          if (r != null && r.isNotEmpty) {
            roles.add(r);
            if (id != null && id.isNotEmpty) {
              keys.add("$r:$id");
              if (r == "admin") admins.add(id);
              if (r == "plumber") plumbers.add(id);
              if (r == "customer") customers.add(id);
            }
          }
        }
      }
      onlineRoles.value = roles;
      onlineKeys.value = keys;
      onlineAdminIds.value = admins;
      onlinePlumberIds.value = plumbers;
      onlineCustomerIds.value = customers;
      stateVersion.value += 1;
    } catch (_) {}
  }

  Future<void> _trackOnline() async {
    final ch = _channel;
    final r = _role;
    final id = _actorId;
    if (ch == null || r == null || id == null) return;
    try {
      await ch.track({
        "role": r,
        "userId": id,
        "id": id,
        "online_at": DateTime.now().toUtc().toIso8601String(),
      });
    } catch (_) {}
  }

  Future<void> _untrackOffline() async {
    final ch = _channel;
    if (ch == null) return;
    try {
      await ch.untrack();
    } catch (_) {}
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final r = _role;
    if (r == null) return;
    if (state == AppLifecycleState.resumed) {
      _trackOnline();
      FlowGuardApiClient.sendPresenceHeartbeat(role: r).catchError((_) {});
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.detached ||
        state == AppLifecycleState.hidden) {
      _untrackOffline();
      FlowGuardApiClient.sendPresenceOffline(role: r).catchError((_) {});
    }
  }

  Future<void> stop() async {
    if (!_started) return;
    _started = false;
    _subscribed = false;
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    WidgetsBinding.instance.removeObserver(this);
    final r = _role;
    await _untrackOffline();
    try {
      await _channel?.unsubscribe();
    } catch (_) {}
    _channel = null;
    if (r != null) {
      FlowGuardApiClient.sendPresenceOffline(role: r).catchError((_) {});
    }
    _role = null;
    _actorId = null;
    onlineRoles.value = {};
    onlineKeys.value = {};
    onlineAdminIds.value = {};
    onlinePlumberIds.value = {};
    onlineCustomerIds.value = {};
    stateVersion.value += 1;
  }
}
