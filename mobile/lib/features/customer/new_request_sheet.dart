import "dart:math";
import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart";
import "package:image_picker/image_picker.dart";
import "package:supabase_flutter/supabase_flutter.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/features/shared/flowguard_google_map.dart";
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
  double? _lat;
  double? _lng;
  bool _locating = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final first = widget.categories.isNotEmpty
        ? widget.categories.first.title
        : "Pipe Installation & Repairs";
    _selectedCategory = widget.initialCategory ?? first;
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
      final pos = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          _lat = pos.latitude;
          _lng = pos.longitude;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _error = "Unable to read GPS coordinates.");
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  Future<void> _addPhoto(ImageSource source) async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, imageQuality: 75);
    if (picked != null && mounted) {
      setState(() => _photos.add(picked));
    }
  }

  void _nextStep() {
    setState(() => _error = null);
    if (_step == 0 && _descriptionController.text.trim().isEmpty) {
      setState(() => _error = "Please describe the plumbing issue.");
      return;
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
        if (url != null && url.isNotEmpty) {
          uploadedUrls.add(url);
        }
      }
      final ticketNum = "FG-${100000 + Random().nextInt(900000)}";
      final addr = _addressController.text.trim();
      final desc = _descriptionController.text.trim();
      final basePayload = <String, dynamic>{
        "ticket_number": ticketNum,
        "customer_id": widget.customerId,
        "customer_name": widget.customerName,
        "customer_phone": widget.customerPhone,
        "problem_category": _selectedCategory,
        "property_type": _propertyType,
        "priority": _priority,
        "address": addr,
        "issue_description": desc,
        "photos": uploadedUrls,
        "status": "new",
        if (_lat != null) "customer_lat": _lat,
        if (_lng != null) "customer_lng": _lng,
      };
      try {
        await SupabaseConfig.client.from("service_requests").insert(basePayload);
      } on PostgrestException catch (pgErr) {
        if (pgErr.message.contains("'address'") ||
            pgErr.message.contains("'issue_description'")) {
          final legacyPayload = Map<String, dynamic>.from(basePayload)
            ..remove("address")
            ..remove("issue_description")
            ..["address_in_kano"] = addr
            ..["description"] = desc;
          await SupabaseConfig.client
              .from("service_requests")
              .insert(legacyPayload);
        } else {
          rethrow;
        }
      }
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
      }
    } on PostgrestException catch (e) {
      if (mounted) {
        setState(() => _error = "Could not submit request: ${e.message}");
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
      heightFactor: 0.88,
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
                      color: active ? FlowGuardTheme.navy : const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      stepLabels[idx],
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: active ? Colors.white : FlowGuardTheme.mutedText,
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
                decoration: const InputDecoration(labelText: "Plumbing Category"),
                items: options
                    .map((o) => DropdownMenuItem(value: o, child: Text(o)))
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
                      decoration: const InputDecoration(labelText: "Priority"),
                      items: const [
                        DropdownMenuItem(value: "standard", child: Text("Standard")),
                        DropdownMenuItem(value: "urgent", child: Text("Urgent")),
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
                      decoration: const InputDecoration(labelText: "Property"),
                      items: const [
                        DropdownMenuItem(value: "Residential", child: Text("Residential")),
                        DropdownMenuItem(value: "Commercial", child: Text("Commercial")),
                      ],
                      onChanged: (v) {
                        if (v != null) setState(() => _propertyType = v);
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
                  labelText: "Problem Description",
                  hintText: "Briefly describe what needs repair or installation",
                ),
              ),
            ] else if (_step == 1) ...[
              TextField(
                controller: _addressController,
                decoration: const InputDecoration(
                  labelText: "Address in Kano",
                  hintText: "e.g., Hotoro, Nassarawa, Tarauni",
                ),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _locating ? null : _captureGps,
                icon: _locating
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Icon(
                        _lat != null
                            ? Icons.check_circle_outline
                            : Icons.my_location_rounded,
                        color: _lat != null ? Colors.green : FlowGuardTheme.navy,
                      ),
                label: Text(
                  _lat != null
                      ? "GPS Pinned (${_lat!.toStringAsFixed(4)}, ${_lng!.toStringAsFixed(4)})"
                      : "Use Current GPS Location",
                ),
              ),
              const SizedBox(height: 10),
              FlowGuardGoogleMap(
                height: 200,
                customerLat: _lat,
                customerLng: _lng,
                onPickLocation: (lat, lng) {
                  setState(() {
                    _lat = lat;
                    _lng = lng;
                  });
                },
              ),
            ] else ...[
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _addPhoto(ImageSource.camera),
                      icon: const Icon(Icons.photo_camera_outlined),
                      label: const Text("Camera"),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _addPhoto(ImageSource.gallery),
                      icon: const Icon(Icons.photo_library_outlined),
                      label: const Text("Gallery"),
                    ),
                  ),
                ],
              ),
              if (_photos.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  "${_photos.length} photo(s) ready",
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: Color(0xFF065F46),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: FlowGuardTheme.surface,
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
                    const SizedBox(height: 4),
                    Text(_addressController.text.trim()),
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
              const SizedBox(height: 10),
              Text(
                _error!,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF991B1B),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                if (_step > 0) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _submitting ? null : () => setState(() => _step -= 1),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: const Text("Back"),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: _submitting ? null : (_step < 2 ? _nextStep : _submit),
                    child: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(_step < 2 ? "Continue" : "Submit Request"),
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
