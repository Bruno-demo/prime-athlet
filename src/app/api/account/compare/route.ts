import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";
import {
  addCompareProduct,
  getCompareProductIdsByUserId,
  removeCompareProduct,
  setCompareProductIds,
} from "@/lib/compare-repository";
import { getProductById, getProductsByIds } from "@/lib/products-repository";

export const runtime = "nodejs";

const MAX_COMPARE_ITEMS = 4;

interface ComparePayload {
  productId: string;
}

interface CompareBulkPayload {
  productIds: string[];
}

function jsonNoStore(data: unknown, init?: Omit<ResponseInit, "headers">): NextResponse {
  return NextResponse.json(data, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function parseComparePayload(payload: unknown): ComparePayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const productId = typeof body.productId === "string" ? body.productId.trim() : "";

  if (productId.length < 2 || productId.length > 120) {
    return null;
  }

  return { productId };
}

function parseCompareBulkPayload(payload: unknown): CompareBulkPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  if (!Array.isArray(body.productIds)) {
    return null;
  }

  const productIds = Array.from(
    new Set(
      body.productIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value.length >= 2 && value.length <= 120),
    ),
  ).slice(0, MAX_COMPARE_ITEMS);

  return { productIds };
}

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

async function hydrateCompareState(productIds: string[]): Promise<{
  productIds: string[];
  products: Awaited<ReturnType<typeof getProductsByIds>>;
}> {
  const products = await getProductsByIds(productIds);
  const orderedProductIds = products.map((product) => product.id).slice(0, MAX_COMPARE_ITEMS);
  const orderedProducts = products.slice(0, MAX_COMPARE_ITEMS);

  return {
    productIds: orderedProductIds,
    products: orderedProducts,
  };
}

async function getCompareStateByUserId(userId: string): Promise<{
  productIds: string[];
  products: Awaited<ReturnType<typeof getProductsByIds>>;
  count: number;
}> {
  const storedProductIds = await getCompareProductIdsByUserId(userId);
  const hydrated = await hydrateCompareState(storedProductIds);

  if (!sameStringArray(storedProductIds, hydrated.productIds)) {
    await setCompareProductIds(userId, hydrated.productIds);
  }

  return {
    productIds: hydrated.productIds,
    products: hydrated.products,
    count: hydrated.productIds.length,
  };
}

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({
        authenticated: false,
        productIds: [],
        products: [],
        count: 0,
      });
    }

    const state = await getCompareStateByUserId(user.id);
    return jsonNoStore({
      authenticated: true,
      productIds: state.productIds,
      products: state.products,
      count: state.count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load compare list.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({ error: "Authentication required." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return jsonNoStore(
        { error: "Verify your email before using compare." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsed = parseCompareBulkPayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid compare payload." }, { status: 400 });
    }

    const hydrated = await hydrateCompareState(parsed.productIds);
    const productIds = await setCompareProductIds(user.id, hydrated.productIds);
    const state = await hydrateCompareState(productIds);

    return jsonNoStore({
      authenticated: true,
      productIds: state.productIds,
      products: state.products,
      count: state.productIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update compare list.";
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
      return jsonNoStore(
        { error: "Verify your email before using compare." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsed = parseComparePayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid compare payload." }, { status: 400 });
    }

    const product = await getProductById(parsed.productId);
    if (!product) {
      return jsonNoStore({ error: "Product not found." }, { status: 400 });
    }

    await addCompareProduct(user.id, product.id);
    const state = await getCompareStateByUserId(user.id);

    return jsonNoStore({
      authenticated: true,
      productIds: state.productIds,
      products: state.products,
      count: state.count,
      productId: product.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update compare list.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return jsonNoStore({ error: "Authentication required." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return jsonNoStore(
        { error: "Verify your email before using compare." },
        { status: 403 },
      );
    }

    const payload = await request.json();
    const parsed = parseComparePayload(payload);
    if (!parsed) {
      return jsonNoStore({ error: "Invalid compare payload." }, { status: 400 });
    }

    await removeCompareProduct(user.id, parsed.productId);
    const state = await getCompareStateByUserId(user.id);

    return jsonNoStore({
      authenticated: true,
      productIds: state.productIds,
      products: state.products,
      count: state.count,
      productId: parsed.productId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update compare list.";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
