import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CreditCard,
  Filter,
  PackageSearch,
  Search,
  ShieldCheck,
  Store,
} from "lucide-react";
import { SignOutButton } from "@/components/sign-out-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatPrice } from "@/lib/catalog";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  CustomerOrderSummary,
  getOrdersByCustomerEmail,
} from "@/lib/orders-repository";
interface AccountOrdersPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}
type OrderStatusFilter =
  | "all"
  | "created"
  | "completed"
  | "payment_failed"
  | "expired";
type OrderProviderFilter =
  | "all"
  | "stripe"
  | "paypal"
  | "bank_transfer"
  | "manual";
function pickFirstValue(value: string | string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) ? value[0] || "" : "";
}
function parseStatusFilter(raw: string): OrderStatusFilter {
  if (
    raw === "created" ||
    raw === "completed" ||
    raw === "payment_failed" ||
    raw === "expired"
  ) {
    return raw;
  }
  return "all";
}
function parseProviderFilter(raw: string): OrderProviderFilter {
  if (
    raw === "stripe" ||
    raw === "paypal" ||
    raw === "bank_transfer" ||
    raw === "manual"
  ) {
    return raw;
  }
  return "all";
}
function parseTimeWindowDays(raw: string): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  if (parsed === 30 || parsed === 90 || parsed === 180 || parsed === 365) {
    return parsed;
  }
  return 0;
}
function formatOrderCode(order: CustomerOrderSummary): string {
  const source = order.externalPaymentId || order.stripeSessionId;
  return source.slice(-10).toUpperCase();
}
function formatOrderStatus(value: string): string {
  return value.replace(/_/g, " ");
}
function getOrderTotalCents(order: CustomerOrderSummary): number {
  return (
    order.totalCents ??
    Math.max(order.subtotalCents - order.discountCents, 0) + order.shippingCents
  );
}
function getPrimaryStatusLabel(order: CustomerOrderSummary): string {
  if (
    order.status === "created" &&
    order.paymentStatus === "awaiting_transfer"
  ) {
    return "awaiting transfer";
  }
  if (order.paymentStatus === "refunded") {
    return "refunded";
  }
  return formatOrderStatus(order.status);
}
function getPrimaryStatusTone(order: CustomerOrderSummary): string {
  if (order.paymentStatus === "refunded") {
    return "status-warning";
  }
  if (
    order.status === "created" &&
    order.paymentStatus === "awaiting_transfer"
  ) {
    return "status-awaiting";
  }
  if (order.status === "completed") {
    return "status-success";
  }
  if (order.status === "payment_failed") {
    return "status-error";
  }
  if (order.status === "expired") {
    return "status-warning";
  }
  return "status-info";
}
function getFulfillmentLabel(order: CustomerOrderSummary): string {
  if (order.fulfillmentStatus === "fulfilled") {
    return "delivered";
  }
  if (order.fulfillmentStatus === "cancelled") {
    return "cancelled";
  }
  return "processing";
}
function getFulfillmentTone(order: CustomerOrderSummary): string {
  if (order.fulfillmentStatus === "fulfilled") {
    return "status-success";
  }
  if (order.fulfillmentStatus === "cancelled") {
    return "status-error";
  }
  return "status-info";
}
function getProviderLabel(value: string): string {
  if (value === "bank_transfer") {
    return "bank transfer";
  }
  return value.replace(/_/g, " ");
}
function getProgressPercent(order: CustomerOrderSummary): number {
  if (order.fulfillmentStatus === "fulfilled") {
    return 100;
  }
  if (order.fulfillmentStatus === "cancelled") {
    return 72;
  }
  if (order.status === "payment_failed" || order.status === "expired") {
    return 30;
  }
  if (order.status === "completed") {
    return 74;
  }
  if (order.paymentStatus === "awaiting_transfer") {
    return 38;
  }
  return 42;
}
function getTimelineSteps(order: CustomerOrderSummary): Array<{
  id: string;
  label: string;
  note: string;
  state: "done" | "active" | "idle";
}> {
  const paid = order.status === "completed" || order.paymentStatus === "paid";
  const paymentIssue =
    order.status === "payment_failed" || order.status === "expired";
  const fulfilled = order.fulfillmentStatus === "fulfilled";
  const cancelled = order.fulfillmentStatus === "cancelled";
  const awaitingTransfer = order.paymentStatus === "awaiting_transfer";
  return [
    {
      id: "placed",
      label: "Order placed",
      note: "Secure checkout session created.",
      state: "done",
    },
    {
      id: "payment",
      label: "Payment confirmation",
      note: paymentIssue
        ? "Payment attempt failed. Retry checkout."
        : awaitingTransfer
          ? "Waiting for transfer settlement."
          : paid
            ? "Payment verified."
            : "Awaiting provider confirmation.",
      state: paid
        ? "done"
        : paymentIssue || awaitingTransfer
          ? "active"
          : "active",
    },
    {
      id: "processing",
      label: "Processing",
      note: cancelled
        ? "Order is cancelled."
        : paid
          ? "Warehouse preparation in progress."
          : "Starts after payment confirmation.",
      state: fulfilled || cancelled ? "done" : paid ? "active" : "idle",
    },
    {
      id: "delivered",
      label: "Delivered",
      note: fulfilled
        ? "Package delivered successfully."
        : cancelled
          ? "Delivery closed because order was cancelled."
          : "Completion milestone.",
      state: fulfilled ? "done" : cancelled ? "active" : "idle",
    },
  ];
}
function matchesSearch(order: CustomerOrderSummary, query: string): boolean {
  if (!query) {
    return true;
  }
  const normalized = query.toLowerCase();
  const haystack = [
    order.stripeSessionId,
    order.externalPaymentId || "",
    order.paymentProvider,
    order.paymentStatus,
    order.status,
    ...order.items.map((item) => item.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}
export default async function AccountOrdersPage({
  searchParams,
}: AccountOrdersPageProps) {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/auth/sign-in?next=/account/orders");
  }
  if (!user.emailVerifiedAt) {
    redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
  }
  const params = searchParams ? await searchParams : {};
  const q = pickFirstValue(params.q).trim();
  const status = parseStatusFilter(pickFirstValue(params.status));
  const provider = parseProviderFilter(pickFirstValue(params.provider));
  const days = parseTimeWindowDays(pickFirstValue(params.days));
  const orders = await getOrdersByCustomerEmail(user.email, { limit: 100 });
  const nowTimestamp = new Date().getTime();
  const minCreatedAt =
    days > 0 ? nowTimestamp - days * 24 * 60 * 60 * 1000 : null;
  const filteredOrders = orders.filter((order) => {
    if (status !== "all" && order.status !== status) {
      return false;
    }
    if (provider !== "all" && order.paymentProvider !== provider) {
      return false;
    }
    if (minCreatedAt && order.createdAt.getTime() < minCreatedAt) {
      return false;
    }
    if (!matchesSearch(order, q)) {
      return false;
    }
    return true;
  });
  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );
  const activeOrders = orders.filter(
    (order) =>
      order.status === "created" ||
      order.fulfillmentStatus === "unfulfilled" ||
      order.paymentStatus === "awaiting_transfer",
  );
  const deliveredOrders = orders.filter(
    (order) => order.fulfillmentStatus === "fulfilled",
  );
  const totalSpentCents = completedOrders.reduce(
    (sum, order) => sum + getOrderTotalCents(order),
    0,
  );
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <PackageSearch className="h-4 w-4" /> Order Tracking
            </p>
            <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
              Orders & Delivery Timeline
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Track payment, fulfillment, and delivery progression from one
              professional order operations center.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/account"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Account
            </Link>
            <SignOutButton className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary" />
          </div>
        </div>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="surface-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Total orders
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {orders.length}
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              In progress
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {activeOrders.length}
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Delivered
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {deliveredOrders.length}
            </p>
          </article>
          <article className="surface-card rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Total spent
            </p>
            <p className="mt-2 text-3xl font-semibold text-brand">
              {formatPrice(totalSpentCents)}
            </p>
          </article>
        </section>
        <section className="glass-card mt-7 rounded-3xl p-5 sm:p-6">
          <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
            <Filter className="h-5 w-5 text-accent" /> Filter Orders
          </h2>
          <form
            className="mt-4 grid gap-2 md:grid-cols-[1.4fr_0.9fr_0.9fr_0.8fr_auto] md:items-center"
            action="/account/orders"
          >
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search order id, item, provider..."
                className="themed-input h-10 w-full rounded-xl pl-9 pr-3 text-sm focus:outline-none"
              />
            </label>
            <select
              name="status"
              defaultValue={status}
              className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            >
              <option value="all">All statuses</option>
              <option value="created">Created</option>
              <option value="completed">Completed</option>
              <option value="payment_failed">Payment failed</option>
              <option value="expired">Expired</option>
            </select>
            <select
              name="provider"
              defaultValue={provider}
              className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            >
              <option value="all">All providers</option>
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="manual">Manual</option>
            </select>
            <select
              name="days"
              defaultValue={days > 0 ? String(days) : "0"}
              className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
            >
              <option value="0">All time</option>
              <option value="30">Last 30d</option>
              <option value="90">Last 90d</option>
              <option value="180">Last 180d</option>
              <option value="365">Last year</option>
            </select>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold btn-primary"
            >
              Apply
            </button>
          </form>
          <p className="mt-3 text-xs text-muted">
            Showing
            <span className="font-semibold text-brand">
              {filteredOrders.length}
            </span>
            of <span className="font-semibold text-brand">{orders.length}</span>
            orders.
          </p>
        </section>
        <section className="mt-7 space-y-4">
          {filteredOrders.length === 0 ? (
            <article className="surface-card rounded-2xl p-6 text-sm text-muted">
              No orders matched your filters. Try adjusting status/provider or
              search terms.
            </article>
          ) : (
            filteredOrders.map((order) => {
              const progress = getProgressPercent(order);
              const steps = getTimelineSteps(order);
              const itemCount = order.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              );
              return (
                <article
                  key={order.stripeSessionId}
                  className="surface-card rounded-3xl p-5 sm:p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Order
                      </p>
                      <h3 className="mt-1 text-xl font-semibold text-brand">
                        #{formatOrderCode(order)}
                      </h3>
                      <p className="mt-1 text-xs text-muted">
                        Placed {new Date(order.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getPrimaryStatusTone(order)}`}
                      >
                        {getPrimaryStatusLabel(order)}
                      </span>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${getFulfillmentTone(order)}`}
                      >
                        {getFulfillmentLabel(order)}
                      </span>
                      <span className="inline-flex rounded-full border border-brand/20 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
                        {getProviderLabel(order.paymentProvider)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,var(--brand-action)_0%,var(--accent)_100%)] transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-4">
                      {steps.map((step) => (
                        <div
                          key={`${order.stripeSessionId}-${step.id}`}
                          className="rounded-xl border border-brand/12 bg-surface-soft px-3 py-2"
                        >
                          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-brand">
                            {step.state === "done" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--status-success-text)]" />
                            ) : step.state === "active" ? (
                              <Clock3 className="h-3.5 w-3.5 text-accent" />
                            ) : (
                              <CircleDashed className="h-3.5 w-3.5 text-muted" />
                            )}
                            {step.label}
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-muted">
                            {step.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-brand/12 bg-surface-soft p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Items ({itemCount})
                      </p>
                      <ul className="mt-2 divide-y divide-brand/10">
                        {order.items.slice(0, 4).map((item) => (
                          <li
                            key={`${order.stripeSessionId}-${item.id}`}
                            className="flex items-center justify-between gap-2 py-2 text-sm"
                          >
                            <span className="line-clamp-1 text-brand">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-muted">
                              x{item.quantity}
                            </span>
                          </li>
                        ))}
                        {order.items.length > 4 ? (
                          <li className="py-2 text-xs text-muted">
                            +{order.items.length - 4} more items
                          </li>
                        ) : null}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-brand/12 bg-surface-soft p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                        Totals
                      </p>
                      <div className="mt-2 space-y-1.5 text-sm">
                        <p className="flex items-center justify-between text-muted">
                          <span>Subtotal</span>
                          <span>{formatPrice(order.subtotalCents)}</span>
                        </p>
                        <p className="flex items-center justify-between text-muted">
                          <span>Discount</span>
                          <span>-{formatPrice(order.discountCents)}</span>
                        </p>
                        <p className="flex items-center justify-between text-muted">
                          <span>Shipping</span>
                          <span>
                            {order.shippingCents === 0
                              ? "Free"
                              : formatPrice(order.shippingCents)}
                          </span>
                        </p>
                        <p className="flex items-center justify-between font-semibold text-brand">
                          <span>Total</span>
                          <span>{formatPrice(getOrderTotalCents(order))}</span>
                        </p>
                        <p className="pt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                          Payment: {order.paymentStatus.replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Link
                      href="/account/billing"
                      className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold btn-secondary"
                    >
                      <CreditCard className="h-3.5 w-3.5" /> Billing details
                    </Link>
                    <Link
                      href="/shop"
                      className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold btn-secondary"
                    >
                      <Store className="h-3.5 w-3.5" /> Continue shopping
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </section>
        <section className="mt-8 rounded-2xl border border-brand/15 bg-surface-soft p-5 text-sm text-muted">
          <p className="inline-flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Order
            tracking is synced from checkout webhooks and admin fulfillment
            actions. Statuses update for Stripe, PayPal, and bank-transfer flows
            in one timeline.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
