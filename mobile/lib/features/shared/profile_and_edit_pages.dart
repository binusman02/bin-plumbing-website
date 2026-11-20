import "package:flutter/material.dart";
import "package:image_picker/image_picker.dart";
import "package:flowguard_plumbing/core/api_client.dart";
import "package:flowguard_plumbing/theme/app_theme.dart";

class FlowGuardProfileView extends StatelessWidget {
  final String role; // "customer" | "plumber"
  final String fullName;
  final String phone;
  final String email;
  final String location;
  final String? avatarUrl;
  final bool isVerifiedTechnician;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;
  final VoidCallback onProfileUpdated;
  final VoidCallback onFeedbackTap;
  final VoidCallback onSignOut;

  const FlowGuardProfileView({
    super.key,
    required this.role,
    required this.fullName,
    required this.phone,
    required this.email,
    required this.location,
    this.avatarUrl,
    this.isVerifiedTechnician = false,
    this.bankName,
    this.accountNumber,
    this.accountName,
    required this.onProfileUpdated,
    required this.onFeedbackTap,
    required this.onSignOut,
  });

  Future<void> _pickAndUploadPhoto(BuildContext context) async {
    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      imageQuality: 82,
      maxWidth: 900,
    );
    if (picked == null) return;
    try {
      final bytes = await picked.readAsBytes();
      await FlowGuardApiClient.uploadAvatar(
        bytes: bytes,
        filename: picked.name,
        role: role,
      );
      onProfileUpdated();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Profile photo updated.")),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Photo upload failed: $e")),
        );
      }
    }
  }

  void _openAbout(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const Padding(
        padding: EdgeInsets.fromLTRB(22, 4, 22, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "About FlowGuard Plumbing",
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            SizedBox(height: 8),
            Text(
              "FlowGuard Plumbing Enterprises delivers trusted residential and commercial plumbing repairs, installations, and emergency dispatch across Kano State, Nigeria.",
              style: TextStyle(
                fontSize: 13.5,
                height: 1.5,
                color: FlowGuardTheme.mutedText,
              ),
            ),
            SizedBox(height: 12),
            Text(
              "Office: Kano State, Nigeria\nSupport: +234 806 329 8575",
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: FlowGuardTheme.navy,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
      children: [
        // Top Profile Card matching mockup
        Container(
          padding: const EdgeInsets.fromLTRB(18, 22, 18, 18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: FlowGuardTheme.border),
          ),
          child: Column(
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: FlowGuardTheme.gold, width: 3),
                    ),
                    child: ClipOval(
                      child: avatarUrl != null && avatarUrl!.isNotEmpty
                          ? Image.network(
                              avatarUrl!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Image.asset(
                                "assets/images/flowguard-icon.jpg",
                                fit: BoxFit.cover,
                              ),
                            )
                          : Image.asset(
                              "assets/images/flowguard-icon.jpg",
                              fit: BoxFit.cover,
                            ),
                    ),
                  ),
                  if (isVerifiedTechnician)
                    Positioned(
                      top: -2,
                      right: -2,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: Color(0xFF10B981),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 15,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  Positioned(
                    bottom: 0,
                    right: -2,
                    child: InkWell(
                      onTap: () => _pickAndUploadPhoto(context),
                      child: Container(
                        padding: const EdgeInsets.all(6),
                        decoration: const BoxDecoration(
                          color: FlowGuardTheme.navy,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.camera_alt_rounded,
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                fullName,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                role == "plumber" ? "Verified Technician" : "Customer Account",
                style: const TextStyle(
                  fontSize: 13,
                  color: FlowGuardTheme.mutedText,
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => EditProfilePage(
                              role: role,
                              fullName: fullName,
                              email: email,
                              location: location,
                              bankName: bankName,
                              accountNumber: accountNumber,
                              accountName: accountName,
                              onSaved: onProfileUpdated,
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.edit_outlined, size: 17),
                      label: const Text(
                        "Edit Profile",
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: FlowGuardTheme.navy,
                        foregroundColor: Colors.white,
                      ),
                      onPressed: () => _pickAndUploadPhoto(context),
                      icon: const Icon(Icons.camera_alt_outlined, size: 17),
                      label: const Text(
                        "Change Photo",
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 14),

        // Personal Information Card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: FlowGuardTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "Personal Information",
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: FlowGuardTheme.navy,
                ),
              ),
              const SizedBox(height: 12),
              _infoRow(Icons.phone_outlined, phone.isNotEmpty ? phone : "Not set"),
              const SizedBox(height: 10),
              _infoRow(Icons.email_outlined, email.isNotEmpty ? email : "Not set"),
              const SizedBox(height: 10),
              _infoRow(
                Icons.location_on_outlined,
                location.isNotEmpty ? location : "Kano State, Nigeria",
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Feedback & Rating
        _navTile(
          icon: Icons.star_outline_rounded,
          title: "Feedback & Rating",
          onTap: onFeedbackTap,
        ),
        const SizedBox(height: 8),

        // About Us
        _navTile(
          icon: Icons.info_outline_rounded,
          title: "About Us",
          onTap: () => _openAbout(context),
        ),

        const SizedBox(height: 22),

        // Centered Sign Out Button
        Center(
          child: SizedBox(
            width: 190,
            child: OutlinedButton.icon(
              onPressed: onSignOut,
              icon: const Icon(Icons.logout_rounded, size: 18),
              label: const Text(
                "Sign Out",
                maxLines: 1,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _infoRow(IconData icon, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: FlowGuardTheme.navy),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w600,
              color: FlowGuardTheme.navy,
            ),
          ),
        ),
      ],
    );
  }

  Widget _navTile({
    required IconData icon,
    required String title,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: FlowGuardTheme.border),
        ),
        child: Row(
          children: [
            Icon(icon, size: 20, color: FlowGuardTheme.navy),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  color: FlowGuardTheme.navy,
                ),
              ),
            ),
            const Icon(
              Icons.chevron_right_rounded,
              color: FlowGuardTheme.mutedText,
            ),
          ],
        ),
      ),
    );
  }
}

class EditProfilePage extends StatefulWidget {
  final String role;
  final String fullName;
  final String email;
  final String location;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;
  final VoidCallback onSaved;

  const EditProfilePage({
    super.key,
    required this.role,
    required this.fullName,
    required this.email,
    required this.location,
    this.bankName,
    this.accountNumber,
    this.accountName,
    required this.onSaved,
  });

  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _bankNameCtrl;
  late final TextEditingController _accountNoCtrl;
  late final TextEditingController _accountNameCtrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.fullName);
    _emailCtrl = TextEditingController(text: widget.email);
    _addressCtrl = TextEditingController(text: widget.location);
    _bankNameCtrl = TextEditingController(text: widget.bankName ?? "");
    _accountNoCtrl = TextEditingController(text: widget.accountNumber ?? "");
    _accountNameCtrl = TextEditingController(text: widget.accountName ?? "");
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _addressCtrl.dispose();
    _bankNameCtrl.dispose();
    _accountNoCtrl.dispose();
    _accountNameCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await FlowGuardApiClient.updateProfile({
        "role": widget.role,
        "fullName": _nameCtrl.text.trim(),
        "email": _emailCtrl.text.trim(),
        "address": _addressCtrl.text.trim(),
        if (widget.role == "plumber") ...{
          "bankName": _bankNameCtrl.text.trim(),
          "accountNumber": _accountNoCtrl.text.trim(),
          "accountName": _accountNameCtrl.text.trim(),
        },
      });
      widget.onSaved();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Profile saved successfully.")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Save failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Edit Profile")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Starts directly from Personal & Account Information (no duplicate Change Picture)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: FlowGuardTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  "Personal & Account Information",
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: "Full Name"),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(labelText: "Email Address"),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _addressCtrl,
                  decoration: const InputDecoration(labelText: "Address in Kano"),
                ),
              ],
            ),
          ),

          if (widget.role == "plumber") ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: FlowGuardTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    "Bank Account Details (Payouts)",
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: FlowGuardTheme.navy,
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _bankNameCtrl,
                    decoration: const InputDecoration(labelText: "Bank Name"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _accountNoCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: "Account Number",
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _accountNameCtrl,
                    decoration: const InputDecoration(
                      labelText: "Account Holder Name",
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 20),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text("Save Changes", maxLines: 1),
          ),
        ],
      ),
    );
  }
}
