import { LoaderCircle } from "lucide-react";
export default function AppLoadingPage() {
  return (
    <div className="min-h-screen">
      <main className="section-shell py-12 sm:py-16">
        <div className="surface-card mx-auto max-w-4xl rounded-3xl p-7 sm:p-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-brand sm:text-4xl">
            Preparing Your Prime Athlete Experience
          </h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            We are fetching your latest catalog, account, and checkout data.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="surface-soft h-28 animate-pulse rounded-2xl border border-brand/10" />
            <div className="surface-soft h-28 animate-pulse rounded-2xl border border-brand/10" />
            <div className="surface-soft h-36 animate-pulse rounded-2xl border border-brand/10 sm:col-span-2" />
          </div>
        </div>
      </main>
    </div>
  );
}
