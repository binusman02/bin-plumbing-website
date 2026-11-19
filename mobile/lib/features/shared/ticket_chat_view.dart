import "package:flutter/material.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class TicketChatView extends StatefulWidget {
  final List<ServiceRequestItem> tickets;
  final String senderRole;
  final String senderName;

  const TicketChatView({
    super.key,
    required this.tickets,
    required this.senderRole,
    required this.senderName,
  });

  @override
  State<TicketChatView> createState() => _TicketChatViewState();
}

class _TicketChatViewState extends State<TicketChatView> {
  String? _selectedTicket;
  final _messageController = TextEditingController();
  bool _sending = false;
  bool _loading = false;
  List<JobMessageItem> _messages = [];

  @override
  void initState() {
    super.initState();
    if (widget.tickets.isNotEmpty) {
      _selectedTicket = widget.tickets.first.ticketNumber;
      _loadMessages();
    }
  }

  @override
  void dispose() {
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    final ticket = _selectedTicket;
    if (ticket == null) return;
    setState(() => _loading = true);
    try {
      final rows = await SupabaseConfig.client
          .from("job_messages")
          .select()
          .eq("ticket_number", ticket)
          .order("created_at", ascending: true);
      if (mounted) {
        setState(() {
          _messages = rows.map((r) => JobMessageItem.fromJson(r)).toList();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _sendMessage() async {
    final ticket = _selectedTicket;
    final text = _messageController.text.trim();
    if (ticket == null || text.isEmpty || _sending) return;

    setState(() => _sending = true);
    try {
      await SupabaseConfig.client.from("job_messages").insert({
        "ticket_number": ticket,
        "sender_role": widget.senderRole,
        "sender_name": widget.senderName,
        "message": text,
      });
      _messageController.clear();
      await _loadMessages();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.tickets.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            "No active tickets to message about yet.",
            textAlign: TextAlign.center,
            style: TextStyle(color: FlowGuardTheme.mutedText),
          ),
        ),
      );
    }

    return Column(
      children: [
        Container(
          color: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: DropdownButtonFormField<String>(
            initialValue: _selectedTicket,
            decoration: const InputDecoration(
              labelText: "Select Ticket",
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            items: widget.tickets
                .map(
                  (t) => DropdownMenuItem(
                    value: t.ticketNumber,
                    child: Text("${t.ticketNumber} • ${t.problemCategory}"),
                  ),
                )
                .toList(),
            onChanged: (val) {
              if (val != null) {
                setState(() => _selectedTicket = val);
                _loadMessages();
              }
            },
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _messages.isEmpty
                  ? const Center(
                      child: Text(
                        "No messages yet. Start the conversation below.",
                        style: TextStyle(color: FlowGuardTheme.mutedText),
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _messages.length,
                      itemBuilder: (context, idx) {
                        final msg = _messages[idx];
                        final isMe = msg.senderRole == widget.senderRole;
                        return Align(
                          alignment: isMe
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            constraints: const BoxConstraints(maxWidth: 290),
                            decoration: BoxDecoration(
                              color: isMe ? FlowGuardTheme.navy : Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: isMe
                                  ? null
                                  : Border.all(color: FlowGuardTheme.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  msg.senderName,
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                    color: isMe
                                        ? FlowGuardTheme.gold
                                        : FlowGuardTheme.mutedText,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  msg.message,
                                  style: TextStyle(
                                    fontSize: 13,
                                    color: isMe ? Colors.white : FlowGuardTheme.navy,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
        ),
        SafeArea(
          top: false,
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: FlowGuardTheme.border)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _messageController,
                    textInputAction: TextInputAction.send,
                    onSubmitted: (_) => _sendMessage(),
                    decoration: const InputDecoration(
                      hintText: "Write a message...",
                      contentPadding: EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _sending ? null : _sendMessage,
                  style: IconButton.styleFrom(
                    backgroundColor: FlowGuardTheme.navy,
                    foregroundColor: FlowGuardTheme.gold,
                    minimumSize: const Size(48, 48),
                  ),
                  icon: _sending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.send_rounded),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
