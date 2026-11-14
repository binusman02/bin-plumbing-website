"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, LogOut, Smartphone } from "lucide-react";
import {
  loginPlumberWithPasswordAction,
  logoutPlumberAction,
  requestPasswordResetAction,
} from "@/app/actions/portal-auth";
import {
  AUTH_FIELD_ERROR_CLASS,
  AUTH_INPUT_WITH_ICON_CLASS,
  AUTH_LABEL_CLASS,
  AUTH_PRIMARY_BTN_CLASS,
  AuthAlert,
  AuthLayout,
} from "@/components/auth/AuthLayout";
import type { PlumberProfile } from "@/lib/marketplace";
import { getStatusMeta } from "@/lib/status-styles";

interface PlumberAuthViewProps {
  authenticatedAccount?: {
    fullName: string;
    phone: string;
    email: string;
  } | null;
  currentPlumber: PlumberProfile | null;
}

export function PlumberAuthView({
  authenticatedAccount = null,
  currentPlumber,
}: PlumberAuthViewProps) {
  const router = useRouter();
  const [identifierInput, setIdentifierInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setAuthLoading(true);
    const res = await loginPlumberWithPasswordAction(identifierInput, passwordInput);
    setAuthLoading(false);
    if (!res.success) {
      setLoginError(res.error || "Invalid sign-in details.");
      return;
    }
    router.push("/plumber");
    router.refresh();
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    const res = await requestPasswordResetAction(resetEmail);
    setAuthLoading(false);
    setResetMessage(
      res.message ||
        "If an account matches that email, a password reset link has been sent."
    );
  };

  if (
    authenticatedAccount &&
    (!currentPlumber || currentPlumber.verification_status !== "approved")
  ) {
    const appStatusMeta = currentPlumber
      ? getStatusMeta(currentPlumber.verification_status)
      : null;

    return (
      <AuthLayout
        roleLabel="TECHNICIAN PORTAL"
        title={currentPlumber ? "Application Status" : "Complete Your Application"}
        subtitle={
          currentPlumber
            ? "Your technician dashboard unlocks once your plumber application is approved by an administrator."
            : "Your plumber account is active. Submit your technician application to be reviewed for job dispatch."
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-white/10 bg-[#0A1E3D]/70 p-4 text-sm text-[#DCE4EE]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#A8B6C8]">
              Signed-in Account
            </p>
            <p className="mt-1 font-semibold text-white">{authenticatedAccount.fullName}</p>
            <p className="text-xs text-[#A8B6C8]">
              {authenticatedAccount.email}
              {authenticatedAccount.phone ? ` · ${authenticatedAccount.phone}` : ""}
            </p>
          </div>

          {currentPlumber ? (
            <div className="space-y-2.5 rounded-lg border border-white/10 bg-[#07152B]/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#A8B6C8]">
                  Application Ref
                </span>
                <span className="font-mono text-xs font-semibold text-[#F5B301]">
                  {currentPlumber.application_ref}
                </span>
              </div>
              {appStatusMeta && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#A8B6C8]">
                    Status
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${appStatusMeta.className}`}
                  >
                    {appStatusMeta.label}
                  </span>
                </div>
              )}
              <p className="text-xs leading-relaxed text-[#A8B6C8]">
                {currentPlumber.verification_status === "submitted" ||
                currentPlumber.verification_status === "under_review"
                  ? "Our team is reviewing your credentials and service area. Check back soon."
                  : currentPlumber.verification_status === "documents_required"
                    ? "Additional verification documents are needed. Open your application details to check what is required."
                    : "Please review your application details or contact support for assistance."}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-[#F5B301]/30 bg-[#F5B301]/10 px-3.5 py-3 text-xs leading-relaxed text-[#F5B301]">
              Application Not Submitted Yet — Complete the technician application form so our admin team can review and approve your profile.
            </div>
          )}

          <Link
            href="/join-as-plumber"
            className={`${AUTH_PRIMARY_BTN_CLASS} inline-flex items-center justify-center text-center`}
          >
            {currentPlumber ? "View Application Details" : "Complete Plumber Application"}
          </Link>

          <button
            type="button"
            onClick={async () => {
              await logoutPlumberAction();
              router.push("/plumber");
              router.refresh();
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-transparent px-4 text-sm font-semibold text-[#DCE4EE] transition hover:bg-white/5"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      roleLabel="TECHNICIAN PORTAL"
      title={forgotMode ? "Reset Password" : "Technician Sign In"}
      subtitle={
        forgotMode
          ? "Enter the email linked to your approved plumber profile."
          : "Sign in with the email or phone and password issued after approval."
      }
    >
      {forgotMode ? (
        <form onSubmit={handleForgotSubmit} className="space-y-4">
          {resetMessage && <AuthAlert type="success" message={resetMessage} />}
          <div>
            <label htmlFor="plumber-reset-email" className={AUTH_LABEL_CLASS}>
              Email address
            </label>
            <input
              id="plumber-reset-email"
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-12 w-full rounded-lg border border-white/15 bg-[#07152B] px-3.5 text-sm text-white placeholder:text-[#8E9FB4] focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/30"
            />
          </div>
          <button type="submit" disabled={authLoading} className={AUTH_PRIMARY_BTN_CLASS}>
            {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Reset Link"}
          </button>
          <button
            type="button"
            onClick={() => {
              setForgotMode(false);
              setResetMessage("");
            }}
            className="w-full text-center text-sm font-medium text-[#F5B301] hover:underline"
          >
            Back to Sign In
          </button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          {loginError && <AuthAlert type="error" message={loginError} />}

          <div>
            <label htmlFor="plumber-id" className={AUTH_LABEL_CLASS}>
              Email or Phone Number
            </label>
            <div className="relative">
              <Smartphone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E9FB4]" />
              <input
                id="plumber-id"
                type="text"
                required
                value={identifierInput}
                onChange={(e) => setIdentifierInput(e.target.value)}
                placeholder="Email or 0806..."
                className={AUTH_INPUT_WITH_ICON_CLASS}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="plumber-pass" className="text-sm font-medium text-[#E3E8EF]">
                Password
              </label>
              <button
                type="button"
                onClick={() => setForgotMode(true)}
                className="text-xs font-medium text-[#F5B301] hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8E9FB4]" />
              <input
                id="plumber-pass"
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
            {loginError && <p className={AUTH_FIELD_ERROR_CLASS}>{loginError}</p>}
          </div>

          <button type="submit" disabled={authLoading} className={AUTH_PRIMARY_BTN_CLASS}>
            {authLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Sign In to Technician Portal"
            )}
          </button>

          <p className="pt-2 text-center text-xs text-[#A8B6C8]">
            Not approved yet?{" "}
            <Link href="/join-as-plumber" className="font-semibold text-[#F5B301] hover:underline">
              Apply to join as a plumber
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
