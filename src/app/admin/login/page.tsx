"use client";

import { useEffect, useState } from "react";
import { Lock, Mail, ArrowRight, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { loginAdmin } from "@/app/actions/admin-auth";
import { requestPasswordResetAction } from "@/app/actions/portal-auth";
import {
  AuthLayout,
  AuthAlert,
  AUTH_LABEL_CLASS,
  AUTH_INPUT_WITH_ICON_CLASS,
  AUTH_PRIMARY_BTN_CLASS,
  AUTH_FIELD_ERROR_CLASS,
} from "@/components/auth/AuthLayout";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [redirectTo, setRedirectTo] = useState<string>("/admin");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("redirect") || "";
    if (requested.startsWith("/admin") && !requested.startsWith("//")) {
      setRedirectTo(requested);
    }
    const err = params.get("error");
    const reason = params.get("reason");
    if (err === "unauthorized") {
      setErrorMessage("Your account is not authorised for administrator access.");
    } else if (reason === "auth_required") {
      setInfoMessage("Please sign in to continue to your administrator page.");
    }
  }, []);

  // Forgot password state
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim() || !email.includes("@")) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Please enter your password.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    const formData = new FormData();
    formData.set("email", email.trim());
    formData.set("password", password);

    const result = await loginAdmin(formData);

    if (result?.error) {
      setErrorMessage(result.error);
      setLoading(false);
    } else {
      window.location.assign(redirectTo);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetFeedback(null);
    setResetLoading(true);
    const res = await requestPasswordResetAction(resetEmail);
    setResetLoading(false);
    if (res.success && res.message) {
      setResetFeedback({ type: "success", text: res.message });
    } else {
      setResetFeedback({ type: "error", text: res.error || "Unable to send reset link." });
    }
  };

  return (
    <AuthLayout
      roleLabel="ADMINISTRATOR PORTAL"
      title="Admin Sign In"
      subtitle="Authorised staff only"
      bottomLinks={
        <div className="flex items-center justify-center gap-1.5 leading-relaxed text-[#C9D3E0]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-[#F5B301]" />
          <span>Authorized access only. Public registration disabled.</span>
        </div>
      }
    >
      {showReset ? (
        <form onSubmit={handleResetSubmit} className="space-y-4" noValidate>
          {resetFeedback && (
            <AuthAlert type={resetFeedback.type} message={resetFeedback.text} />
          )}

          <div>
            <label htmlFor="admin-reset-email" className={AUTH_LABEL_CLASS}>
              Admin Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9D3E0]/70" />
              <input
                id="admin-reset-email"
                type="email"
                required
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className={AUTH_INPUT_WITH_ICON_CLASS}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={resetLoading}
            className={AUTH_PRIMARY_BTN_CLASS}
          >
            {resetLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Sending reset link...</span>
              </>
            ) : (
              <span>Send Password Reset Link</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowReset(false);
              setResetFeedback(null);
            }}
            className="w-full text-center text-xs font-medium text-[#C9D3E0] transition-colors hover:text-[#F5B301]"
          >
            Back to Admin Sign In
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {infoMessage && !errorMessage && (
            <div className="rounded-lg border border-[#F5B301]/40 bg-[#F5B301]/10 px-3.5 py-2.5 text-xs font-medium text-[#F5B301]">
              {infoMessage}
            </div>
          )}
          {errorMessage && <AuthAlert type="error" message={errorMessage} />}

          <div>
            <label htmlFor="admin-email" className={AUTH_LABEL_CLASS}>
              Email Address
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9D3E0]/70" />
              <input
                id="admin-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                }}
                className={AUTH_INPUT_WITH_ICON_CLASS}
              />
            </div>
            {fieldErrors.email && (
              <p className={AUTH_FIELD_ERROR_CLASS}>{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="admin-password" className="text-xs font-semibold uppercase tracking-wider text-[#C9D3E0]">
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowReset(true)}
                className="text-xs font-medium text-[#F5B301] transition-colors hover:text-[#E0A200]"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#C9D3E0]/70" />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                name="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                }}
                className={`${AUTH_INPUT_WITH_ICON_CLASS} pr-11`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#C9D3E0]/70 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className={AUTH_FIELD_ERROR_CLASS}>{fieldErrors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className={AUTH_PRIMARY_BTN_CLASS}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
