import "package:flutter/widgets.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";

/// Sub-second WhatsApp-style online presence via Supabase Realtime Presence
/// + immediate backend persistence for delivery ticks (`delivered_at`).
class PresenceService with WidgetsBindingObserver {
  PresenceService._();
  static final PresenceService instance = PresenceService._();

  final ValueNotifier<Set<String>> onlineRoles = ValueNotifier<Set<String>>({});
  final ValueNotifier<Set<String>> onlineKeys = ValueNotifier<Set<String>>({});

  RealtimeChannel? _channel;
  String? _role;
  String? _actorId;
  bool _started = false;

  bool isRoleOnline(String role) => onlineRoles.value.contains(role);

  bool isActorOnline(String role, String? id) {
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
    WidgetsBinding.instance.addObserver(this);

    try {
      final ch = SupabaseConfig.client.channel(
        "flowguard-presence",
        opts: RealtimeChannelConfig(key: "$role:$actorId"),
      );
      _channel = ch
        ..onPresenceSync((_) => _syncState())
        ..onPresenceJoin((_) => _syncState())
        ..onPresenceLeave((_) => _syncState())
        ..subscribe((status, [_]) {
          if (status == RealtimeSubscribeStatus.subscribed) {
            _trackOnline();
          }
        });
    } catch (_) {}

    FlowGuardApiClient.sendPresenceHeartbeat(role: role).catchError((_) {});
  }

  void _syncState() {
    final ch = _channel;
    if (ch == null) return;
    try {
      final states = ch.presenceState();
      final roles = <String>{};
      final keys = <String>{};
      for (final s in states) {
        if (s.key.isNotEmpty) keys.add(s.key);
        for (final p in s.presences) {
          final r = p.payload["role"]?.toString();
          final id = p.payload["id"]?.toString();
          if (r != null && r.isNotEmpty) {
            roles.add(r);
            if (id != null && id.isNotEmpty) {
              keys.add("$r:$id");
            }
          }
        }
      }
      onlineRoles.value = roles;
      onlineKeys.value = keys;
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
  }
}
