import "dart:async";
import "dart:convert";
import "dart:io";
import "package:audioplayers/audioplayers.dart";
import "package:flutter/material.dart";
import "package:path_provider/path_provider.dart";
import "package:record/record.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class ZiatChatTurn {
  final String role; // "user" | "assistant"
  final String content;
  final String? audioFilePath;

  const ZiatChatTurn({
    required this.role,
    required this.content,
    this.audioFilePath,
  });
}

class ZiatAssistantSheet extends StatefulWidget {
  final VoidCallback? onBookRequest;

  const ZiatAssistantSheet({super.key, this.onBookRequest});

  static Future<void> show(
    BuildContext context, {
    VoidCallback? onBookRequest,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ZiatAssistantSheet(onBookRequest: onBookRequest),
    );
  }

  @override
  State<ZiatAssistantSheet> createState() => _ZiatAssistantSheetState();
}

class _ZiatAssistantSheetState extends State<ZiatAssistantSheet> {
  static const String _greeting =
      "Hi there! I'm Ziat from FlowGuard. Tell me what's going on with your plumbing in Kano — in English, Hausa, or Pidgin — and I'll help you right away.";

  static final List<ZiatChatTurn> _sessionTurns = [
    const ZiatChatTurn(role: "assistant", content: _greeting),
  ];
  static bool _voiceRepliesEnabled = false;

  final TextEditingController _inputCtrl = TextEditingController();
  final ScrollController _scrollCtrl = ScrollController();
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();

  bool _loading = false;
  bool _recording = false;
  int _recordSeconds = 0;
  int? _playingIdx;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playingIdx = null);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToBottom());
  }

  @override
  void dispose() {
    _recordTimer?.cancel();
    _recorder.dispose();
    _player.dispose();
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (!_scrollCtrl.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  String _cleanDisplayText(String raw) {
    return raw
        .replaceAll(RegExp(r"```[\w]*\n?"), "")
        .replaceAll("```", "")
        .replaceAll("**", "")
        .replaceAll("`", "")
        .replaceAll(RegExp(r"^#{1,4}\s+", multiLine: true), "")
        .replaceAll(RegExp(r"(?<!\w)\*|\*(?!\w)"), "")
        .trim();
  }

  Future<String?> _saveAudioDataUrl(String? dataUrl) async {
    if (dataUrl == null || !dataUrl.startsWith("data:audio/")) return null;
    final commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) return null;
    try {
      final bytes = base64Decode(dataUrl.substring(commaIdx + 1));
      if (bytes.isEmpty) return null;
      final dir = await getTemporaryDirectory();
      final file = File(
        "${dir.path}/ziat_reply_${DateTime.now().millisecondsSinceEpoch}.wav",
      );
      await file.writeAsBytes(bytes, flush: true);
      return file.path;
    } catch (_) {
      return null;
    }
  }

  Future<void> _playFile(String filePath, int idx) async {
    try {
      if (_playingIdx == idx) {
        await _player.stop();
        if (mounted) setState(() => _playingIdx = null);
        return;
      }
      await _player.stop();
      setState(() => _playingIdx = idx);
      await _player.play(DeviceFileSource(filePath));
    } catch (_) {
      if (mounted) setState(() => _playingIdx = null);
    }
  }

  Future<void> _sendMessage({
    String? audioBase64,
    String? audioMimeType,
    int? durationSec,
  }) async {
    final isVoice = audioBase64 != null && audioBase64.isNotEmpty;
    final text = isVoice
        ? "Voice note (${durationSec ?? 1}s)"
        : _inputCtrl.text.trim();
    if (text.isEmpty || _loading) return;

    if (!isVoice) _inputCtrl.clear();

    setState(() {
      _sessionTurns.add(ZiatChatTurn(role: "user", content: text));
      _loading = true;
    });
    _scrollToBottom();

    try {
      final payloadTurns = _sessionTurns
          .map((t) => {"role": t.role, "content": t.content})
          .toList();

      final res = await FlowGuardApiClient.askZiat(
        messages: payloadTurns,
        audioBase64: audioBase64,
        audioMimeType: audioMimeType,
        wantVoiceReply: _voiceRepliesEnabled || isVoice,
      );

      final replyRaw = res["reply"]?.toString().trim();
      final reply = (replyRaw != null && replyRaw.isNotEmpty)
          ? replyRaw
          : "I'm having trouble connecting right now. Please try again.";
      final audioPath =
          await _saveAudioDataUrl(res["audioDataUrl"]?.toString());

      if (!mounted) return;
      setState(() {
        _sessionTurns.add(
          ZiatChatTurn(
            role: "assistant",
            content: reply,
            audioFilePath: audioPath,
          ),
        );
      });
      _scrollToBottom();

      if (audioPath != null && (_voiceRepliesEnabled || isVoice)) {
        await _playFile(audioPath, _sessionTurns.length - 1);
      }
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _sessionTurns.add(
          const ZiatChatTurn(
            role: "assistant",
            content:
                "Connection error. Please check your internet and try again.",
          ),
        );
      });
      _scrollToBottom();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startVoiceRecording() async {
    if (_recording || _loading) return;
    try {
      final hasPerm = await _recorder.hasPermission();
      if (!hasPerm) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Microphone permission is needed to talk to Ziat."),
            ),
          );
        }
        return;
      }
      final dir = await getTemporaryDirectory();
      final path =
          "${dir.path}/ziat_input_${DateTime.now().millisecondsSinceEpoch}.m4a";
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
        path: path,
      );
      setState(() {
        _recording = true;
        _recordSeconds = 0;
      });
      _recordTimer?.cancel();
      _recordTimer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        setState(() => _recordSeconds += 1);
        if (_recordSeconds >= 60) {
          _stopAndSendVoice();
        }
      });
    } catch (_) {
      if (mounted) setState(() => _recording = false);
    }
  }

  Future<void> _stopAndSendVoice() async {
    if (!_recording) return;
    _recordTimer?.cancel();
    final duration = _recordSeconds < 1 ? 1 : _recordSeconds;
    setState(() {
      _recording = false;
      _recordSeconds = 0;
    });
    try {
      final path = await _recorder.stop();
      if (path == null) return;
      final file = File(path);
      if (!await file.exists()) return;
      final bytes = await file.readAsBytes();
      if (bytes.length < 400) return;
      await _sendMessage(
        audioBase64: base64Encode(bytes),
        audioMimeType: "audio/mp4",
        durationSec: duration,
      );
    } catch (_) {}
  }

  void _clearChat() {
    _player.stop();
    setState(() {
      _playingIdx = null;
      _sessionTurns
        ..clear()
        ..add(const ZiatChatTurn(role: "assistant", content: _greeting));
    });
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Container(
      height: MediaQuery.of(context).size.height * 0.78,
      margin: EdgeInsets.only(bottom: bottomInset),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
            decoration: const BoxDecoration(
              color: FlowGuardTheme.navy,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: FlowGuardTheme.gold, width: 2),
                  ),
                  child: ClipOval(
                    child: Image.asset(
                      "assets/images/ziat-avatar.jpg",
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
                        "Ziat",
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 15,
                        ),
                      ),
                      Text(
                        "FlowGuard Assistant • English, Hausa & Pidgin",
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: _voiceRepliesEnabled
                      ? "Mute voice replies"
                      : "Enable voice replies",
                  icon: Icon(
                    _voiceRepliesEnabled
                        ? Icons.volume_up_rounded
                        : Icons.volume_off_rounded,
                    color: _voiceRepliesEnabled
                        ? FlowGuardTheme.gold
                        : Colors.white70,
                    size: 20,
                  ),
                  onPressed: () {
                    setState(() {
                      _voiceRepliesEnabled = !_voiceRepliesEnabled;
                      if (!_voiceRepliesEnabled) {
                        _player.stop();
                        _playingIdx = null;
                      }
                    });
                  },
                ),
                if (_sessionTurns.length > 1)
                  IconButton(
                    tooltip: "New chat",
                    icon: const Icon(
                      Icons.refresh_rounded,
                      color: Colors.white70,
                      size: 20,
                    ),
                    onPressed: _loading ? null : _clearChat,
                  ),
                IconButton(
                  tooltip: "Close",
                  icon: const Icon(Icons.close_rounded, color: Colors.white),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),

          // Messages
          Expanded(
            child: Container(
              color: const Color(0xFFF8FAFC),
              child: ListView.builder(
                controller: _scrollCtrl,
                padding: const EdgeInsets.all(14),
                itemCount: _sessionTurns.length + (_loading ? 1 : 0),
                itemBuilder: (_, idx) {
                  if (_loading && idx == _sessionTurns.length) {
                    return Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          ClipOval(
                            child: Image.asset(
                              "assets/images/ziat-avatar.jpg",
                              width: 24,
                              height: 24,
                              fit: BoxFit.cover,
                            ),
                          ),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: FlowGuardTheme.border),
                            ),
                            child: const Text(
                              "Ziat is thinking…",
                              style: TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  final turn = _sessionTurns[idx];
                  final isUser = turn.role == "user";

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      mainAxisAlignment: isUser
                          ? MainAxisAlignment.end
                          : MainAxisAlignment.start,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        if (!isUser) ...[
                          ClipOval(
                            child: Image.asset(
                              "assets/images/ziat-avatar.jpg",
                              width: 24,
                              height: 24,
                              fit: BoxFit.cover,
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                        Flexible(
                          child: Column(
                            crossAxisAlignment: isUser
                                ? CrossAxisAlignment.end
                                : CrossAxisAlignment.start,
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 10,
                                ),
                                decoration: BoxDecoration(
                                  color: isUser
                                      ? FlowGuardTheme.navy
                                      : Colors.white,
                                  borderRadius: BorderRadius.only(
                                    topLeft: const Radius.circular(16),
                                    topRight: const Radius.circular(16),
                                    bottomLeft: Radius.circular(isUser ? 16 : 4),
                                    bottomRight:
                                        Radius.circular(isUser ? 4 : 16),
                                  ),
                                  border: isUser
                                      ? null
                                      : Border.all(
                                          color: FlowGuardTheme.border,
                                        ),
                                ),
                                child: Text(
                                  _cleanDisplayText(turn.content),
                                  style: TextStyle(
                                    color: isUser
                                        ? Colors.white
                                        : const Color(0xFF1E293B),
                                    fontSize: 13.5,
                                    height: 1.45,
                                  ),
                                ),
                              ),
                              if (!isUser && turn.audioFilePath != null)
                                TextButton.icon(
                                  style: TextButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 6,
                                      vertical: 2,
                                    ),
                                    minimumSize: Size.zero,
                                    tapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                  ),
                                  onPressed: () =>
                                      _playFile(turn.audioFilePath!, idx),
                                  icon: Icon(
                                    _playingIdx == idx
                                        ? Icons.pause_rounded
                                        : Icons.play_arrow_rounded,
                                    size: 16,
                                    color: FlowGuardTheme.navy,
                                  ),
                                  label: Text(
                                    _playingIdx == idx ? "Pause" : "Listen",
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                      color: FlowGuardTheme.navy,
                                    ),
                                  ),
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
          ),

          // Input Bar
          Container(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
            decoration: const BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: FlowGuardTheme.border)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_recording)
                  Container(
                    height: 44,
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF2F2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFFECACA)),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.fiber_manual_record,
                          color: Color(0xFFDC2626),
                          size: 12,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            "Recording… 0:${_recordSeconds.toString().padLeft(2, '0')}",
                            style: const TextStyle(
                              color: Color(0xFF991B1B),
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                        FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: const Color(0xFFDC2626),
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                          ),
                          onPressed: _stopAndSendVoice,
                          icon: const Icon(Icons.stop_rounded, size: 16),
                          label: const Text("Send"),
                        ),
                      ],
                    ),
                  )
                else
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _inputCtrl,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _sendMessage(),
                          decoration: InputDecoration(
                            hintText: "Ask in English, Hausa, or Pidgin...",
                            hintStyle: const TextStyle(fontSize: 13),
                            filled: true,
                            fillColor: const Color(0xFFF8FAFC),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 10,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: FlowGuardTheme.border,
                              ),
                            ),
                            enabledBorder: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                              borderSide: const BorderSide(
                                color: FlowGuardTheme.border,
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filledTonal(
                        style: IconButton.styleFrom(
                          backgroundColor: const Color(0xFFF1F5F9),
                          foregroundColor: FlowGuardTheme.navy,
                          fixedSize: const Size(44, 44),
                        ),
                        tooltip: "Speak to Ziat",
                        onPressed: _loading ? null : _startVoiceRecording,
                        icon: const Icon(Icons.mic_rounded),
                      ),
                      const SizedBox(width: 6),
                      IconButton.filled(
                        style: IconButton.styleFrom(
                          backgroundColor: FlowGuardTheme.navy,
                          foregroundColor: Colors.white,
                          fixedSize: const Size(44, 44),
                        ),
                        tooltip: "Send",
                        onPressed: _loading ? null : () => _sendMessage(),
                        icon: const Icon(Icons.send_rounded, size: 18),
                      ),
                    ],
                  ),
                if (widget.onBookRequest != null) ...[
                  const SizedBox(height: 6),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      onPressed: () {
                        Navigator.of(context).pop();
                        widget.onBookRequest?.call();
                      },
                      child: const Text(
                        "Ready to book? Submit a New Request →",
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: FlowGuardTheme.navy,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
