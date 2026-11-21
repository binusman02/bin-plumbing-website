import "package:flutter/services.dart";

enum FlowGuardFlavor { customer, technician }

class AppFlavorConfig {
  static const String _rawFlavor = String.fromEnvironment(
    "APP_FLAVOR",
    defaultValue: "",
  );

  static FlowGuardFlavor get current {
    final effective =
        _rawFlavor.isNotEmpty ? _rawFlavor : (appFlavor ?? "customer");
    return effective == "technician"
        ? FlowGuardFlavor.technician
        : FlowGuardFlavor.customer;
  }

  static bool get isCustomer => current == FlowGuardFlavor.customer;
  static bool get isTechnician => current == FlowGuardFlavor.technician;

  static String get appTitle =>
      isTechnician ? "FlowGuard Technician" : "FlowGuard Plumbing";

  static String get expectedRole => isTechnician ? "plumber" : "customer";
}
