import "dart:math";
import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class NewRequestSheet extends StatefulWidget {
  final String customerId;
  final String customerName;
  final String customerPhone;
  final List<ServiceCategoryItem> categories;
  final String? initialCategory;
  final VoidCallback onCreated;

  const NewRequestSheet({
    super.key,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.categories,
    this.initialCategory,
    required this.onCreated,
  });

  @override
  State<NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends State<NewRequestSheet> {
  late String _selectedCategory;
  String _priority = "standard";
  String _propertyType = "Residential";
  final _addressController = TextEditingController();
  final _descriptionController = TextEditingController();
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

  Future<void> _submit() async {
    final address = _addressController.text.trim();
    final desc = _descriptionController.text.trim();
    if (address.isEmpty || desc.isEmpty) {
      setState(() => _error = "Enter your Kano address and describe the issue.");
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final ticketNum =
          "FG-${100000 + Random().nextInt(900000)}";
      await SupabaseConfig.client.from("service_requests").insert({
        "ticket_number": ticketNum,
        "customer_id": widget.customerId,
        "customer_name": widget.customerName,
        "customer_phone": widget.customerPhone,
        "problem_category": _selectedCategory,
        "property_type": _propertyType,
        "priority": _priority,
        "address_in_kano": address,
        "description": desc,
        "status": "new",
        if (_lat != null) "customer_lat": _lat,
        if (_lng != null) "customer_lng": _lng,
      });
      if (mounted) {
        Navigator.pop(context);
        widget.onCreated();
      }
    } catch (_) {
      if (mounted) {
        setState(() => _error = "Could not submit request. Please try again.");
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

    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        8,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Request This Service",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              initialValue: _selectedCategory,
              decoration: const InputDecoration(labelText: "Service Category"),
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
                      if (v != null) setState(() => _propertyType = v);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
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
                    : "Pin My Current GPS Location",
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: "Describe the Plumbing Issue",
              ),
            ),
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
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text("Submit Plumbing Request"),
            ),
          ],
        ),
      ),
    );
  }
}
