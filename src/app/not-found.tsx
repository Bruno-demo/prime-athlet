import Link from "next/link";
import { Home, Search, ShieldAlert } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function NotFoundPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-14 sm:py-20">
        <section className="surface-card mx-auto max-w-3xl rounded-3xl p-7 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <ShieldAlert className="h-4 w-4" /> Error 404
          </p>
          <h1 className="mt-4 text-3xl font-semibold text-brand sm:text-5xl">
            Page Not Found
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            The page you requested does not exist or has been moved. Use the
            quick actions below to continue shopping and account tasks.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              title="Go back to homepage"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-primary"
            >
              <Home className="h-4 w-4" /> Go Home
            </Link>
            <Link
              href="/shop"
              title="Open products catalog"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold btn-secondary"
            >
              <Search className="h-4 w-4" /> Browse Products
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
