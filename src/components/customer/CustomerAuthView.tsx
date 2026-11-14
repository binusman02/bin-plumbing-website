"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Lock, Smartphone } from "lucide-react";
import {
  loginCustomerWithPasswordAction,
  registerCustomerWithPasswordAction,
  requestPasswordResetAction,
  resendCustomerConfirmationAction,
} from "@/app/actions/portal-auth";
import {
  AUTH_FIELD_ERROR_CLASS,
  AUTH_INPUT_CLASS,
  AUTH_INPUT_WITH_ICON_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BTN_CLASS,
  AuthAlert,
  AuthLayout,
} from "@/components/auth/AuthLayout";

const NIGERIAN_STATES = [
  "Kano State",
  "Kaduna State",
  "Abuja (FCT)",
  "Lagos State",
  "Katsina State",
  "Other State",
];

function isValidNigerianPhone(phone: string): boolean {
  const compact = phone.replace(/[\s()-]/g, "");
  return /^(?:\+?234|0)[789][01]\d{8}$/.test(compact);
}

interface CustomerAuthViewProps {
  activeLocations?: string[];
}

export function CustomerAuthView({ activeLocations = [] }: CustomerAuthViewProps) {
  const [authMode, setAuthMode] = useState<"signin" | "register" | "forgot">("signin");
  const [identifierInput, setIdentifierInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [pendingResendEmail, setPendingResendEmail] = useState("");

  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regState, setRegState] = useState("");
  const [regCityLga, setRegCityLga] = useState("");
  const [regConsent, setRegConsent] = useState(true);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    setPendingResendEmail("");
    setAuthLoading(true);
    try {
      const res = await loginCustomerWithPasswordAction(identifierInput, passwordInput);
      if (!res.success) {
        setAuthError(res.error || "Invalid sign-in details.");
        if ("needsConfirmation" in res && res.needsConfirmation && res.emailForResend) {
          setPendingResendEmail(res.emailForResend);
        }
        setAuthLoading(false);
        return;
      }
      window.location.assign(window.location.pathname + window.location.search);
    } catch {
      setAuthError("Sign-in failed. Please try again.");
      setAuthLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!pendingResendEmail) return;
    setAuthLoading(true);
    const res = await resendCustomerConfirmationAction(pendingResendEmail);
    setAuthLoading(false);
    if (res.success) {
      setAuthError("");
      setAuthSuccess(res.message || "Confirmation email sent.");
      setPendingResendEmail("");
    } else {
      setAuthError(res.error || "Could not resend confirmation email.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    if (!isValidNigerianPhone(regPhone)) {
      setAuthError("Please enter a valid Nigerian phone number (e.g. 0806 329 8575).");
      return;
    }
    if (!regEmail.trim() || !regEmail.includes("@")) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    setAuthLoading(true);
    try {
      const res = await registerCustomerWithPasswordAction({
        fullName: regName,
        phone: regPhone,
        email: regEmail.trim(),
        password: regPassword,
        address: regAddress,
        state: regState,
        cityLga: regCityLga || activeLocations[0] || "City Area",
        consentPrivacy: regConsent,
      });
      if (!res.success) {
        setAuthError(res.error || "Could not create account.");
        setAuthLoading(false);
        return;
      }
      if (res.requiresEmailVerification) {
        setAuthLoading(false);
        setIdentifierInput(regEmail.trim());
        setAuthMode("signin");
        setAuthSuccess(
          res.message ||
            "Account created. Please check your email inbox (and spam folder) to confirm your address before signing in."
        );
        return;
      }
      window.location.assign(window.location.pathname + window.location.search);
    } catch {
      setAuthError("Registration failed. Please try again.");
      setAuthLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    const res = await requestPasswordResetAction(identifierInput);
    setAuthLoading(false);
    setAuthSuccess(
      res.message || "If an account matches that email, a password reset link has been sent."
    );
  };

  return (
    <AuthLayout
      roleLabel="CUSTOMER PORTAL"
      title={
        authMode === "signin"
          ? "Customer Sign In"
          : authMode === "register"
            ? "Create Customer Account"
            : "Reset Password"
      }
      subtitle={
        authMode === "signin"
          ? "Sign in with your phone number or email and password."
          : authMode === "register"
            ? "Create an account to book plumbers, approve quotes, and track jobs."
            : "Enter your registered email to receive a password reset link."
      }
    >
      {authMode === "signin" && (
        <form onSubmit={handleSignIn} className="space-y-4">
          {authSuccess && <AuthAlert type="success" message={authSuccess} />}
          {authError && <AuthAlert type="error" message={authError} />}
          {pendingResendEmail && (
            <button
              type="button"
              disabled={authLoading}
              onClick={handleResendConfirmation}
              className="w-full rounded-lg border border-[#F5B301]/50 bg-[#F5B301]/10 px-3 py-2 text-xs font-semibold text-[#F5B301] hover:bg-[#F5B301]/20"
            >
              Resend confirmation email to {pendingResendEmail}
            </button>
          )}
          <div>
            <label htmlFor="cust-id" className={AUTH_LABEL_CLASS}>
              Phone Number or Email
            </label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E9FB4]" />
              <input
                id="cust-id"
                type="text"
                required
                value={identifierInput}
                onChange={(e) => setIdentifierInput(e.target.value)}
                placeholder="0806... or email"
                className={AUTH_INPUT_WITH_ICON_CLASS}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="cust-pass" className="text-sm font-medium text-[#E3E8EF]">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("forgot");
                  setAuthError("");
                }}
                className="text-xs font-medium text-[#F5B301] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E9FB4]" />
              <input
                id="cust-pass"
                type={showPassword ? "text" : "password"}
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                className={`${AUTH_INPUT_WITH_ICON_CLASS} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8E9FB4]"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {authError && <p className={AUTH_FIELD_ERROR_CLASS}>{authError}</p>}
          </div>

          <button type="submit" disabled={authLoading} className={AUTH_PRIMARY_BTN_CLASS}>
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
          </button>

          <p className="pt-2 text-center text-xs text-[#A8B6C8]">
            New customer?{" "}
            <button
              type="button"
              onClick={() => {
                setAuthMode("register");
                setAuthError("");
              }}
              className="font-semibold text-[#F5B301] hover:underline"
            >
              Create an account
            </button>
          </p>
        </form>
      )}

      {authMode === "register" && (
        <form onSubmit={handleRegister} className="space-y-3.5">
          {authError && <AuthAlert type="error" message={authError} />}
          <div>
            <label className={AUTH_LABEL_CLASS}>Full Name *</label>
            <input
              type="text"
              required
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={AUTH_LABEL_CLASS}>Phone Number *</label>
            <input
              type="tel"
              required
              value={regPhone}
              onChange={(e) => setRegPhone(e.target.value)}
              placeholder="0806..."
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={AUTH_LABEL_CLASS}>Email Address *</label>
            <input
              type="email"
              required
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="you@example.com"
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={AUTH_LABEL_CLASS}>Password (min 8 characters) *</label>
            <input
              type="password"
              required
              minLength={8}
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div>
            <label className={AUTH_LABEL_CLASS}>Property Address *</label>
            <input
              type="text"
              required
              value={regAddress}
              onChange={(e) => setRegAddress(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={AUTH_LABEL_CLASS}>State *</label>
              <select
                value={regState}
                onChange={(e) => setRegState(e.target.value)}
                className={AUTH_INPUT_CLASS}
              >
                {NIGERIAN_STATES.map((s) => (
                  <option key={s} value={s} className="bg-[#0B1F3A]">
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={AUTH_LABEL_CLASS}>City / Area *</label>
              <input
                type="text"
                required
                value={regCityLga}
                onChange={(e) => setRegCityLga(e.target.value)}
                placeholder="Area"
                className={AUTH_INPUT_CLASS}
              />
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-xs text-[#C9D3E0]">
            <input
              type="checkbox"
              checked={regConsent}
              onChange={(e) => setRegConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I accept the{" "}
              <Link href="/privacy" className="text-[#F5B301] underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          <button type="submit" disabled={authLoading} className={AUTH_PRIMARY_BTN_CLASS}>
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Account"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("signin");
              setAuthError("");
            }}
            className="w-full text-center text-xs font-medium text-[#F5B301] hover:underline"
          >
            Already have an account? Sign In
          </button>
        </form>
      )}

      {authMode === "forgot" && (
        <form onSubmit={handleForgot} className="space-y-4">
          {authSuccess && <AuthAlert type="success" message={authSuccess} />}
          <div>
            <label className={AUTH_LABEL_CLASS}>Registered Email</label>
            <input
              type="email"
              required
              value={identifierInput}
              onChange={(e) => setIdentifierInput(e.target.value)}
              className={AUTH_INPUT_CLASS}
            />
          </div>
          <button type="submit" disabled={authLoading} className={AUTH_PRIMARY_BTN_CLASS}>
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode("signin");
              setAuthSuccess("");
            }}
            className="w-full text-center text-xs font-medium text-[#F5B301] hover:underline"
          >
            Back to Sign In
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
