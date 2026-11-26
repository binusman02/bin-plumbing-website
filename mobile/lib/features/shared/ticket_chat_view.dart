import "dart:async";
import "dart:io";
import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:path_provider/path_provider.dart";
import "package:record/record.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/app_state_badges.dart";
import "package:flowguard_plumbing/core/presence_service.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/shared/voice_note_widgets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class ConversationSummary {
  final String conversationId;
  final String conversationType;
  final String ticketNumber;
  final String problemCategory;
  final String peerName;
  final String peerRole;
  final String? peerId;
  final String? peerAvatarUrl;
  final String? customerId;
  final String? assignedPlumberId;
  final bool adminOnline;
  final bool plumberOnline;
  final bool customerOnline;
  final String ownerName;
  final String status;
  final String lastMessage;
  final String? lastMessageAt;
  final String? lastSenderRole;
  final String? lastReceiptStatus;
  final int unreadCount;
  final bool online;

  const ConversationSummary({
    required this.conversationId,
    required this.conversationType,
    required this.ticketNumber,
    required this.problemCategory,
    required this.peerName,
    required this.peerRole,
    this.peerId,
    this.peerAvatarUrl,
    this.customerId,
    this.assignedPlumberId,
    this.adminOnline = false,
    this.plumberOnline = false,
    this.customerOnline = false,
    required this.ownerName,
    required this.status,
    required this.lastMessage,
    this.lastMessageAt,
    this.lastSenderRole,
    this.lastReceiptStatus,
    required this.unreadCount,
    required this.online,
  });

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      conversationId: (json["conversationId"] ?? "").toString(),
      conversationType: (json["conversationType"] ?? "customer_support").toString(),
      ticketNumber: (json["ticketNumber"] ?? "").toString(),
      problemCategory: (json["problemCategory"] ?? "Plumbing").toString(),
      peerName: (json["peerName"] ?? "FlowGuard Support").toString(),
      peerRole: (json["peerRole"] ?? "admin").toString(),
      peerId: json["peerId"]?.toString(),
      peerAvatarUrl: json["peerAvatarUrl"]?.toString(),
      customerId: json["customerId"]?.toString(),
      assignedPlumberId: json["assignedPlumberId"]?.toString(),
      adminOnline: json["adminOnline"] == true,
      plumberOnline: json["plumberOnline"] == true,
      customerOnline: json["customerOnline"] == true,
      ownerName: (json["ownerName"] ?? "FlowGuard Support").toString(),
      status: (json["status"] ?? "open").toString(),
      lastMessage: (json["lastMessage"] ?? "").toString(),
      lastMessageAt: json["lastMessageAt"]?.toString(),
      lastSenderRole: json["lastSenderRole"]?.toString(),
      lastReceiptStatus: json["lastReceiptStatus"]?.toString(),
      unreadCount: (json["unreadCount"] as num?)?.toInt() ?? 0,
      online: json["online"] == true,
    );
  }
}

({bool isOnline, String label}) resolveMobileThreadPresence({
  required ConversationSummary item,
  required String viewerRole,
  bool? serverAdminOnline,
  bool? serverPlumberOnline,
  bool? serverCustomerOnline,
}) {
  final svc = PresenceService.instance;
  final adminOn = svc.isAdminOnline || (serverAdminOnline ?? item.adminOnline);
  final plumberOn = (item.assignedPlumberId != null &&
          item.assignedPlumberId!.isNotEmpty)
      ? (svc.isPlumberOnline(item.assignedPlumberId) ||
          (serverPlumberOnline ?? item.plumberOnline))
      : (serverPlumberOnline ?? item.plumberOnline);
  final customerOn = (item.customerId != null && item.customerId!.isNotEmpty)
      ? (svc.isCustomerOnline(item.customerId) ||
          (serverCustomerOnline ?? item.customerOnline))
      : (serverCustomerOnline ?? item.customerOnline);

  if (viewerRole == "customer") {
    if (item.assignedPlumberId != null && item.assignedPlumberId!.isNotEmpty) {
      if (adminOn && plumberOn) {
        return (isOnline: true, label: "Admin & Plumber online");
      }
      if (adminOn) {
        return (isOnline: true, label: "Admin online");
      }
      if (plumberOn) {
        return (isOnline: true, label: "Plumber online");
      }
      return (isOnline: false, label: "Offline");
    }
    return (isOnline: adminOn, label: adminOn ? "Admin online" : "Offline");
  }

  if (viewerRole == "plumber") {
    if (adminOn && customerOn) {
      return (isOnline: true, label: "Admin & Customer online");
    }
    if (adminOn) {
      return (isOnline: true, label: "Admin online");
    }
    if (customerOn) {
      return (isOnline: true, label: "Customer online");
    }
    return (isOnline: false, label: "Offline");
  }

  if (customerOn && plumberOn) {
    return (isOnline: true, label: "Customer & Plumber online");
  }
  if (customerOn) {
    return (isOnline: true, label: "Customer online");
  }
  if (plumberOn) {
    return (isOnline: true, label: "Plumber online");
  }
  return (isOnline: false, label: "Offline");
}

/// Dedicated WhatsApp-style Messages tab backed by owned conversations & Supabase Realtime.
class TicketChatView extends StatefulWidget {
  final List<ServiceRequestItem> tickets;
  final String senderRole; // "customer" | "plumber"
  final String senderName;
  final String senderId;

  const TicketChatView({
    super.key,
    required this.tickets,
    required this.senderRole,
    required this.senderName,
    required this.senderId,
  });

  @override
  State<TicketChatView> createState() => _TicketChatViewState();
}

class _TicketChatViewState extends State<TicketChatView> {
  String _searchQuery = "";
  List<ConversationSummary> _conversations = [];
  bool _loading = true;
  String? _error;
  RealtimeChannel? _rtChannel;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadConversations();
    _subscribeRealtime();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _loadConversations(quiet: true),
    );
  }

  @override
  void didUpdateWidget(covariant TicketChatView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.tickets.length != widget.tickets.length) {
      _loadConversations(quiet: true);
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _rtChannel?.unsubscribe();
    super.dispose();
  }

  void _subscribeRealtime() {
    try {
      _rtChannel = SupabaseConfig.client
          .channel("mobile-chat-list-${widget.senderRole}-${widget.senderId}")
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: "public",
            table: "messages",
            callback: (_) => _loadConversations(quiet: true),
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: "public",
            table: "messages",
            callback: (_) => _loadConversations(quiet: true),
          )
          .subscribe();
    } catch (_) {}
  }

  Future<void> _loadConversations({bool quiet = false}) async {
    if (!quiet && _conversations.isEmpty && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final data = await FlowGuardApiClient.fetchConversations(
        role: widget.senderRole,
      );
      final raw = data["conversations"] as List? ?? [];
      final parsed = raw
          .whereType<Map<String, dynamic>>()
          .map(ConversationSummary.fromJson)
          .toList();
      final totalUnread = (data["totalUnread"] as num?)?.toInt() ?? 0;
      AppStateBadges.unreadMessagesCount.value = totalUnread;

      if (mounted) {
        setState(() {
          _conversations = parsed;
          _loading = false;
          _error = null;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          if (_conversations.isEmpty) {
            _error = "Unable to load conversations. Pull down to retry.";
          }
        });
      }
    }
  }

  String _formatShortTime(String? iso) {
    if (iso == null || iso.isEmpty) return "";
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return "";
    final hh = dt.hour.toString().padLeft(2, "0");
    final mm = dt.minute.toString().padLeft(2, "0");
    return "$hh:$mm";
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _conversations.where((c) {
      if (_searchQuery.trim().isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return c.peerName.toLowerCase().contains(q) ||
          c.ticketNumber.toLowerCase().contains(q) ||
          c.problemCategory.toLowerCase().contains(q) ||
          c.lastMessage.toLowerCase().contains(q);
    }).toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: InputDecoration(
              hintText: "Search conversations or ticket...",
              prefixIcon: const Icon(Icons.search_rounded),
              filled: true,
              fillColor: Colors.white,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 16,
                vertical: 10,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: const BorderSide(color: FlowGuardTheme.border),
              ),
            ),
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () => _loadConversations(),
            child: _loading && _conversations.isEmpty
                ? const Center(child: CircularProgressIndicator())
                    : _error != null && _conversations.isEmpty
                        ? ListView(
                            children: [
                              const SizedBox(height: 80),
                              Center(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 24),
                                  child: Column(
                                    children: [
                                      Text(
                                        _error!,
                                        textAlign: TextAlign.center,
                                        style: const TextStyle(
                                          color: FlowGuardTheme.mutedText,
                                        ),
                                      ),
                                      const SizedBox(height: 12),
                                      OutlinedButton(
                                        onPressed: _loadConversations,
                                        child: const Text("Retry"),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          )
                    : filtered.isEmpty
                        ? ListView(
                            children: const [
                              SizedBox(height: 80),
                              Padding(
                                padding: EdgeInsets.symmetric(horizontal: 28),
                                child: Text(
                                  "No conversations yet. Submit or accept a plumbing request to chat with your technician or support.",
                                  textAlign: TextAlign.center,
                                  style: TextStyle(
                                    color: FlowGuardTheme.mutedText,
                                  ),
                                ),
                              ),
                            ],
                          )
                        : ListView.separated(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            itemCount: filtered.length,
                            separatorBuilder: (_, __) => const Divider(
                              height: 1,
                              indent: 78,
                              endIndent: 16,
                            ),
                            itemBuilder: (context, idx) {
                              final item = filtered[idx];
                              final isSupport = item.peerRole == "admin";
                              final timeLabel =
                                  _formatShortTime(item.lastMessageAt);
                              final isMe =
                                  item.lastSenderRole == widget.senderRole;
                              final hasUnread = item.unreadCount > 0;

                              return ListTile(
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 16,
                                  vertical: 6,
                                ),
                                onTap: () async {
                                  await Navigator.of(context).push(
                                    MaterialPageRoute(
                                      builder: (_) => WhatsAppConversationPage(
                                        conversation: item,
                                        senderRole: widget.senderRole,
                                        senderName: widget.senderName,
                                      ),
                                    ),
                                  );
                                  _loadConversations(quiet: true);
                                },
                                leading: Stack(
                                  children: [
                                    CircleAvatar(
                                      radius: 25,
                                      backgroundColor: isSupport
                                          ? FlowGuardTheme.navy
                                          : const Color(0xFFE2E8F0),
                                      child: isSupport
                                          ? ClipOval(
                                              child: Image.asset(
                                                "assets/images/flowguard-icon.jpg",
                                                width: 50,
                                                height: 50,
                                                fit: BoxFit.cover,
                                              ),
                                            )
                                          : item.peerAvatarUrl != null &&
                                                  item.peerAvatarUrl!.isNotEmpty
                                              ? ClipOval(
                                                  child: Image.network(
                                                    FlowGuardApiClient
                                                        .authenticatedFileUrl(
                                                      item.peerAvatarUrl!,
                                                    ),
                                                    headers: FlowGuardApiClient
                                                        .fileAuthHeaders(
                                                      FlowGuardApiClient
                                                          .authenticatedFileUrl(
                                                        item.peerAvatarUrl!,
                                                      ),
                                                    ),
                                                    width: 50,
                                                    height: 50,
                                                    fit: BoxFit.cover,
                                                    errorBuilder:
                                                        (_, __, ___) => Text(
                                                      item.peerName.isNotEmpty
                                                          ? item.peerName[0]
                                                              .toUpperCase()
                                                          : "U",
                                                      style: const TextStyle(
                                                        fontWeight:
                                                            FontWeight.w800,
                                                        fontSize: 18,
                                                        color: FlowGuardTheme
                                                            .navy,
                                                      ),
                                                    ),
                                                  ),
                                                )
                                              : Text(
                                                  item.peerName.isNotEmpty
                                                      ? item.peerName[0]
                                                          .toUpperCase()
                                                      : "U",
                                                  style: const TextStyle(
                                                    fontWeight: FontWeight.w800,
                                                    fontSize: 18,
                                                    color: FlowGuardTheme.navy,
                                                  ),
                                                ),
                                    ),
                                      Positioned(
                                      bottom: 0,
                                      right: 0,
                                      child: ValueListenableBuilder<int>(
                                        valueListenable:
                                            PresenceService.instance.stateVersion,
                                        builder: (_, __, ___) {
                                          final live = resolveMobileThreadPresence(
                                            item: item,
                                            viewerRole: widget.senderRole,
                                          );
                                          return Container(
                                            width: 13,
                                            height: 13,
                                            decoration: BoxDecoration(
                                              color: live.isOnline
                                                  ? const Color(0xFF22C55E)
                                                  : const Color(0xFF94A3B8),
                                              shape: BoxShape.circle,
                                              border: Border.all(
                                                color: Colors.white,
                                                width: 2,
                                              ),
                                            ),
                                          );
                                        },
                                      ),
                                    ),
                                  ],
                                ),
                                title: Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        item.peerName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          fontWeight: hasUnread
                                              ? FontWeight.w900
                                              : FontWeight.w800,
                                          fontSize: 15,
                                          color: FlowGuardTheme.navy,
                                        ),
                                      ),
                                    ),
                                    if (timeLabel.isNotEmpty)
                                      Text(
                                        timeLabel,
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          fontWeight: hasUnread
                                              ? FontWeight.w800
                                              : FontWeight.w500,
                                          color: hasUnread
                                              ? const Color(0xFF059669)
                                              : FlowGuardTheme.mutedText,
                                        ),
                                      ),
                                  ],
                                ),
                                subtitle: Padding(
                                  padding: const EdgeInsets.only(top: 3),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      ValueListenableBuilder<int>(
                                        valueListenable:
                                            PresenceService.instance.stateVersion,
                                        builder: (_, __, ___) {
                                          final pres = resolveMobileThreadPresence(
                                            item: item,
                                            viewerRole: widget.senderRole,
                                          );
                                          return Text(
                                            "${item.ticketNumber} • ${pres.isOnline ? pres.label : item.problemCategory}",
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                              color: pres.isOnline
                                                  ? const Color(0xFF059669)
                                                  : FlowGuardTheme.navy,
                                            ),
                                          );
                                        },
                                      ),
                                      const SizedBox(height: 2),
                                      Row(
                                        children: [
                                          if (isMe &&
                                              item.lastReceiptStatus !=
                                                  null) ...[
                                            ValueListenableBuilder<int>(
                                              valueListenable: PresenceService
                                                  .instance.stateVersion,
                                              builder: (_, __, ___) {
                                                final pres =
                                                    resolveMobileThreadPresence(
                                                  item: item,
                                                  viewerRole: widget.senderRole,
                                                );
                                                final showSingle =
                                                    item.lastReceiptStatus ==
                                                            "sent" &&
                                                        !pres.isOnline;
                                                return Icon(
                                                  showSingle
                                                      ? Icons.done_rounded
                                                      : Icons.done_all_rounded,
                                                  size: 15,
                                                  color: item.lastReceiptStatus ==
                                                          "read"
                                                      ? const Color(0xFF0284C7)
                                                      : FlowGuardTheme.mutedText,
                                                );
                                              },
                                            ),
                                            const SizedBox(width: 4),
                                          ],
                                          Expanded(
                                            child: Text(
                                              item.lastMessage,
                                              maxLines: 1,
                                              overflow: TextOverflow.ellipsis,
                                              style: TextStyle(
                                                fontSize: 13,
                                                fontWeight: hasUnread
                                                    ? FontWeight.w700
                                                    : FontWeight.w400,
                                                color: hasUnread
                                                    ? FlowGuardTheme.navy
                                                    : FlowGuardTheme.mutedText,
                                              ),
                                            ),
                                          ),
                                          if (hasUnread)
                                            Container(
                                              margin: const EdgeInsets.only(
                                                left: 8,
                                              ),
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                horizontal: 7,
                                                vertical: 2,
                                              ),
                                              decoration: BoxDecoration(
                                                color: const Color(0xFF10B981),
                                                borderRadius:
                                                    BorderRadius.circular(999),
                                              ),
                                              child: Text(
                                                "${item.unreadCount}",
                                                style: const TextStyle(
                                                  color: Colors.white,
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w800,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          ),
          ),
        ),
      ],
    );
  }
}

/// Real-time WhatsApp conversation screen with optimistic sending, failure retry, voice notes & attachments.
class WhatsAppConversationPage extends StatefulWidget {
  final ConversationSummary conversation;
  final String senderRole;
  final String senderName;

  const WhatsAppConversationPage({
    super.key,
    required this.conversation,
    required this.senderRole,
    required this.senderName,
  });

  @override
  State<WhatsAppConversationPage> createState() =>
      _WhatsAppConversationPageState();
}

class _WhatsAppConversationPageState extends State<WhatsAppConversationPage> {
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  late bool _serverAdminOnline;
  late bool _serverPlumberOnline;
  late bool _serverCustomerOnline;
  bool _showJumpToBottom = false;
  bool _hasText = false;
  bool _recordingVoice = false;
  int _recordSeconds = 0;
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final AudioRecorder _voiceRecorder = AudioRecorder();
  RealtimeChannel? _rtChannel;
  Timer? _recordTimer;
  Timer? _rtDebounce;
  Timer? _pollTimer;
  String? _threadError;
  Map<String, dynamic>? _replyToMsg;
  bool _isInternal = false;
  final Map<String, GlobalKey> _msgKeys = {};

  bool get _canUsePrivateToggle =>
      widget.senderRole == "plumber" || widget.senderRole == "admin";

  bool get _replyIsPrivate =>
      _replyToMsg != null &&
      (_replyToMsg!["is_internal"] == true ||
          _replyToMsg!["isInternal"] == true);

  void _setReplyTo(Map<String, dynamic> msg) {
    final priv = msg["is_internal"] == true || msg["isInternal"] == true;
    setState(() {
      _replyToMsg = msg;
      if (priv && _canUsePrivateToggle) {
        _isInternal = true;
      }
    });
  }

  void _scrollToMessageById(String targetId) {
    final key = _msgKeys[targetId];
    final ctx = key?.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(
        ctx,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
        alignment: 0.3,
      );
      return;
    }
    final idx = _messages.indexWhere((m) => m["id"]?.toString() == targetId);
    if (idx >= 0 && _scrollController.hasClients) {
      // ListView uses reverse: true (newest is offset 0)
      final reversedPos = _messages.length - 1 - idx;
      final ratio =
          _messages.length <= 1 ? 0.0 : reversedPos / (_messages.length - 1);
      final targetOffset =
          _scrollController.position.maxScrollExtent * ratio.clamp(0.0, 1.0);
      _scrollController.animateTo(
        targetOffset,
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  void initState() {
    super.initState();
    _serverAdminOnline = widget.conversation.adminOnline;
    _serverPlumberOnline = widget.conversation.plumberOnline;
    _serverCustomerOnline = widget.conversation.customerOnline;
    _inputController.addListener(() {
      final next = _inputController.text.trim().isNotEmpty;
      if (next != _hasText && mounted) {
        setState(() => _hasText = next);
      }
    });
    _scrollController.addListener(() {
      if (!_scrollController.hasClients || !mounted) return;
      final farFromBottom = _scrollController.offset > 120;
      if (farFromBottom != _showJumpToBottom) {
        setState(() => _showJumpToBottom = farFromBottom);
      }
    });
    _loadMessages();
    _subscribeRealtime();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 20),
      (_) => _loadMessages(quiet: true),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _rtDebounce?.cancel();
    _rtChannel?.unsubscribe();
    _recordTimer?.cancel();
    _voiceRecorder.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleRealtimeReload() {
    _rtDebounce?.cancel();
    _rtDebounce = Timer(const Duration(milliseconds: 500), () {
      if (mounted) _loadMessages(quiet: true);
    });
  }

  void _subscribeRealtime() {
    try {
      _rtChannel = SupabaseConfig.client
          .channel(
            "conv-${widget.conversation.ticketNumber}-${widget.conversation.conversationType}",
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.insert,
            schema: "public",
            table: "messages",
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: "ticket_number",
              value: widget.conversation.ticketNumber,
            ),
            callback: (_) => _scheduleRealtimeReload(),
          )
          .onPostgresChanges(
            event: PostgresChangeEvent.update,
            schema: "public",
            table: "messages",
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: "ticket_number",
              value: widget.conversation.ticketNumber,
            ),
            callback: (_) => _scheduleRealtimeReload(),
          )
          .subscribe();
    } catch (_) {}
  }

  List<Map<String, dynamic>> _filterForConversation(
    List<Map<String, dynamic>> all,
  ) {
    final isDirect =
        widget.conversation.conversationType == "customer_plumber";
    return all.where((m) {
      final s = (m["senderRole"] ?? m["sender_role"] ?? "").toString();
      final r = (m["recipientRole"] ?? m["recipient_role"] ?? "").toString();
      final isPriv = m["is_internal"] == true || m["isInternal"] == true;
      // Never expose internal messages to customers
      if (widget.senderRole == "customer" && isPriv) return false;
      // In the plumber's thread, include admin messages (public and private) so replies to admin are possible
      if (widget.senderRole == "plumber" && (s == "admin" || r == "admin")) {
        return true;
      }
      if (isDirect) {
        return (s == "customer" && r == "plumber") ||
            (s == "plumber" && r == "customer");
      }
      return (s == widget.senderRole && r == "admin") ||
          (s == "admin" && r == widget.senderRole) ||
          (s == widget.senderRole && r != "plumber" && r != "customer");
    }).toList();
  }

  Future<void> _loadMessages({bool quiet = false}) async {
    if (!quiet && _messages.isEmpty && mounted) {
      setState(() {
        _loading = true;
        _threadError = null;
      });
    }
    try {
      final data = await FlowGuardApiClient.fetchChatMessagesWithPresence(
        ticketNumber: widget.conversation.ticketNumber,
        role: widget.senderRole,
      );
      if (data == null) {
        if (mounted && !quiet) {
          setState(() {
            _loading = false;
            _threadError = "Unable to load messages. Check your connection.";
          });
        }
        return;
      }
      final rawMsgs = data["messages"] as List? ?? [];
      final serverList = _filterForConversation(
        rawMsgs.whereType<Map<String, dynamic>>().toList(),
      );
      final serverIds = serverList
          .map((m) => m["id"]?.toString() ?? "")
          .where((id) => id.isNotEmpty)
          .toSet();
      final pendingLocals = _messages.where((m) {
        final st = m["_localState"]?.toString();
        if (st != "sending" && st != "failed" && st != "sent_pending_sync") {
          return false;
        }
        final cid =
            m["_confirmedId"]?.toString() ?? m["id"]?.toString() ?? "";
        if (cid.isNotEmpty && serverIds.contains(cid)) return false;
        if (st == "sent_pending_sync") {
          final localText = (m["message"] ?? "").toString();
          final localSender =
              (m["senderRole"] ?? m["sender_role"] ?? "").toString();
          final matched = serverList.any((s) =>
              (s["message"] ?? "").toString() == localText &&
              (s["senderRole"] ?? s["sender_role"] ?? "").toString() ==
                  localSender);
          if (matched) return false;
        }
        return true;
      }).toList();

      final presence = data["presence"] as Map<String, dynamic>? ?? {};
      final participants =
          data["ticketParticipants"] as Map<String, dynamic>? ?? {};
      final onlinePlumbers = (presence["onlinePlumberIds"] as List? ?? [])
          .map((e) => e.toString())
          .toSet();
      final onlineCustomers = (presence["onlineCustomerIds"] as List? ?? [])
          .map((e) => e.toString())
          .toSet();

      final nextAdminOnline =
          participants["adminOnline"] == true || presence["adminOnline"] == true;
      final plumberId = widget.conversation.assignedPlumberId;
      final nextPlumberOnline = participants["assignedPlumberOnline"] == true ||
          (plumberId != null &&
              plumberId.isNotEmpty &&
              onlinePlumbers.contains(plumberId));
      final customerId = widget.conversation.customerId;
      final nextCustomerOnline = participants["customerOnline"] == true ||
          (customerId != null &&
              customerId.isNotEmpty &&
              onlineCustomers.contains(customerId));

      if (mounted) {
        setState(() {
          _messages = [...serverList, ...pendingLocals];
          _serverAdminOnline = nextAdminOnline;
          _serverPlumberOnline = nextPlumberOnline;
          _serverCustomerOnline = nextCustomerOnline;
          _loading = false;
          _threadError = null;
        });
      }
      final hasUnreadFromOther = serverList.any((m) {
        final sender = (m["senderRole"] ?? m["sender_role"] ?? "").toString();
        if (sender == widget.senderRole) return false;
        final readBy = m["read_by"] is List ? (m["read_by"] as List) : const [];
        return m["read_at"] == null && !readBy.contains(widget.senderRole);
      });
      if (hasUnreadFromOther) {
        FlowGuardApiClient.markChatRead(
          ticketNumber: widget.conversation.ticketNumber,
          role: widget.senderRole,
          peerRole: widget.conversation.peerRole,
        ).catchError((_) {});
      }
    } catch (_) {
      if (mounted && !quiet) {
        setState(() {
          _loading = false;
          _threadError = "Unable to load messages. Check your connection.";
        });
      }
    }
  }

  String _effectiveRecipientRole(bool sendInternal) {
    if (sendInternal) {
      return widget.senderRole == "plumber" ? "admin" : "plumber";
    }
    return widget.conversation.peerRole;
  }

  Future<void> _sendText({String? retryText, String? tempId}) async {
    final text = (retryText ?? _inputController.text).trim();
    if (text.isEmpty) return;

    final sendInternal =
        _canUsePrivateToggle && (_isInternal || _replyIsPrivate);
    final replyId = _replyToMsg?["id"]?.toString();
    final localId = tempId ?? "temp-${DateTime.now().millisecondsSinceEpoch}";
    if (tempId == null) {
      _inputController.clear();
    }

    setState(() {
      if (tempId == null) {
        _replyToMsg = null;
        if (!_canUsePrivateToggle) _isInternal = false;
      }
      _messages = [
        ..._messages.where((m) => m["_localId"] != localId),
        {
          "_localId": localId,
          "_localState": "sending",
          "senderRole": widget.senderRole,
          "senderName": widget.senderName,
          "message": text,
          "is_internal": sendInternal,
          if (replyId != null && replyId.isNotEmpty) "reply_to_id": replyId,
          "createdAt": DateTime.now().toUtc().toIso8601String(),
          "receipt_status": "sending",
        },
      ];
    });
    _scrollToBottom();

    try {
      final resp = await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.conversation.ticketNumber,
        message: text,
        actorRole: widget.senderRole,
        recipientRole: _effectiveRecipientRole(sendInternal),
        isInternal: sendInternal,
        replyToId: replyId,
      );
      final rawConfirmed = resp["message"];
      final rawAiReply = resp["aiReply"];
      Map<String, dynamic>? confirmedMap =
          rawConfirmed is Map ? Map<String, dynamic>.from(rawConfirmed) : null;

      if (mounted) {
        setState(() {
          if (confirmedMap != null) {
            final cid = confirmedMap["id"]?.toString();
            final alreadyHas = cid != null &&
                cid.isNotEmpty &&
                _messages.any((m) => m["id"]?.toString() == cid);
            if (alreadyHas) {
              _messages =
                  _messages.where((m) => m["_localId"] != localId).toList();
            } else {
              _messages = _messages
                  .map((m) => m["_localId"] == localId ? confirmedMap : m)
                  .toList();
            }
          } else {
            _messages = _messages
                .map((m) => m["_localId"] == localId
                    ? {
                        ...m,
                        "_localState": "sent_pending_sync",
                        "receipt_status": "sent",
                      }
                    : m)
                .toList();
          }

          if (rawAiReply is Map) {
            final aiMap = Map<String, dynamic>.from(rawAiReply);
            final aiId = aiMap["id"]?.toString();
            final canInclude =
                _filterForConversation([aiMap]).isNotEmpty &&
                    (aiId == null ||
                        !_messages.any((m) => m["id"]?.toString() == aiId));
            if (canInclude) {
              _messages = [..._messages, aiMap];
            }
          }
        });
      }
      unawaited(
        PresenceService.instance.broadcastEvent("new_message", {
          "ticketNumber": widget.conversation.ticketNumber,
          if (!sendInternal && confirmedMap != null) "message": confirmedMap,
        }),
      );
    } catch (_) {
      if (mounted) {
        setState(() {
          _messages = _messages.map((m) {
            if (m["_localId"] == localId) {
              return {
                ...m,
                "_localState": "failed",
                "receipt_status": "failed",
              };
            }
            return m;
          }).toList();
        });
        if (retryText == null && _inputController.text.isEmpty) {
          _inputController.text = text;
        }
      }
    }
  }

  Future<void> _sendPhoto() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 78,
      maxWidth: 1400,
    );
    if (picked == null) return;

    final sendInternal =
        _canUsePrivateToggle && (_isInternal || _replyIsPrivate);
    final replyId = _replyToMsg?["id"]?.toString();
    final localId = "temp-photo-${DateTime.now().millisecondsSinceEpoch}";
    setState(() {
      _sending = true;
      _replyToMsg = null;
      _messages = [
        ..._messages,
        {
          "_localId": localId,
          "_localState": "sending",
          "senderRole": widget.senderRole,
          "senderName": widget.senderName,
          "message": "Sending photo...",
          "is_internal": sendInternal,
          if (replyId != null && replyId.isNotEmpty) "reply_to_id": replyId,
          "createdAt": DateTime.now().toUtc().toIso8601String(),
          "receipt_status": "sending",
        },
      ];
    });
    _scrollToBottom();

    try {
      final bytes = await picked.readAsBytes();
      final attachment = await FlowGuardApiClient.uploadChatAttachment(
        bytes: bytes,
        filename: picked.name,
        ticketNumber: widget.conversation.ticketNumber,
        role: widget.senderRole,
      );
      final resp = await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.conversation.ticketNumber,
        message: "Photo",
        actorRole: widget.senderRole,
        recipientRole: _effectiveRecipientRole(sendInternal),
        attachment: attachment,
        isInternal: sendInternal,
        replyToId: replyId,
      );
      final rawConfirmed = resp["message"];
      final confirmedMap =
          rawConfirmed is Map ? Map<String, dynamic>.from(rawConfirmed) : null;
      if (mounted && confirmedMap != null) {
        final cid = confirmedMap["id"]?.toString();
        setState(() {
          _messages = (cid != null &&
                  _messages.any((m) => m["id"]?.toString() == cid))
              ? _messages.where((m) => m["_localId"] != localId).toList()
              : _messages
                  .map((m) => m["_localId"] == localId ? confirmedMap : m)
                  .toList();
        });
      }
      unawaited(
        PresenceService.instance.broadcastEvent("new_message", {
          "ticketNumber": widget.conversation.ticketNumber,
          if (!sendInternal && confirmedMap != null) "message": confirmedMap,
        }),
      );
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages =
              _messages.where((m) => m["_localId"] != localId).toList();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Photo upload failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _startVoiceRecording() async {
    final hasPerm = await _voiceRecorder.hasPermission();
    if (!hasPerm) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Microphone permission is required for voice notes."),
          ),
        );
      }
      return;
    }
    final dir = await getTemporaryDirectory();
    final path =
        "${dir.path}/chat_voice_${DateTime.now().millisecondsSinceEpoch}.m4a";
    await _voiceRecorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
      path: path,
    );
    setState(() {
      _recordingVoice = true;
      _recordSeconds = 0;
    });
    _recordTimer?.cancel();
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordSeconds += 1);
    });
  }

  Future<void> _cancelVoiceRecording() async {
    _recordTimer?.cancel();
    final path = await _voiceRecorder.stop();
    if (path != null) {
      try {
        File(path).deleteSync();
      } catch (_) {}
    }
    if (mounted) setState(() => _recordingVoice = false);
  }

  Future<void> _finishAndSendVoiceNote() async {
    _recordTimer?.cancel();
    final path = await _voiceRecorder.stop();
    final durationSec = _recordSeconds;
    if (mounted) setState(() => _recordingVoice = false);
    if (path == null) return;

    final sendInternal =
        _canUsePrivateToggle && (_isInternal || _replyIsPrivate);
    final replyId = _replyToMsg?["id"]?.toString();
    final localId = "temp-voice-${DateTime.now().millisecondsSinceEpoch}";

    setState(() {
      _sending = true;
      _replyToMsg = null;
      _messages = [
        ..._messages,
        {
          "_localId": localId,
          "_localState": "sending",
          "senderRole": widget.senderRole,
          "senderName": widget.senderName,
          "message": "Voice Note (${durationSec}s)",
          "is_internal": sendInternal,
          if (replyId != null && replyId.isNotEmpty) "reply_to_id": replyId,
          "createdAt": DateTime.now().toUtc().toIso8601String(),
          "receipt_status": "sending",
        },
      ];
    });
    _scrollToBottom();

    try {
      final bytes = await File(path).readAsBytes();
      final filename = "voice_${DateTime.now().millisecondsSinceEpoch}.m4a";
      final attachment = await FlowGuardApiClient.uploadChatAttachment(
        bytes: bytes,
        filename: filename,
        ticketNumber: widget.conversation.ticketNumber,
        role: widget.senderRole,
      );
      final resp = await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.conversation.ticketNumber,
        message: "Voice Note (${durationSec}s)",
        actorRole: widget.senderRole,
        recipientRole: _effectiveRecipientRole(sendInternal),
        attachment: attachment,
        isInternal: sendInternal,
        replyToId: replyId,
      );
      final rawConfirmed = resp["message"];
      final confirmedMap =
          rawConfirmed is Map ? Map<String, dynamic>.from(rawConfirmed) : null;
      if (mounted && confirmedMap != null) {
        final cid = confirmedMap["id"]?.toString();
        setState(() {
          _messages = (cid != null &&
                  _messages.any((m) => m["id"]?.toString() == cid))
              ? _messages.where((m) => m["_localId"] != localId).toList()
              : _messages
                  .map((m) => m["_localId"] == localId ? confirmedMap : m)
                  .toList();
        });
      }
      unawaited(
        PresenceService.instance.broadcastEvent("new_message", {
          "ticketNumber": widget.conversation.ticketNumber,
          if (!sendInternal && confirmedMap != null) "message": confirmedMap,
        }),
      );
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages =
              _messages.where((m) => m["_localId"] != localId).toList();
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Voice note failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0.0,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  String _formatTime(String? iso) {
    if (iso == null || iso.isEmpty) return "";
    final dt = DateTime.tryParse(iso)?.toLocal();
    if (dt == null) return "";
    final hh = dt.hour.toString().padLeft(2, "0");
    final mm = dt.minute.toString().padLeft(2, "0");
    return "$hh:$mm";
  }

  @override
  Widget build(BuildContext context) {
    final isSupport = widget.conversation.peerRole == "admin";
    return Scaffold(
      appBar: AppBar(
        backgroundColor: FlowGuardTheme.navy,
        foregroundColor: Colors.white,
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: FlowGuardTheme.gold,
              child: isSupport
                  ? ClipOval(
                      child: Image.asset(
                        "assets/images/flowguard-icon.jpg",
                        width: 36,
                        height: 36,
                        fit: BoxFit.cover,
                      ),
                    )
                  : Text(
                      widget.conversation.peerName.isNotEmpty
                          ? widget.conversation.peerName[0].toUpperCase()
                          : "U",
                      style: const TextStyle(
                        fontWeight: FontWeight.w900,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.conversation.peerName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  ValueListenableBuilder<int>(
                    valueListenable: PresenceService.instance.stateVersion,
                    builder: (_, __, ___) {
                      final live = resolveMobileThreadPresence(
                        item: widget.conversation,
                        viewerRole: widget.senderRole,
                        serverAdminOnline: _serverAdminOnline,
                        serverPlumberOnline: _serverPlumberOnline,
                        serverCustomerOnline: _serverCustomerOnline,
                      );
                      return Row(
                        children: [
                          Container(
                            width: 7,
                            height: 7,
                            margin: const EdgeInsets.only(right: 5),
                            decoration: BoxDecoration(
                              color: live.isOnline
                                  ? const Color(0xFF22C55E)
                                  : const Color(0xFF94A3B8),
                              shape: BoxShape.circle,
                            ),
                          ),
                          Expanded(
                            child: Text(
                              "${live.label} • ${widget.conversation.ticketNumber}",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: live.isOnline
                                    ? const Color(0xFF86EFAC)
                                    : const Color(0xFFCBD5E1),
                                fontSize: 11,
                                fontWeight: live.isOnline
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                              ),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () => _loadMessages(),
            icon: const Icon(Icons.refresh_rounded, color: Colors.white),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: Container(
              color: const Color(0xFFEFEAE2),
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _threadError != null && _messages.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  _threadError!,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: FlowGuardTheme.mutedText,
                                  ),
                                ),
                                const SizedBox(height: 12),
                                OutlinedButton(
                                  onPressed: () => _loadMessages(),
                                  child: const Text("Retry"),
                                ),
                              ],
                            ),
                          ),
                        )
                      : _messages.isEmpty
                      ? const Center(
                          child: Text(
                            "Send a message or voice note to start chatting.",
                            style: TextStyle(color: FlowGuardTheme.mutedText),
                          ),
                        )
                      : Stack(
                          children: [
                            ListView.builder(
                              controller: _scrollController,
                              reverse: true,
                              padding: const EdgeInsets.all(12),
                              itemCount: _messages.length,
                              itemBuilder: (_, idx) {
                                final reversedIdx = _messages.length - 1 - idx;
                                final msg = _messages[reversedIdx];
                                final msgId = (msg["id"] ??
                                        msg["_localId"] ??
                                        "idx-$reversedIdx")
                                    .toString();
                                final itemKey = _msgKeys.putIfAbsent(
                                  msgId,
                                  () => GlobalKey(),
                                );
                            final isMe =
                                msg["senderRole"] == widget.senderRole ||
                                    msg["sender_role"] == widget.senderRole;
                            final isPrivate = msg["is_internal"] == true ||
                                msg["isInternal"] == true;
                            final replyToId = (msg["reply_to_id"] ??
                                    msg["replyToId"] ??
                                    "")
                                .toString();
                            final quotedMsg = replyToId.isEmpty
                                ? null
                                : _messages
                                    .where(
                                      (m) => m["id"]?.toString() == replyToId,
                                    )
                                    .firstOrNull;
                            final status = (msg["receipt_status"] ??
                                    msg["status"] ??
                                    "sent")
                                .toString();
                            final isFailed = status == "failed";
                            final isSending = status == "sending";
                            final createdAt = (msg["createdAt"] ??
                                    msg["created_at"] ??
                                    "")
                                .toString();
                            final senderName = (msg["senderName"] ??
                                    msg["sender_name"] ??
                                    "User")
                                .toString();
                            final text = (msg["message"] ?? "").toString();
                            final attachment = msg["attachment"];
                            final rawUrl = attachment is Map
                                ? (attachment["url"] ?? "").toString()
                                : "";
                            final isVoice =
                                VoiceNoteBubblePlayer.isAudioUrl(rawUrl) ||
                                    (attachment is Map &&
                                        (attachment["mimeType"] ?? "")
                                            .toString()
                                            .startsWith("audio/"));

                            return Dismissible(
                              key: ValueKey("swipe-$msgId-$idx"),
                              direction: DismissDirection.startToEnd,
                              confirmDismiss: (_) async {
                                _setReplyTo(msg);
                                return false;
                              },
                              background: const Align(
                                alignment: Alignment.centerLeft,
                                child: Padding(
                                  padding: EdgeInsets.only(left: 16),
                                  child: Icon(
                                    Icons.reply_rounded,
                                    color: FlowGuardTheme.navy,
                                  ),
                                ),
                              ),
                              child: Align(
                                key: itemKey,
                                alignment: isMe
                                    ? Alignment.centerRight
                                    : Alignment.centerLeft,
                                child: Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding:
                                      const EdgeInsets.fromLTRB(12, 8, 10, 6),
                                  constraints: BoxConstraints(
                                    maxWidth:
                                        MediaQuery.of(context).size.width *
                                            0.78,
                                  ),
                                  decoration: BoxDecoration(
                                    color: isFailed
                                        ? const Color(0xFFFEE2E2)
                                        : isPrivate
                                            ? const Color(0xFFFEF3C7)
                                            : isMe
                                                ? const Color(0xFFD9FDD3)
                                                : Colors.white,
                                    border: isPrivate
                                        ? Border.all(
                                            color: const Color(0xFFF59E0B),
                                            width: 1,
                                          )
                                        : null,
                                    borderRadius: BorderRadius.only(
                                      topLeft: const Radius.circular(14),
                                      topRight: const Radius.circular(14),
                                      bottomLeft:
                                          Radius.circular(isMe ? 14 : 2),
                                      bottomRight:
                                          Radius.circular(isMe ? 2 : 14),
                                    ),
                                    boxShadow: const [
                                      BoxShadow(
                                        color: Color(0x12000000),
                                        blurRadius: 3,
                                        offset: Offset(0, 1),
                                      ),
                                    ],
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      if (!isMe || isPrivate)
                                        Padding(
                                          padding:
                                              const EdgeInsets.only(bottom: 2),
                                          child: Row(
                                            mainAxisSize: MainAxisSize.min,
                                            children: [
                                              if (isPrivate) ...[
                                                const Icon(
                                                  Icons.lock_rounded,
                                                  size: 12,
                                                  color: Color(0xFF92400E),
                                                ),
                                                const SizedBox(width: 4),
                                              ],
                                              Text(
                                                isPrivate && isMe
                                                    ? "Private (admin only)"
                                                    : isPrivate
                                                        ? "$senderName • Private"
                                                        : senderName,
                                                style: TextStyle(
                                                  fontSize: 11,
                                                  fontWeight: FontWeight.w800,
                                                  color: isPrivate
                                                      ? const Color(0xFF92400E)
                                                      : FlowGuardTheme.navy,
                                                ),
                                              ),
                                            ],
                                          ),
                                        ),
                                      if (replyToId.isNotEmpty)
                                        InkWell(
                                          onTap: () =>
                                              _scrollToMessageById(replyToId),
                                          child: Container(
                                            width: double.infinity,
                                            margin: const EdgeInsets.only(
                                              bottom: 6,
                                            ),
                                            padding: const EdgeInsets.fromLTRB(
                                              8,
                                              5,
                                              8,
                                              5,
                                            ),
                                            decoration: BoxDecoration(
                                              color: Colors.black
                                                  .withValues(alpha: 0.05),
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              border: const Border(
                                                left: BorderSide(
                                                  color: FlowGuardTheme.navy,
                                                  width: 3,
                                                ),
                                              ),
                                            ),
                                            child: Column(
                                              crossAxisAlignment:
                                                  CrossAxisAlignment.start,
                                              children: [
                                                Text(
                                                  (quotedMsg?["senderName"] ??
                                                          quotedMsg?[
                                                              "sender_name"] ??
                                                          "Original message")
                                                      .toString(),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    fontSize: 10.5,
                                                    fontWeight: FontWeight.w800,
                                                    color: FlowGuardTheme.navy,
                                                  ),
                                                ),
                                                Text(
                                                  quotedMsg == null
                                                      ? "Tap to view original"
                                                      : (quotedMsg["message"] ??
                                                              "Attachment")
                                                          .toString(),
                                                  maxLines: 1,
                                                  overflow:
                                                      TextOverflow.ellipsis,
                                                  style: const TextStyle(
                                                    fontSize: 11.5,
                                                    color:
                                                        FlowGuardTheme.mutedText,
                                                  ),
                                                ),
                                              ],
                                            ),
                                          ),
                                        ),
                                    if (rawUrl.isNotEmpty && isVoice)
                                      VoiceNoteBubblePlayer(rawUrl: rawUrl)
                                    else if (rawUrl.isNotEmpty)
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 6),
                                        child: ClipRRect(
                                          borderRadius:
                                              BorderRadius.circular(10),
                                          child: Image.network(
                                            FlowGuardApiClient
                                                .authenticatedFileUrl(rawUrl),
                                            headers: FlowGuardApiClient
                                                .fileAuthHeaders(
                                              FlowGuardApiClient
                                                  .authenticatedFileUrl(rawUrl),
                                            ),
                                            height: 160,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) =>
                                                const Icon(
                                                    Icons.image_outlined),
                                          ),
                                        ),
                                      ),
                                    if (text.isNotEmpty && !isVoice)
                                      Text(
                                        text,
                                        style: const TextStyle(
                                          fontSize: 14,
                                          color: Color(0xFF111B21),
                                        ),
                                      ),
                                    const SizedBox(height: 3),
                                    Row(
                                      mainAxisSize: MainAxisSize.min,
                                      mainAxisAlignment: MainAxisAlignment.end,
                                      children: [
                                        Text(
                                          isFailed
                                              ? "Not sent"
                                              : _formatTime(createdAt),
                                          style: TextStyle(
                                            fontSize: 10,
                                            color: isFailed
                                                ? const Color(0xFFB91C1C)
                                                : const Color(0xFF667781),
                                          ),
                                        ),
                                        if (isMe) ...[
                                          const SizedBox(width: 4),
                                          if (isFailed)
                                            InkWell(
                                              onTap: () => _sendText(
                                                retryText: text,
                                                tempId: msg["_localId"]
                                                    ?.toString(),
                                              ),
                                              child: const Text(
                                                "Tap to Retry",
                                                style: TextStyle(
                                                  fontSize: 10.5,
                                                  fontWeight: FontWeight.w800,
                                                  color: Color(0xFFB91C1C),
                                                ),
                                              ),
                                            )
                                          else if (isSending)
                                            const Icon(
                                              Icons.schedule_rounded,
                                              size: 13,
                                              color: Color(0xFF667781),
                                            )
                                          else
                                            ValueListenableBuilder<int>(
                                              valueListenable: PresenceService
                                                  .instance.stateVersion,
                                              builder: (_, __, ___) {
                                                final live =
                                                    resolveMobileThreadPresence(
                                                  item: widget.conversation,
                                                  viewerRole: widget.senderRole,
                                                  serverAdminOnline:
                                                      _serverAdminOnline,
                                                  serverPlumberOnline:
                                                      _serverPlumberOnline,
                                                  serverCustomerOnline:
                                                      _serverCustomerOnline,
                                                );
                                                return Icon(
                                                  (status == "sent" &&
                                                          !live.isOnline)
                                                      ? Icons.done_rounded
                                                      : Icons.done_all_rounded,
                                                  size: 14,
                                                  color: status == "read"
                                                      ? const Color(0xFF0284C7)
                                                      : const Color(0xFF667781),
                                                );
                                              },
                                            ),
                                        ],
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            ),
                            );
                          },
                        ),
                            if (_showJumpToBottom)
                              Positioned(
                                right: 14,
                                bottom: 14,
                                child: FloatingActionButton.small(
                                  heroTag: null,
                                  backgroundColor: FlowGuardTheme.navy,
                                  foregroundColor: Colors.white,
                                  onPressed: _scrollToBottom,
                                  child: const Icon(
                                    Icons.keyboard_arrow_down_rounded,
                                  ),
                                ),
                              ),
                          ],
                        ),
            ),
          ),
          if (_replyToMsg != null)
            Container(
              color: const Color(0xFFE2E8F0),
              padding: const EdgeInsets.fromLTRB(12, 6, 8, 6),
              child: Row(
                children: [
                  Container(
                    width: 3,
                    height: 34,
                    color: _replyIsPrivate
                        ? const Color(0xFFD97706)
                        : FlowGuardTheme.navy,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (_replyIsPrivate) ...[
                              const Icon(
                                Icons.lock_rounded,
                                size: 12,
                                color: Color(0xFF92400E),
                              ),
                              const SizedBox(width: 4),
                            ],
                            Text(
                              "Replying to ${(_replyToMsg!["senderName"] ?? _replyToMsg!["sender_name"] ?? "User")}",
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                          ],
                        ),
                        Text(
                          (_replyToMsg!["message"] ?? "Attachment").toString(),
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
                  IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () => setState(() => _replyToMsg = null),
                  ),
                ],
              ),
            ),
          if (_canUsePrivateToggle)
            Container(
              color: const Color(0xFFF0F2F5),
              padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
              child: Row(
                children: [
                  FilterChip(
                    avatar: Icon(
                      Icons.lock_rounded,
                      size: 15,
                      color: (_isInternal || _replyIsPrivate)
                          ? const Color(0xFF92400E)
                          : FlowGuardTheme.mutedText,
                    ),
                    label: const Text(
                      "Private (admin only)",
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                    ),
                    selected: _isInternal || _replyIsPrivate,
                    selectedColor: const Color(0xFFFEF3C7),
                    onSelected: _replyIsPrivate
                        ? null
                        : (val) => setState(() => _isInternal = val),
                  ),
                ],
              ),
            ),
          Container(
            color: const Color(0xFFF0F2F5),
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 12),
            child: _recordingVoice
                ? Row(
                    children: [
                      IconButton(
                        tooltip: "Cancel recording",
                        onPressed: _cancelVoiceRecording,
                        icon: const Icon(
                          Icons.delete_outline_rounded,
                          color: Color(0xFFDC2626),
                        ),
                      ),
                      const Icon(
                        Icons.mic_rounded,
                        color: Color(0xFFDC2626),
                        size: 20,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          "Recording voice note... ${_recordSeconds}s",
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: Color(0xFFB91C1C),
                          ),
                        ),
                      ),
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: const Color(0xFF10B981),
                        child: IconButton(
                          tooltip: "Send voice note",
                          onPressed: _finishAndSendVoiceNote,
                          icon: const Icon(
                            Icons.send_rounded,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                      ),
                    ],
                  )
                : Row(
                    children: [
                      IconButton(
                        tooltip: "Send photo",
                        onPressed: _sending ? null : _sendPhoto,
                        icon: const Icon(
                          Icons.camera_alt_outlined,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                      IconButton(
                        tooltip: "Record voice note",
                        onPressed: _sending ? null : _startVoiceRecording,
                        icon: const Icon(
                          Icons.mic_none_rounded,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _inputController,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _sendText(),
                          decoration: InputDecoration(
                            hintText: "Type a message...",
                            filled: true,
                            fillColor: Colors.white,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(24),
                              borderSide: BorderSide.none,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 6),
                      CircleAvatar(
                        radius: 22,
                        backgroundColor: FlowGuardTheme.navy,
                        child: IconButton(
                          tooltip: "Send message",
                          onPressed:
                              (_sending || !_hasText) ? null : () => _sendText(),
                          icon: _sending
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Icon(
                                  Icons.send_rounded,
                                  color: Colors.white,
                                  size: 19,
                                ),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
