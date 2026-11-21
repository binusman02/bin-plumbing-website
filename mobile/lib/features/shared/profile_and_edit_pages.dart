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
  final double rating;
  final String? bankName;
  final String? accountNumber;
  final String? accountName;
  final VoidCallback onProfileUpdated;
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
    this.rating = 5.0,
    this.bankName,
    this.accountNumber,
    this.accountName,
    required this.onProfileUpdated,
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

  void _openFeedbackAndRating(BuildContext context) {
    if (role == "plumber") {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PlumberReviewsPage(
            plumberName: fullName,
            initialRating: rating,
          ),
        ),
      );
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const CustomerRateCompanyPage(),
        ),
      );
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
        // Top Profile Card
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
                              FlowGuardApiClient.authenticatedFileUrl(
                                avatarUrl!,
                              ),
                              headers: FlowGuardApiClient.fileAuthHeaders(
                                FlowGuardApiClient.authenticatedFileUrl(
                                  avatarUrl!,
                                ),
                              ),
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
                  if (role == "plumber" && isVerifiedTechnician)
                    Positioned(
                      bottom: 0,
                      right: -2,
                      child: Container(
                        padding: const EdgeInsets.all(5),
                        decoration: BoxDecoration(
                          color: const Color(0xFF10B981),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white, width: 2),
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 16,
                          color: Colors.white,
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
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 11,
                        ),
                      ),
                      onPressed: () {
                        Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => EditProfilePage(
                              role: role,
                              fullName: fullName,
                              phone: phone,
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
                      icon: const Icon(Icons.edit_outlined, size: 16),
                      label: const Text(
                        "Edit Profile",
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: ElevatedButton.icon(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: FlowGuardTheme.navy,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 11,
                        ),
                      ),
                      onPressed: () => _pickAndUploadPhoto(context),
                      icon: const Icon(Icons.camera_alt_outlined, size: 16),
                      label: const Text(
                        "Change Photo",
                        maxLines: 1,
                        softWrap: false,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 13),
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
              _infoRow(
                Icons.phone_outlined,
                phone.isNotEmpty ? phone : "Not set",
              ),
              const SizedBox(height: 10),
              _infoRow(
                Icons.email_outlined,
                email.isNotEmpty ? email : "Not set",
              ),
              const SizedBox(height: 10),
              _infoRow(
                Icons.location_on_outlined,
                location.isNotEmpty ? location : "Kano State, Nigeria",
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // Feedback & Rating (Opens dedicated page with Back button!)
        _navTile(
          icon: Icons.star_outline_rounded,
          title: "Feedback & Rating",
          onTap: () => _openFeedbackAndRating(context),
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
              label: const Text("Sign Out", maxLines: 1),
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
  final String phone;
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
    required this.phone,
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
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _emailCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _bankNameCtrl;
  late final TextEditingController _accountNoCtrl;
  late final TextEditingController _accountNameCtrl;

  final _currentPassCtrl = TextEditingController();
  final _newPassCtrl = TextEditingController();
  final _confirmPassCtrl = TextEditingController();

  bool _saving = false;
  bool _changingPass = false;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.fullName);
    _phoneCtrl = TextEditingController(text: widget.phone);
    _emailCtrl = TextEditingController(text: widget.email);
    _addressCtrl = TextEditingController(text: widget.location);
    _bankNameCtrl = TextEditingController(text: widget.bankName ?? "");
    _accountNoCtrl = TextEditingController(text: widget.accountNumber ?? "");
    _accountNameCtrl = TextEditingController(text: widget.accountName ?? "");
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _emailCtrl.dispose();
    _addressCtrl.dispose();
    _bankNameCtrl.dispose();
    _accountNoCtrl.dispose();
    _accountNameCtrl.dispose();
    _currentPassCtrl.dispose();
    _newPassCtrl.dispose();
    _confirmPassCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    try {
      await FlowGuardApiClient.updateProfile({
        "role": widget.role,
        "fullName": _nameCtrl.text.trim(),
        "phone": _phoneCtrl.text.trim(),
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

  Future<void> _updatePassword() async {
    final nextPass = _newPassCtrl.text;
    final confirmPass = _confirmPassCtrl.text;
    if (nextPass.length < 8) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("New password must be at least 8 characters."),
        ),
      );
      return;
    }
    if (nextPass != confirmPass) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("New passwords do not match.")),
      );
      return;
    }
    setState(() => _changingPass = true);
    try {
      await FlowGuardApiClient.changePassword(
        role: widget.role,
        currentPassword: _currentPassCtrl.text,
        newPassword: nextPass,
      );
      _currentPassCtrl.clear();
      _newPassCtrl.clear();
      _confirmPassCtrl.clear();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text("Password updated successfully.")),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Password update failed: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _changingPass = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Edit Profile")),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 36),
        children: [
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
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: "Phone Number"),
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
                  decoration: const InputDecoration(
                    labelText: "Address in Kano",
                  ),
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

          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text("Save Profile Changes", maxLines: 1),
          ),

          const SizedBox(height: 22),

          // Change / Reset Password Section
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
                  "Security & Password Reset",
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "Update your account sign-in password below.",
                  style: TextStyle(
                    fontSize: 12,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _currentPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: "Current Password",
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _newPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: "New Password (min 8 chars)",
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _confirmPassCtrl,
                  obscureText: true,
                  decoration: const InputDecoration(
                    labelText: "Confirm New Password",
                  ),
                ),
                const SizedBox(height: 14),
                OutlinedButton.icon(
                  onPressed: _changingPass ? null : _updatePassword,
                  icon: const Icon(Icons.lock_reset_rounded, size: 18),
                  label: Text(
                    _changingPass ? "Updating..." : "Update Password",
                    maxLines: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Customer page to rate FlowGuard Plumbing & submit feedback (with Back button).
class CustomerRateCompanyPage extends StatefulWidget {
  const CustomerRateCompanyPage({super.key});

  @override
  State<CustomerRateCompanyPage> createState() =>
      _CustomerRateCompanyPageState();
}

class _CustomerRateCompanyPageState extends State<CustomerRateCompanyPage> {
  int _rating = 5;
  final _commentCtrl = TextEditingController();
  bool _submitting = false;
  bool _loading = true;
  List<Map<String, dynamic>> _myReviews = [];

  @override
  void initState() {
    super.initState();
    _loadReviews();
  }

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadReviews() async {
    try {
      final list = await FlowGuardApiClient.fetchReviews(role: "customer");
      if (mounted) {
        setState(() {
          _myReviews = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_commentCtrl.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please write a short review or feedback.")),
      );
      return;
    }
    setState(() => _submitting = true);
    try {
      await FlowGuardApiClient.submitReview(
        ticketNumber: "",
        rating: _rating,
        comment: _commentCtrl.text.trim(),
      );
      _commentCtrl.clear();
      await _loadReviews();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Thank you! Your rating has been submitted."),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text("Could not submit rating: $e")),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Feedback & Rating")),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: FlowGuardTheme.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  "Rate FlowGuard Plumbing",
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: FlowGuardTheme.navy,
                  ),
                ),
                const SizedBox(height: 4),
                const Text(
                  "Tell us about your experience with our plumbing services in Kano.",
                  style: TextStyle(
                    fontSize: 12.5,
                    color: FlowGuardTheme.mutedText,
                  ),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (idx) {
                    final star = idx + 1;
                    return IconButton(
                      onPressed: () => setState(() => _rating = star),
                      icon: Icon(
                        star <= _rating
                            ? Icons.star_rounded
                            : Icons.star_border_rounded,
                        size: 36,
                        color: FlowGuardTheme.gold,
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: _commentCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: "Your Feedback / Review",
                    hintText: "Fast response, neat plumbing work...",
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text("Submit Rating", maxLines: 1),
                ),
              ],
            ),
          ),
          if (!_loading && _myReviews.isNotEmpty) ...[
            const SizedBox(height: 20),
            const Text(
              "Your Previous Ratings",
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: FlowGuardTheme.navy,
              ),
            ),
            const SizedBox(height: 8),
            ..._myReviews.map(
              (r) => Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          "★ ${(r["rating"] ?? 5)} / 5",
                          style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: FlowGuardTheme.navy,
                          ),
                        ),
                        Text(
                          (r["created_at"] ?? "").toString().split("T").first,
                          style: const TextStyle(
                            fontSize: 11,
                            color: FlowGuardTheme.mutedText,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      (r["comment"] ?? "").toString(),
                      style: const TextStyle(
                        fontSize: 13,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Technician page to view all customer reviews given to them (with Back button).
class PlumberReviewsPage extends StatefulWidget {
  final String plumberName;
  final double initialRating;

  const PlumberReviewsPage({
    super.key,
    required this.plumberName,
    required this.initialRating,
  });

  @override
  State<PlumberReviewsPage> createState() => _PlumberReviewsPageState();
}

class _PlumberReviewsPageState extends State<PlumberReviewsPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _reviews = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final list = await FlowGuardApiClient.fetchReviews(role: "plumber");
      if (mounted) {
        setState(() {
          _reviews = list;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final avg = _reviews.isEmpty
        ? widget.initialRating
        : _reviews.fold<double>(
              0,
              (sum, r) => sum + ((r["rating"] as num?)?.toDouble() ?? 5.0),
            ) /
            _reviews.length;

    return Scaffold(
      appBar: AppBar(title: const Text("Customer Reviews & Ratings")),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: FlowGuardTheme.navy,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: FlowGuardTheme.gold,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Text(
                      "${avg.toStringAsFixed(1)} ★",
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                        color: FlowGuardTheme.navy,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.plumberName,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          "${_reviews.length} customer review(s) recorded",
                          style: const TextStyle(
                            color: Color(0xFFCBD5E1),
                            fontSize: 12.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(28),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_reviews.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: FlowGuardTheme.border),
                ),
                child: const Text(
                  "No customer reviews have been submitted for your completed jobs yet.",
                  textAlign: TextAlign.center,
                  style: TextStyle(color: FlowGuardTheme.mutedText),
                ),
              )
            else
              ..._reviews.map(
                (r) => Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: FlowGuardTheme.border),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            (r["customer_name"] ?? "Customer").toString(),
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: FlowGuardTheme.navy,
                            ),
                          ),
                          Text(
                            "★ ${(r["rating"] ?? 5)} / 5",
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFB45309),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "${r["ticket_number"] ?? ""} • ${r["service_category"] ?? ""}",
                        style: const TextStyle(
                          fontSize: 11.5,
                          color: FlowGuardTheme.mutedText,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        (r["comment"] ?? "").toString(),
                        style: const TextStyle(
                          fontSize: 13.5,
                          color: FlowGuardTheme.navy,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
