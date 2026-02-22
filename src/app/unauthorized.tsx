import Link from "next/link";
import { Lock, LogIn, ShieldCheck } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-14 sm:py-20">
        <section className="surface-card mx-auto max-w-3xl rounded-3xl p-7 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <Lock className="h-4 w-4" /> Authentication Required
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-brand sm:text-5xl">
            Sign In To Continue
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            This page requires an authenticated account session before access
            can be granted.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/sign-in"
              title="Sign in to your account"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-primary"
            >
              <LogIn className="h-4 w-4" /> Sign In
            </Link>
            <Link
              href="/auth/sign-up"
              title="Create a new account"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-secondary"
            >
              <ShieldCheck className="h-4 w-4" /> Create Account
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
