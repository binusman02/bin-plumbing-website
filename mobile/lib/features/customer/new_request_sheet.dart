import "dart:io";
import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart";
import "package:image_picker/image_picker.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
import "package:flowguard_plumbing/features/shared/voice_note_widgets.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class NewRequestSheet extends StatefulWidget {
  final String customerId;
  final String customerName;
  final String customerPhone;
  final String? savedAddress;
  final List<ServiceCategoryItem> categories;
  final String? initialCategory;
  final VoidCallback onCreated;

  const NewRequestSheet({
    super.key,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    this.savedAddress,
    required this.categories,
    this.initialCategory,
    required this.onCreated,
  });

  @override
  State<NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends State<NewRequestSheet> {
  int _step = 0;
  late String _selectedCategory;
  String _priority = "standard";
  String _propertyType = "Residential";
  late final TextEditingController _addressController;
  final _descriptionController = TextEditingController();
  final List<XFile> _photos = [];
  String? _voiceNotePath;
  double? _lat;
  double? _lng;
  bool _locating = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _selectedCategory = widget.initialCategory ??
        (widget.categories.isNotEmpty
            ? widget.categories.first.title
            : "General Plumbing");
    _addressController = TextEditingController(text: widget.savedAddress ?? "");
  }

  @override
  void dispose() {
    _addressController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _captureGps() async {
    setState(() {
      _locating = true;
      _error = null;
    });
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        setState(() => _error = "Location permission denied.");
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      setState(() {
        _lat = pos.latitude;
        _lng = pos.longitude;
        if (_addressController.text.trim().isEmpty) {
          _addressController.text =
              "Pinned GPS Location (${pos.latitude.toStringAsFixed(4)}, ${pos.longitude.toStringAsFixed(4)}), Kano";
        }
      });
    } catch (_) {
      setState(
        () => _error = "Could not fetch GPS. You can enter your address below.",
      );
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      imageQuality: 80,
      maxWidth: 1400,
    );
    if (file != null && mounted) {
      setState(() => _photos.add(file));
    }
  }

  void _nextStep() {
    setState(() => _error = null);
    if (_step == 0) {
      if (_descriptionController.text.trim().isEmpty &&
          _voiceNotePath != null) {
        _descriptionController.text =
            "Voice note attached describing the plumbing issue.";
      }
      if (_descriptionController.text.trim().isEmpty) {
        setState(
          () => _error =
              "Please describe the issue or record a quick voice note.",
        );
        return;
      }
    }
    if (_step == 1 && _addressController.text.trim().isEmpty) {
      setState(() => _error = "Please enter or confirm your address in Kano.");
      return;
    }
    setState(() => _step += 1);
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final uploadedUrls = <String>[];
      for (final file in _photos) {
        final bytes = await file.readAsBytes();
        final url = await FlowGuardApiClient.uploadRequestPhoto(
          bytes: bytes,
          filename: file.name,
        );
        uploadedUrls.add(url);
      }
      if (_voiceNotePath != null) {
        final voiceFile = File(_voiceNotePath!);
        if (await voiceFile.exists()) {
          final bytes = await voiceFile.readAsBytes();
          final voiceUrl = await FlowGuardApiClient.uploadRequestPhoto(
            bytes: bytes,
            filename:
                "voice_${DateTime.now().millisecondsSinceEpoch}.m4a",
          );
          uploadedUrls.add(voiceUrl);
        }
      }

      await FlowGuardApiClient.createServiceRequest(
        problemCategory: _selectedCategory,
        propertyType: _propertyType,
        priority: _priority,
        address: _addressController.text.trim(),
        issueDescription: _descriptionController.text.trim(),
        photos: uploadedUrls,
        customerLat: _lat,
        customerLng: _lng,
      );

      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
      }
    } catch (e) {
      if (mounted) {
        setState(() => _error = "Could not submit request: $e");
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final options = widget.categories.map((c) => c.title).toList();
    if (!options.contains(_selectedCategory)) {
      options.insert(0, _selectedCategory);
    }

    const stepLabels = ["1. Details", "2. Location", "3. Confirm"];

    return FractionallySizedBox(
      heightFactor: 0.90,
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          12,
          20,
          MediaQuery.of(context).viewInsets.bottom + 20,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              "New Plumbing Request",
              style: TextStyle(
                fontSize: 19,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: List.generate(3, (idx) {
                final active = idx <= _step;
                return Expanded(
                  child: Container(
                    margin: EdgeInsets.only(right: idx < 2 ? 8 : 0),
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: active
                          ? FlowGuardTheme.navy
                          : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      stepLabels[idx],
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color:
                            active ? Colors.white : FlowGuardTheme.mutedText,
                      ),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 18),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_step == 0) ...[
                      DropdownButtonFormField<String>(
                        initialValue: _selectedCategory,
                        decoration: const InputDecoration(
                          labelText: "Plumbing Category",
                        ),
                        items: options
                            .map(
                              (o) => DropdownMenuItem(value: o, child: Text(o)),
                            )
                            .toList(),
                        onChanged: (v) {
                          if (v != null) setState(() => _selectedCategory = v);
                        },
                      ),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _priority,
                              decoration: const InputDecoration(
                                labelText: "Priority",
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: "standard",
                                  child: Text("Standard"),
                                ),
                                DropdownMenuItem(
                                  value: "urgent",
                                  child: Text("Urgent"),
                                ),
                              ],
                              onChanged: (v) {
                                if (v != null) setState(() => _priority = v);
                              },
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: DropdownButtonFormField<String>(
                              initialValue: _propertyType,
                              decoration: const InputDecoration(
                                labelText: "Property",
                              ),
                              items: const [
                                DropdownMenuItem(
                                  value: "Residential",
                                  child: Text("Residential"),
                                ),
                                DropdownMenuItem(
                                  value: "Commercial",
                                  child: Text("Commercial"),
                                ),
                              ],
                              onChanged: (v) {
                                if (v != null) {
                                  setState(() => _propertyType = v);
                                }
                              },
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: _descriptionController,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: "Problem Description (or record voice below)",
                          hintText:
                              "Describe the leak, blockage, or installation needed...",
                        ),
                      ),
                      const SizedBox(height: 12),
                      VoiceNoteRecorderBox(
                        onRecorded: (path) =>
                            setState(() => _voiceNotePath = path),
                      ),
                    ] else if (_step == 1) ...[
                      TextField(
                        controller: _addressController,
                        decoration: const InputDecoration(
                          labelText: "Property Address in Kano",
                          prefixIcon: Icon(Icons.location_on_outlined),
                        ),
                      ),
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: _locating ? null : _captureGps,
                        icon: const Icon(Icons.my_location_outlined, size: 18),
                        label: Text(
                          _locating
                              ? "Fetching GPS..."
                              : _lat != null
                                  ? "GPS Pinned (${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)})"
                                  : "Use Current GPS Location",
                          maxLines: 1,
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        "Or tap on the map to pin exact property location:",
                        style: TextStyle(
                          fontSize: 12,
                          color: FlowGuardTheme.mutedText,
                        ),
                      ),
                      const SizedBox(height: 8),
                      FlowGuardGoogleMap(
                        customerLat: _lat,
                        customerLng: _lng,
                        height: 200,
                        onPickLocation: (lat, lng) {
                          setState(() {
                            _lat = lat;
                            _lng = lng;
                            if (_addressController.text.trim().isEmpty) {
                              _addressController.text =
                                  "Pinned Map Location (${lat.toStringAsFixed(4)}, ${lng.toStringAsFixed(4)}), Kano";
                            }
                          });
                        },
                      ),
                    ] else ...[
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _pickPhoto(ImageSource.camera),
                              icon: const Icon(Icons.camera_alt_outlined),
                              label: const Text("Camera", maxLines: 1),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _pickPhoto(ImageSource.gallery),
                              icon: const Icon(Icons.photo_library_outlined),
                              label: const Text("Gallery", maxLines: 1),
                            ),
                          ),
                        ],
                      ),
                      if (_photos.isNotEmpty) ...[
                        const SizedBox(height: 10),
                        Text(
                          "${_photos.length} photo(s) attached",
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                      ],
                      if (_voiceNotePath != null) ...[
                        const SizedBox(height: 6),
                        const Row(
                          children: [
                            Icon(
                              Icons.mic_rounded,
                              size: 16,
                              color: Color(0xFF059669),
                            ),
                            SizedBox(width: 6),
                            Text(
                              "Voice note attached",
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: Color(0xFF059669),
                              ),
                            ),
                          ],
                        ),
                      ],
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: FlowGuardTheme.border),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              "$_selectedCategory ($_priority • $_propertyType)",
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                color: FlowGuardTheme.navy,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _addressController.text.trim(),
                              style: const TextStyle(fontSize: 13),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _descriptionController.text.trim(),
                              style: const TextStyle(
                                fontSize: 12,
                                color: FlowGuardTheme.mutedText,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: Color(0xFFB91C1C),
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        if (_step > 0) ...[
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _submitting
                                  ? null
                                  : () => setState(() => _step -= 1),
                              child: const Text("Back", maxLines: 1),
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        Expanded(
                          flex: 2,
                          child: ElevatedButton(
                            onPressed: _submitting
                                ? null
                                : (_step < 2 ? _nextStep : _submit),
                            child: _submitting
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(
                                    _step < 2 ? "Continue" : "Submit Request",
                                    maxLines: 1,
                                  ),
                          ),
                        ),
                      ],
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
