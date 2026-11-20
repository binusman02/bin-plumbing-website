import "dart:async";
import "dart:io";
import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:path_provider/path_provider.dart";
import "package:record/record.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/features/shared/voice_note_widgets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class _ChatContactThread {
  final String contactName;
  final String subtitle;
  final String ticketNumber;
  final bool isSupport;

  const _ChatContactThread({
    required this.contactName,
    required this.subtitle,
    required this.ticketNumber,
    this.isSupport = false,
  });
}

/// WhatsApp-style Contacts / People Chat List (tap a person to open conversation).
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
  final Map<String, Map<String, dynamic>> _lastMessageByTicket = {};
  bool _peerOnline = false;
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _refreshPreviews();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 10),
      (_) => _refreshPreviews(),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  List<_ChatContactThread> _buildContactThreads() {
    final threads = <_ChatContactThread>[];
    if (widget.tickets.isEmpty) return threads;

    // 1. Official FlowGuard Support / Dispatch contact (linked to latest request)
    final primaryTicket = widget.tickets.first;
    threads.add(
      _ChatContactThread(
        contactName: widget.senderRole == "customer"
            ? "FlowGuard Support"
            : "FlowGuard Dispatch",
        subtitle:
            "Official Support • ${primaryTicket.ticketNumber} (${primaryTicket.problemCategory})",
        ticketNumber: primaryTicket.ticketNumber,
        isSupport: true,
      ),
    );

    // 2. Direct people contacts (Assigned Plumber for Customer, Assigned Customer for Plumber)
    final seenNames = <String>{};
    for (final t in widget.tickets) {
      final personName = widget.senderRole == "customer"
          ? (t.assignedTechnician != null && t.assignedTechnician!.isNotEmpty
              ? t.assignedTechnician!
              : "Assigned Technician (${t.ticketNumber})")
          : (t.customerName != null && t.customerName!.isNotEmpty
              ? t.customerName!
              : "Customer (${t.ticketNumber})");
      final key = "$personName-${t.ticketNumber}";
      if (seenNames.add(key)) {
        threads.add(
          _ChatContactThread(
            contactName: personName,
            subtitle: "${t.problemCategory} • ${t.addressInKano}",
            ticketNumber: t.ticketNumber,
          ),
        );
      }
    }
    return threads;
  }

  Future<void> _refreshPreviews() async {
    for (final t in widget.tickets.take(6)) {
      try {
        final data = await FlowGuardApiClient.fetchChatMessagesWithPresence(
          ticketNumber: t.ticketNumber,
          role: widget.senderRole,
        );
        if (data == null) continue;
        final msgs = data["messages"] as List? ?? [];
        final presence = data["presence"] as Map<String, dynamic>? ?? {};
        final online = widget.senderRole == "customer"
            ? (presence["adminOnline"] == true ||
                presence["plumberOnline"] == true)
            : (presence["adminOnline"] == true ||
                presence["customerOnline"] == true);
        if (mounted) {
          setState(() {
            _peerOnline = online;
            if (msgs.isNotEmpty && msgs.last is Map<String, dynamic>) {
              _lastMessageByTicket[t.ticketNumber] =
                  msgs.last as Map<String, dynamic>;
            }
          });
        }
      } catch (_) {}
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
    if (widget.tickets.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            "No active chats yet. Create or accept a plumbing request to message.",
            textAlign: TextAlign.center,
            style: TextStyle(color: FlowGuardTheme.mutedText),
          ),
        ),
      );
    }

    final threads = _buildContactThreads().where((c) {
      if (_searchQuery.trim().isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return c.contactName.toLowerCase().contains(q) ||
          c.subtitle.toLowerCase().contains(q) ||
          c.ticketNumber.toLowerCase().contains(q);
    }).toList();

    return Column(
      children: [
        // WhatsApp-style search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: InputDecoration(
              hintText: "Search people or chats...",
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
            onRefresh: _refreshPreviews,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 4),
              itemCount: threads.length,
              separatorBuilder: (_, __) => const Divider(
                height: 1,
                indent: 78,
                endIndent: 16,
              ),
              itemBuilder: (context, idx) {
                final item = threads[idx];
                final lastMsg = _lastMessageByTicket[item.ticketNumber];
                final previewText = lastMsg != null
                    ? (lastMsg["message"]?.toString().isNotEmpty == true
                        ? lastMsg["message"].toString()
                        : "Attachment")
                    : item.subtitle;
                final timeLabel = _formatShortTime(
                  (lastMsg?["createdAt"] ?? lastMsg?["created_at"])?.toString(),
                );
                final isMe = lastMsg?["senderRole"] == widget.senderRole ||
                    lastMsg?["sender_role"] == widget.senderRole;
                final receipt =
                    (lastMsg?["receipt_status"] ?? lastMsg?["status"] ?? "sent")
                        .toString();

                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 6,
                  ),
                  onTap: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => WhatsAppConversationPage(
                          contactName: item.contactName,
                          subtitle: item.subtitle,
                          ticketNumber: item.ticketNumber,
                          senderRole: widget.senderRole,
                          senderName: widget.senderName,
                          isSupport: item.isSupport,
                        ),
                      ),
                    );
                    _refreshPreviews();
                  },
                  leading: Stack(
                    children: [
                      CircleAvatar(
                        radius: 25,
                        backgroundColor: item.isSupport
                            ? FlowGuardTheme.navy
                            : const Color(0xFFE2E8F0),
                        child: item.isSupport
                            ? ClipOval(
                                child: Image.asset(
                                  "assets/images/flowguard-icon.jpg",
                                  width: 50,
                                  height: 50,
                                  fit: BoxFit.cover,
                                ),
                              )
                            : Text(
                                item.contactName.isNotEmpty
                                    ? item.contactName[0].toUpperCase()
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
                        child: Container(
                          width: 13,
                          height: 13,
                          decoration: BoxDecoration(
                            color: _peerOnline
                                ? const Color(0xFF22C55E)
                                : const Color(0xFF94A3B8),
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                          ),
                        ),
                      ),
                    ],
                  ),
                  title: Row(
                    children: [
                      Expanded(
                        child: Text(
                          item.contactName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 15,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                      ),
                      if (timeLabel.isNotEmpty)
                        Text(
                          timeLabel,
                          style: const TextStyle(
                            fontSize: 11.5,
                            color: FlowGuardTheme.mutedText,
                          ),
                        ),
                    ],
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Row(
                      children: [
                        if (lastMsg != null && isMe) ...[
                          Icon(
                            receipt == "sent"
                                ? Icons.done_rounded
                                : Icons.done_all_rounded,
                            size: 15,
                            color: receipt == "read"
                                ? const Color(0xFF0284C7)
                                : FlowGuardTheme.mutedText,
                          ),
                          const SizedBox(width: 4),
                        ],
                        Expanded(
                          child: Text(
                            previewText,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              color: FlowGuardTheme.mutedText,
                            ),
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
      ],
    );
  }
}

/// Full-screen WhatsApp conversation page with Back button, photos, and Voice Note recording.
class WhatsAppConversationPage extends StatefulWidget {
  final String contactName;
  final String subtitle;
  final String ticketNumber;
  final String senderRole;
  final String senderName;
  final bool isSupport;

  const WhatsAppConversationPage({
    super.key,
    required this.contactName,
    required this.subtitle,
    required this.ticketNumber,
    required this.senderRole,
    required this.senderName,
    this.isSupport = false,
  });

  @override
  State<WhatsAppConversationPage> createState() =>
      _WhatsAppConversationPageState();
}

class _WhatsAppConversationPageState extends State<WhatsAppConversationPage> {
  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _peerOnline = false;
  bool _hasText = false;
  bool _recordingVoice = false;
  int _recordSeconds = 0;
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  final AudioRecorder _voiceRecorder = AudioRecorder();
  Timer? _pollTimer;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    _inputController.addListener(() {
      final next = _inputController.text.trim().isNotEmpty;
      if (next != _hasText && mounted) {
        setState(() => _hasText = next);
      }
    });
    _loadMessages();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _loadMessages(quiet: true),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _recordTimer?.cancel();
    _voiceRecorder.dispose();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages({bool quiet = false}) async {
    if (!quiet) setState(() => _loading = true);
    try {
      final data = await FlowGuardApiClient.fetchChatMessagesWithPresence(
        ticketNumber: widget.ticketNumber,
        role: widget.senderRole,
      );
      if (data == null) {
        if (mounted && !quiet) setState(() => _loading = false);
        return;
      }
      final rawMsgs = data["messages"] as List? ?? [];
      final presence = data["presence"] as Map<String, dynamic>? ?? {};
      final otherOnline = widget.senderRole == "customer"
          ? (presence["adminOnline"] == true ||
              presence["plumberOnline"] == true)
          : (presence["adminOnline"] == true ||
              presence["customerOnline"] == true);

      if (mounted) {
        setState(() {
          _messages = rawMsgs.whereType<Map<String, dynamic>>().toList();
          _peerOnline = otherOnline;
          _loading = false;
        });
      }
      await FlowGuardApiClient.markChatRead(
        ticketNumber: widget.ticketNumber,
        role: widget.senderRole,
      );
    } catch (_) {
      if (mounted && !quiet) setState(() => _loading = false);
    }
  }

  Future<void> _sendText() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    // Optimistic append for instant WhatsApp feel
    final optimistic = <String, dynamic>{
      "senderRole": widget.senderRole,
      "senderName": widget.senderName,
      "message": text,
      "createdAt": DateTime.now().toUtc().toIso8601String(),
      "receipt_status": "sent",
    };
    setState(() {
      _messages = [..._messages, optimistic];
      _sending = true;
    });
    _inputController.clear();
    _scrollToBottom();

    try {
      await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.ticketNumber,
        message: text,
        actorRole: widget.senderRole,
      );
      await _loadMessages(quiet: true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not send message: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _sendPhoto() async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 78,
      maxWidth: 1400,
    );
    if (picked == null) return;

    setState(() => _sending = true);
    try {
      final bytes = await picked.readAsBytes();
      final attachment = await FlowGuardApiClient.uploadChatAttachment(
        bytes: bytes,
        filename: picked.name,
        ticketNumber: widget.ticketNumber,
        role: widget.senderRole,
      );
      await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.ticketNumber,
        message: "Photo",
        actorRole: widget.senderRole,
        attachment: attachment,
      );
      await _loadMessages(quiet: true);
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
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
    if (mounted) setState(() => _recordingVoice = false);
    if (path == null) return;

    setState(() => _sending = true);
    try {
      final bytes = await File(path).readAsBytes();
      final filename = "voice_${DateTime.now().millisecondsSinceEpoch}.m4a";
      final attachment = await FlowGuardApiClient.uploadChatAttachment(
        bytes: bytes,
        filename: filename,
        ticketNumber: widget.ticketNumber,
        role: widget.senderRole,
      );
      await FlowGuardApiClient.sendChatMessage(
        ticketNumber: widget.ticketNumber,
        message: "Voice Note (${_recordSeconds}s)",
        actorRole: widget.senderRole,
        attachment: attachment,
      );
      await _loadMessages(quiet: true);
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Voice note failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent + 120,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    }
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
              child: widget.isSupport
                  ? ClipOval(
                      child: Image.asset(
                        "assets/images/flowguard-icon.jpg",
                        width: 36,
                        height: 36,
                        fit: BoxFit.cover,
                      ),
                    )
                  : Text(
                      widget.contactName.isNotEmpty
                          ? widget.contactName[0].toUpperCase()
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
                    widget.contactName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    _peerOnline
                        ? "Online • ${widget.ticketNumber}"
                        : widget.subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Color(0xFFCBD5E1),
                      fontSize: 11,
                    ),
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
                  : _messages.isEmpty
                      ? const Center(
                          child: Text(
                            "Send a message or voice note to start chatting.",
                            style: TextStyle(color: FlowGuardTheme.mutedText),
                          ),
                        )
                      : ListView.builder(
                          controller: _scrollController,
                          padding: const EdgeInsets.all(12),
                          itemCount: _messages.length,
                          itemBuilder: (_, idx) {
                            final msg = _messages[idx];
                            final isMe =
                                msg["senderRole"] == widget.senderRole ||
                                    msg["sender_role"] == widget.senderRole;
                            final status = (msg["receipt_status"] ??
                                    msg["status"] ??
                                    "sent")
                                .toString();
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

                            return Align(
                              alignment: isMe
                                  ? Alignment.centerRight
                                  : Alignment.centerLeft,
                              child: Container(
                                margin: const EdgeInsets.only(bottom: 8),
                                padding:
                                    const EdgeInsets.fromLTRB(12, 8, 10, 6),
                                constraints: BoxConstraints(
                                  maxWidth:
                                      MediaQuery.of(context).size.width * 0.78,
                                ),
                                decoration: BoxDecoration(
                                  color: isMe
                                      ? const Color(0xFFD9FDD3)
                                      : Colors.white,
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(14),
                                    topRight: const Radius.circular(14),
                                    bottomLeft: Radius.circular(isMe ? 14 : 2),
                                    bottomRight: Radius.circular(isMe ? 2 : 14),
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
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (!isMe)
                                      Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 2),
                                        child: Text(
                                          senderName,
                                          style: const TextStyle(
                                            fontSize: 11,
                                            fontWeight: FontWeight.w800,
                                            color: FlowGuardTheme.navy,
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
                                          _formatTime(createdAt),
                                          style: const TextStyle(
                                            fontSize: 10,
                                            color: Color(0xFF667781),
                                          ),
                                        ),
                                        if (isMe) ...[
                                          const SizedBox(width: 4),
                                          Icon(
                                            status == "sent"
                                                ? Icons.done_rounded
                                                : Icons.done_all_rounded,
                                            size: 14,
                                            color: status == "read"
                                                ? const Color(0xFF0284C7)
                                                : const Color(0xFF667781),
                                          ),
                                        ],
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

          // WhatsApp composer bar with Photo + Voice Note recording
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
                        onPressed: _sending ? null : _sendPhoto,
                        icon: const Icon(
                          Icons.camera_alt_outlined,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                      Expanded(
                        child: TextField(
                          controller: _inputController,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _sendText(),
                          decoration: InputDecoration(
                            hintText: "Message or tap mic...",
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
                          onPressed: _sending
                              ? null
                              : (_hasText ? _sendText : _startVoiceRecording),
                          icon: _sending
                              ? const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : Icon(
                                  _hasText
                                      ? Icons.send_rounded
                                      : Icons.mic_rounded,
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
