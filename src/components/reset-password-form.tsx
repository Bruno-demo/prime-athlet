"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound, LoaderCircle } from "lucide-react";
interface ResetPasswordFormProps {
  token: string | null;
}
interface ResetPasswordResponse {
  error?: string;
  success?: boolean;
  requiresEmailVerification?: boolean;
}
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [requiresVerification, setRequiresVerification] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || !token) {
      return;
    }
    setErrorMessage(null);
    setSuccessMessage(null);
    setRequiresVerification(false);
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const body = (await response.json()) as ResetPasswordResponse;
      if (!response.ok || !body.success) {
        setErrorMessage(body.error || "Could not reset password.");
        return;
      }
      setSuccessMessage("Password updated successfully.");
      setRequiresVerification(Boolean(body.requiresEmailVerification));
      setPassword("");
      setConfirmPassword("");
    } catch {
      setErrorMessage("Could not reset password.");
    } finally {
      setIsSubmitting(false);
    }
  }
  if (!token) {
    return (
      <section className="glass-card mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <h1 className="font-display text-4xl leading-none text-brand sm:text-5xl">
          Invalid Reset Link
        </h1>
        <p className="mt-3 text-sm text-muted sm:text-base">
          This password reset link is missing or malformed.
        </p>
        <Link
          href="/auth/forgot-password"
          title="Request a fresh password reset link for your account"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-primary"
        >
          Request a new link
        </Link>
      </section>
    );
  }
  return (
    <section className="glass-card mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <KeyRound className="h-3.5 w-3.5 text-accent" /> Reset Credentials
      </p>
      <h1 className="mt-4 font-display text-4xl leading-none text-brand sm:text-5xl">
        Set New Password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
        Use a strong password with uppercase, lowercase, number, and symbol.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            New password
          </span>
          <input
            type="password"
            suppressHydrationWarning
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="************"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Confirm password
          </span>
          <input
            type="password"
            suppressHydrationWarning
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="************"
            autoComplete="new-password"
            required
          />
        </label>
        {errorMessage ? (
          <p className="status-error rounded-lg px-3 py-2 text-sm">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="status-success rounded-lg px-3 py-2 text-sm">
            {successMessage}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          title="Save your new password and secure your account access"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          Update password
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {requiresVerification ? (
          <>
            Please verify your email before sign-in.
            <Link
              href="/auth/sign-in"
              title="Return to sign in after your email verification is complete"
              className="font-semibold text-brand hover:text-accent"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            Password reset complete.
            <Link
              href="/account"
              title="Go to your account dashboard and continue shopping"
              className="font-semibold text-brand hover:text-accent"
            >
              Continue to account
            </Link>
          </>
        )}
      </p>
    </section>
  );
}
