import "package:flutter/material.dart";
import "package:google_maps_flutter/google_maps_flutter.dart";
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
  GoogleMapController? _controller;

  LatLng get _target {
    if (widget.plumberLat != null && widget.plumberLng != null) {
      return LatLng(widget.plumberLat!, widget.plumberLng!);
    }
    if (widget.customerLat != null && widget.customerLng != null) {
      return LatLng(widget.customerLat!, widget.customerLng!);
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
    if (changed && _controller != null) {
      _controller!.animateCamera(
        CameraUpdate.newLatLngZoom(
          _target,
          (widget.customerLat != null || widget.plumberLat != null)
              ? 15.0
              : 12.0,
        ),
      );
    }
  }

  Set<Marker> _buildMarkers() {
    final markers = <Marker>{};
    if (widget.customerLat != null && widget.customerLng != null) {
      markers.add(
        Marker(
          markerId: const MarkerId("customer-property"),
          position: LatLng(widget.customerLat!, widget.customerLng!),
          infoWindow: const InfoWindow(title: "Property Location"),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueAzure,
          ),
        ),
      );
    }
    if (widget.plumberLat != null && widget.plumberLng != null) {
      markers.add(
        Marker(
          markerId: const MarkerId("assigned-plumber"),
          position: LatLng(widget.plumberLat!, widget.plumberLng!),
          infoWindow: InfoWindow(
            title: widget.plumberLabel ?? "Assigned Plumber",
          ),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueOrange,
          ),
        ),
      );
    }
    return markers;
  }

  Set<Polyline> _buildPolylines() {
    if (widget.routePoints.length < 2) return const {};
    return {
      Polyline(
        polylineId: const PolylineId("live-route"),
        color: FlowGuardTheme.navy,
        width: 5,
        points: widget.routePoints,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final mapWidget = GoogleMap(
      initialCameraPosition: CameraPosition(
        target: _target,
        zoom: (widget.customerLat != null || widget.plumberLat != null)
            ? 15.0
            : 12.0,
      ),
      onMapCreated: (ctrl) => _controller = ctrl,
      markers: _buildMarkers(),
      polylines: _buildPolylines(),
      myLocationEnabled: true,
      myLocationButtonEnabled: true,
      zoomControlsEnabled: true,
      onTap: widget.onPickLocation == null
          ? null
          : (pos) => widget.onPickLocation!(pos.latitude, pos.longitude),
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
          ],
        ),
      ),
    );
  }
}
