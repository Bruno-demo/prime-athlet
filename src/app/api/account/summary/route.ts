import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { getOrdersByCustomerEmail } from "@/lib/orders-repository";
import { getWishlistProductIdsByUserId } from "@/lib/wishlist-repository";

export const runtime = "nodejs";

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({
        authenticated: false,
        user: null,
        summary: {
          orderCount: 0,
          activeOrderCount: 0,
          completedOrderCount: 0,
          wishlistCount: 0,
          totalSpentCents: 0,
          recentOrderAt: null,
        },
      });
    }

    const [orders, wishlistProductIds] = await Promise.all([
      getOrdersByCustomerEmail(user.email, { limit: 100 }),
      getWishlistProductIdsByUserId(user.id),
    ]);

    const completedOrders = orders.filter((order) => order.status === "completed");
    const activeOrders = orders.filter((order) => order.status === "created");
    const totalSpentCents = completedOrders.reduce((sum, order) => {
      return (
        sum +
        (order.totalCents ??
          Math.max(order.subtotalCents - order.discountCents, 0) +
            order.shippingCents)
      );
    }, 0);

    return jsonNoStore({
      authenticated: true,
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
      },
      summary: {
        orderCount: orders.length,
        activeOrderCount: activeOrders.length,
        completedOrderCount: completedOrders.length,
        wishlistCount: wishlistProductIds.length,
        totalSpentCents,
        recentOrderAt: orders[0]?.createdAt.toISOString() ?? null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load summary.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
