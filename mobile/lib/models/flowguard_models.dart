import "package:flutter/material.dart";

import "dart:convert";

class ServiceCategoryItem {
  final String id;
  final String slug;
  final String title;
  final String shortDescription;
  final String image;
  final String iconName;

  const ServiceCategoryItem({
    required this.id,
    required this.slug,
    required this.title,
    required this.shortDescription,
    required this.image,
    required this.iconName,
  });

  factory ServiceCategoryItem.fromJson(Map<String, dynamic> json) {
    final slug = (json["slug"] ?? json["id"] ?? "").toString();
    final title = (json["title"] ?? json["name"] ?? slug).toString();
    return ServiceCategoryItem(
      id: (json["id"] ?? slug).toString(),
      slug: slug,
      title: title,
      shortDescription:
          (json["short_description"] ?? json["description"] ?? "").toString(),
      image: (json["image"] ?? "").toString(),
      iconName: (json["icon_name"] ?? slug).toString(),
    );
  }
}

class ServiceRequestItem {
  final String id;
  final String ticketNumber;
  final String problemCategory;
  final String propertyType;
  final String addressInKano;
  final String description;
  final String status;
  final String priority;
  final String? assignedPlumberId;
  final String? assignedTechnician;
  final String? customerName;
  final String? customerPhone;
  final double? customerLat;
  final double? customerLng;
  final List<String> photos;
  final String createdAt;

  const ServiceRequestItem({
    required this.id,
    required this.ticketNumber,
    required this.problemCategory,
    required this.propertyType,
    required this.addressInKano,
    required this.description,
    required this.status,
    required this.priority,
    this.assignedPlumberId,
    this.assignedTechnician,
    this.customerName,
    this.customerPhone,
    this.customerLat,
    this.customerLng,
    this.photos = const [],
    required this.createdAt,
  });

  factory ServiceRequestItem.fromJson(Map<String, dynamic> json) {
    final rawPhotos = json["photos"];
    final photoList = rawPhotos is List
        ? rawPhotos.map((p) => p.toString()).toList()
        : <String>[];
    final rawCategory =
        (json["problem_category"] ?? json["category_slug"] ?? "").toString();
    final formattedCategory = rawCategory.contains("-") &&
            !rawCategory.contains(" ")
        ? rawCategory
            .split("-")
            .where((s) => s.isNotEmpty)
            .map((w) => w[0].toUpperCase() + w.substring(1))
            .join(" ")
        : rawCategory;
    return ServiceRequestItem(
      id: (json["id"] ?? "").toString(),
      ticketNumber: (json["ticket_number"] ?? "").toString(),
      problemCategory: formattedCategory,
      propertyType: (json["property_type"] ?? "Residential").toString(),
      addressInKano: (json["address"] ?? json["address_in_kano"] ?? "").toString(),
      description: (json["issue_description"] ?? json["description"] ?? "").toString(),
      status: (json["status"] ?? "new").toString(),
      priority: (json["priority"] ?? "standard").toString(),
      assignedPlumberId: json["assigned_plumber_id"]?.toString(),
      assignedTechnician: json["assigned_technician"]?.toString(),
      customerName: json["customer_name"]?.toString(),
      customerPhone: json["customer_phone"]?.toString(),
      customerLat: (json["customer_lat"] as num?)?.toDouble(),
      customerLng: (json["customer_lng"] as num?)?.toDouble(),
      photos: photoList,
      createdAt: (json["created_at"] ?? "").toString(),
    );
  }

  bool get isActive => status != "completed" && status != "cancelled";
}

class QuotationLineItem {
  final String id;
  final String name;
  final int quantity;
  final double unitPrice;

  const QuotationLineItem({
    required this.id,
    required this.name,
    required this.quantity,
    required this.unitPrice,
  });

  double get amount => quantity * unitPrice;
}

class QuotationData {
  final String id;
  final String ticketNumber;
  final double labourCharge;
  final double materialsCost;
  final double transportCharge;
  final double otherCharges;
  final double totalAmount;
  final String approvalStatus;
  final String? notes;
  final String? createdAt;
  final List<QuotationLineItem> items;

  const QuotationData({
    required this.id,
    required this.ticketNumber,
    required this.labourCharge,
    required this.materialsCost,
    required this.transportCharge,
    required this.otherCharges,
    required this.totalAmount,
    required this.approvalStatus,
    this.notes,
    this.createdAt,
    this.items = const [],
  });

  factory QuotationData.fromJson(Map<String, dynamic> json) {
    final labour = (json["labour_charge"] as num?)?.toDouble() ?? 0;
    final materials = (json["materials_cost"] as num?)?.toDouble() ?? 0;
    final transport = (json["transport_charge"] as num?)?.toDouble() ?? 0;
    final other = (json["other_charges"] as num?)?.toDouble() ?? 0;
    final total = (json["total_amount"] as num?)?.toDouble() ??
        (labour + materials + transport + other);
    final rawNotes = json["notes"]?.toString() ?? "";
    final parsedItems = <QuotationLineItem>[];
    final markerMatch = RegExp(
      r"<!--BP_QUOTE_ITEMS:([\s\S]*?)-->",
    ).firstMatch(rawNotes);
    if (markerMatch != null) {
      try {
        final decoded = jsonDecode(markerMatch.group(1) ?? "[]");
        if (decoded is List) {
          for (var i = 0; i < decoded.length; i++) {
            final row = decoded[i];
            if (row is Map) {
              final name = (row["name"] ?? "").toString().trim();
              if (name.isEmpty) continue;
              final qty = ((row["quantity"] as num?)?.toInt() ?? 1).clamp(1, 9999);
              final unit = ((row["unitPrice"] as num?)?.toDouble() ?? 0).clamp(0.0, 999999999.0);
              parsedItems.add(
                QuotationLineItem(
                  id: (row["id"] ?? "item-$i").toString(),
                  name: name,
                  quantity: qty,
                  unitPrice: unit,
                ),
              );
            }
          }
        }
      } catch (_) {}
    }
    final cleanNotes = rawNotes
        .replaceAll(RegExp(r"\s*<!--BP_QUOTE_ITEMS:[\s\S]*?-->"), "")
        .trim();
    return QuotationData(
      id: (json["id"] ?? "").toString(),
      ticketNumber: (json["ticket_number"] ?? "").toString(),
      labourCharge: labour,
      materialsCost: materials,
      transportCharge: transport,
      otherCharges: other,
      totalAmount: total,
      approvalStatus:
          (json["customer_approval_status"] ?? "pending").toString(),
      notes: cleanNotes.isNotEmpty ? cleanNotes : null,
      createdAt: json["created_at"]?.toString(),
      items: parsedItems,
    );
  }
}

class JobMessageItem {
  final String id;
  final String ticketNumber;
  final String senderRole;
  final String senderName;
  final String message;
  final String createdAt;

  const JobMessageItem({
    required this.id,
    required this.ticketNumber,
    required this.senderRole,
    required this.senderName,
    required this.message,
    required this.createdAt,
  });

  factory JobMessageItem.fromJson(Map<String, dynamic> json) {
    return JobMessageItem(
      id: (json["id"] ?? "").toString(),
      ticketNumber: (json["ticket_number"] ?? "").toString(),
      senderRole: (json["sender_role"] ?? "").toString(),
      senderName: (json["sender_name"] ?? "User").toString(),
      message: (json["message"] ?? "").toString(),
      createdAt: (json["created_at"] ?? "").toString(),
    );
  }
}

class NotificationItem {
  final String id;
  final String title;
  final String body;
  final String? link;
  final bool isRead;
  final String createdAt;

  const NotificationItem({
    required this.id,
    required this.title,
    required this.body,
    this.link,
    required this.isRead,
    required this.createdAt,
  });

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    return NotificationItem(
      id: (json["id"] ?? "").toString(),
      title: (json["title"] ?? "Notification").toString(),
      body: (json["body"] ?? json["message"] ?? "").toString(),
      link: (json["destination"] ?? json["link"])?.toString(),
      isRead: json["read_at"] != null ||
          json["is_read"] == true ||
          json["read"] == true,
      createdAt: (json["created_at"] ?? "").toString(),
    );
  }
}

class BankDetailsData {
  final String bankName;
  final String accountName;
  final String accountNumber;

  const BankDetailsData({
    required this.bankName,
    required this.accountName,
    required this.accountNumber,
  });

  factory BankDetailsData.fromSettingsValue(Map<String, dynamic> row) {
    return BankDetailsData(
      bankName: (row["bankName"] ?? row["bank_name"] ?? "").toString(),
      accountName: (row["accountName"] ??
              row["bank_account_name"] ??
              "FlowGuard Plumbing Enterprises")
          .toString(),
      accountNumber:
          (row["accountNumber"] ?? row["bank_account_number"] ?? "").toString(),
    );
  }

  bool get isConfigured => accountNumber.isNotEmpty;
}

class StatusBadgeMeta {
  final String label;
  final Color background;
  final Color foreground;

  const StatusBadgeMeta({
    required this.label,
    required this.background,
    required this.foreground,
  });

  factory StatusBadgeMeta.fromStatus(String status) {
    switch (status) {
      case "completed":
        return const StatusBadgeMeta(
          label: "Completed",
          background: Color(0xFFD1FAE5),
          foreground: Color(0xFF065F46),
        );
      case "in_progress":
        return const StatusBadgeMeta(
          label: "In Progress",
          background: Color(0xFFDBEAFE),
          foreground: Color(0xFF1E40AF),
        );
      case "awaiting_final_payment":
      case "work_completed":
        return const StatusBadgeMeta(
          label: "Awaiting Payment",
          background: Color(0xFFFEF3C7),
          foreground: Color(0xFF92400E),
        );
      case "awaiting_approval":
      case "quotation_submitted":
      case "quoted":
        return const StatusBadgeMeta(
          label: "Quote Ready",
          background: Color(0xFFFEF3C7),
          foreground: Color(0xFFB45309),
        );
      case "scheduled":
      case "approved":
      case "contacted":
      case "inspection_required":
        return const StatusBadgeMeta(
          label: "Assigned",
          background: Color(0xFFE0E7FF),
          foreground: Color(0xFF3730A3),
        );
      case "cancelled":
        return const StatusBadgeMeta(
          label: "Cancelled",
          background: Color(0xFFFEE2E2),
          foreground: Color(0xFF991B1B),
        );
      default:
        return const StatusBadgeMeta(
          label: "Submitted",
          background: Color(0xFFF1F5F9),
          foreground: Color(0xFF334155),
        );
    }
  }
}
