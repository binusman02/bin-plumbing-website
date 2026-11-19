import "package:flutter/material.dart";

class ServiceAssetHelper {
  static String resolveImageAsset(String slugOrTitle) {
    final key = slugOrTitle.toLowerCase();
    if (key.contains("leak")) {
      return "assets/images/services/real-work-pipe-repair.png";
    }
    if (key.contains("drain") || key.contains("blockage")) {
      return "assets/images/services/underground-drainage-chamber-installation-kano.jpg";
    }
    if (key.contains("pump")) {
      return "assets/images/services/water-pump-pressure-controller-setup-kano.jpg";
    }
    if (key.contains("tank") || key.contains("overhead")) {
      return "assets/images/services/overhead-water-tank-installation-kano.png";
    }
    if (key.contains("bathroom") || key.contains("heater") || key.contains("shower")) {
      return "assets/images/services/bathroom-shower-water-heater-installation-kano.jpg";
    }
    if (key.contains("toilet") || key.contains("sanitary")) {
      return "assets/images/services/bathroom-sanitaryware.jpg";
    }
    if (key.contains("kitchen") || key.contains("sink") || key.contains("tap")) {
      return "assets/images/services/kitchen-sink-tap-installation-kano.jpg";
    }
    if (key.contains("riser") || key.contains("multi")) {
      return "assets/images/services/multi-storey-ppr-riser-piping-kano.jpg";
    }
    return "assets/images/services/surface-ppr-pipe-installation-kano.jpg";
  }

  static IconData resolveCategoryIcon(String iconNameOrSlug) {
    final key = iconNameOrSlug.toLowerCase();
    if (key.contains("leak") || key.contains("water") || key.contains("droplet")) {
      return Icons.water_drop_outlined;
    }
    if (key.contains("pump") || key.contains("pressure") || key.contains("gauge")) {
      return Icons.speed_rounded;
    }
    if (key.contains("tank") || key.contains("overhead")) {
      return Icons.propane_tank_outlined;
    }
    if (key.contains("drain") || key.contains("blockage")) {
      return Icons.waves_rounded;
    }
    if (key.contains("bathroom") || key.contains("shower")) {
      return Icons.shower_outlined;
    }
    if (key.contains("toilet") || key.contains("sink") || key.contains("kitchen") || key.contains("tap")) {
      return Icons.countertops_outlined;
    }
    if (key.contains("heater") || key.contains("hot")) {
      return Icons.thermostat_rounded;
    }
    return Icons.plumbing_rounded;
  }
}
