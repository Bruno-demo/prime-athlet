"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  LoaderCircle,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
interface VerifyEmailPanelProps {
  token: string | null;
}
interface VerifyEmailResponse {
  error?: string;
  verified?: boolean;
}
const VERIFY_REQUEST_TIMEOUT_MS = 12000;
export function VerifyEmailPanel({ token }: VerifyEmailPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >(token ? "loading" : "error");
  const [message, setMessage] = useState<string | null>(
    token ? null : "Verification token is missing.",
  );
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) {
      return;
    }
    let isActive = true;
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => {
      abortController.abort();
    }, VERIFY_REQUEST_TIMEOUT_MS);
    async function verify() {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          signal: abortController.signal,
        });
        const body = (await response.json()) as VerifyEmailResponse;
        if (!isActive) {
          return;
        }
        if (!response.ok || !body.verified) {
          setStatus("error");
          setMessage(body.error || "Verification failed.");
          return;
        }
        setStatus("success");
        setMessage("Email verified successfully. Your account is now active.");
      } catch (error) {
        if (!isActive) {
          return;
        }
        setStatus("error");
        if (error instanceof Error && error.name === "AbortError") {
          setMessage("Verification timed out. Please retry.");
          return;
        }
        setMessage("Could not verify email. Please try again.");
      }
    }
    void verify();
    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [attempt, token]);
  return (
    <section className="glass-card mx-auto w-full max-w-xl rounded-3xl p-6 sm:p-8">
      <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
        <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Email Verification
      </p>
      <h1 className="mt-4 font-display text-4xl leading-none text-brand sm:text-5xl">
        Confirm Account
      </h1>
      {status === "loading" ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Verifying your
          account...
        </p>
      ) : null}
      {status === "success" ? (
        <p className="mt-4 inline-flex items-center gap-2 status-success rounded-lg px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4" /> {message}
        </p>
      ) : null}
      {status === "error" ? (
        <p className="mt-4 inline-flex items-center gap-2 status-error rounded-lg px-3 py-2 text-sm">
          <TriangleAlert className="h-4 w-4" /> {message}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {status === "success" ? (
          <button
            type="button"
            onClick={() => {
              router.push("/account");
              router.refresh();
            }}
            title="Open your verified account and continue to billing and orders"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-primary"
          >
            Continue to billing
          </button>
        ) : null}
        {status === "error" && token ? (
          <button
            type="button"
            onClick={() => {
              setStatus("loading");
              setMessage(null);
              setAttempt((current) => current + 1);
            }}
            title="Retry email verification with the secure link token"
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-primary"
          >
            Retry verification
          </button>
        ) : null}
        <Link
          href="/auth/sign-in"
          title="Return to sign in after confirming your email"
          className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-secondary"
        >
          Back to sign in
        </Link>
      </div>
    </section>
  );
}
