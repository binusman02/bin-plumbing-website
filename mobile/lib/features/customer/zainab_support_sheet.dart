import "dart:async";
import "dart:io";
import "package:flutter/material.dart";
import "package:path_provider/path_provider.dart";
import "package:record/record.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class ZainabSupportSheet extends StatefulWidget {
  final String customerName;

  const ZainabSupportSheet({super.key, required this.customerName});

  @override
  State<ZainabSupportSheet> createState() => _ZainabSupportSheetState();
}

class _ZainabSupportSheetState extends State<ZainabSupportSheet> {
  final TextEditingController _inputCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  final AudioRecorder _recorder = AudioRecorder();

  List<Map<String, dynamic>> _messages = [];
  bool _loading = true;
  bool _sending = false;
  bool _recording = false;
  bool _transcribing = false;
  int _recordSeconds = 0;
  Timer? _recordTimer;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    _recorder.dispose();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadHistory() async {
    try {
      final msgs = await FlowGuardApiClient.fetchZainabMessages();
      if (!mounted) return;
      setState(() {
        _messages = msgs.isNotEmpty
            ? msgs
            : [
                {
                  "id": "welcome",
                  "role": "assistant",
                  "content":
                      "Sannu ${widget.customerName}! I'm Zainab on FlowGuard Support. Ask me in English, Hausa, or Pidgin about your service request, live plumber ETA, quotation, or receipt.",
                  "source": "text",
                },
              ];
        _loading = false;
      });
      _scrollToBottom();
    } catch (_) {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendText([String? preset, String source = "text"]) async {
    final text = (preset ?? _inputCtrl.text).trim();
    if (text.isEmpty || _sending) return;
    if (preset == null) _inputCtrl.clear();

    setState(() {
      _sending = true;
      _error = null;
      _messages = [
        ..._messages,
        {
          "id": "local-${DateTime.now().millisecondsSinceEpoch}",
          "role": "customer",
          "content": text,
          "source": source,
        },
      ];
    });
    _scrollToBottom();

    try {
      final res = await FlowGuardApiClient.sendZainabMessage(
        message: text,
        source: source,
      );
      if (!mounted) return;
      final serverMsgs = res["messages"];
      if (serverMsgs is List && serverMsgs.isNotEmpty) {
        setState(() {
          _messages = serverMsgs
              .whereType<Map>()
              .map((m) => Map<String, dynamic>.from(m))
              .toList();
          _sending = false;
        });
      } else {
        setState(() {
          _messages = [
            ..._messages,
            {
              "id": "reply-${DateTime.now().millisecondsSinceEpoch}",
              "role": "assistant",
              "content": (res["reply"] ?? "").toString(),
              "source": "text",
            },
          ];
          _sending = false;
        });
      }
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = e.toString().replaceFirst("Exception: ", "");
      });
    }
  }

  Future<void> _toggleVoiceRecord() async {
    if (_transcribing || _sending) return;
    if (_recording) {
      _recordTimer?.cancel();
      final path = await _recorder.stop();
      setState(() {
        _recording = false;
        _transcribing = true;
      });
      if (path == null) {
        setState(() => _transcribing = false);
        return;
      }
      try {
        final bytes = await File(path).readAsBytes();
        final transcript = await FlowGuardApiClient.transcribeZainabAudio(
          bytes: bytes,
          filename: "voice_${DateTime.now().millisecondsSinceEpoch}.m4a",
        );
        if (!mounted) return;
        setState(() => _transcribing = false);
        if (transcript.trim().isNotEmpty) {
          await _sendText(transcript.trim(), "voice");
        }
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _transcribing = false;
          _error = e.toString().replaceFirst("Exception: ", "");
        });
      }
      return;
    }

    final perm = await _recorder.hasPermission();
    if (!perm) {
      if (mounted) {
        setState(() {
          _error = "Microphone permission is required for voice notes.";
        });
      }
      return;
    }

    try {
      final dir = await getTemporaryDirectory();
      final outPath =
          "${dir.path}/zainab_voice_${DateTime.now().millisecondsSinceEpoch}.m4a";
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
        path: outPath,
      );
      setState(() {
        _recording = true;
        _recordSeconds = 0;
        _error = null;
      });
      _recordTimer?.cancel();
      _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) return;
        setState(() => _recordSeconds += 1);
        if (_recordSeconds >= 55) {
          _toggleVoiceRecord();
        }
      });
    } catch (e) {
      if (mounted) {
        setState(() => _error = "Could not start recording: $e");
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.78,
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
              decoration: const BoxDecoration(
                color: FlowGuardTheme.navy,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: FlowGuardTheme.gold, width: 2),
                    ),
                    child: ClipOval(
                      child: Image.asset(
                        "assets/images/zainab-avatar.jpg",
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          "Zainab — Customer Support",
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          "Live ticket status, quotes & help (EN / Hausa / Pidgin)",
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.builder(
                      controller: _scrollCtrl,
                      padding: const EdgeInsets.all(14),
                      itemCount: _messages.length + (_sending ? 1 : 0),
                      itemBuilder: (context, idx) {
                        if (idx >= _messages.length) {
                          return const Align(
                            alignment: Alignment.centerLeft,
                            child: Padding(
                              padding: EdgeInsets.symmetric(vertical: 6),
                              child: Text(
                                "Zainab is checking your account...",
                                style: TextStyle(
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                  color: FlowGuardTheme.mutedText,
                                ),
                              ),
                            ),
                          );
                        }
                        final msg = _messages[idx];
                        final isCustomer = msg["role"] == "customer";
                        final content = (msg["content"] ?? "").toString();
                        return Align(
                          alignment: isCustomer
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 13,
                              vertical: 10,
                            ),
                            constraints: BoxConstraints(
                              maxWidth:
                                  MediaQuery.of(context).size.width * 0.78,
                            ),
                            decoration: BoxDecoration(
                              color: isCustomer
                                  ? FlowGuardTheme.navy
                                  : const Color(0xFFF1F5F9),
                              borderRadius: BorderRadius.circular(16),
                              border: isCustomer
                                  ? null
                                  : Border.all(color: FlowGuardTheme.border),
                            ),
                            child: Text(
                              content,
                              style: TextStyle(
                                fontSize: 13.5,
                                height: 1.38,
                                color: isCustomer
                                    ? Colors.white
                                    : FlowGuardTheme.navy,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    fontSize: 11.5,
                    color: Color(0xFFB91C1C),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: FlowGuardTheme.border)),
                ),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: _recording
                          ? "Stop recording"
                          : "Send voice message",
                      onPressed:
                          (_sending || _transcribing) ? null : _toggleVoiceRecord,
                      style: IconButton.styleFrom(
                        backgroundColor: _recording
                            ? const Color(0xFFFEE2E2)
                            : const Color(0xFFF1F5F9),
                      ),
                      icon: _transcribing
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : Icon(
                              _recording ? Icons.stop_rounded : Icons.mic_none,
                              color: _recording
                                  ? const Color(0xFFDC2626)
                                  : FlowGuardTheme.navy,
                            ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: TextField(
                        controller: _inputCtrl,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendText(),
                        decoration: InputDecoration(
                          hintText: _recording
                              ? "Listening (${_recordSeconds}s)..."
                              : "Ask Zainab about your request...",
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 10,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton(
                      onPressed: _sending ? null : () => _sendText(),
                      style: IconButton.styleFrom(
                        backgroundColor: FlowGuardTheme.navy,
                        foregroundColor: Colors.white,
                      ),
                      icon: const Icon(Icons.send_rounded, size: 18),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
