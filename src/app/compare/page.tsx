import Link from "next/link";
import { ArrowLeft, Scale } from "lucide-react";
import { CompareTable } from "@/components/compare-table";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function ComparePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              <Scale className="mr-1 inline h-4 w-4" /> Product Compare
            </p>
            <h1 className="mt-2 text-4xl font-semibold leading-none text-brand sm:text-5xl">
              Compare Products
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Evaluate key specs and pricing side-by-side before checkout.
            </p>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold btn-secondary"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Shop
          </Link>
        </div>
        <CompareTable />
      </main>
      <SiteFooter />
    </div>
  );
}
