import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BellRing,
  ChartNoAxesCombined,
  Compass,
  CreditCard,
  Heart,
  PackageSearch,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { AdminTwoFactorPanel } from "@/components/admin-two-factor-panel";
import { ProductCard } from "@/components/product-card";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { resolveAdminAccessByEmailWithOverrides } from "@/lib/admin-access";
import { formatPrice } from "@/lib/catalog";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  CustomerOrderSummary,
  getOrdersByCustomerEmail,
} from "@/lib/orders-repository";
import { getProductsByIds } from "@/lib/products-repository";
import { getWishlistProductIdsByUserId } from "@/lib/wishlist-repository";
const statusToneClassMap: Record<CustomerOrderSummary["status"], string> = {
  completed: "status-success",
  created: "status-info",
  expired: "status-warning",
  payment_failed: "status-error",
};
function getOrderCode(order: CustomerOrderSummary): string {
  return (order.externalPaymentId || order.stripeSessionId)
    .slice(-10)
    .toUpperCase();
}
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
  return statusToneClassMap[order.status] || "status-info";
}
function getProviderLabel(
  provider: CustomerOrderSummary["paymentProvider"],
): string {
  return provider.replace(/_/g, " ");
}
function getFirstName(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0];
  return firstName || "Athlete";
}
interface AccountHubPageProps {
  searchParams?: Promise<{ admin_error?: string | string[] }>;
}
export default async function AccountHubPage({
  searchParams,
}: AccountHubPageProps) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth/sign-in?next=/account");
  }
  if (!user.emailVerifiedAt) {
    redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
  }
  const [orders, wishlistProductIds] = await Promise.all([
    getOrdersByCustomerEmail(user.email, { limit: 25 }),
    getWishlistProductIdsByUserId(user.id),
  ]);
  const wishlistProducts = await getProductsByIds(wishlistProductIds);
  const compareCandidates = wishlistProducts.slice(0, 2);
  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );
  const activeOrders = orders.filter(
    (order) =>
      order.status === "created" ||
      order.fulfillmentStatus === "unfulfilled" ||
      order.paymentStatus === "awaiting_transfer",
  );
  const totalSpentCents = completedOrders.reduce((sum, order) => {
    return (
      sum +
      (order.totalCents ??
        Math.max(order.subtotalCents - order.discountCents, 0) +
          order.shippingCents)
    );
  }, 0);
  const firstName = getFirstName(user.displayName);
  const adminAccess = await resolveAdminAccessByEmailWithOverrides(user.email);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const adminError =
    typeof resolvedSearchParams?.admin_error === "string"
      ? resolvedSearchParams.admin_error
      : undefined;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <Sparkles className="h-4 w-4" /> Account Hub
            </p>
            <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
              Welcome, {firstName}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Manage your wishlist, track orders, compare products, and control
              billing details from one professional dashboard.
            </p>
          </div>
          <SignOutButton className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary" />
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="surface-card rounded-2xl p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <PackageSearch className="h-4 w-4 text-accent" /> Orders
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {orders.length}
            </p>
            <p className="mt-1 text-xs text-muted">
              {activeOrders.length} currently in tracking
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <Heart className="h-4 w-4 text-accent" /> Wishlist
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {wishlistProducts.length}
            </p>
            <p className="mt-1 text-xs text-muted">
              Saved items ready for compare and checkout
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <ChartNoAxesCombined className="h-4 w-4 text-accent" /> Completed
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {completedOrders.length}
            </p>
            <p className="mt-1 text-xs text-muted">
              Orders fully paid and fulfilled
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <CreditCard className="h-4 w-4 text-accent" /> Lifetime Spend
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {formatPrice(totalSpentCents)}
            </p>
            <p className="mt-1 text-xs text-muted">
              Based on completed checkout sessions
            </p>
          </article>
        </section>
        {adminAccess ? (
          <section className="mt-8">
            {adminError === "2fa-not-configured" ? (
              <p className="mb-4 status-warning rounded-xl px-3 py-2 text-sm">
                Admin access requires two-factor authentication. Complete setup
                below before opening the admin dashboard.
              </p>
            ) : null}
            <AdminTwoFactorPanel />
          </section>
        ) : null}
        <section className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <article id="orders" className="glass-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
              <Compass className="h-5 w-5 text-accent" /> Order Tracking
            </h2>
            <p className="mt-2 text-sm text-muted">
              Real-time order states synchronized from secure checkout events.
            </p>
            <div className="mt-5 space-y-3">
              {orders.length === 0 ? (
                <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4 text-sm text-muted">
                  You do not have any tracked orders yet. Start from the shop
                  and your order timeline will appear here automatically.
                </div>
              ) : (
                orders.slice(0, 4).map((order) => (
                  <article
                    key={order.stripeSessionId}
                    className="rounded-2xl border border-brand/15 bg-surface-soft p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-brand">
                          #{getOrderCode(order)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                          {getProviderLabel(order.paymentProvider)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getOrderPrimaryStatusTone(order)}`}
                      >
                        {getOrderPrimaryStatusLabel(order)}
                      </span>
                    </div>
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
            {orders.length > 4 ? (
              <p className="mt-3 text-xs text-muted">
                Showing latest 4 orders. Open tracking center for full history
                and filters.
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent"
              >
                Open Tracking Center <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/account/billing"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-accent"
              >
                Open Billing & Invoices <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
          <article id="compare" className="glass-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
              <BellRing className="h-5 w-5 text-accent" /> Alerts & Compare
            </h2>
            <p className="mt-2 text-sm text-muted">
              Keep discount alerts active and compare your saved products before
              checkout.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
                <p className="text-sm font-semibold text-brand">
                  Price Drop Alerts
                </p>
                <p className="mt-1 text-xs text-muted">
                  Alerts are available for all products in your wishlist.
                </p>
              </div>
              <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
                <p className="text-sm font-semibold text-brand">
                  Restock Notifications
                </p>
                <p className="mt-1 text-xs text-muted">
                  Stay informed when high-demand sizes and equipment are back in
                  stock.
                </p>
              </div>
              <div className="rounded-2xl border border-brand/15 bg-surface-soft p-4">
                <p className="text-sm font-semibold text-brand">
                  Compare Ready
                </p>
                <p className="mt-1 text-xs text-muted">
                  Save at least two items in wishlist to unlock side-by-side
                  compare.
                </p>
              </div>
            </div>
            {compareCandidates.length >= 2 ? (
              <div className="mt-5 rounded-2xl border border-brand/15 bg-surface-soft p-4">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  <Scale className="h-4 w-4 text-accent" /> Quick Compare
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {compareCandidates.map((product) => (
                    <div
                      key={`compare-${product.id}`}
                      className="rounded-xl border border-brand/15 bg-surface p-3"
                    >
                      <p className="line-clamp-2 text-sm font-semibold text-brand">
                        {product.name}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {product.sport} - {product.category}
                      </p>
                      <p className="mt-2 text-base font-semibold text-brand">
                        {formatPrice(product.priceCents)}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {product.rating.toFixed(1)} rating - {product.reviews}
                        reviews
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-5 rounded-2xl border border-brand/15 bg-surface-soft px-4 py-3 text-xs text-muted">
                Add at least two products to your wishlist to view a compare
                preview.
              </p>
            )}
          </article>
        </section>
        <section id="wishlist" className="mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-3xl font-semibold text-brand">
              <Heart className="h-6 w-6 text-accent" /> Wishlist
            </h2>
            <Link
              href="/shop"
              className="text-sm font-semibold text-brand hover:text-accent"
            >
              Browse more products
            </Link>
          </div>
          {wishlistProducts.length === 0 ? (
            <article className="surface-card rounded-2xl p-6 text-sm text-muted">
              Your wishlist is empty. Save products from shop cards or detail
              pages to track discounts and compare options later.
            </article>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {wishlistProducts.map((product) => (
                <ProductCard key={`wishlist-${product.id}`} product={product} />
              ))}
            </div>
          )}
        </section>
        <section className="mt-8 rounded-2xl border border-brand/15 bg-surface-soft p-5 text-sm text-muted">
          <p className="inline-flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            Account hub data is protected by session-based access control.
            Orders are synced from checkout events and wishlist items are
            persisted in MongoDB per user.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
