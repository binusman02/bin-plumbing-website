enum FlowGuardFlavor { customer, technician }

class AppFlavorConfig {
  static const String _rawFlavor = String.fromEnvironment(
    "APP_FLAVOR",
    defaultValue: "customer",
  );

  static FlowGuardFlavor get current => _rawFlavor == "technician"
      ? FlowGuardFlavor.technician
      : FlowGuardFlavor.customer;

  static bool get isCustomer => current == FlowGuardFlavor.customer;
  static bool get isTechnician => current == FlowGuardFlavor.technician;

  static String get appTitle =>
      isTechnician ? "FlowGuard Technician" : "FlowGuard Plumbing";

  static String get expectedRole => isTechnician ? "plumber" : "customer";
}
