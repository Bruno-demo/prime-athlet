"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { LoaderCircle, LockKeyhole, Mail, UserRound } from "lucide-react";
type AuthMode = "sign-in" | "sign-up";
interface AuthFormProps {
  mode: AuthMode;
  nextPath: string;
}
interface AuthResponsePayload {
  error?: string;
  needsVerification?: boolean;
  requiresVerification?: boolean;
  requiresTwoFactor?: boolean;
  setupRequired?: boolean;
  email?: string;
  debugUrl?: string;
}
export function AuthForm({ mode, nextPath }: AuthFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verificationNotice, setVerificationNotice] = useState<string | null>(
    null,
  );
  const [debugUrl, setDebugUrl] = useState<string | null>(null);
  const formCopy = useMemo(
    () =>
      mode === "sign-in"
        ? {
            title: "Sign In",
            subtitle: "Access your saved billing profile and payment history.",
            submitLabel: "Sign in securely",
            submitTitle:
              "Sign in to access saved billing, faster checkout, and live order tracking",
            alternateLabel: "Need an account?",
            alternateCta: "Create one",
            alternateTitle:
              "Create your Prime Athlete account to save favorites and speed up checkout",
            alternateHref: `/auth/sign-up?next=${encodeURIComponent(nextPath)}`,
            endpoint: "/api/auth/sign-in",
          }
        : {
            title: "Create Account",
            subtitle:
              "Set up secure access for checkout, billing, and order tracking.",
            submitLabel: "Create secure account",
            submitTitle:
              "Create your account to unlock secure checkout, billing, and order tracking",
            alternateLabel: "Already have an account?",
            alternateCta: "Sign in",
            alternateTitle:
              "Sign in with your existing account to continue where you left off",
            alternateHref: `/auth/sign-in?next=${encodeURIComponent(nextPath)}`,
            endpoint: "/api/auth/sign-up",
          },
    [mode, nextPath],
  );
  async function handleResendVerification() {
    if (isResending || !email.trim()) {
      return;
    }
    setIsResending(true);
    setErrorMessage(null);
    setVerificationNotice(null);
    setDebugUrl(null);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await response.json()) as AuthResponsePayload;
      if (!response.ok) {
        setErrorMessage(body.error || "Could not resend verification email.");
        return;
      }
      setVerificationNotice("Verification email sent. Check your inbox.");
      if (body.debugUrl) {
        setDebugUrl(body.debugUrl);
      }
    } catch {
      setErrorMessage("Could not resend verification email.");
    } finally {
      setIsResending(false);
    }
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setVerificationNotice(null);
    setDebugUrl(null);
    try {
      const normalizedEmail = email.trim();
      const payload: Record<string, string> = {
        email: normalizedEmail,
        password,
      };
      if (mode === "sign-up") {
        payload.displayName = displayName.trim();
      } else if (requiresTwoFactor) {
        payload.otpCode = otpCode.trim();
      }
      const response = await fetch(formCopy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as AuthResponsePayload;
      if (!response.ok) {
        if (
          mode === "sign-in" &&
          response.status === 403 &&
          body.needsVerification
        ) {
          setVerificationNotice("Please verify your email before signing in.");
          return;
        }
        if (mode === "sign-in" && body.requiresTwoFactor) {
          setRequiresTwoFactor(true);
          setVerificationNotice(
            "Enter your authenticator code or one-time backup code to complete sign-in.",
          );
          setErrorMessage(body.error || null);
          return;
        }
        setErrorMessage(body.error || "Authentication request failed.");
        return;
      }
      if (mode === "sign-up" && body.requiresVerification) {
        const query = new URLSearchParams({
          email: body.email || normalizedEmail,
        });
        if (body.debugUrl) {
          query.set("debug", body.debugUrl);
        }
        router.push(`/auth/check-email?${query.toString()}`);
        router.refresh();
        return;
      }
      setRequiresTwoFactor(false);
      setOtpCode("");
      router.push(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Could not complete authentication. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <section className="glass-card mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <LockKeyhole className="h-3.5 w-3.5 text-accent" /> Account Security
      </p>
      <h1 className="mt-4 font-display text-4xl leading-none text-brand sm:text-5xl">
        {formCopy.title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
        {formCopy.subtitle}
      </p>
      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <label className="block">
            <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <UserRound className="h-3.5 w-3.5" /> Full Name
            </span>
            <input
              type="text"
              suppressHydrationWarning
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder="Jordan Williams"
              required
              minLength={2}
              maxLength={60}
              autoComplete="name"
            />
          </label>
        ) : null}
        <label className="block">
          <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <Mail className="h-3.5 w-3.5" /> Email
          </span>
          <input
            type="email"
            suppressHydrationWarning
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (requiresTwoFactor) {
                setRequiresTwoFactor(false);
                setOtpCode("");
              }
            }}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            <LockKeyhole className="h-3.5 w-3.5" /> Password
          </span>
          <input
            type="password"
            suppressHydrationWarning
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (requiresTwoFactor) {
                setRequiresTwoFactor(false);
                setOtpCode("");
              }
            }}
            className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            placeholder="************"
            required
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
          />
        </label>
        {mode === "sign-in" && requiresTwoFactor ? (
          <label className="block">
            <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <LockKeyhole className="h-3.5 w-3.5" /> 2FA / Backup Code
            </span>
            <input
              type="text"
              suppressHydrationWarning
              inputMode="text"
              pattern="[A-Za-z0-9\\-\\s]{6,24}"
              maxLength={24}
              value={otpCode}
              onChange={(event) => setOtpCode(event.target.value)}
              className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
              placeholder="123456 or ABCD-EFGH"
              required
              autoComplete="one-time-code"
            />
          </label>
        ) : null}
        {mode === "sign-up" ? (
          <p className="rounded-lg border border-brand/15 bg-surface-soft px-3 py-2 text-xs text-muted">
            Use at least 10 characters with uppercase, lowercase, number, and
            symbol.
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResending}
              title="Resend your verification email so you can securely sign in"
              className="font-semibold text-brand transition hover:text-accent disabled:opacity-70"
            >
              {isResending ? "Resending..." : "Resend verification"}
            </button>
            <Link
              href="/auth/forgot-password"
              title="Reset your password and recover account access securely"
              className="font-semibold text-brand transition hover:text-accent"
            >
              Forgot password?
            </Link>
          </div>
        )}
        {errorMessage ? (
          <p className="status-error rounded-lg px-3 py-2 text-sm">
            {errorMessage}
          </p>
        ) : null}
        {verificationNotice ? (
          <p className="status-warning rounded-lg px-3 py-2 text-sm">
            {verificationNotice}
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
              open link
            </a>
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isSubmitting}
          title={formCopy.submitTitle}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-primary disabled:opacity-70"
        >
          {isSubmitting ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : null}
          {formCopy.submitLabel}
        </button>
      </form>
      <p className="mt-5 text-sm text-muted">
        {formCopy.alternateLabel}
        <Link
          href={formCopy.alternateHref}
          title={formCopy.alternateTitle}
          className="font-semibold text-brand hover:text-accent"
        >
          {formCopy.alternateCta}
        </Link>
      </p>
    </section>
  );
}
