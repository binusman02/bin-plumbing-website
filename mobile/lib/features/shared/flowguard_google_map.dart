import "package:flutter/foundation.dart";
import "package:flutter/gestures.dart";
import "package:flutter/material.dart";
import "package:geolocator/geolocator.dart" as geo;
import "package:latlong2/latlong.dart";
import "package:mapbox_maps_flutter/mapbox_maps_flutter.dart";
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
  static const String _mapboxAccessToken = String.fromEnvironment(
    "MAPBOX_ACCESS_TOKEN",
    defaultValue: "",
  );
  static const String _streetStyleUri = "mapbox://styles/mapbox/streets-v12";
  static const String _satelliteStyleUri =
      "mapbox://styles/mapbox/satellite-streets-v12";

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
  MapboxMap? _mapboxMap;
  CircleAnnotationManager? _circleManager;
  PolylineAnnotationManager? _polylineManager;
  LatLng? _myLocation;
  bool _locatingMe = false;
  bool _satellite = false;

  @override
  void initState() {
    super.initState();
    MapboxOptions.setAccessToken(FlowGuardGoogleMap._mapboxAccessToken);
  }

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

  double get _targetZoom =>
      (widget.customerLat != null || widget.plumberLat != null) ? 15.0 : 12.5;

  @override
  void didUpdateWidget(covariant FlowGuardGoogleMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final coordsChanged = oldWidget.customerLat != widget.customerLat ||
        oldWidget.customerLng != widget.customerLng ||
        oldWidget.plumberLat != widget.plumberLat ||
        oldWidget.plumberLng != widget.plumberLng;
    final routeChanged = oldWidget.routePoints.length != widget.routePoints.length;

    if (coordsChanged) {
      _moveCamera(_target, _targetZoom);
    }
    if (coordsChanged || routeChanged) {
      _syncAnnotations();
    }
  }

  Future<void> _moveCamera(LatLng target, double zoom) async {
    final map = _mapboxMap;
    if (map == null) return;
    try {
      await map.flyTo(
        CameraOptions(
          center: Point(
            coordinates: Position(target.longitude, target.latitude),
          ),
          zoom: zoom,
        ),
        MapAnimationOptions(duration: 450),
      );
    } catch (_) {}
  }

  Future<void> _onMapCreated(MapboxMap mapboxMap) async {
    _mapboxMap = mapboxMap;
    _circleManager = await mapboxMap.annotations.createCircleAnnotationManager();
    _polylineManager =
        await mapboxMap.annotations.createPolylineAnnotationManager();
    if (widget.onPickLocation != null) {
      mapboxMap.addInteraction(
        TapInteraction.onMap((ctx) {
          final coords = ctx.point.coordinates;
          widget.onPickLocation!(
            coords.lat.toDouble(),
            coords.lng.toDouble(),
          );
        }),
      );
    }
    await _syncAnnotations();
  }

  Future<void> _syncAnnotations() async {
    final circles = _circleManager;
    final lines = _polylineManager;
    if (circles == null || lines == null) return;

    try {
      await circles.deleteAll();
      await lines.deleteAll();

      if (widget.routePoints.length >= 2) {
        await lines.create(
          PolylineAnnotationOptions(
            geometry: LineString(
              coordinates: widget.routePoints
                  .map((p) => Position(p.longitude, p.latitude))
                  .toList(),
            ),
            lineColor: FlowGuardTheme.navy.toARGB32(),
            lineWidth: 5.0,
          ),
        );
      }

      if (widget.customerLat != null && widget.customerLng != null) {
        await circles.create(
          CircleAnnotationOptions(
            geometry: Point(
              coordinates: Position(widget.customerLng!, widget.customerLat!),
            ),
            circleColor: FlowGuardTheme.navy.toARGB32(),
            circleRadius: 10.0,
            circleStrokeColor: Colors.white.toARGB32(),
            circleStrokeWidth: 3.0,
          ),
        );
      }

      if (widget.plumberLat != null && widget.plumberLng != null) {
        await circles.create(
          CircleAnnotationOptions(
            geometry: Point(
              coordinates: Position(widget.plumberLng!, widget.plumberLat!),
            ),
            circleColor: FlowGuardTheme.gold.toARGB32(),
            circleRadius: 11.0,
            circleStrokeColor: FlowGuardTheme.navy.toARGB32(),
            circleStrokeWidth: 3.0,
          ),
        );
      }

      if (_myLocation != null &&
          widget.customerLat == null &&
          widget.plumberLat == null) {
        await circles.create(
          CircleAnnotationOptions(
            geometry: Point(
              coordinates: Position(
                _myLocation!.longitude,
                _myLocation!.latitude,
              ),
            ),
            circleColor: const Color(0xFF2563EB).toARGB32(),
            circleRadius: 9.0,
            circleStrokeColor: Colors.white.toARGB32(),
            circleStrokeWidth: 2.5,
          ),
        );
      }
    } catch (_) {}
  }

  Future<void> _toggleStyle() async {
    final next = !_satellite;
    setState(() => _satellite = next);
    try {
      await _mapboxMap?.loadStyleURI(
        next
            ? FlowGuardGoogleMap._satelliteStyleUri
            : FlowGuardGoogleMap._streetStyleUri,
      );
      await _syncAnnotations();
    } catch (_) {}
  }

  Future<void> _centerOnMyLocation() async {
    setState(() => _locatingMe = true);
    try {
      var perm = await geo.Geolocator.checkPermission();
      if (perm == geo.LocationPermission.denied) {
        perm = await geo.Geolocator.requestPermission();
      }
      if (perm == geo.LocationPermission.denied ||
          perm == geo.LocationPermission.deniedForever) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text("Location permission is required.")),
          );
        }
        return;
      }
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
        ),
      );
      final point = LatLng(pos.latitude, pos.longitude);
      if (mounted) {
        setState(() => _myLocation = point);
      }
      await _moveCamera(point, 15.5);
      await _syncAnnotations();
      if (widget.onPickLocation != null) {
        widget.onPickLocation!(pos.latitude, pos.longitude);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Unable to fetch current location.")),
        );
      }
    } finally {
      if (mounted) setState(() => _locatingMe = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mapWidget = MapWidget(
      key: const ValueKey("flowguard-mapbox-widget"),
      styleUri: _satellite
          ? FlowGuardGoogleMap._satelliteStyleUri
          : FlowGuardGoogleMap._streetStyleUri,
      viewport: CameraViewportState(
        center: Point(
          coordinates: Position(_target.longitude, _target.latitude),
        ),
        zoom: _targetZoom,
      ),
      gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
        Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer()),
      },
      onMapCreated: _onMapCreated,
      onStyleLoadedListener: (_) => _syncAnnotations(),
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
            Positioned(
              top: 10,
              right: 10,
              child: Material(
                color: Colors.white,
                elevation: 2,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _toggleStyle,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 8,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _satellite
                              ? Icons.map_outlined
                              : Icons.satellite_alt_rounded,
                          size: 16,
                          color: FlowGuardTheme.navy,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _satellite ? "Street" : "Satellite",
                          maxLines: 1,
                          softWrap: false,
                          style: const TextStyle(
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
              child: FloatingActionButton.small(
                heroTag: null,
                backgroundColor: Colors.white,
                foregroundColor: FlowGuardTheme.navy,
                onPressed: _locatingMe ? null : _centerOnMyLocation,
                child: _locatingMe
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.my_location_rounded),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
