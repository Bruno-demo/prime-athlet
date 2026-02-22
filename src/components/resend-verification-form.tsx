"use client";
import { FormEvent, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
interface ResendVerificationFormProps {
  initialEmail: string;
}
interface ResendResponsePayload {
  error?: string;
  message?: string;
}
export function ResendVerificationForm({
  initialEmail,
}: ResendVerificationFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const body = (await response.json()) as ResendResponsePayload;
      if (!response.ok) {
        setErrorMessage(body.error || "Unable to resend verification email.");
        return;
      }
      setSuccessMessage(
        body.message ||
          "If an account exists, a verification email has been sent.",
      );
    } catch {
      setErrorMessage("Unable to resend verification email.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          Account email
        </span>
        <input
          type="email"
          suppressHydrationWarning
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="themed-input h-11 w-full rounded-xl px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
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
        title="Send a new verification email to activate your account access"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold btn-primary disabled:opacity-70"
      >
        {isSubmitting ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        Resend verification
      </button>
    </form>
  );
}
