import { Suspense } from "react";
import { LoaderCircle, ShoppingCart } from "lucide-react";
import { CartView } from "@/components/cart-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
export default function CartPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            <ShoppingCart className="mr-1 inline h-4 w-4" /> Checkout
          </p>
          <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
            Your Cart
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Review quantities, confirm totals, and continue to secure checkout.
          </p>
        </div>
        <Suspense
          fallback={
            <div className="surface-card inline-flex items-center gap-2 rounded-2xl p-8 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Loading cart...
            </div>
          }
        >
          <CartView />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
