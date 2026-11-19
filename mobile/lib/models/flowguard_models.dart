import "package:flutter/material.dart";

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
      shortDescription: (json["short_description"] ?? json["description"] ?? "").toString(),
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
  final String? assignedTechnician;
  final String? customerName;
  final String? customerPhone;
  final double? customerLat;
  final double? customerLng;
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
    this.assignedTechnician,
    this.customerName,
    this.customerPhone,
    this.customerLat,
    this.customerLng,
    required this.createdAt,
  });

  factory ServiceRequestItem.fromJson(Map<String, dynamic> json) {
    return ServiceRequestItem(
      id: (json["id"] ?? "").toString(),
      ticketNumber: (json["ticket_number"] ?? "").toString(),
      problemCategory: (json["problem_category"] ?? "").toString(),
      propertyType: (json["property_type"] ?? "Residential").toString(),
      addressInKano: (json["address_in_kano"] ?? "").toString(),
      description: (json["description"] ?? "").toString(),
      status: (json["status"] ?? "new").toString(),
      priority: (json["priority"] ?? "standard").toString(),
      assignedTechnician: json["assigned_technician"]?.toString(),
      customerName: json["customer_name"]?.toString(),
      customerPhone: json["customer_phone"]?.toString(),
      customerLat: (json["customer_lat"] as num?)?.toDouble(),
      customerLng: (json["customer_lng"] as num?)?.toDouble(),
      createdAt: (json["created_at"] ?? "").toString(),
    );
  }

  bool get isActive => status != "completed" && status != "cancelled";
}

class QuotationData {
  final String id;
  final String ticketNumber;
  final double labourCost;
  final double materialsCost;
  final double totalAmount;
  final String status;
  final String? notes;

  const QuotationData({
    required this.id,
    required this.ticketNumber,
    required this.labourCost,
    required this.materialsCost,
    required this.totalAmount,
    required this.status,
    this.notes,
  });

  factory QuotationData.fromJson(Map<String, dynamic> json) {
    final labour = (json["labour_cost"] as num?)?.toDouble() ?? 0;
    final materials = (json["materials_cost"] as num?)?.toDouble() ?? 0;
    final total = (json["total_amount"] as num?)?.toDouble() ?? (labour + materials);
    return QuotationData(
      id: (json["id"] ?? "").toString(),
      ticketNumber: (json["ticket_number"] ?? "").toString(),
      labourCost: labour,
      materialsCost: materials,
      totalAmount: total,
      status: (json["status"] ?? "pending_customer").toString(),
      notes: json["notes"]?.toString(),
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

class BankDetailsData {
  final String bankName;
  final String accountName;
  final String accountNumber;

  const BankDetailsData({
    required this.bankName,
    required this.accountName,
    required this.accountNumber,
  });

  factory BankDetailsData.fromSettings(Map<String, dynamic> row) {
    return BankDetailsData(
      bankName: (row["bank_name"] ?? "").toString(),
      accountName: (row["bank_account_name"] ?? "FlowGuard Plumbing Enterprises").toString(),
      accountNumber: (row["bank_account_number"] ?? "").toString(),
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
      case "scheduled":
      case "approved":
        return const StatusBadgeMeta(
          label: "Scheduled",
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
