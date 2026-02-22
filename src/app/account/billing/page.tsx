import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { BillingProfileForm } from "@/components/billing-profile-form";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatPrice } from "@/lib/catalog";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  type CustomerOrderSummary,
  getOrdersByCustomerEmail,
} from "@/lib/orders-repository";
const statusToneClassMap: Record<string, string> = {
  completed: "status-success",
  created: "status-info",
  expired: "status-warning",
  payment_failed: "status-error",
};
function getOrderTotalCents(order: CustomerOrderSummary): number {
  return (
    order.totalCents ??
    Math.max(order.subtotalCents - order.discountCents, 0) + order.shippingCents
  );
}
function getOrderPrimaryStatusLabel(order: CustomerOrderSummary): string {
  if (
    order.status === "created" &&
    order.paymentStatus === "awaiting_transfer"
  ) {
    return "awaiting transfer";
  }
  if (order.paymentStatus === "refunded") {
    return "refunded";
  }
  return order.status.replace(/_/g, " ");
}
function getOrderPrimaryStatusTone(order: CustomerOrderSummary): string {
  if (
    order.status === "created" &&
    order.paymentStatus === "awaiting_transfer"
  ) {
    return "status-awaiting";
  }
  if (order.paymentStatus === "refunded") {
    return "status-warning";
  }
  return (
    statusToneClassMap[order.status] ||
    "border border-brand/20 bg-brand/10 text-brand"
  );
}
function getProviderLabel(
  provider: CustomerOrderSummary["paymentProvider"],
): string {
  return provider.replace(/_/g, " ");
}
export default async function BillingPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth/sign-in?next=/account/billing");
  }
  if (!user.emailVerifiedAt) {
    redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
  }
  const orders = await getOrdersByCustomerEmail(user.email, { limit: 20 });
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <CreditCard className="h-4 w-4" /> Billing Center
            </p>
            <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
              Account & Billing
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Manage payment-ready profile details and monitor checkout history
              tied to your account email.
            </p>
          </div>
          <SignOutButton className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="glass-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
              <UserRound className="h-5 w-5 text-accent" /> Billing Profile
            </h2>
            <p className="mt-2 text-sm text-muted">
              Keep these details current to speed up payment and improve invoice
              accuracy.
            </p>
            <div className="mt-6">
              <BillingProfileForm initialProfile={user.billingProfile} />
            </div>
          </section>
          <section className="glass-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
              <ReceiptText className="h-5 w-5 text-accent" /> Billing History
            </h2>
            <p className="mt-2 text-sm text-muted">
              Recent checkout sessions for
              <span className="font-semibold">{user.email}</span>.
            </p>
            <Link
              href="/account/orders"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-accent"
            >
              Open tracking center <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <div className="mt-5 space-y-3">
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4 text-sm text-muted">
                  No billing records yet. Complete your first order from the
                  cart.
                </div>
              ) : (
                orders.map((order) => (
                  <article
                    key={order.stripeSessionId}
                    className="rounded-2xl border border-brand/15 bg-surface-soft p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-brand">
                        #
                        {(order.externalPaymentId || order.stripeSessionId)
                          .slice(-10)
                          .toUpperCase()}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getOrderPrimaryStatusTone(order)}`}
                      >
                        {getOrderPrimaryStatusLabel(order)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                      {getProviderLabel(order.paymentProvider)}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-muted">
                        {order.items.reduce(
                          (sum, item) => sum + item.quantity,
                          0,
                        )}
                        items
                      </p>
                      <p className="text-base font-semibold text-brand">
                        {formatPrice(getOrderTotalCents(order))}
                      </p>
                    </div>
                    <div className="mt-3">
                      <Link
                        href={`/account/orders?q=${encodeURIComponent(order.externalPaymentId || order.stripeSessionId)}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-accent"
                      >
                        Track this order <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
        <section className="mt-8 rounded-2xl border border-brand/15 bg-surface-soft p-5 text-sm text-muted">
          <p className="inline-flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            Session-based access control protects account routes and billing
            APIs. Checkout events are synchronized and persisted in MongoDB
            order records.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
