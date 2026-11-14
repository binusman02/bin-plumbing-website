"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, CheckCircle2, KeyRound, Loader2, Save, ShieldCheck, Trash2 } from "lucide-react";
import { changePortalPasswordAction, updateProfileAction } from "@/app/actions/profile-actions";
import { Avatar } from "@/components/ui";

interface ProfileManagerProps {
  role: "admin" | "customer" | "plumber";
  initialData: {
    id: string;
    fullName: string;
    email?: string;
    phone?: string;
    avatarUrl?: string | null;
    roleLabel?: string;
    cityLga?: string;
    address?: string;
    state?: string;
    residentialLocation?: string;
    preferredLocations?: string[];
    skills?: string[];
    availability?: string;
    verificationStatus?: string;
    rating?: number;
    totalJobs?: number;
  };
}

export function ProfileManager({ role, initialData }: ProfileManagerProps) {
  const [fullName, setFullName] = useState(initialData.fullName || "");
  const [phone, setPhone] = useState(initialData.phone || "");
  const [email, setEmail] = useState(initialData.email || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialData.avatarUrl || null);

  // Customer fields
  const [cityLga, setCityLga] = useState(initialData.cityLga || "");
  const [address, setAddress] = useState(initialData.address || "");
  const [stateName, setStateName] = useState(initialData.state || "Kano");

  // Plumber fields
  const [residentialLocation, setResidentialLocation] = useState(initialData.residentialLocation || "");
  const [preferredLocationsStr, setPreferredLocationsStr] = useState(
    (initialData.preferredLocations || []).join(", ")
  );
  const [skillsStr, setSkillsStr] = useState((initialData.skills || []).join(", "));
  const [availability, setAvailability] = useState(initialData.availability || "");

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pwFeedback, setPwFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleAvatarUpload = async (file: File) => {
    setFeedback(null);
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("role", role);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", text: data.error || "Could not upload profile photo." });
      } else {
        setAvatarUrl(data.avatarUrl);
        setFeedback({ type: "success", text: "Profile photo updated." });
      }
    } catch {
      setFeedback({ type: "error", text: "Upload failed. Please try again." });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setFeedback(null);
    setUploadingAvatar(true);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setAvatarUrl(null);
        setFeedback({ type: "success", text: "Profile photo removed." });
      }
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await updateProfileAction({
        role,
        fullName,
        phone,
        email,
        cityLga,
        address,
        state: stateName,
        residentialLocation,
        preferredLocations: preferredLocationsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        skills: skillsStr
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        availability,
      });
      if (res.success) {
        setFeedback({ type: "success", text: "Profile changes saved." });
      } else {
        setFeedback({ type: "error", text: res.error || "Failed to save profile." });
      }
    });
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwFeedback(null);
    if (newPassword.length < 8) {
      setPwFeedback({ type: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwFeedback({ type: "error", text: "Passwords do not match." });
      return;
    }
    startTransition(async () => {
      const res = await changePortalPasswordAction({
        role,
        currentPassword,
        newPassword,
      });
      if (res.success) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPwFeedback({ type: "success", text: "Password updated successfully." });
      } else {
        setPwFeedback({ type: "error", text: res.error || "Could not change password." });
      }
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header & Photo Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar name={fullName || "User"} src={avatarUrl} size="lg" />
            <div>
              <h2 className="text-lg font-bold text-[#0B1F3A]">{fullName || "Account Profile"}</h2>
              <p className="text-xs font-medium text-slate-500">
                {initialData.roleLabel || role.toUpperCase()} • {email || phone}
              </p>
              {role === "plumber" && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Status: {initialData.verificationStatus || "submitted"}
                  </span>
                  <span className="text-slate-500">
                    Jobs completed: {initialData.totalJobs ?? 0} • Rating: {initialData.rating ?? 5.0}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleAvatarUpload(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploadingAvatar}
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#0B1F3A] px-4 text-xs font-bold text-white hover:bg-[#0B1F3A]/90 disabled:opacity-50"
            >
              {uploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Upload Photo
            </button>
            {avatarUrl && (
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={handleRemoveAvatar}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Account Details Form */}
      <form onSubmit={handleSaveProfile} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-bold text-[#0B1F3A]">Personal & Account Information</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Keep your contact details accurate so dispatch notifications and receipts reach you.
        </p>

        {feedback && (
          <div
            className={`mt-4 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {feedback.type === "success" && <CheckCircle2 className="h-4 w-4" />}
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Phone Number</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>

          {role !== "plumber" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Email Address</label>
              <input
                type="email"
                value={email}
                disabled={role === "admin"}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500 focus:border-[#0B1F3A] focus:outline-none"
              />
            </div>
          )}

          {role === "customer" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">State</label>
                <input
                  type="text"
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">City / LGA</label>
                <input
                  type="text"
                  value={cityLga}
                  onChange={(e) => setCityLga(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Default Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
            </>
          )}

          {role === "plumber" && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Residential Location</label>
                <input
                  type="text"
                  value={residentialLocation}
                  onChange={(e) => setResidentialLocation(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Preferred Service Areas</label>
                <input
                  type="text"
                  value={preferredLocationsStr}
                  onChange={(e) => setPreferredLocationsStr(e.target.value)}
                  placeholder="Nassarawa, Tarauni, Kumbotso"
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Skills (comma-separated)</label>
                <input
                  type="text"
                  value={skillsStr}
                  onChange={(e) => setSkillsStr(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Availability Schedule</label>
                <input
                  type="text"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#F5B301] px-5 text-xs font-bold text-[#0B1F3A] hover:bg-[#F5B301]/90 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Profile
          </button>
        </div>
      </form>

      {/* Security & Password Change */}
      <form onSubmit={handleChangePassword} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#0B1F3A]" />
          <h3 className="text-base font-bold text-[#0B1F3A]">Security & Password</h3>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Use a strong password with at least 8 characters.
        </p>

        {pwFeedback && (
          <div
            className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs font-semibold ${
              pwFeedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {pwFeedback.text}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {role !== "admin" && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">New Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#0B1F3A]">Confirm Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-[#0B1F3A] focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#0B1F3A] px-5 text-xs font-bold text-[#0B1F3A] hover:bg-[#0B1F3A] hover:text-white disabled:opacity-50"
          >
            Update Password
          </button>
        </div>
      </form>
    </div>
  );
}
