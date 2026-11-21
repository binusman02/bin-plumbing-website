import "dart:async";
import "dart:io";
import "package:audioplayers/audioplayers.dart";
import "package:flutter/material.dart";
import "package:http/http.dart" as http;
import "package:path_provider/path_provider.dart";
import "package:record/record.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

/// Smooth voice note recorder card for customers who prefer speaking over typing.
class VoiceNoteRecorderBox extends StatefulWidget {
  final void Function(String? filePath) onRecorded;

  const VoiceNoteRecorderBox({super.key, required this.onRecorded});

  @override
  State<VoiceNoteRecorderBox> createState() => _VoiceNoteRecorderBoxState();
}

class _VoiceNoteRecorderBoxState extends State<VoiceNoteRecorderBox> {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();
  bool _isRecording = false;
  bool _isPlaying = false;
  int _seconds = 0;
  String? _recordedPath;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _isPlaying = false);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
    _player.dispose();
    super.dispose();
  }

  Future<void> _startRecording() async {
    try {
      final hasPerm = await _recorder.hasPermission();
      if (!hasPerm) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("Microphone permission is needed for voice notes."),
            ),
          );
        }
        return;
      }
      final dir = await getTemporaryDirectory();
      final path =
          "${dir.path}/voice_note_${DateTime.now().millisecondsSinceEpoch}.m4a";
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc, bitRate: 96000),
        path: path,
      );
      setState(() {
        _isRecording = true;
        _seconds = 0;
        _recordedPath = null;
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _seconds += 1);
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not start recording: $e")),
        );
      }
    }
  }

  Future<void> _stopRecording() async {
    _timer?.cancel();
    final path = await _recorder.stop();
    if (mounted) {
      setState(() {
        _isRecording = false;
        _recordedPath = path;
      });
    }
    widget.onRecorded(path);
  }

  Future<void> _togglePreview() async {
    if (_recordedPath == null) return;
    if (_isPlaying) {
      await _player.pause();
      setState(() => _isPlaying = false);
    } else {
      await _player.play(DeviceFileSource(_recordedPath!));
      setState(() => _isPlaying = true);
    }
  }

  void _clearRecording() {
    _player.stop();
    if (_recordedPath != null) {
      try {
        File(_recordedPath!).deleteSync();
      } catch (_) {}
    }
    setState(() {
      _recordedPath = null;
      _isPlaying = false;
      _seconds = 0;
    });
    widget.onRecorded(null);
  }

  String _formatDuration(int sec) {
    final m = (sec ~/ 60).toString().padLeft(2, "0");
    final s = (sec % 60).toString().padLeft(2, "0");
    return "$m:$s";
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: _isRecording ? const Color(0xFFFEF2F2) : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _isRecording ? const Color(0xFFEF4444) : FlowGuardTheme.border,
        ),
      ),
      child: Row(
        children: [
          if (_isRecording) ...[
            const Icon(Icons.mic_rounded, color: Color(0xFFDC2626), size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                "Recording voice note... ${_formatDuration(_seconds)}",
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: Color(0xFFB91C1C),
                  fontSize: 13,
                ),
              ),
            ),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFDC2626),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              ),
              onPressed: _stopRecording,
              icon: const Icon(Icons.stop_rounded, size: 18),
              label: const Text("Stop", maxLines: 1),
            ),
          ] else if (_recordedPath != null) ...[
            IconButton(
              onPressed: _togglePreview,
              icon: Icon(
                _isPlaying
                    ? Icons.pause_circle_filled_rounded
                    : Icons.play_circle_fill_rounded,
                color: FlowGuardTheme.navy,
                size: 32,
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    "Voice Note Attached",
                    style: TextStyle(
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    "Duration: ${_formatDuration(_seconds)} • Tap play to listen",
                    style: const TextStyle(
                      fontSize: 11,
                      color: FlowGuardTheme.mutedText,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              tooltip: "Remove voice note",
              onPressed: _clearRecording,
              icon: const Icon(
                Icons.delete_outline_rounded,
                color: Color(0xFFDC2626),
              ),
            ),
          ] else ...[
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: FlowGuardTheme.navy.withValues(alpha: 0.08),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.mic_none_rounded,
                color: FlowGuardTheme.navy,
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    "Voice Note",
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: FlowGuardTheme.navy,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    "Optional audio description",
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      color: FlowGuardTheme.mutedText,
                    ),
                  ),
                ],
              ),
            ),
            OutlinedButton.icon(
              onPressed: _startRecording,
              icon: const Icon(Icons.mic_rounded, size: 16),
              label: const Text(
                "Record",
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Inline voice note player for WhatsApp chat bubbles & request detail pages.
class VoiceNoteBubblePlayer extends StatefulWidget {
  final String rawUrl;
  final bool darkTheme;

  const VoiceNoteBubblePlayer({
    super.key,
    required this.rawUrl,
    this.darkTheme = false,
  });

  static bool isAudioUrl(String url) {
    final lower = url.toLowerCase();
    return lower.contains(".m4a") ||
        lower.contains(".aac") ||
        lower.contains(".mp3") ||
        lower.contains(".wav") ||
        lower.contains(".ogg");
  }

  @override
  State<VoiceNoteBubblePlayer> createState() => _VoiceNoteBubblePlayerState();
}

class _VoiceNoteBubblePlayerState extends State<VoiceNoteBubblePlayer> {
  final AudioPlayer _player = AudioPlayer();
  bool _playing = false;
  bool _downloading = false;
  String? _cachedFilePath;

  @override
  void initState() {
    super.initState();
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playing = false);
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_downloading) return;
    try {
      if (_playing) {
        await _player.pause();
        if (mounted) setState(() => _playing = false);
      } else {
        final url = FlowGuardApiClient.authenticatedFileUrl(widget.rawUrl);
        String? localPath = _cachedFilePath;
        if (localPath == null || !File(localPath).existsSync()) {
          if (mounted) setState(() => _downloading = true);
          final res = await http
              .get(
                Uri.parse(url),
                headers: FlowGuardApiClient.fileAuthHeaders(url),
              )
              .timeout(const Duration(seconds: 20));
          if (res.statusCode < 200 || res.statusCode >= 300) {
            throw Exception("Audio download failed (${res.statusCode})");
          }
          final dir = await getTemporaryDirectory();
          final file = File(
            "${dir.path}/fg_voice_${url.hashCode.abs()}.m4a",
          );
          await file.writeAsBytes(res.bodyBytes, flush: true);
          localPath = file.path;
          _cachedFilePath = localPath;
        }
        await _player.play(DeviceFileSource(localPath));
        if (mounted) {
          setState(() {
            _downloading = false;
            _playing = true;
          });
        }
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _downloading = false;
          _playing = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Could not play this voice note.")),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fg = widget.darkTheme ? Colors.white : FlowGuardTheme.navy;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: widget.darkTheme
            ? Colors.white.withValues(alpha: 0.14)
            : FlowGuardTheme.navy.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          InkWell(
            onTap: _toggle,
            child: Icon(
              _playing
                  ? Icons.pause_circle_filled_rounded
                  : Icons.play_circle_fill_rounded,
              color: fg,
              size: 32,
            ),
          ),
          const SizedBox(width: 8),
          Icon(Icons.graphic_eq_rounded, color: fg, size: 20),
          const SizedBox(width: 6),
          Text(
            _playing ? "Playing voice note..." : "Voice Note",
            style: TextStyle(
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
