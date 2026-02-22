"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertOctagon, Home, RotateCcw } from "lucide-react";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global app error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background px-4 py-14 text-foreground sm:px-6 sm:py-20">
        <div className="mx-auto w-full max-w-3xl">
          <section className="surface-card rounded-3xl p-7 sm:p-10">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <AlertOctagon className="h-4 w-4" />
              Critical Error
            </p>
            <h1 className="mt-4 text-3xl font-semibold text-brand sm:text-5xl">
              Service Temporarily Unavailable
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              A critical app error occurred. Retry the request, or return to the
              homepage while we recover the session.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-primary"
                title="Retry this request"
              >
                <RotateCcw className="h-4 w-4" />
                Retry
              </button>
              <Link
                href="/"
                title="Return to homepage"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-secondary"
              >
                <Home className="h-4 w-4" />
                Home
              </Link>
            </div>
          </section>
        </div>
      </body>
    </html>
  );
}
