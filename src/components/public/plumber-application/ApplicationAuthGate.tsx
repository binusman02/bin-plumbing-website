"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import {
  loginPlumberWithPasswordAction,
  registerPlumberAccountAction,
} from "@/app/actions/portal-auth";

export function ApplicationAuthGate() {
  const router = useRouter();
  const [authTab, setAuthTab] = useState<"register" | "signin">("register");
  const [accName, setAccName] = useState("");
  const [accPhone, setAccPhone] = useState("");
  const [accEmail, setAccEmail] = useState("");
  const [accPassword, setAccPassword] = useState("");
  const [showAccPassword, setShowAccPassword] = useState(false);
  const [accConsent, setAccConsent] = useState(false);
  const [signInId, setSignInId] = useState("");
  const [signInPass, setSignInPass] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    const res = await registerPlumberAccountAction({
      fullName: accName,
      phone: accPhone,
      email: accEmail,
      password: accPassword,
      consentPrivacy: accConsent,
    });
    setAuthBusy(false);
    if (!res.success) {
      setAuthError(res.error || "Could not create plumber account.");
      return;
    }
    router.push("/join-as-plumber");
    router.refresh();
  };

  const handleSignInAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    const res = await loginPlumberWithPasswordAction(signInId, signInPass);
    setAuthBusy(false);
    if (!res.success) {
      setAuthError(res.error || "Invalid sign-in details.");
      return;
    }
    router.push("/join-as-plumber");
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col gap-3 border-b border-[#E3E8EF] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#F5B301]">
              Step 1 of 2
            </p>
            <h2 className="mt-1 font-heading text-xl font-bold text-[#0B1F3A]">
              Create Your Plumber Account to Apply
            </h2>
            <p className="mt-1 text-sm text-[#5B6675]">
              Your account lets you submit your application and track review updates in the Technician Portal.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-[#E3E8EF] bg-[#F4F6F9] p-1">
            <button
              type="button"
              onClick={() => {
                setAuthTab("register");
                setAuthError(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                authTab === "register"
                  ? "bg-[#0B1F3A] text-white"
                  : "text-[#4B5B70] hover:text-[#0B1F3A]"
              }`}
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab("signin");
                setAuthError(null);
              }}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                authTab === "signin"
                  ? "bg-[#0B1F3A] text-white"
                  : "text-[#4B5B70] hover:text-[#0B1F3A]"
              }`}
            >
              Sign In
            </button>
          </div>
        </div>

        {authTab === "register" ? (
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Full Name (as on ID) *
                </label>
                <input
                  type="text"
                  required
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Enter your full name"
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={accPhone}
                  onChange={(e) => setAccPhone(e.target.value)}
                  placeholder="e.g. 0806 329 8575"
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={accEmail}
                  onChange={(e) => setAccEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Password (min 8 characters) *
                </label>
                <div className="relative">
                  <input
                    type={showAccPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={accPassword}
                    onChange={(e) => setAccPassword(e.target.value)}
                    placeholder="Create password"
                    className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 pr-11 text-base text-[#0B1F3A]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    aria-label="Toggle password"
                  >
                    {showAccPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-[#E3E8EF] bg-slate-50 p-4 text-sm text-[#4B5B70]">
              <input
                type="checkbox"
                checked={accConsent}
                onChange={(e) => setAccConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#0B1F3A]"
              />
              <span>
                I agree to the{" "}
                <Link href="/privacy" className="font-semibold text-[#0B1F3A] underline">
                  Privacy Notice
                </Link>{" "}
                and want to create a plumber account to submit my application.
              </span>
            </label>

            {authError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-6 text-base font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-60"
            >
              {authBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
              <span>Create Account & Continue to Application</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignInAccount} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Email or Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={signInId}
                  onChange={(e) => setSignInId(e.target.value)}
                  placeholder="Email or 0806..."
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-[#0B1F3A]">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={signInPass}
                  onChange={(e) => setSignInPass(e.target.value)}
                  placeholder="Enter password"
                  className="h-12 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-base text-[#0B1F3A]"
                />
              </div>
            </div>

            {authError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#F5B301] px-6 text-base font-bold text-[#07152B] hover:bg-[#e5a700] disabled:opacity-60"
            >
              {authBusy && <Loader2 className="h-5 w-5 animate-spin" />}
              <span>Sign In & Continue</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
