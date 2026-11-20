import "package:flutter/material.dart";
import "package:flutter_map/flutter_map.dart";
import "package:geolocator/geolocator.dart";
import "package:latlong2/latlong.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class FlowGuardGoogleMap extends StatefulWidget {
  final double? customerLat;
  final double? customerLng;
  final double? plumberLat;
  final double? plumberLng;
  final String? plumberLabel;
  final List<LatLng> routePoints;
  final void Function(double lat, double lng)? onPickLocation;
  final double height;
  final bool allowFullscreen;

  static const LatLng _kanoCenter = LatLng(12.0022, 8.5920);

  const FlowGuardGoogleMap({
    super.key,
    this.customerLat,
    this.customerLng,
    this.plumberLat,
    this.plumberLng,
    this.plumberLabel,
    this.routePoints = const [],
    this.onPickLocation,
    this.height = 240,
    this.allowFullscreen = false,
  });

  @override
  State<FlowGuardGoogleMap> createState() => _FlowGuardGoogleMapState();
}

class _FlowGuardGoogleMapState extends State<FlowGuardGoogleMap> {
  final MapController _mapController = MapController();
  LatLng? _myLocation;
  bool _locatingMe = false;

  LatLng get _target {
    if (widget.plumberLat != null && widget.plumberLng != null) {
      return LatLng(widget.plumberLat!, widget.plumberLng!);
    }
    if (widget.customerLat != null && widget.customerLng != null) {
      return LatLng(widget.customerLat!, widget.customerLng!);
    }
    if (_myLocation != null) {
      return _myLocation!;
    }
    return FlowGuardGoogleMap._kanoCenter;
  }

  @override
  void didUpdateWidget(covariant FlowGuardGoogleMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final changed = oldWidget.customerLat != widget.customerLat ||
        oldWidget.customerLng != widget.customerLng ||
        oldWidget.plumberLat != widget.plumberLat ||
        oldWidget.plumberLng != widget.plumberLng;
    if (changed) {
      try {
        _mapController.move(
          _target,
          (widget.customerLat != null || widget.plumberLat != null)
              ? 15.0
              : 12.5,
        );
      } catch (_) {}
    }
  }

  Future<void> _centerOnMyLocation() async {
    setState(() => _locatingMe = true);
    try {
      var perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) {
        perm = await Geolocator.requestPermission();
      }
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Location permission is required.")),
          );
        }
        return;
      }
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
        ),
      );
      final point = LatLng(pos.latitude, pos.longitude);
      if (mounted) {
        setState(() => _myLocation = point);
      }
      _mapController.move(point, 15.5);
      if (widget.onPickLocation != null) {
        widget.onPickLocation!(point.latitude, point.longitude);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Turn on device GPS to show current location."),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _locatingMe = false);
    }
  }

  List<Marker> _buildMarkers() {
    final markers = <Marker>[];
    if (_myLocation != null) {
      markers.add(
        Marker(
          point: _myLocation!,
          width: 24,
          height: 24,
          child: Container(
            decoration: BoxDecoration(
              color: const Color(0xFF2563EB),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 3),
              boxShadow: const [
                BoxShadow(color: Color(0x33000000), blurRadius: 6),
              ],
            ),
          ),
        ),
      );
    }
    if (widget.customerLat != null && widget.customerLng != null) {
      markers.add(
        Marker(
          point: LatLng(widget.customerLat!, widget.customerLng!),
          width: 44,
          height: 44,
          child: const Icon(
            Icons.location_on_rounded,
            color: FlowGuardTheme.navy,
            size: 38,
          ),
        ),
      );
    }
    if (widget.plumberLat != null && widget.plumberLng != null) {
      markers.add(
        Marker(
          point: LatLng(widget.plumberLat!, widget.plumberLng!),
          width: 48,
          height: 48,
          child: Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: FlowGuardTheme.gold,
              shape: BoxShape.circle,
              border: Border.all(color: FlowGuardTheme.navy, width: 2.5),
              boxShadow: const [
                BoxShadow(color: Color(0x33000000), blurRadius: 6),
              ],
            ),
            child: const Icon(
              Icons.engineering_rounded,
              color: FlowGuardTheme.navy,
              size: 22,
            ),
          ),
        ),
      );
    }
    return markers;
  }

  @override
  Widget build(BuildContext context) {
    final initialZoom =
        (widget.customerLat != null || widget.plumberLat != null) ? 15.0 : 12.5;

    final mapWidget = FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: _target,
        initialZoom: initialZoom,
        onTap: widget.onPickLocation == null
            ? null
            : (_, point) =>
                widget.onPickLocation!(point.latitude, point.longitude),
      ),
      children: [
        TileLayer(
          urlTemplate:
              "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
          userAgentPackageName: "com.flowguard.plumbing",
        ),
        if (widget.routePoints.length >= 2)
          PolylineLayer(
            polylines: [
              Polyline(
                points: widget.routePoints,
                color: FlowGuardTheme.navy,
                strokeWidth: 5,
              ),
            ],
          ),
        MarkerLayer(markers: _buildMarkers()),
      ],
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(
          border: Border.all(color: FlowGuardTheme.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Stack(
          children: [
            mapWidget,
            if (widget.allowFullscreen)
              Positioned(
                top: 10,
                left: 10,
                child: Material(
                  color: Colors.white,
                  elevation: 2,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => Scaffold(
                            appBar: AppBar(title: const Text("Live Map")),
                            body: FlowGuardGoogleMap(
                              customerLat: widget.customerLat,
                              customerLng: widget.customerLng,
                              plumberLat: widget.plumberLat,
                              plumberLng: widget.plumberLng,
                              plumberLabel: widget.plumberLabel,
                              routePoints: widget.routePoints,
                              onPickLocation: widget.onPickLocation,
                              height: double.infinity,
                              allowFullscreen: false,
                            ),
                          ),
                        ),
                      );
                    },
                    child: const Padding(
                      padding: EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 8,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.fullscreen_rounded,
                            size: 18,
                            color: FlowGuardTheme.navy,
                          ),
                          SizedBox(width: 4),
                          Text(
                            "Expand",
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            Positioned(
              bottom: 12,
              right: 12,
              child: Material(
                color: Colors.white,
                elevation: 2,
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: "My current location",
                  onPressed: _locatingMe ? null : _centerOnMyLocation,
                  icon: _locatingMe
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(
                          Icons.my_location_rounded,
                          color: FlowGuardTheme.navy,
                        ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
