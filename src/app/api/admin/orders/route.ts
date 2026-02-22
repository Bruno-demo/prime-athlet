import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import {
  AdminOrderAction,
  AdminOrdersPageQuery,
  AdminOrderSummary,
  applyAdminOrderAction,
  getAdminOrderBySessionId,
  getAdminOrdersPage,
  OrderActionError,
} from "@/lib/orders-repository";
import { incrementPromotionsUsage } from "@/lib/promotions-repository";
import { getStripeServer } from "@/lib/stripe";

export const runtime = "nodejs";

interface OrderActionPayload {
  stripeSessionId: string;
  action: AdminOrderAction;
}

const statusSet = new Set(["all", "created", "completed", "expired", "payment_failed"]);
const fulfillmentSet = new Set(["all", "unfulfilled", "fulfilled", "cancelled"]);

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function serializeOrder(order: AdminOrderSummary) {
  return {
    stripeSessionId: order.stripeSessionId,
    status: order.status,
    paymentProvider: order.paymentProvider,
    externalPaymentId: order.externalPaymentId,
    paymentStatus: order.paymentStatus,
    customerEmail: order.customerEmail,
    fulfillmentStatus: order.fulfillmentStatus,
    fulfilledAt: toIsoOrNull(order.fulfilledAt),
    cancelledAt: toIsoOrNull(order.cancelledAt),
    refundedAt: toIsoOrNull(order.refundedAt),
    refundId: order.refundId,
    items: order.items,
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    promotions: order.promotions,
    totalCents: order.totalCents,
    currency: order.currency,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function parseActionPayload(payload: unknown): OrderActionPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const stripeSessionId =
    typeof body.stripeSessionId === "string"
      ? body.stripeSessionId.trim()
      : "";
  const action =
    typeof body.action === "string"
      ? body.action.trim().toLowerCase()
      : "";

  if (
    stripeSessionId.length < 4 ||
    !["fulfill", "cancel", "refund", "mark_paid"].includes(action)
  ) {
    return null;
  }

  return {
    stripeSessionId,
    action: action as AdminOrderAction,
  };
}

function parsePositiveInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function parseDateOrNull(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:orders:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 1, 100);
    const statusParam = searchParams.get("status") || "all";
    const fulfillmentStatusParam = searchParams.get("fulfillmentStatus") || "all";
    const paymentStatusParam = searchParams.get("paymentStatus") || "all";

    const query: AdminOrdersPageQuery = {
      page,
      pageSize,
      q: searchParams.get("q") || "",
      status: statusSet.has(statusParam) ? (statusParam as AdminOrdersPageQuery["status"]) : "all",
      fulfillmentStatus: fulfillmentSet.has(fulfillmentStatusParam)
        ? (fulfillmentStatusParam as AdminOrdersPageQuery["fulfillmentStatus"])
        : "all",
      paymentStatus: paymentStatusParam,
      createdFrom: parseDateOrNull(searchParams.get("createdFrom")),
      createdTo: parseDateOrNull(searchParams.get("createdTo")),
    };

    const result = await getAdminOrdersPage(query);

    return NextResponse.json(
      {
        orders: result.orders.map((order) => serializeOrder(order)),
        pagination: result.pagination,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load orders.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:orders:write");
  if (auth.response) {
    return auth.response;
  }

  const csrfError = requireAdminCsrf(request);
  if (csrfError) {
    return csrfError;
  }

  const rateLimitError = await enforceAdminMutationRateLimit({
    request,
    userId: auth.user.id,
    scope: "admin:orders:post",
    limit: 25,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parseActionPayload(payload);
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "order.mutate",
        resourceType: "order",
        status: "failure",
        message: "Invalid order action payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid order action payload." },
        { status: 400 },
      );
    }

    const existing = await getAdminOrderBySessionId(parsed.stripeSessionId);
    if (!existing) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: `order.${parsed.action}`,
        resourceType: "order",
        resourceId: parsed.stripeSessionId,
        status: "failure",
        message: "Order not found.",
        request,
      });
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    let refundId: string | null = null;
    if (parsed.action === "refund") {
      if (existing.status !== "completed") {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "order.refund",
          resourceType: "order",
          resourceId: parsed.stripeSessionId,
          status: "failure",
          message: "Refund requested for non-completed order.",
          request,
        });
        return NextResponse.json(
          { error: "Only completed payments can be refunded." },
          { status: 400 },
        );
      }
      if (existing.refundedAt) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "order.refund",
          resourceType: "order",
          resourceId: parsed.stripeSessionId,
          status: "failure",
          message: "Refund requested for already-refunded order.",
          request,
        });
        return NextResponse.json(
          { error: "Order has already been refunded." },
          { status: 409 },
        );
      }

      if (existing.paymentProvider !== "stripe") {
        const providerLabel = existing.paymentProvider.replace("_", " ");
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "order.refund",
          resourceType: "order",
          resourceId: parsed.stripeSessionId,
          status: "failure",
          message: `Refund requires provider-side action for ${providerLabel}.`,
          request,
        });
        return NextResponse.json(
          {
            error: `Refund this order from ${providerLabel} and then mark it refunded here.`,
          },
          { status: 400 },
        );
      }

      const stripe = getStripeServer();
      const session = await stripe.checkout.sessions.retrieve(
        parsed.stripeSessionId,
        {
          expand: ["payment_intent"],
        },
      );

      const paymentIntent =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;
      if (!paymentIntent) {
        await recordAdminAuditEvent({
          actorUserId: auth.user.id,
          actorEmail: auth.user.email,
          actorRole: auth.admin.role,
          action: "order.refund",
          resourceType: "order",
          resourceId: parsed.stripeSessionId,
          status: "failure",
          message: "No Stripe payment intent found.",
          request,
        });
        return NextResponse.json(
          { error: "No Stripe payment intent found for this order." },
          { status: 400 },
        );
      }

      const refund = await stripe.refunds.create({
        payment_intent: paymentIntent,
        metadata: {
          source: "admin-order-operation",
          stripeSessionId: parsed.stripeSessionId,
          adminUserId: auth.user.id,
        },
      });

      refundId = refund.id;
    }

    const updated = await applyAdminOrderAction({
      stripeSessionId: parsed.stripeSessionId,
      action: parsed.action,
      refundId,
    });
    if (!updated) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: `order.${parsed.action}`,
        resourceType: "order",
        resourceId: parsed.stripeSessionId,
        status: "failure",
        message: "Order could not be updated.",
        request,
      });
      return NextResponse.json(
        { error: "Order could not be updated." },
        { status: 404 },
      );
    }

    if (parsed.action === "mark_paid" && updated.promotions.length > 0) {
      await incrementPromotionsUsage(
        updated.promotions.map((promotion) => promotion.id),
      );
    }

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: `order.${parsed.action}`,
      resourceType: "order",
      resourceId: parsed.stripeSessionId,
      status: "success",
      message: `Order action "${parsed.action}" applied.`,
      metadata: {
        refundId,
      },
      request,
    });

    return NextResponse.json(
      {
        success: true,
        order: serializeOrder(updated),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    if (error instanceof OrderActionError) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "order.mutate",
        resourceType: "order",
        status: "failure",
        message: error.message,
        request,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const message =
      error instanceof Error ? error.message : "Unable to process order action.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "order.mutate",
      resourceType: "order",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
