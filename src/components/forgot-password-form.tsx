"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { KeyRound, LoaderCircle, Mail } from "lucide-react";
interface ForgotPasswordResponse {
  error?: string;
  message?: string;
  debugUrl?: string;
}
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setDebugUrl(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await response.json()) as ForgotPasswordResponse;
      if (!response.ok) {
        setErrorMessage(body.error || "Could not send reset email.");
        return;
      }
      setSuccessMessage(
        body.message ||
          "If an account exists, a password reset email has been sent.",
      );
      if (body.debugUrl) {
        setDebugUrl(body.debugUrl);
      }
    } catch {
      setErrorMessage("Could not send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <section className="glass-card mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <KeyRound className="h-3.5 w-3.5 text-accent" /> Password Recovery
      </p>
      <h1 className="mt-4 font-display text-4xl leading-none text-brand sm:text-5xl">
        Reset Password
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
        Enter your account email and we will send a one-time secure reset link.
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <Mail className="h-3.5 w-3.5" /> Email
          </span>
          <input
            type="email"
            suppressHydrationWarning
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="you@example.com"
            required
            autoComplete="email"
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
        {debugUrl ? (
          <p className="rounded-lg border border-brand/15 bg-surface-soft px-3 py-2 text-xs text-muted">
            Dev link:
            <a
              href={debugUrl}
              className="font-semibold text-brand underline"
              target="_blank"
              rel="noreferrer"
            >
              open reset link
            </a>
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          title="Send a one-time secure reset link to this email"
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          Send reset link
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        Remembered your password?
        <Link
          href="/auth/sign-in"
          title="Return to sign in with your existing credentials"
          className="font-semibold text-brand hover:text-accent"
        >
          Sign in
        </Link>
      </p>
    </section>
  );
}
