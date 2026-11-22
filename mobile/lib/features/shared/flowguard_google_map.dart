import "dart:convert";

import "package:flutter/foundation.dart";
import "package:flutter/gestures.dart";
import "package:flutter/material.dart";
import "package:flutter/services.dart";
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
  final bool followMe;
  final bool enable3D;
  final bool showPlumberMarker;
  final double followZoom;
  final bool showStyleControls;
  final bool showDefaultCenterButton;
  final int recenterTrigger;
  final double borderRadius;

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
    this.followMe = false,
    this.enable3D = false,
    this.showPlumberMarker = true,
    this.followZoom = 16.2,
    this.showStyleControls = true,
    this.showDefaultCenterButton = true,
    this.recenterTrigger = 0,
    this.borderRadius = 18.0,
  });

  @override
  State<FlowGuardGoogleMap> createState() => _FlowGuardGoogleMapState();
}

class _FlowGuardGoogleMapState extends State<FlowGuardGoogleMap> {
  static const String _routeSourceId = "flowguard-route-source";
  static const String _routeLayerId = "flowguard-route-layer";

  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointManager;
  PointAnnotation? _customerAnnotation;
  PointAnnotation? _plumberAnnotation;
  Uint8List? _customerPinBytes;
  Uint8List? _plumberPinBytes;
  late final ViewportController _viewportController;
  LatLng? _myLocation;
  bool _locatingMe = false;
  bool _satellite = false;
  late bool _is3D;

  @override
  void initState() {
    super.initState();
    _is3D = widget.enable3D;
    _viewportController = ViewportController();
    MapboxOptions.setAccessToken(FlowGuardGoogleMap._mapboxAccessToken);
  }

  @override
  void dispose() {
    _viewportController.dispose();
    super.dispose();
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
      (widget.customerLat != null || widget.plumberLat != null) ? 15.5 : 12.5;

  bool _routeChanged(List<LatLng> prev, List<LatLng> next) {
    if (identical(prev, next)) return false;
    if (prev.length != next.length) return true;
    if (prev.isEmpty) return false;
    return prev.first != next.first || prev.last != next.last;
  }

  @override
  void didUpdateWidget(covariant FlowGuardGoogleMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final coordsChanged = oldWidget.customerLat != widget.customerLat ||
        oldWidget.customerLng != widget.customerLng ||
        oldWidget.plumberLat != widget.plumberLat ||
        oldWidget.plumberLng != widget.plumberLng ||
        oldWidget.showPlumberMarker != widget.showPlumberMarker;
    final routeChanged = _routeChanged(oldWidget.routePoints, widget.routePoints);

    final firstCoordAppearance =
        (oldWidget.customerLat == null && widget.customerLat != null) ||
        (oldWidget.plumberLat == null && widget.plumberLat != null);

    if (oldWidget.recenterTrigger != widget.recenterTrigger && widget.followMe) {
      _engageFollowPuck();
    } else if (oldWidget.followMe != widget.followMe && widget.followMe) {
      _engageFollowPuck();
    } else if (firstCoordAppearance && !widget.followMe) {
      _moveCamera(_target, _targetZoom);
    }

    if (coordsChanged) {
      _syncCircleAnnotations();
    }
    if (routeChanged) {
      _syncRouteSource();
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
          pitch: _is3D ? 48.0 : 0.0,
        ),
        MapAnimationOptions(duration: 450),
      );
    } catch (_) {}
  }

  Future<void> _enableLocationPuck({bool engageFollow = false}) async {
    final map = _mapboxMap;
    if (map == null) return;
    try {
      final perm = await geo.Geolocator.checkPermission();
      if (perm != geo.LocationPermission.always &&
          perm != geo.LocationPermission.whileInUse) {
        return;
      }
      await map.location.updateSettings(
        LocationComponentSettings(
          enabled: true,
          pulsingEnabled: true,
          showAccuracyRing: true,
          puckBearingEnabled: true,
          puckBearing: PuckBearing.HEADING,
        ),
      );
      if (engageFollow ||
          widget.followMe ||
          (widget.customerLat == null && widget.plumberLat == null)) {
        _engageFollowPuck();
      }
    } catch (_) {}
  }

  void _engageFollowPuck() {
    try {
      _viewportController.moveTo(
        FollowPuckViewportState(
          zoom: widget.followZoom,
          pitch: _is3D ? 50.0 : 0.0,
          bearing: const FollowPuckViewportStateBearingHeading(),
        ),
      );
    } catch (_) {}
  }

  Future<void> _ensurePinBytesLoaded() async {
    if (_customerPinBytes == null) {
      try {
        final data = await rootBundle.load(
          "assets/images/map-pins/customer-pin.png",
        );
        _customerPinBytes = data.buffer.asUint8List();
      } catch (_) {}
    }
    if (_plumberPinBytes == null) {
      try {
        final data = await rootBundle.load(
          "assets/images/map-pins/plumber-pin.png",
        );
        _plumberPinBytes = data.buffer.asUint8List();
      } catch (_) {}
    }
  }

  Future<void> _onMapCreated(MapboxMap mapboxMap) async {
    _mapboxMap = mapboxMap;
    _pointManager = await mapboxMap.annotations.createPointAnnotationManager();
    _customerAnnotation = null;
    _plumberAnnotation = null;
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
    await _ensurePinBytesLoaded();
    await _enableLocationPuck(engageFollow: widget.followMe);
    await _syncCircleAnnotations();
    await _syncRouteSource();
  }

  Future<void> _syncCircleAnnotations() async {
    final points = _pointManager;
    if (points == null) return;
    await _ensurePinBytesLoaded();

    try {
      if (widget.customerLat != null &&
          widget.customerLng != null &&
          _customerPinBytes != null) {
        final pt = Point(
          coordinates: Position(widget.customerLng!, widget.customerLat!),
        );
        if (_customerAnnotation == null) {
          _customerAnnotation = await points.create(
            PointAnnotationOptions(
              geometry: pt,
              image: _customerPinBytes,
              iconSize: 0.55,
              iconAnchor: IconAnchor.BOTTOM,
            ),
          );
        } else {
          _customerAnnotation!.geometry = pt;
          await points.update(_customerAnnotation!);
        }
      } else if (_customerAnnotation != null) {
        await points.delete(_customerAnnotation!);
        _customerAnnotation = null;
      }

      if (widget.showPlumberMarker &&
          widget.plumberLat != null &&
          widget.plumberLng != null &&
          _plumberPinBytes != null) {
        final pt = Point(
          coordinates: Position(widget.plumberLng!, widget.plumberLat!),
        );
        if (_plumberAnnotation == null) {
          _plumberAnnotation = await points.create(
            PointAnnotationOptions(
              geometry: pt,
              image: _plumberPinBytes,
              iconSize: 0.55,
              iconAnchor: IconAnchor.BOTTOM,
            ),
          );
        } else {
          _plumberAnnotation!.geometry = pt;
          await points.update(_plumberAnnotation!);
        }
      } else if (_plumberAnnotation != null) {
        await points.delete(_plumberAnnotation!);
        _plumberAnnotation = null;
      }
    } catch (_) {}
  }

  String _routeGeoJson(List<LatLng> points) {
    if (points.length < 2) {
      return jsonEncode({
        "type": "FeatureCollection",
        "features": const [],
      });
    }
    return jsonEncode({
      "type": "FeatureCollection",
      "features": [
        {
          "type": "Feature",
          "properties": const {},
          "geometry": {
            "type": "LineString",
            "coordinates":
                points.map((p) => [p.longitude, p.latitude]).toList(),
          },
        },
      ],
    });
  }

  Future<void> _syncRouteSource() async {
    final map = _mapboxMap;
    if (map == null) return;
    final geoJson = _routeGeoJson(widget.routePoints);
    try {
      final exists = await map.styleSourceExists(_routeSourceId);
      if (!exists) {
        await map.addSource(
          GeoJsonSource(id: _routeSourceId, data: geoJson),
        );
        final layerExists = await map.styleLayerExists(_routeLayerId);
        if (!layerExists) {
          await map.addLayer(
            LineLayer(
              id: _routeLayerId,
              sourceId: _routeSourceId,
              lineColor: FlowGuardTheme.navy.toARGB32(),
              lineWidth: 6.0,
              lineCap: LineCap.ROUND,
              lineJoin: LineJoin.ROUND,
            ),
          );
        }
      } else {
        await map.setStyleSourceProperty(_routeSourceId, "data", geoJson);
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
      await _syncCircleAnnotations();
      await _syncRouteSource();
    } catch (_) {}
  }

  Future<void> _toggle3D() async {
    final next = !_is3D;
    setState(() => _is3D = next);
    if (widget.followMe ||
        (widget.customerLat == null && widget.plumberLat == null)) {
      _engageFollowPuck();
    } else {
      await _moveCamera(_target, _targetZoom);
    }
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
      await _enableLocationPuck(engageFollow: true);
      final pos = await geo.Geolocator.getCurrentPosition(
        locationSettings: const geo.LocationSettings(
          accuracy: geo.LocationAccuracy.high,
        ),
      );
      final point = LatLng(pos.latitude, pos.longitude);
      if (mounted) {
        setState(() => _myLocation = point);
      }
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
    final missingToken = FlowGuardGoogleMap._mapboxAccessToken.trim().isEmpty;

    final mapWidget = MapWidget(
      key: const ValueKey("flowguard-mapbox-widget"),
      styleUri: _satellite
          ? FlowGuardGoogleMap._satelliteStyleUri
          : FlowGuardGoogleMap._streetStyleUri,
      viewportController: _viewportController,
      viewport: widget.followMe
          ? FollowPuckViewportState(
              zoom: widget.followZoom,
              pitch: _is3D ? 50.0 : 0.0,
              bearing: const FollowPuckViewportStateBearingHeading(),
            )
          : CameraViewportState(
              center: Point(
                coordinates: Position(_target.longitude, _target.latitude),
              ),
              zoom: _targetZoom,
              pitch: _is3D ? 48.0 : 0.0,
            ),
      gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
        Factory<OneSequenceGestureRecognizer>(() => EagerGestureRecognizer()),
      },
      onMapCreated: _onMapCreated,
      onStyleLoadedListener: (_) {
        _syncCircleAnnotations();
        _syncRouteSource();
      },
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.borderRadius),
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(
          border: widget.borderRadius > 0
              ? Border.all(color: FlowGuardTheme.border)
              : null,
          borderRadius: BorderRadius.circular(widget.borderRadius),
        ),
        child: Stack(
          children: [
            mapWidget,
            if (missingToken)
              Positioned(
                top: 12,
                left: 12,
                right: 12,
                child: Material(
                  color: Colors.red.shade700,
                  elevation: 4,
                  borderRadius: BorderRadius.circular(12),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    child: Row(
                      children: [
                        Icon(
                          Icons.error_outline_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            "Mapbox token missing. Build with --dart-define=MAPBOX_ACCESS_TOKEN=pk....",
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            if (widget.showStyleControls)
              Positioned(
                top: 10,
                right: 10,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Material(
                      color: _is3D ? FlowGuardTheme.navy : Colors.white,
                      elevation: 2,
                      borderRadius: BorderRadius.circular(12),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(12),
                        onTap: _toggle3D,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 8,
                          ),
                          child: Text(
                            _is3D ? "3D" : "2D",
                            maxLines: 1,
                            softWrap: false,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: _is3D ? Colors.white : FlowGuardTheme.navy,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Material(
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
                  ],
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
                              followMe: widget.followMe,
                              enable3D: _is3D,
                              showPlumberMarker: widget.showPlumberMarker,
                              borderRadius: 0.0,
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
            if (widget.showDefaultCenterButton)
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
