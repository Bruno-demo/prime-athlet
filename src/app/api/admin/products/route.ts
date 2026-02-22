import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import { readLocalImageMetadata } from "@/lib/admin-images";
import {
  IMAGE_PRESETS,
  matchesExactImagePreset,
} from "@/lib/image-standards";
import {
  getDefaultProductColors,
  getDefaultProductSizes,
  normalizeProductOptionList,
  Product,
  ProductTone,
} from "@/lib/catalog";
import {
  AdminProductSort,
  deleteProductById,
  getAdminProductScopeOptionsPage,
  getAdminProductsPage,
  upsertProduct,
} from "@/lib/products-repository";
import { revalidateStorefrontCaches } from "@/lib/storefront-cache";
import { getTaxonomyValues } from "@/lib/taxonomy-repository";

export const runtime = "nodejs";

const toneSet = new Set<ProductTone>([
  "field",
  "court",
  "street",
  "fitness",
  "outdoor",
]);
const productSortSet = new Set<AdminProductSort>([
  "name-asc",
  "name-desc",
  "price-asc",
  "price-desc",
  "rating-desc",
  "reviews-desc",
]);

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

function toDistinctSortedStrings(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)),
  ).sort((left, right) => left.localeCompare(right));
}

interface AdminProductImageInput {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

interface AdminProductInput {
  id: string;
  name: string;
  sport: string;
  category: string;
  priceCents: number;
  brand: string;
  sku: string;
  stockQuantity: number;
  compareAtPriceCents: number | null;
  tags: string[];
  sizes: string[];
  colors: string[];
  rating: number;
  reviews: number;
  badge: string;
  description: string;
  tone: ProductTone;
  images: AdminProductImageInput[];
}

type ProductPayloadParseResult =
  | { ok: true; value: AdminProductInput }
  | { ok: false; error: string };

function parseDeletePayload(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const body = payload as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (id.length < 2 || id.length > 120) {
    return null;
  }
  return { id };
}

function parseProductPayload(payload: unknown): ProductPayloadParseResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const body = payload as Record<string, unknown>;
  const rawProduct =
    body.product && typeof body.product === "object"
      ? (body.product as Record<string, unknown>)
      : body;

  const id = typeof rawProduct.id === "string" ? rawProduct.id.trim() : "";
  const name = typeof rawProduct.name === "string" ? rawProduct.name.trim() : "";
  const sport = typeof rawProduct.sport === "string" ? rawProduct.sport.trim() : "";
  const category =
    typeof rawProduct.category === "string" ? rawProduct.category.trim() : "";
  const badge = typeof rawProduct.badge === "string" ? rawProduct.badge.trim() : "";
  const brand = typeof rawProduct.brand === "string" ? rawProduct.brand.trim() : "";
  const rawSku = typeof rawProduct.sku === "string" ? rawProduct.sku.trim() : "";
  const sku = rawSku.toUpperCase();
  const tagsRaw = Array.isArray(rawProduct.tags) ? rawProduct.tags : [];
  const sizesRaw = Array.isArray(rawProduct.sizes) ? rawProduct.sizes : [];
  const colorsRaw = Array.isArray(rawProduct.colors) ? rawProduct.colors : [];
  const description =
    typeof rawProduct.description === "string" ? rawProduct.description.trim() : "";
  const tone = typeof rawProduct.tone === "string" ? rawProduct.tone.trim() : "";

  const priceCents =
    typeof rawProduct.priceCents === "number" ? rawProduct.priceCents : Number.NaN;
  const stockQuantity =
    typeof rawProduct.stockQuantity === "number"
      ? rawProduct.stockQuantity
      : Number.NaN;
  const compareAtPriceRaw = rawProduct.compareAtPriceCents;
  const compareAtPriceCents =
    compareAtPriceRaw === null || compareAtPriceRaw === undefined
      ? null
      : typeof compareAtPriceRaw === "number"
        ? compareAtPriceRaw
        : Number.NaN;
  const rating =
    typeof rawProduct.rating === "number" ? rawProduct.rating : Number.NaN;
  const reviews =
    typeof rawProduct.reviews === "number" ? rawProduct.reviews : Number.NaN;

  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) {
    return {
      ok: false,
      error:
        "Product ID must be 2-120 characters using lowercase letters, numbers, and hyphens.",
    };
  }
  if (name.length < 2) {
    return { ok: false, error: "Product name must be at least 2 characters." };
  }
  if (sport.length < 2) {
    return { ok: false, error: "Select a valid sport." };
  }
  if (category.length < 2) {
    return { ok: false, error: "Select a valid category." };
  }
  if (brand.length < 2 || brand.length > 80) {
    return { ok: false, error: "Brand must be between 2 and 80 characters." };
  }
  if (!/^[A-Z0-9][A-Z0-9-]{1,63}$/.test(sku)) {
    return {
      ok: false,
      error:
        "SKU must be 2-64 characters using uppercase letters, numbers, and hyphens.",
    };
  }
  if (badge.length < 2) {
    return { ok: false, error: "Select a valid badge." };
  }
  if (description.length < 12) {
    return { ok: false, error: "Description must be at least 12 characters." };
  }
  if (!toneSet.has(tone as ProductTone)) {
    return { ok: false, error: "Select a valid tone." };
  }
  if (!Number.isInteger(priceCents) || priceCents < 100 || priceCents > 2_000_000) {
    return { ok: false, error: "Price must be an integer between 100 and 2,000,000 cents." };
  }
  if (
    !Number.isInteger(stockQuantity) ||
    stockQuantity < 0 ||
    stockQuantity > 1_000_000
  ) {
    return { ok: false, error: "Stock quantity must be an integer between 0 and 1,000,000." };
  }
  if (compareAtPriceCents !== null) {
    if (
      !Number.isInteger(compareAtPriceCents) ||
      compareAtPriceCents < 100 ||
      compareAtPriceCents > 3_000_000
    ) {
      return {
        ok: false,
        error: "Compare-at price must be an integer between 100 and 3,000,000 cents.",
      };
    }
    if (compareAtPriceCents <= priceCents) {
      return { ok: false, error: "Compare-at price must be higher than the current price." };
    }
  }
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    return { ok: false, error: "Rating must be between 0 and 5." };
  }
  if (!Number.isFinite(reviews) || reviews < 0) {
    return { ok: false, error: "Reviews must be zero or greater." };
  }

  const tags = tagsRaw
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter((tag) => tag.length > 0);
  const uniqueTags = Array.from(new Set(tags));
  if (uniqueTags.length === 0) {
    return { ok: false, error: "Add at least one product tag." };
  }
  if (uniqueTags.length > 12) {
    return { ok: false, error: "A product can include up to 12 tags." };
  }
  const invalidTag = uniqueTags.find((tag) => tag.length < 2 || tag.length > 32);
  if (invalidTag) {
    return {
      ok: false,
      error: `Tag "${invalidTag}" must be between 2 and 32 characters.`,
    };
  }

  const sizes = normalizeProductOptionList(
    sizesRaw,
    getDefaultProductSizes(category),
  );
  const colors = normalizeProductOptionList(
    colorsRaw,
    getDefaultProductColors(sport, category),
  );
  if (sizes.length === 0) {
    return { ok: false, error: "Add at least one available size." };
  }
  if (colors.length === 0) {
    return { ok: false, error: "Add at least one available color." };
  }
  const invalidSize = sizes.find((size) => size.length < 1 || size.length > 24);
  if (invalidSize) {
    return {
      ok: false,
      error: `Size "${invalidSize}" must be between 1 and 24 characters.`,
    };
  }
  const invalidColor = colors.find(
    (color) => color.length < 2 || color.length > 24,
  );
  if (invalidColor) {
    return {
      ok: false,
      error: `Color "${invalidColor}" must be between 2 and 24 characters.`,
    };
  }

  if (!Array.isArray(rawProduct.images) || rawProduct.images.length === 0) {
    return { ok: false, error: "Add at least one product image before saving." };
  }
  if (rawProduct.images.length > 8) {
    return { ok: false, error: "A product can include up to 8 images." };
  }

  const images = rawProduct.images
    .map((image): AdminProductImageInput | null => {
      if (!image || typeof image !== "object") {
        return null;
      }

      const candidate = image as Record<string, unknown>;
      const src = typeof candidate.src === "string" ? candidate.src.trim() : "";
      const alt = typeof candidate.alt === "string" ? candidate.alt.trim() : "";
      const width =
        typeof candidate.width === "number" && Number.isFinite(candidate.width)
          ? Math.floor(candidate.width)
          : undefined;
      const height =
        typeof candidate.height === "number" && Number.isFinite(candidate.height)
          ? Math.floor(candidate.height)
          : undefined;

      if (src.length === 0 || alt.length === 0) {
        return null;
      }

      return { src, alt, width, height };
    })
    .filter((image): image is AdminProductImageInput => image !== null);

  if (images.length !== rawProduct.images.length) {
    return {
      ok: false,
      error: "Each image must include a source path and alt text.",
    };
  }

  return {
    ok: true,
    value: {
      id,
      name,
      sport,
      category,
      priceCents,
      brand,
      sku,
      stockQuantity: Math.floor(stockQuantity),
      compareAtPriceCents:
        compareAtPriceCents === null ? null : Math.floor(compareAtPriceCents),
      tags: uniqueTags,
      sizes,
      colors,
      rating: Number(rating.toFixed(2)),
      reviews: Math.floor(reviews),
      badge,
      description,
      tone: tone as ProductTone,
      images,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminForApi("admin:products:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const page = parsePositiveInt(searchParams.get("page"), 1, 1, 100_000);
    const pageSize = parsePositiveInt(searchParams.get("pageSize"), 24, 1, 100);
    const query = searchParams.get("q") || "";

    if (view === "scope-options") {
      const [scopeOptions, taxonomySports, taxonomyCategories] = await Promise.all([
        getAdminProductScopeOptionsPage({
          q: query,
          page,
          pageSize,
        }),
        getTaxonomyValues("sport"),
        getTaxonomyValues("category"),
      ]);

      return NextResponse.json(
        {
          ...scopeOptions,
          sports: toDistinctSortedStrings([
            ...scopeOptions.sports,
            ...taxonomySports,
          ]),
          categories: toDistinctSortedStrings([
            ...scopeOptions.categories,
            ...taxonomyCategories,
          ]),
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const sortValue = searchParams.get("sort");
    const sort = productSortSet.has(sortValue as AdminProductSort)
      ? (sortValue as AdminProductSort)
      : undefined;

    const [result, taxonomySports, taxonomyCategories] = await Promise.all([
      getAdminProductsPage({
        q: query,
        sport: searchParams.get("sport") || undefined,
        category: searchParams.get("category") || undefined,
        badge: searchParams.get("badge") || undefined,
        sort,
        page,
        pageSize,
      }),
      getTaxonomyValues("sport"),
      getTaxonomyValues("category"),
    ]);

    return NextResponse.json(
      {
        ...result,
        filters: {
          ...result.filters,
          sports: toDistinctSortedStrings([
            ...result.filters.sports,
            ...taxonomySports,
          ]),
          categories: toDistinctSortedStrings([
            ...result.filters.categories,
            ...taxonomyCategories,
          ]),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load products.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:products:write");
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
    scope: "admin:products:post",
    limit: 40,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parseProductPayload(payload);
    if (!parsed.ok) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "product.upsert",
        resourceType: "product",
        status: "failure",
        message: `Invalid product payload: ${parsed.error}`,
        request,
      });
      return NextResponse.json(
        { error: parsed.error },
        { status: 400 },
      );
    }
    const productInput = parsed.value;

    const [taxonomySports, taxonomyCategories] = await Promise.all([
      getTaxonomyValues("sport"),
      getTaxonomyValues("category"),
    ]);
    const hasSport =
      taxonomySports.length === 0 ||
      taxonomySports.some(
        (value) => value.toLowerCase() === productInput.sport.toLowerCase(),
      );
    const hasCategory =
      taxonomyCategories.length === 0 ||
      taxonomyCategories.some(
        (value) => value.toLowerCase() === productInput.category.toLowerCase(),
      );
    if (!hasSport || !hasCategory) {
      const message = !hasSport
        ? `Sport "${productInput.sport}" is not registered. Create it in taxonomy settings first.`
        : `Category "${productInput.category}" is not registered. Create it in taxonomy settings first.`;
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "product.upsert",
        resourceType: "product",
        resourceId: productInput.id,
        status: "failure",
        message,
        request,
      });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const imagePreset = IMAGE_PRESETS.product;
    const validatedImages: Product["images"] = [];
    for (const image of productInput.images) {
      if (image.src.startsWith("/")) {
        const metadata = await readLocalImageMetadata(image.src);
        if (!metadata) {
          await recordAdminAuditEvent({
            actorUserId: auth.user.id,
            actorEmail: auth.user.email,
            actorRole: auth.admin.role,
            action: "product.upsert",
            resourceType: "product",
            resourceId: productInput.id,
            status: "failure",
            message: `Local image "${image.src}" was not found or could not be read.`,
            request,
          });
          return NextResponse.json(
            { error: `Image "${image.src}" was not found or could not be read.` },
            { status: 400 },
          );
        }

        if (
          !matchesExactImagePreset(
            "product",
            metadata.width,
            metadata.height,
          )
        ) {
          await recordAdminAuditEvent({
            actorUserId: auth.user.id,
            actorEmail: auth.user.email,
            actorRole: auth.admin.role,
            action: "product.upsert",
            resourceType: "product",
            resourceId: productInput.id,
            status: "failure",
            message: `Image "${image.src}" failed dimension validation.`,
            request,
          });
          return NextResponse.json(
            {
              error: `Image "${image.src}" must be exactly ${imagePreset.exactWidth}x${imagePreset.exactHeight}px.`,
            },
            { status: 400 },
          );
        }

        validatedImages.push({
          src: metadata.src,
          alt: image.alt,
          width: metadata.width,
          height: metadata.height,
        });
      } else {
        const width = typeof image.width === "number" ? image.width : null;
        const height = typeof image.height === "number" ? image.height : null;
        if (
          width === null ||
          height === null ||
          !matchesExactImagePreset("product", width, height)
        ) {
          await recordAdminAuditEvent({
            actorUserId: auth.user.id,
            actorEmail: auth.user.email,
            actorRole: auth.admin.role,
            action: "product.upsert",
            resourceType: "product",
            resourceId: productInput.id,
            status: "failure",
            message: `Remote image "${image.src}" requires exact ${imagePreset.exactWidth}x${imagePreset.exactHeight}px metadata.`,
            request,
          });
          return NextResponse.json(
            {
              error: `Remote image "${image.src}" must include exact ${imagePreset.exactWidth}x${imagePreset.exactHeight}px metadata.`,
            },
            { status: 400 },
          );
        }

        validatedImages.push({
          src: image.src,
          alt: image.alt,
          width,
          height,
        });
      }
    }

    const product: Product = {
      ...productInput,
      images: validatedImages,
    };

    await upsertProduct(product);
    revalidateStorefrontCaches();

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "product.upsert",
      resourceType: "product",
      resourceId: productInput.id,
      status: "success",
      message: "Product upserted.",
      metadata: {
        imageCount: validatedImages.length,
      },
      request,
    });

    return NextResponse.json(
      { success: true, product },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save product.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "product.upsert",
      resourceType: "product",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForApi("admin:products:write");
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
    scope: "admin:products:delete",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parseDeletePayload(payload);
    if (!parsed) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "product.delete",
        resourceType: "product",
        status: "failure",
        message: "Invalid delete payload.",
        request,
      });
      return NextResponse.json(
        { error: "Invalid delete payload." },
        { status: 400 },
      );
    }

    await deleteProductById(parsed.id);
    revalidateStorefrontCaches();
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "product.delete",
      resourceType: "product",
      resourceId: parsed.id,
      status: "success",
      message: "Product deleted.",
      request,
    });
    return NextResponse.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete product.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "product.delete",
      resourceType: "product",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
