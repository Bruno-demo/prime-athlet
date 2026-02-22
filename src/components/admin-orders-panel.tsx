"use client";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { FileCheck2, LoaderCircle, RefreshCcw } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
type AdminOrderStatus = "created" | "completed" | "expired" | "payment_failed";
type AdminFulfillmentStatus = "unfulfilled" | "fulfilled" | "cancelled";
type AdminOrderAction = "fulfill" | "cancel" | "refund" | "mark_paid";
interface AdminOrderItem {
  id: string;
  productId?: string;
  name: string;
  quantity: number;
  unitAmountCents: number;
  size?: string;
  color?: string;
}
interface AdminOrderRow {
  stripeSessionId: string;
  status: AdminOrderStatus;
  paymentProvider: "stripe" | "paypal" | "bank_transfer" | "manual";
  externalPaymentId: string | null;
  paymentStatus: string;
  customerEmail: string | null;
  items: AdminOrderItem[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number | null;
  currency: string;
  fulfillmentStatus: AdminFulfillmentStatus;
  fulfilledAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
  refundId: string | null;
  createdAt: string;
  updatedAt: string;
}
interface OrdersResponse {
  orders?: AdminOrderRow[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: string;
}
interface OrderActionResponse {
  order?: AdminOrderRow;
  error?: string;
}
interface AdminOrdersPanelProps {
  csrfToken: string;
  canWrite: boolean;
  onAfterMutation?: () => Promise<void> | void;
}
const pageSizeOptions = [10, 20, 30, 50];
const statusOptions = [
  "all",
  "created",
  "completed",
  "expired",
  "payment_failed",
] as const;
const fulfillmentOptions = [
  "all",
  "unfulfilled",
  "fulfilled",
  "cancelled",
] as const;
const paymentStatusOptions = [
  "all",
  "paid",
  "unpaid",
  "refunded",
  "awaiting_transfer",
] as const;

const chipBaseClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]";
const neutralChipClass = `${chipBaseClass} border border-brand/20 bg-surface-soft text-brand`;
const tableActionButtonBaseClass =
  "inline-flex h-8 w-full items-center justify-center rounded-lg px-2.5 text-[11px] font-semibold";

function getOrderDisplayTotalCents(order: AdminOrderRow): number {
  if (typeof order.totalCents === "number" && order.totalCents >= 0) {
    return Math.floor(order.totalCents);
  }
  return Math.max(order.subtotalCents - order.discountCents, 0) + order.shippingCents;
}
function shortSessionId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}
function isAwaitingTransfer(order: AdminOrderRow): boolean {
  return order.paymentStatus === "awaiting_transfer";
}

function formatPaymentProviderLabel(
  provider: AdminOrderRow["paymentProvider"],
): string {
  return provider.replace("_", " ");
}

function formatStatusLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function getOrderStatusChipClass(status: AdminOrderStatus): string {
  if (status === "completed") {
    return `${chipBaseClass} status-success`;
  }
  if (status === "payment_failed") {
    return `${chipBaseClass} status-error`;
  }
  if (status === "expired") {
    return `${chipBaseClass} status-warning`;
  }
  return `${chipBaseClass} status-info`;
}

function getFulfillmentChipClass(status: AdminFulfillmentStatus): string {
  if (status === "fulfilled") {
    return `${chipBaseClass} status-success`;
  }
  if (status === "cancelled") {
    return `${chipBaseClass} status-warning`;
  }
  return `${chipBaseClass} status-info`;
}

function summarizeVariantValues(
  order: AdminOrderRow,
  field: "size" | "color",
): string[] {
  const fallback = field === "size" ? "One Size" : "Standard";
  return Array.from(
    new Set(
      order.items.map((item) => {
        const value = item[field];
        return typeof value === "string" && value.trim().length > 0
          ? value.trim()
          : fallback;
      }),
    ),
  );
}

export function AdminOrdersPanel({
  csrfToken,
  canWrite,
  onAfterMutation,
}: AdminOrdersPanelProps) {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("all");
  const [fulfillmentStatus, setFulfillmentStatus] =
    useState<(typeof fulfillmentOptions)[number]>("all");
  const [paymentStatus, setPaymentStatus] =
    useState<(typeof paymentStatusOptions)[number]>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderActionKey, setOrderActionKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      params.set("status", status);
      params.set("fulfillmentStatus", fulfillmentStatus);
      params.set("paymentStatus", paymentStatus);
      if (query.trim()) {
        params.set("q", query.trim());
      }
      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const body = (await response.json()) as OrdersResponse;
      if (!response.ok) {
        throw new Error(body.error || "Unable to load orders.");
      }
      setOrders(body.orders || []);
      setPagination({
        page: body.pagination?.page ?? page,
        pageSize: body.pagination?.pageSize ?? pageSize,
        total: body.pagination?.total ?? 0,
        totalPages: body.pagination?.totalPages ?? 1,
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load orders.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [fulfillmentStatus, page, pageSize, paymentStatus, query, status]);
  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);
  const handleOrderAction = useCallback(
    async (stripeSessionId: string, action: AdminOrderAction) => {
      if (!canWrite) {
        setErrorMessage("Your role is read-only for order operations.");
        return;
      }
      if (!csrfToken) {
        setErrorMessage("Security token is not ready. Retry in a moment.");
        return;
      }
      if (orderActionKey) {
        return;
      }
      const actionKey = `${stripeSessionId}:${action}`;
      setOrderActionKey(actionKey);
      setErrorMessage(null);
      setNotice(null);
      try {
        const response = await fetch("/api/admin/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({ stripeSessionId, action }),
        });
        const body = (await response.json()) as OrderActionResponse;
        if (!response.ok || !body.order) {
          throw new Error(body.error || "Unable to update order.");
        }
        await loadOrders();
        if (onAfterMutation) {
          await onAfterMutation();
        }
        const actionLabel = action === "mark_paid" ? "mark paid" : action;
        setNotice(
          `Order ${shortSessionId(stripeSessionId)} updated: ${actionLabel} applied.`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to update order.",
        );
      } finally {
        setOrderActionKey(null);
      }
    },
    [canWrite, csrfToken, loadOrders, onAfterMutation, orderActionKey],
  );
  const summaryText = useMemo(() => {
    if (pagination.total === 0) {
      return "No orders found for the selected filters.";
    }
    const start = (pagination.page - 1) * pagination.pageSize + 1;
    const end = Math.min(pagination.total, start + orders.length - 1);
    return `Showing ${start}-${end} of ${pagination.total} orders`;
  }, [orders.length, pagination.page, pagination.pageSize, pagination.total]);
  return (
    <article className="glass-card rounded-3xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
            <FileCheck2 className="h-5 w-5 text-accent" /> Order Operations
          </h3>
          <p className="mt-2 text-sm text-muted">
            Server-side pagination, filters, and mutation controls for large
            order datasets.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadOrders()}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold btn-secondary"
        >
          {isLoading ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Search email or session id"
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none xl:col-span-2"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as (typeof statusOptions)[number]);
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
        >
          {statusOptions.map((option) => (
            <option key={`status-${option}`} value={option}>
              Status: {option}
            </option>
          ))}
        </select>
        <select
          value={fulfillmentStatus}
          onChange={(event) => {
            setFulfillmentStatus(
              event.target.value as (typeof fulfillmentOptions)[number],
            );
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
        >
          {fulfillmentOptions.map((option) => (
            <option key={`fulfillment-${option}`} value={option}>
              Fulfillment: {option}
            </option>
          ))}
        </select>
        <select
          value={paymentStatus}
          onChange={(event) => {
            setPaymentStatus(
              event.target.value as (typeof paymentStatusOptions)[number],
            );
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
        >
          {paymentStatusOptions.map((option) => (
            <option key={`payment-${option}`} value={option}>
              Payment: {option}
            </option>
          ))}
        </select>
        <select
          value={String(pageSize)}
          onChange={(event) => {
            setPageSize(Number(event.target.value));
            setPage(1);
          }}
          className="themed-input h-10 rounded-xl px-3 text-sm focus:outline-none"
        >
          {pageSizeOptions.map((size) => (
            <option key={`orders-size-${size}`} value={size}>
              {size} per page
            </option>
          ))}
        </select>
      </div>
      {notice ? (
        <p className="mt-3 status-success rounded-xl px-3 py-2 text-sm">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 status-error rounded-xl px-3 py-2 text-sm">
          {errorMessage}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted">{summaryText}</p>
      {orders.length === 0 ? (
        <p className="mt-4 rounded-xl border border-brand/15 bg-surface p-4 text-sm text-muted">
          {isLoading ? "Loading orders..." : "No orders available yet."}
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-2.5 md:hidden">
            {orders.map((order) => {
              const orderTotalCents = getOrderDisplayTotalCents(order);
              const isPaid = order.status === "completed";
              const isRefunded = Boolean(order.refundedAt);
              const canFulfill =
                isPaid &&
                !isRefunded &&
                order.fulfillmentStatus === "unfulfilled";
              const canCancel =
                !isRefunded && order.fulfillmentStatus === "unfulfilled";
              const canRefund =
                isPaid && !isRefunded && order.paymentProvider === "stripe";
              const usesMarkPaidAction =
                order.paymentProvider === "bank_transfer" &&
                order.status !== "completed" &&
                isAwaitingTransfer(order);
              const canMarkPaid =
                usesMarkPaidAction &&
                !isRefunded &&
                order.fulfillmentStatus !== "cancelled";
              const isExpanded = expandedOrderId === order.stripeSessionId;
              const pendingMarkPaid =
                orderActionKey === `${order.stripeSessionId}:mark_paid`;
              const pendingFulfill =
                orderActionKey === `${order.stripeSessionId}:fulfill`;
              const pendingCancel =
                orderActionKey === `${order.stripeSessionId}:cancel`;
              const pendingRefund =
                orderActionKey === `${order.stripeSessionId}:refund`;
              const variantSizes = summarizeVariantValues(order, "size");
              const variantColors = summarizeVariantValues(order, "color");
              return (
                <article
                  key={`mobile-order-${order.stripeSessionId}`}
                  className="rounded-2xl border border-brand/15 bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-muted">
                        {shortSessionId(order.stripeSessionId)}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {order.customerEmail || "No customer email"}
                      </p>
                    </div>
                    <p className="text-base font-semibold text-brand">
                      {formatPrice(orderTotalCents)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className={neutralChipClass}>
                      {formatPaymentProviderLabel(order.paymentProvider)}
                    </span>
                    <span className={getOrderStatusChipClass(order.status)}>
                      {formatStatusLabel(order.status)}
                    </span>
                    {isAwaitingTransfer(order) ? (
                      <span
                        className={`${chipBaseClass} status-awaiting`}
                      >
                        awaiting transfer
                      </span>
                    ) : null}
                    <span
                      className={getFulfillmentChipClass(order.fulfillmentStatus)}
                    >
                      {formatStatusLabel(order.fulfillmentStatus)}
                    </span>
                    {isRefunded ? (
                      <span className={`${chipBaseClass} status-warning`}>
                        refunded
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] text-muted">
                    Created: {new Date(order.createdAt).toLocaleString()}
                  </p>
                  {order.externalPaymentId ? (
                    <p className="mt-1 text-[11px] text-muted">
                      Provider ID:
                      <span className="font-mono">
                        {shortSessionId(order.externalPaymentId)}
                      </span>
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted">
                    Sizes:{" "}
                    <span className="font-semibold text-brand">
                      {variantSizes.join(", ")}
                    </span>{" "}
                    • Colors:{" "}
                    <span className="font-semibold text-brand">
                      {variantColors.join(", ")}
                    </span>
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedOrderId((current) =>
                          current === order.stripeSessionId
                            ? null
                            : order.stripeSessionId,
                        )
                      }
                      className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold btn-secondary"
                    >
                      {isExpanded ? "Hide details" : "View details"}
                    </button>
                    {usesMarkPaidAction ? (
                      <button
                        type="button"
                        disabled={
                          !canWrite || !canMarkPaid || Boolean(orderActionKey)
                        }
                        onClick={() =>
                          void handleOrderAction(
                            order.stripeSessionId,
                            "mark_paid",
                          )
                        }
                        className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold btn-primary disabled:opacity-60"
                      >
                        {pendingMarkPaid ? "..." : "Mark paid"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          !canWrite || !canFulfill || Boolean(orderActionKey)
                        }
                        onClick={() =>
                          void handleOrderAction(
                            order.stripeSessionId,
                            "fulfill",
                          )
                        }
                        className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold btn-primary disabled:opacity-60"
                      >
                        {pendingFulfill ? "..." : "Fulfill"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={
                        !canWrite || !canCancel || Boolean(orderActionKey)
                      }
                      onClick={() =>
                        void handleOrderAction(order.stripeSessionId, "cancel")
                      }
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--status-warning-border)] px-2 text-[11px] font-semibold text-[var(--status-warning-text)] transition hover:bg-[var(--status-warning-bg)] disabled:opacity-60"
                    >
                      {pendingCancel ? "..." : "Cancel"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canWrite || !canRefund || Boolean(orderActionKey)
                      }
                      onClick={() =>
                        void handleOrderAction(order.stripeSessionId, "refund")
                      }
                      className="inline-flex h-8 items-center justify-center rounded-lg px-2 text-[11px] font-semibold btn-danger disabled:opacity-60"
                    >
                      {pendingRefund ? "..." : "Refund"}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3 rounded-xl border border-brand/15 bg-surface-soft p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Line items
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {order.items.map((item) => (
                          <div
                            key={`${order.stripeSessionId}-mobile-item-${item.id}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-brand/12 bg-surface px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-brand">
                                {item.name}
                              </p>
                              <p className="font-mono text-[10px] text-muted">
                                {item.productId || item.id}
                              </p>
                              <p className="text-[10px] text-muted">
                                {item.size || "One Size"} |{" "}
                                {item.color || "Standard"}
                              </p>
                            </div>
                            <div className="text-right text-[11px]">
                              <p className="font-semibold text-brand">
                                x{item.quantity}
                              </p>
                              <p className="text-muted">
                                {formatPrice(item.unitAmountCents)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted">
                        <span>Subtotal</span>
                        <span className="text-right text-brand">
                          {formatPrice(order.subtotalCents)}
                        </span>
                        <span>Discount</span>
                        <span className="text-right text-brand">
                          -{formatPrice(order.discountCents)}
                        </span>
                        <span>Shipping</span>
                        <span className="text-right text-brand">
                          {order.shippingCents === 0
                            ? "Free"
                            : formatPrice(order.shippingCents)}
                        </span>
                        <span className="font-semibold text-brand">Total</span>
                        <span className="text-right font-semibold text-brand">
                          {formatPrice(orderTotalCents)}
                        </span>
                      </div>
                      {isRefunded ? (
                        <p className="mt-2 text-[11px] text-[var(--status-warning-text)]">
                          Refunded on
                          {order.refundedAt
                            ? new Date(order.refundedAt).toLocaleString()
                            : "N/A"}
                          {order.refundId
                            ? ` - Refund ID: ${order.refundId}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
          <div className="admin-table-wrap admin-table-mobile mt-4 hidden md:block">
            <table className="admin-table admin-table-pin-first admin-table-pin-last min-w-[88rem] text-xs sm:text-sm">
              <thead>
                <tr>
                  <th className="min-w-[12rem]">Order</th>
                  <th className="hidden min-w-[14rem] md:table-cell">
                    Customer
                  </th>
                  <th className="min-w-[7rem] text-right">Total</th>
                  <th className="min-w-[15rem]">Status</th>
                  <th className="hidden min-w-[10rem] lg:table-cell">Size</th>
                  <th className="hidden min-w-[10rem] lg:table-cell">Color</th>
                  <th className="hidden min-w-[12rem] sm:table-cell">
                    Fulfillment
                  </th>
                  <th className="hidden min-w-[9.5rem] xl:table-cell">
                    Created
                  </th>
                  <th className="min-w-[13rem] text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const createdAtDate = new Date(order.createdAt);
                  const orderTotalCents = getOrderDisplayTotalCents(order);
                  const isPaid = order.status === "completed";
                  const isRefunded = Boolean(order.refundedAt);
                  const canFulfill =
                    isPaid &&
                    !isRefunded &&
                    order.fulfillmentStatus === "unfulfilled";
                  const canCancel =
                    !isRefunded && order.fulfillmentStatus === "unfulfilled";
                  const canRefund =
                    isPaid && !isRefunded && order.paymentProvider === "stripe";
                  const usesMarkPaidAction =
                    order.paymentProvider === "bank_transfer" &&
                    order.status !== "completed" &&
                    isAwaitingTransfer(order);
                  const canMarkPaid =
                    usesMarkPaidAction &&
                    !isRefunded &&
                    order.fulfillmentStatus !== "cancelled";
                  const isExpanded = expandedOrderId === order.stripeSessionId;
                  const pendingMarkPaid =
                    orderActionKey === `${order.stripeSessionId}:mark_paid`;
                  const pendingFulfill =
                    orderActionKey === `${order.stripeSessionId}:fulfill`;
                  const pendingCancel =
                    orderActionKey === `${order.stripeSessionId}:cancel`;
                  const pendingRefund =
                    orderActionKey === `${order.stripeSessionId}:refund`;
                  const variantSizes = summarizeVariantValues(order, "size");
                  const variantColors = summarizeVariantValues(order, "color");
                  return (
                    <Fragment key={order.stripeSessionId}>
                      <tr>
                        <td className="align-top">
                          <p
                            className="font-mono text-[11px] sm:text-xs"
                            title={order.stripeSessionId}
                          >
                            {shortSessionId(order.stripeSessionId)}
                          </p>
                          {order.externalPaymentId ? (
                            <p
                              className="mt-1 line-clamp-1 break-all font-mono text-[10px] text-muted"
                              title={order.externalPaymentId}
                            >
                              {shortSessionId(order.externalPaymentId)}
                            </p>
                          ) : null}
                        </td>
                        <td className="hidden align-top md:table-cell">
                          <p
                            className="line-clamp-2 break-all text-xs text-brand"
                            title={order.customerEmail || "No customer email"}
                          >
                            {order.customerEmail || "No customer email"}
                          </p>
                        </td>
                        <td className="align-top text-right">
                          <p className="font-semibold text-brand">
                            {formatPrice(orderTotalCents)}
                          </p>
                        </td>
                        <td className="align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={getOrderStatusChipClass(order.status)}>
                              {formatStatusLabel(order.status)}
                            </span>
                            {isAwaitingTransfer(order) ? (
                              <span
                                className={`${chipBaseClass} status-awaiting`}
                              >
                                awaiting transfer
                              </span>
                            ) : null}
                            <span className={neutralChipClass}>
                              {formatPaymentProviderLabel(order.paymentProvider)}
                            </span>
                          </div>
                        </td>
                        <td className="hidden align-top lg:table-cell">
                          <p
                            className="line-clamp-2 text-xs text-brand"
                            title={variantSizes.join(", ")}
                          >
                            {variantSizes.join(", ")}
                          </p>
                        </td>
                        <td className="hidden align-top lg:table-cell">
                          <p
                            className="line-clamp-2 text-xs text-brand"
                            title={variantColors.join(", ")}
                          >
                            {variantColors.join(", ")}
                          </p>
                        </td>
                        <td className="hidden align-top sm:table-cell">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={getFulfillmentChipClass(
                                order.fulfillmentStatus,
                              )}
                            >
                              {formatStatusLabel(order.fulfillmentStatus)}
                            </span>
                            {isRefunded ? (
                              <span className={`${chipBaseClass} status-warning`}>
                                refunded
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="hidden align-top xl:table-cell">
                          <p className="whitespace-nowrap text-xs text-brand">
                            {createdAtDate.toLocaleDateString()}
                          </p>
                          <p className="mt-1 whitespace-nowrap text-[11px] text-muted">
                            {createdAtDate.toLocaleTimeString()}
                          </p>
                        </td>
                        <td className="align-top text-right">
                          <div className="ml-auto grid w-full max-w-[13rem] grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedOrderId((current) =>
                                  current === order.stripeSessionId
                                    ? null
                                    : order.stripeSessionId,
                                )
                              }
                              className={`${tableActionButtonBaseClass} btn-secondary`}
                            >
                              {isExpanded ? "Hide" : "Details"}
                            </button>
                            {usesMarkPaidAction ? (
                              <button
                                type="button"
                                disabled={
                                  !canWrite ||
                                  !canMarkPaid ||
                                  Boolean(orderActionKey)
                                }
                                onClick={() =>
                                  void handleOrderAction(
                                    order.stripeSessionId,
                                    "mark_paid",
                                  )
                                }
                                className={`${tableActionButtonBaseClass} btn-primary disabled:opacity-60`}
                              >
                                {pendingMarkPaid ? "..." : "Mark paid"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={
                                  !canWrite ||
                                  !canFulfill ||
                                  Boolean(orderActionKey)
                                }
                                onClick={() =>
                                  void handleOrderAction(
                                    order.stripeSessionId,
                                    "fulfill",
                                  )
                                }
                                className={`${tableActionButtonBaseClass} btn-primary disabled:opacity-60`}
                              >
                                {pendingFulfill ? "..." : "Fulfill"}
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                !canWrite ||
                                !canCancel ||
                                Boolean(orderActionKey)
                              }
                              onClick={() =>
                                void handleOrderAction(
                                  order.stripeSessionId,
                                  "cancel",
                                )
                              }
                              className={`${tableActionButtonBaseClass} border border-[var(--status-warning-border)] text-[var(--status-warning-text)] transition hover:bg-[var(--status-warning-bg)] disabled:opacity-60`}
                            >
                              {pendingCancel ? "..." : "Cancel"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                !canWrite ||
                                !canRefund ||
                                Boolean(orderActionKey)
                              }
                              onClick={() =>
                                void handleOrderAction(
                                  order.stripeSessionId,
                                  "refund",
                                )
                              }
                              className={`${tableActionButtonBaseClass} btn-danger disabled:opacity-60`}
                            >
                              {pendingRefund ? "..." : "Refund"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="rounded-xl border border-brand/15 bg-surface-soft p-3">
                              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted">
                                Line items
                              </p>
                              <div className="admin-table-wrap admin-table-mobile mt-2">
                                <table className="admin-table admin-table-pin-first text-xs">
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th>Product ID</th>
                                      <th>Size</th>
                                      <th>Color</th>
                                      <th className="text-right">Qty</th>
                                      <th className="text-right">Unit Price</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {order.items.map((item) => (
                                      <tr
                                        key={`${order.stripeSessionId}-${item.id}`}
                                      >
                                        <td>{item.name}</td>
                                        <td className="font-mono text-[11px]">
                                          {item.productId || item.id}
                                        </td>
                                        <td>{item.size || "One Size"}</td>
                                        <td>{item.color || "Standard"}</td>
                                        <td className="text-right">
                                          {item.quantity}
                                        </td>
                                        <td className="text-right">
                                          {formatPrice(item.unitAmountCents)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="mt-3 grid grid-cols-4 gap-2 rounded-lg border border-brand/12 bg-surface px-3 py-2 text-xs text-muted">
                                <div>
                                  <p>Subtotal</p>
                                  <p className="font-semibold text-brand">
                                    {formatPrice(order.subtotalCents)}
                                  </p>
                                </div>
                                <div>
                                  <p>Discount</p>
                                  <p className="font-semibold text-brand">
                                    -{formatPrice(order.discountCents)}
                                  </p>
                                </div>
                                <div>
                                  <p>Shipping</p>
                                  <p className="font-semibold text-brand">
                                    {order.shippingCents === 0
                                      ? "Free"
                                      : formatPrice(order.shippingCents)}
                                  </p>
                                </div>
                                <div>
                                  <p>Total</p>
                                  <p className="font-semibold text-brand">
                                    {formatPrice(orderTotalCents)}
                                  </p>
                                </div>
                              </div>
                              {isRefunded ? (
                                <p className="mt-2 text-xs text-[var(--status-warning-text)]">
                                  Refunded on
                                  {order.refundedAt
                                    ? new Date(
                                        order.refundedAt,
                                      ).toLocaleString()
                                    : "N/A"}
                                  {order.refundId
                                    ? ` - Refund ID: ${order.refundId}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Page {pagination.page} of {pagination.totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={pagination.page <= 1}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(pagination.totalPages, current + 1))
            }
            disabled={pagination.page >= pagination.totalPages}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </article>
  );
}
