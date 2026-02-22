import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import {
  getDailyOrderTimeSeries,
  getMonthlyOrderTimeSeries,
  getOrderMetrics,
  getRecentAdminOrders,
} from "@/lib/orders-repository";
import { getAllProducts } from "@/lib/products-repository";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminForApi("admin:summary:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const [products, orderMetrics, recentOrders, monthlySeries, dailySeries] = await Promise.all([
      getAllProducts(),
      getOrderMetrics(),
      getRecentAdminOrders(12),
      getMonthlyOrderTimeSeries(6),
      getDailyOrderTimeSeries(14),
    ]);

    const totalReviews = products.reduce((sum, product) => sum + product.reviews, 0);
    const averageRating =
      products.length > 0
        ? products.reduce((sum, product) => sum + product.rating, 0) / products.length
        : 0;

    return NextResponse.json(
      {
        products: {
          count: products.length,
          totalReviews,
          averageRating: Number(averageRating.toFixed(2)),
        },
        orders: orderMetrics,
        timeSeries: {
          monthly: monthlySeries,
          daily: dailySeries,
        },
        recentOrders,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load admin summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
