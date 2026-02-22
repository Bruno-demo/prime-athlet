import { NextResponse } from "next/server";
import Stripe from "stripe";

import { updateOrderStatus } from "@/lib/orders-repository";
import { incrementPromotionsUsage } from "@/lib/promotions-repository";
import { getStripeServer } from "@/lib/stripe";
import { syncUserBillingProfileFromPayment } from "@/lib/users-repository";

export const runtime = "nodejs";

function mapStripeEventToOrderState(
  event: Stripe.Event,
): { status: "completed" | "expired" | "payment_failed"; paymentStatus: string } | null {
  if (event.type === "checkout.session.completed") {
    return {
      status: "completed",
      paymentStatus: "paid",
    };
  }

  if (event.type === "checkout.session.expired") {
    return {
      status: "expired",
      paymentStatus: "unpaid",
    };
  }

  if (event.type === "checkout.session.async_payment_failed") {
    return {
      status: "payment_failed",
      paymentStatus: "unpaid",
    };
  }

  return null;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET." },
      { status: 500 },
    );
  }

  const stripeSignature = request.headers.get("stripe-signature");
  if (!stripeSignature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 },
    );
  }

  try {
    const stripe = getStripeServer();
    const body = await request.text();
    const event = stripe.webhooks.constructEvent(body, stripeSignature, webhookSecret);
    const mappedStatus = mapStripeEventToOrderState(event);

    if (mappedStatus && event.data.object.object === "checkout.session") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerEmail =
        session.customer_details?.email || session.customer_email || null;

      const statusUpdate = await updateOrderStatus({
        stripeSessionId: session.id,
        status: mappedStatus.status,
        paymentStatus: session.payment_status || mappedStatus.paymentStatus,
        totalCents: session.amount_total || null,
        customerEmail,
      });

      if (
        statusUpdate.becameCompleted &&
        statusUpdate.appliedPromotions.length > 0
      ) {
        await incrementPromotionsUsage(
          statusUpdate.appliedPromotions.map((promotion) => promotion.id),
        );
      }

      if (mappedStatus.status === "completed") {
        try {
          await syncUserBillingProfileFromPayment({
            userId: session.metadata?.userId || null,
            email: customerEmail,
            fullName: session.customer_details?.name || null,
            phone: session.customer_details?.phone || null,
            address: {
              line1: session.customer_details?.address?.line1 || null,
              line2: session.customer_details?.address?.line2 || null,
              city: session.customer_details?.address?.city || null,
              state: session.customer_details?.address?.state || null,
              postalCode: session.customer_details?.address?.postal_code || null,
              country: session.customer_details?.address?.country || null,
            },
          });
        } catch (billingSyncError) {
          console.error("Stripe billing sync failed.", billingSyncError);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
