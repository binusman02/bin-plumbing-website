import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:intl/intl.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

String formatQuoteApprovalLabel(String status) {
  switch (status) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Declined";
    default:
      return "Pending";
  }
}

bool isPaymentConfirmedStatus(String? status) {
  final s = (status ?? "").toLowerCase().trim();
  return s == "verified" || s == "confirmed" || s == "paid";
}

String formatPaymentStatusLabel(String? status) {
  final s = (status ?? "").toLowerCase().trim();
  if (isPaymentConfirmedStatus(s)) return "Paid";
  if (s == "rejected" || s == "declined") return "Declined";
  if (s == "submitted") return "Submitted";
  return "Pending";
}

String _formatDisplayDate(String? raw) {
  if (raw == null || raw.trim().isEmpty) {
    return DateFormat("d MMM yyyy, HH:mm").format(DateTime.now());
  }
  final parsed = DateTime.tryParse(raw);
  if (parsed == null) return raw;
  return DateFormat("d MMM yyyy, HH:mm").format(parsed.toLocal());
}

Widget _sheetCostRow(String label, String value, {bool bold = false}) {
  return Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Expanded(
        child: Text(
          label,
          style: TextStyle(
            fontSize: bold ? 14 : 13,
            fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
            color: bold ? FlowGuardTheme.navy : FlowGuardTheme.mutedText,
          ),
        ),
      ),
      const SizedBox(width: 8),
      Text(
        value,
        style: TextStyle(
          fontSize: bold ? 15 : 13,
          fontWeight: bold ? FontWeight.w800 : FontWeight.w700,
          color: FlowGuardTheme.navy,
        ),
      ),
    ],
  );
}

void showFullQuotationSheet({
  required BuildContext context,
  required ServiceRequestItem request,
  required QuotationData quote,
  NumberFormat? formatter,
}) {
  final naira = formatter ??
      NumberFormat.currency(locale: "en_NG", symbol: "₦", decimalDigits: 0);
  final statusLabel = formatQuoteApprovalLabel(quote.approvalStatus);
  final isApproved = quote.approvalStatus == "approved";
  final isDeclined = quote.approvalStatus == "rejected";
  final dateStr = _formatDisplayDate(quote.createdAt);

  final copyLines = <String>[
    "FLOWGUARD PLUMBING — QUOTATION",
    "Ticket: #${request.ticketNumber} • Rev #${quote.revisionNumber}",
    "Date: $dateStr",
    if ((request.customerName ?? "").isNotEmpty)
      "Customer: ${request.customerName}${(request.customerPhone ?? "").isNotEmpty ? " (${request.customerPhone})" : ""}",
    if (request.addressInKano.isNotEmpty) "Address: ${request.addressInKano}",
    "Service: ${request.problemCategory.isNotEmpty ? request.problemCategory : request.propertyType}",
    if ((request.assignedTechnician ?? "").isNotEmpty)
      "Plumber: ${request.assignedTechnician}",
    "Status: $statusLabel",
    "---",
    if (quote.items.isNotEmpty)
      ...quote.items.map(
        (it) =>
            "${it.name} (${it.quantity} x ${naira.format(it.unitPrice)}) = ${naira.format(it.amount)}",
      )
    else if (quote.materialsCost > 0)
      "Materials & Plumbing Supplies = ${naira.format(quote.materialsCost)}",
    "Labour / Workmanship = ${naira.format(quote.labourCharge)}",
    if (quote.transportCharge > 0)
      "Transport / Logistics = ${naira.format(quote.transportCharge)}",
    if (quote.otherCharges > 0)
      "Other Charges = ${naira.format(quote.otherCharges)}",
    if (quote.notes != null && quote.notes!.trim().isNotEmpty) ...[
      "---",
      "Notes: ${quote.notes!.trim()}",
    ],
    "---",
    "Total Quotation Amount: ${naira.format(quote.totalAmount)}",
  ];

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    ClipOval(
                      child: Image.asset(
                        "assets/images/flowguard-icon.jpg",
                        width: 40,
                        height: 40,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      "FlowGuard Plumbing",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      "QUOTATION",
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                    Text(
                      "#${request.ticketNumber}",
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: isApproved
                            ? const Color(0xFFD1FAE5)
                            : isDeclined
                                ? const Color(0xFFFEE2E2)
                                : const Color(0xFFFEF3C7),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        statusLabel,
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          color: isApproved
                              ? const Color(0xFF065F46)
                              : isDeclined
                                  ? const Color(0xFF991B1B)
                                  : const Color(0xFF92400E),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const Divider(height: 22),
            if ((request.customerName ?? "").isNotEmpty)
              Text(
                "${request.customerName}${(request.customerPhone ?? "").isNotEmpty ? " • ${request.customerPhone}" : ""}",
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: FlowGuardTheme.navy,
                ),
              ),
            if (request.addressInKano.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  request.addressInKano,
                  style: const TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                "${request.problemCategory.isNotEmpty ? request.problemCategory : request.propertyType}${(request.assignedTechnician ?? "").isNotEmpty ? " • Plumber: ${request.assignedTechnician}" : ""}",
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: FlowGuardTheme.navy,
                ),
              ),
            ),
            Text(
              "$dateStr • Rev #${quote.revisionNumber}",
              style: const TextStyle(
                fontSize: 11.5,
                color: FlowGuardTheme.mutedText,
              ),
            ),
            const SizedBox(height: 14),
            if (quote.items.isNotEmpty) ...[
              for (final item in quote.items) ...[
                _sheetCostRow(
                  "${item.name} (${item.quantity} × ${naira.format(item.unitPrice)})",
                  naira.format(item.amount),
                ),
                const SizedBox(height: 6),
              ],
            ] else if (quote.materialsCost > 0) ...[
              _sheetCostRow(
                "Materials & Supplies",
                naira.format(quote.materialsCost),
              ),
              const SizedBox(height: 6),
            ],
            _sheetCostRow(
              "Labour / Workmanship",
              naira.format(quote.labourCharge),
            ),
            if (quote.transportCharge > 0) ...[
              const SizedBox(height: 6),
              _sheetCostRow(
                "Transport / Logistics",
                naira.format(quote.transportCharge),
              ),
            ],
            if (quote.otherCharges > 0) ...[
              const SizedBox(height: 6),
              _sheetCostRow("Other Charges", naira.format(quote.otherCharges)),
            ],
            if (quote.notes != null && quote.notes!.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFF8FAFC),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Text(
                  quote.notes!.trim(),
                  style: const TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ),
            ],
            const Divider(height: 18),
            _sheetCostRow(
              "Total Quotation Amount",
              naira.format(quote.totalAmount),
              bold: true,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Clipboard.setData(
                        ClipboardData(text: copyLines.join("\n")),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text("Quotation copied to clipboard."),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy_rounded, size: 16),
                    label: const Text("Copy Quote", maxLines: 1),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text("Close", maxLines: 1),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}

void showOfficialReceiptSheet({
  required BuildContext context,
  required String ticketNumber,
  required String customerName,
  required String customerPhone,
  required String address,
  required String serviceLabel,
  String? technicianName,
  String? paymentStatus,
  String? paymentMethod,
  String? paymentDate,
  QuotationData? quote,
  double? fallbackTotalPayment,
  double? fallbackLabourPortion,
  double? fallbackMaterialsPortion,
  NumberFormat? formatter,
}) {
  if (!isPaymentConfirmedStatus(paymentStatus)) return;
  final naira = formatter ??
      NumberFormat.currency(locale: "en_NG", symbol: "₦", decimalDigits: 0);
  final dateStr = _formatDisplayDate(paymentDate);
  final methodLabel =
      (paymentMethod ?? "Bank Transfer").replaceAll("_", " ").trim();
  final totalPaid = quote?.totalAmount ?? fallbackTotalPayment ?? 0;
  final labourPaid = quote?.labourCharge ?? fallbackLabourPortion ?? 0;
  final materialsPaid = quote?.materialsCost ?? fallbackMaterialsPortion ?? 0;

  final receiptCopy = <String>[
    "FLOWGUARD PLUMBING — OFFICIAL RECEIPT",
    "Ticket: #$ticketNumber",
    if (customerName.isNotEmpty)
      "Paid By: $customerName${customerPhone.isNotEmpty ? " ($customerPhone)" : ""}",
    if (address.isNotEmpty) "Address: $address",
    "Service: $serviceLabel",
    "Method: $methodLabel",
    "Date: $dateStr",
    if ((technicianName ?? "").isNotEmpty) "Technician: $technicianName",
    "Status: Paid (Confirmed by FlowGuard)",
    "---",
    if (quote != null && quote.items.isNotEmpty)
      ...quote.items.map(
        (it) =>
            "${it.name} (${it.quantity} x ${naira.format(it.unitPrice)}) = ${naira.format(it.amount)}",
      )
    else
      "Materials Portion = ${naira.format(materialsPaid)}",
    "Labour Portion = ${naira.format(labourPaid)}",
    if (quote != null && quote.transportCharge > 0)
      "Transport = ${naira.format(quote.transportCharge)}",
    if (quote != null && quote.otherCharges > 0)
      "Other = ${naira.format(quote.otherCharges)}",
    "---",
    "Total Paid: ${naira.format(totalPaid)}",
  ];

  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.white,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
    ),
    builder: (ctx) => SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    ClipOval(
                      child: Image.asset(
                        "assets/images/flowguard-icon.jpg",
                        width: 40,
                        height: 40,
                        fit: BoxFit.cover,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      "FlowGuard Plumbing",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text(
                      "OFFICIAL RECEIPT",
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.8,
                        color: FlowGuardTheme.mutedText,
                      ),
                    ),
                    Text(
                      "#$ticketNumber",
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFD1FAE5),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: const Text(
                        "Paid",
                        style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF065F46),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const Divider(height: 22),
            if (customerName.isNotEmpty)
              Text(
                "$customerName${customerPhone.isNotEmpty ? " • $customerPhone" : ""}",
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: FlowGuardTheme.navy,
                ),
              ),
            if (address.isNotEmpty)
              Text(
                address,
                style: const TextStyle(
                  fontSize: 12,
                  color: FlowGuardTheme.mutedText,
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 3),
              child: Text(
                "$serviceLabel • $methodLabel • $dateStr",
                style: const TextStyle(
                  fontSize: 12,
                  color: FlowGuardTheme.mutedText,
                ),
              ),
            ),
            if ((technicianName ?? "").isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  "Technician: $technicianName",
                  style: const TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
              ),
            const SizedBox(height: 12),
            if (quote != null && quote.items.isNotEmpty) ...[
              for (final item in quote.items) ...[
                _sheetCostRow(
                  "${item.name} (${item.quantity} × ${naira.format(item.unitPrice)})",
                  naira.format(item.amount),
                ),
                const SizedBox(height: 6),
              ],
            ] else ...[
              _sheetCostRow("Materials Portion", naira.format(materialsPaid)),
              const SizedBox(height: 6),
            ],
            _sheetCostRow("Labour Portion", naira.format(labourPaid)),
            if (quote != null && quote.transportCharge > 0) ...[
              const SizedBox(height: 6),
              _sheetCostRow("Transport", naira.format(quote.transportCharge)),
            ],
            if (quote != null && quote.otherCharges > 0) ...[
              const SizedBox(height: 6),
              _sheetCostRow("Other Charges", naira.format(quote.otherCharges)),
            ],
            const Divider(height: 18),
            _sheetCostRow(
              "Total Paid",
              naira.format(totalPaid),
              bold: true,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFFD1FAE5),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                "Confirmed by FlowGuard Plumbing • Ticket #$ticketNumber",
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF065F46),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () {
                      Clipboard.setData(
                        ClipboardData(text: receiptCopy.join("\n")),
                      );
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            "Receipt copied — ready to print or share.",
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.copy_rounded, size: 16),
                    label: const Text("Copy Receipt", maxLines: 1),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(ctx).pop(),
                    child: const Text(
                      "Close",
                      maxLines: 1,
                      softWrap: false,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    ),
  );
}
