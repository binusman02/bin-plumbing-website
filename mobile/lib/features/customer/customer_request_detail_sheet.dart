import "package:flutter/material.dart";
import "package:flutter/services.dart";
import "package:intl/intl.dart";
import "package:flowguard_plumbing/core/supabase_config.dart";
import "package:flowguard_plumbing/models/flowguard_models.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class CustomerRequestDetailSheet extends StatefulWidget {
  final ServiceRequestItem request;
  final BankDetailsData? bankDetails;
  final VoidCallback onUpdated;

  const CustomerRequestDetailSheet({
    super.key,
    required this.request,
    this.bankDetails,
    required this.onUpdated,
  });

  @override
  State<CustomerRequestDetailSheet> createState() =>
      _CustomerRequestDetailSheetState();
}

class _CustomerRequestDetailSheetState
    extends State<CustomerRequestDetailSheet> {
  QuotationData? _quote;
  bool _loadingQuote = true;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _loadQuote();
  }

  Future<void> _loadQuote() async {
    try {
      final rows = await SupabaseConfig.client
          .from("quotations")
          .select()
          .eq("ticket_number", widget.request.ticketNumber)
          .order("created_at", ascending: false)
          .limit(1);
      if (mounted) {
        setState(() {
          _quote = rows.isNotEmpty ? QuotationData.fromJson(rows.first) : null;
          _loadingQuote = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingQuote = false);
    }
  }

  Future<void> _decideQuote(String decision) async {
    if (_quote == null || _busy) return;
    setState(() => _busy = true);
    try {
      await SupabaseConfig.client
          .from("quotations")
          .update({"status": decision})
          .eq("id", _quote!.id);
      if (decision == "approved") {
        await SupabaseConfig.client
            .from("service_requests")
            .update({"status": "approved"})
            .eq("id", widget.request.id);
      }
      await _loadQuote();
      widget.onUpdated();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final badge = StatusBadgeMeta.fromStatus(widget.request.status);
    final naira = NumberFormat.currency(locale: "en_NG", symbol: "₦", decimalDigits: 0);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.request.ticketNumber,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: badge.background,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    badge.label,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: badge.foreground,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              widget.request.problemCategory,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              widget.request.addressInKano,
              style: const TextStyle(fontSize: 13, color: FlowGuardTheme.mutedText),
            ),
            const SizedBox(height: 10),
            Text(
              widget.request.description,
              style: const TextStyle(fontSize: 13, color: Color(0xFF334155)),
            ),
            if (widget.request.assignedTechnician != null) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Text(
                  "Assigned Technician: ${widget.request.assignedTechnician}",
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF065F46),
                  ),
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (_loadingQuote)
              const Center(child: CircularProgressIndicator())
            else if (_quote != null) ...[
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: FlowGuardTheme.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      "Itemised Quotation",
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text("Labour"),
                        Text(naira.format(_quote!.labourCost)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text("Materials"),
                        Text(naira.format(_quote!.materialsCost)),
                      ],
                    ),
                    const Divider(height: 16),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text(
                          "Total",
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        Text(
                          naira.format(_quote!.totalAmount),
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                      ],
                    ),
                    if (_quote!.status == "pending_customer") ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("declined"),
                              child: const Text("Decline"),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: ElevatedButton(
                              onPressed: _busy
                                  ? null
                                  : () => _decideQuote("approved"),
                              child: const Text("Approve Quote"),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ],
            if (widget.bankDetails?.isConfigured == true) ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: FlowGuardTheme.gold),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.bankDetails!.bankName,
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            widget.bankDetails!.accountNumber,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: () {
                        Clipboard.setData(
                          ClipboardData(text: widget.bankDetails!.accountNumber),
                        );
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text("Account number copied"),
                          ),
                        );
                      },
                      icon: const Icon(Icons.copy_rounded),
                      tooltip: "Copy account number",
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
