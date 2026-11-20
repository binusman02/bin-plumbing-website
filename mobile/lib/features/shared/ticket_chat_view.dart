import "dart:async";
import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class TicketChatView extends StatefulWidget {
  final List<ServiceRequestItem> tickets;
  final String senderRole;
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
  String? _selectedTicket;
  List<Map<String, dynamic>> _messages = [];
  bool _loading = false;
  bool _sending = false;
  bool _peerOnline = false;
  final _inputController = TextEditingController();
  final _scrollController = ScrollController();
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    if (widget.tickets.isNotEmpty) {
      _selectedTicket = widget.tickets.first.ticketNumber;
      _loadMessages();
    }
    _pollTimer = Timer.periodic(const Duration(seconds: 6), (_) {
      if (_selectedTicket != null) {
        _loadMessages(quiet: true);
      }
    });
  }

  @override
  void didUpdateWidget(covariant TicketChatView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_selectedTicket == null && widget.tickets.isNotEmpty) {
      _selectedTicket = widget.tickets.first.ticketNumber;
      _loadMessages();
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages({bool quiet = false}) async {
    final ticket = _selectedTicket;
    if (ticket == null) return;
    if (!quiet) setState(() => _loading = true);
    try {
      final data = await FlowGuardApiClient.fetchChatMessagesWithPresence(
        ticketNumber: ticket,
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
              (presence["plumbersOnline"] is Map &&
                  (presence["plumbersOnline"] as Map).values.any((v) => v == true)))
          : (presence["adminOnline"] == true ||
              (presence["customersOnline"] is Map &&
                  (presence["customersOnline"] as Map).values.any((v) => v == true)));

      if (mounted) {
        setState(() {
          _messages = rawMsgs.whereType<Map<String, dynamic>>().toList();
          _peerOnline = otherOnline;
          _loading = false;
        });
      }
      await FlowGuardApiClient.markChatRead(
        ticketNumber: ticket,
        role: widget.senderRole,
      );
    } catch (_) {
      if (mounted && !quiet) setState(() => _loading = false);
    }
  }

  Future<void> _sendText() async {
    final ticket = _selectedTicket;
    final text = _inputController.text.trim();
    if (ticket == null || text.isEmpty) return;

    setState(() => _sending = true);
    try {
      await FlowGuardApiClient.sendChatMessage(
        ticketNumber: ticket,
        message: text,
        actorRole: widget.senderRole,
      );
      _inputController.clear();
      await _loadMessages(quiet: true);
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent + 120,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
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
    final ticket = _selectedTicket;
    if (ticket == null) return;
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
        ticketNumber: ticket,
        role: widget.senderRole,
      );
      if (attachment != null) {
        await FlowGuardApiClient.sendChatMessage(
          ticketNumber: ticket,
          message: "Sent a photo",
          actorRole: widget.senderRole,
          attachment: attachment,
        );
        await _loadMessages(quiet: true);
      }
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
    if (widget.tickets.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            "No service request conversations yet.",
            style: TextStyle(color: FlowGuardTheme.mutedText),
          ),
        ),
      );
    }

    final activeReq = widget.tickets
        .where((t) => t.ticketNumber == _selectedTicket)
        .firstOrNull;

    return Column(
      children: [
        // WhatsApp-style conversation header + selector
        Container(
          color: FlowGuardTheme.navy,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: FlowGuardTheme.gold,
                child: Text(
                  (activeReq?.problemCategory.isNotEmpty == true
                          ? activeReq!.problemCategory[0]
                          : "F")
                      .toUpperCase(),
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
                    DropdownButtonHideUnderline(
                      child: DropdownButton<String>(
                        value: _selectedTicket,
                        dropdownColor: FlowGuardTheme.navy,
                        iconEnabledColor: Colors.white,
                        isDense: true,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                        ),
                        items: widget.tickets
                            .map(
                              (t) => DropdownMenuItem(
                                value: t.ticketNumber,
                                child: Text(
                                  "${t.ticketNumber} • ${t.problemCategory}",
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (val) {
                          setState(() => _selectedTicket = val);
                          _loadMessages();
                        },
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _peerOnline
                                ? const Color(0xFF22C55E)
                                : const Color(0xFF94A3B8),
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _peerOnline ? "Online" : "Offline • Messages notify",
                          style: const TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => _loadMessages(),
                icon: const Icon(Icons.refresh_rounded, color: Colors.white),
              ),
            ],
          ),
        ),

        // WhatsApp-style warm message canvas
        Expanded(
          child: Container(
            color: const Color(0xFFEFEAE2),
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(
                        child: Text(
                          "Start a conversation for this request.",
                          style: TextStyle(color: FlowGuardTheme.mutedText),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                        itemCount: _messages.length,
                        itemBuilder: (_, idx) {
                          final msg = _messages[idx];
                          final isMe = msg["senderRole"] == widget.senderRole ||
                              msg["sender_role"] == widget.senderRole;
                          final status = (msg["status"] ?? "sent").toString();
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

                          return Align(
                            alignment: isMe
                                ? Alignment.centerRight
                                : Alignment.centerLeft,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.fromLTRB(12, 8, 10, 6),
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
                                      padding: const EdgeInsets.only(bottom: 2),
                                      child: Text(
                                        senderName,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w800,
                                          color: FlowGuardTheme.navy,
                                        ),
                                      ),
                                    ),
                                  if (attachment is Map &&
                                      attachment["url"] != null)
                                    Padding(
                                      padding: const EdgeInsets.only(bottom: 6),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(10),
                                        child: Image.network(
                                          attachment["url"].toString(),
                                          height: 150,
                                          fit: BoxFit.cover,
                                          errorBuilder: (_, __, ___) =>
                                              const Icon(Icons.image_outlined),
                                        ),
                                      ),
                                    ),
                                  if (text.isNotEmpty)
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
                                              ? const Color(0xFF53BDEB)
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

        // WhatsApp-style composer bar
        Container(
          color: const Color(0xFFF0F2F5),
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 10),
          child: Row(
            children: [
              IconButton(
                onPressed: _sending ? null : _sendPhoto,
                icon: const Icon(
                  Icons.attach_file_rounded,
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
                  onPressed: _sending ? null : _sendText,
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
                          size: 18,
                        ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
