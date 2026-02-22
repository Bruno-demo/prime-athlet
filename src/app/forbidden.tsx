import Link from "next/link";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function ForbiddenPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-14 sm:py-20">
        <section className="surface-card mx-auto max-w-3xl rounded-3xl p-7 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <ShieldOff className="h-4 w-4" /> Access Denied
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-brand sm:text-5xl">
            You Don&apos;t Have Permission
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Your account is signed in, but this area is restricted by role or
            policy.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/account"
              title="Return to account dashboard"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-primary"
            >
              <ArrowLeft className="h-4 w-4" /> Back To Account
            </Link>
            <Link
              href="/"
              title="Return to homepage"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-secondary"
            >
              Home
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
