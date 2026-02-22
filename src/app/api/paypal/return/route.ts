import { NextResponse } from "next/server";

import { updateOrderStatus } from "@/lib/orders-repository";
import { capturePayPalOrder } from "@/lib/paypal";
import { incrementPromotionsUsage } from "@/lib/promotions-repository";
import { syncUserBillingProfileFromPayment } from "@/lib/users-repository";

export const runtime = "nodejs";

function buildCartRedirectUrl(
  request: Request,
  status: "success" | "cancelled" | "payment_failed",
  message?: string,
): URL {
  const url = new URL("/cart", request.url);
  url.searchParams.set("status", status);
  url.searchParams.set("provider", "paypal");
  if (message) {
    url.searchParams.set("message", message.slice(0, 160));
  }
  return url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.redirect(
      buildCartRedirectUrl(request, "cancelled", "Missing PayPal token."),
    );
  }

  try {
    const capture = await capturePayPalOrder(token);
    const sessionId = `paypal_${capture.orderId}`;

    if (capture.status === "COMPLETED") {
      const statusUpdate = await updateOrderStatus({
        stripeSessionId: sessionId,
        status: "completed",
        paymentStatus: "paid",
        totalCents: capture.totalCents,
        customerEmail: capture.payerEmail,
      });

      if (
        statusUpdate.becameCompleted &&
        statusUpdate.appliedPromotions.length > 0
      ) {
        await incrementPromotionsUsage(
          statusUpdate.appliedPromotions.map((promotion) => promotion.id),
        );
      }

      try {
        await syncUserBillingProfileFromPayment({
          email: capture.payerEmail,
          fullName: capture.payerName,
          address: capture.address,
        });
      } catch (billingSyncError) {
        console.error("PayPal billing sync failed.", billingSyncError);
      }

      return NextResponse.redirect(buildCartRedirectUrl(request, "success"));
    }

    await updateOrderStatus({
      stripeSessionId: sessionId,
      status: "payment_failed",
      paymentStatus: "unpaid",
      totalCents: capture.totalCents,
      customerEmail: capture.payerEmail,
    });

    return NextResponse.redirect(
      buildCartRedirectUrl(
        request,
        "payment_failed",
        `PayPal status: ${capture.status.toLowerCase()}`,
      ),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /ORDER_ALREADY_CAPTURED/i.test(error.message)
    ) {
      await updateOrderStatus({
        stripeSessionId: `paypal_${token}`,
        status: "completed",
        paymentStatus: "paid",
      });
      return NextResponse.redirect(buildCartRedirectUrl(request, "success"));
    }

    const message =
      error instanceof Error ? error.message : "PayPal confirmation failed.";
    return NextResponse.redirect(
      buildCartRedirectUrl(request, "payment_failed", message),
    );
  }
}
