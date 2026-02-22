"use client";
import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";
export default function AppErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App segment error:", error);
  }, [error]);
  return (
    <div className="min-h-screen px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-3xl">
        <section className="surface-card rounded-3xl p-7 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <AlertTriangle className="h-4 w-4" /> Something Went Wrong
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-brand sm:text-5xl">
            We Couldn&apos;t Load This Page
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            A temporary issue interrupted this request. You can retry now or
            return to the storefront.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-primary"
              title="Try loading this page again"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
            <Link
              href="/"
              title="Return to homepage"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-secondary"
            >
              <Home className="h-4 w-4" /> Back Home
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
