import "package:flutter/material.dart";
import "package:google_maps_flutter/google_maps_flutter.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class FlowGuardGoogleMap extends StatelessWidget {
  final double? customerLat;
  final double? customerLng;
  final double? plumberLat;
  final double? plumberLng;
  final String? plumberLabel;
  final void Function(double lat, double lng)? onPickLocation;
  final double height;

  static const LatLng _kanoCenter = LatLng(12.0022, 8.5920);

  const FlowGuardGoogleMap({
    super.key,
    this.customerLat,
    this.customerLng,
    this.plumberLat,
    this.plumberLng,
    this.plumberLabel,
    this.onPickLocation,
    this.height = 220,
  });

  @override
  Widget build(BuildContext context) {
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

    final initialTarget = (plumberLat != null && plumberLng != null)
        ? LatLng(plumberLat!, plumberLng!)
        : (customerLat != null && customerLng != null)
            ? LatLng(customerLat!, customerLng!)
            : _kanoCenter;

    return ClipRRect(
      borderRadius: BorderRadius.circular(18),
      child: Container(
        height: height,
        decoration: BoxDecoration(
          border: Border.all(color: FlowGuardTheme.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: GoogleMap(
          initialCameraPosition: CameraPosition(
            target: initialTarget,
            zoom: (customerLat != null || plumberLat != null) ? 14.5 : 12.0,
          ),
          markers: markers,
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          onTap: onPickLocation == null
              ? null
              : (pos) => onPickLocation!(pos.latitude, pos.longitude),
        ),
      ),
    );
  }
}
