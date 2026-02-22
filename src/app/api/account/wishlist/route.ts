import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import { getProductById } from "@/lib/products-repository";
import {
  addWishlistProduct,
  getWishlistProductIdsByUserId,
  removeWishlistProduct,
} from "@/lib/wishlist-repository";

export const runtime = "nodejs";

interface WishlistPayload {
  productId: string;
}

function parseWishlistPayload(payload: unknown): WishlistPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";

  if (productId.length < 2 || productId.length > 120) {
    return null;
  }

  return {
    productId,
  };
}

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
        productIds: [],
        count: 0,
      });
    }

    const productIds = await getWishlistProductIdsByUserId(user.id);
    return jsonNoStore({
      authenticated: true,
      productIds,
      count: productIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load wishlist.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({ error: "Authentication required." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return jsonNoStore({ error: "Verify your email before using wishlist." }, { status: 403 });
    }

    const payload = await request.json();
    const parsed = parseWishlistPayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid wishlist payload." }, { status: 400 });
    }

    const product = await getProductById(parsed.productId);
    if (!product) {
      return jsonNoStore({ error: "Product not found." }, { status: 400 });
    }

    const productIds = await addWishlistProduct(user.id, product.id);
    return jsonNoStore({
      productIds,
      count: productIds.length,
      productId: product.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update wishlist.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({ error: "Authentication required." }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = parseWishlistPayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid wishlist payload." }, { status: 400 });
    }

    const product = await getProductById(parsed.productId);
    const normalizedProductId = product?.id ?? parsed.productId;
    const productIds = await removeWishlistProduct(user.id, normalizedProductId);

    return jsonNoStore({
      productIds,
      count: productIds.length,
      productId: normalizedProductId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update wishlist.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
