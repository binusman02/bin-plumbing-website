import "package:flutter/material.dart";
import "package:google_maps_flutter/google_maps_flutter.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class FlowGuardGoogleMap extends StatelessWidget {
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

  Set<Marker> _buildMarkers() {
    final markers = <Marker>{};
    if (customerLat != null && customerLng != null) {
      markers.add(
        Marker(
          markerId: const MarkerId("customer-property"),
          position: LatLng(customerLat!, customerLng!),
          infoWindow: const InfoWindow(title: "Property Location"),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueAzure,
          ),
        ),
      );
    }
    if (plumberLat != null && plumberLng != null) {
      markers.add(
        Marker(
          markerId: const MarkerId("assigned-plumber"),
          position: LatLng(plumberLat!, plumberLng!),
          infoWindow: InfoWindow(title: plumberLabel ?? "Assigned Plumber"),
          icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueOrange,
          ),
        ),
      );
    }
    return markers;
  }

  Set<Polyline> _buildPolylines() {
    if (routePoints.length < 2) return const {};
    return {
      Polyline(
        polylineId: const PolylineId("live-route"),
        color: FlowGuardTheme.navy,
        width: 5,
        points: routePoints,
      ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final initialTarget = (plumberLat != null && plumberLng != null)
        ? LatLng(plumberLat!, plumberLng!)
        : (customerLat != null && customerLng != null)
            ? LatLng(customerLat!, customerLng!)
            : _kanoCenter;

    final mapWidget = GoogleMap(
      initialCameraPosition: CameraPosition(
        target: initialTarget,
        zoom: (customerLat != null || plumberLat != null) ? 14.5 : 12.0,
      ),
      markers: _buildMarkers(),
      polylines: _buildPolylines(),
      myLocationEnabled: true,
      myLocationButtonEnabled: true,
      onTap: onPickLocation == null
          ? null
          : (pos) => onPickLocation!(pos.latitude, pos.longitude),
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          border: Border.all(color: FlowGuardTheme.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: Stack(
          children: [
            mapWidget,
            if (allowFullscreen)
              Positioned(
                top: 10,
                left: 10,
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  elevation: 2,
                  child: IconButton(
                    icon: const Icon(
                      Icons.fullscreen_rounded,
                      color: FlowGuardTheme.navy,
                    ),
                    tooltip: "Full screen map",
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => Scaffold(
                            appBar: AppBar(
                              title: const Text(
                                "Live Service Map",
                                style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: FlowGuardTheme.navy,
                                ),
                              ),
                            ),
                            body: FlowGuardGoogleMap(
                              customerLat: customerLat,
                              customerLng: customerLng,
                              plumberLat: plumberLat,
                              plumberLng: plumberLng,
                              plumberLabel: plumberLabel,
                              routePoints: routePoints,
                              height: double.infinity,
                            ),
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
