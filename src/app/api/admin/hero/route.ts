import { NextResponse } from "next/server";

import { ProductImage } from "@/lib/catalog";
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
  deleteHeroSlideById,
  getAdminHeroSlides,
  HeroSlideUpsertInput,
  upsertHeroSlide,
} from "@/lib/hero-slides-repository";
import { revalidateStorefrontCaches } from "@/lib/storefront-cache";

export const runtime = "nodejs";

const heroIdPattern = /^[a-z0-9][a-z0-9-]{1,119}$/;

interface HeroSlideImageInput {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

interface HeroSlideInput {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  image: HeroSlideImageInput;
  isActive: boolean;
  sortOrder: number;
}

function normalizeHeroId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function parseDeletePayload(payload: unknown): { id: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const body = payload as Record<string, unknown>;
  const id = typeof body.id === "string" ? normalizeHeroId(body.id) : "";
  if (!heroIdPattern.test(id)) {
    return null;
  }

  return { id };
}

type ParseHeroPayloadResult =
  | { ok: true; value: HeroSlideInput }
  | { ok: false; error: string };

function parseHeroPayload(payload: unknown): ParseHeroPayloadResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const body = payload as Record<string, unknown>;
  const rawSlide =
    body.slide && typeof body.slide === "object"
      ? (body.slide as Record<string, unknown>)
      : body;

  const id = typeof rawSlide.id === "string" ? normalizeHeroId(rawSlide.id) : "";
  const title = typeof rawSlide.title === "string" ? rawSlide.title.trim() : "";
  const subtitle =
    typeof rawSlide.subtitle === "string" ? rawSlide.subtitle.trim() : "";
  const badge = typeof rawSlide.badge === "string" ? rawSlide.badge.trim() : "";
  const href = typeof rawSlide.href === "string" ? rawSlide.href.trim() : "";
  const isActive = Boolean(rawSlide.isActive);
  const sortOrder =
    typeof rawSlide.sortOrder === "number" && Number.isFinite(rawSlide.sortOrder)
      ? Math.floor(rawSlide.sortOrder)
      : Number.NaN;

  if (!heroIdPattern.test(id)) {
    return {
      ok: false,
      error:
        "Hero slide ID must be 2-120 characters using lowercase letters, numbers, and hyphens.",
    };
  }
  if (title.length < 3 || title.length > 120) {
    return { ok: false, error: "Title must be between 3 and 120 characters." };
  }
  if (subtitle.length < 12 || subtitle.length > 280) {
    return { ok: false, error: "Subtitle must be between 12 and 280 characters." };
  }
  if (badge.length < 2 || badge.length > 40) {
    return { ok: false, error: "Badge must be between 2 and 40 characters." };
  }
  if (href.length < 1 || href.length > 220 || !href.startsWith("/")) {
    return {
      ok: false,
      error: "Link must be a valid internal path starting with '/'.",
    };
  }
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10_000) {
    return { ok: false, error: "Sort order must be an integer between 0 and 10,000." };
  }

  if (!rawSlide.image || typeof rawSlide.image !== "object") {
    return { ok: false, error: "Hero image is required." };
  }

  const rawImage = rawSlide.image as Record<string, unknown>;
  const src = typeof rawImage.src === "string" ? rawImage.src.trim() : "";
  const alt = typeof rawImage.alt === "string" ? rawImage.alt.trim() : "";
  const width =
    typeof rawImage.width === "number" && Number.isFinite(rawImage.width)
      ? Math.floor(rawImage.width)
      : undefined;
  const height =
    typeof rawImage.height === "number" && Number.isFinite(rawImage.height)
      ? Math.floor(rawImage.height)
      : undefined;

  if (!src || !alt) {
    return {
      ok: false,
      error: "Hero image must include both source path and alt text.",
    };
  }

  return {
    ok: true,
    value: {
      id,
      title,
      subtitle,
      badge,
      href,
      isActive,
      sortOrder,
      image: {
        src,
        alt,
        width,
        height,
      },
    },
  };
}

export async function GET() {
  const auth = await requireAdminForApi("admin:media:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const slides = await getAdminHeroSlides();
    return NextResponse.json(
      { slides },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load hero slides.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminForApi("admin:media:write");
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
    scope: "admin:hero:post",
    limit: 30,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const payload = await request.json();
    const parsed = parseHeroPayload(payload);
    if (!parsed.ok) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "hero.upsert",
        resourceType: "hero_slide",
        status: "failure",
        message: `Invalid hero payload: ${parsed.error}`,
        request,
      });
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const slideInput = parsed.value;
    const heroPreset = IMAGE_PRESETS.hero;
    let validatedImage: ProductImage;

    if (slideInput.image.src.startsWith("/")) {
      const metadata = await readLocalImageMetadata(slideInput.image.src);
      if (!metadata) {
        return NextResponse.json(
          { error: `Hero image "${slideInput.image.src}" was not found or could not be read.` },
          { status: 400 },
        );
      }
      if (!matchesExactImagePreset("hero", metadata.width, metadata.height)) {
        return NextResponse.json(
          {
            error: `Hero image must be exactly ${heroPreset.exactWidth}x${heroPreset.exactHeight}px.`,
          },
          { status: 400 },
        );
      }

      validatedImage = {
        src: metadata.src,
        alt: slideInput.image.alt,
        width: metadata.width,
        height: metadata.height,
      };
    } else {
      const width =
        typeof slideInput.image.width === "number" ? slideInput.image.width : null;
      const height =
        typeof slideInput.image.height === "number" ? slideInput.image.height : null;
      if (
        width === null ||
        height === null ||
        !matchesExactImagePreset("hero", width, height)
      ) {
        return NextResponse.json(
          {
            error: `Remote hero image must include exact ${heroPreset.exactWidth}x${heroPreset.exactHeight}px metadata.`,
          },
          { status: 400 },
        );
      }

      validatedImage = {
        src: slideInput.image.src,
        alt: slideInput.image.alt,
        width,
        height,
      };
    }

    const upsertInput: HeroSlideUpsertInput = {
      ...slideInput,
      image: validatedImage,
    };

    const saved = await upsertHeroSlide(upsertInput);
    revalidateStorefrontCaches();
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "hero.upsert",
      resourceType: "hero_slide",
      resourceId: saved.id,
      status: "success",
      message: "Hero slide upserted.",
      metadata: {
        isActive: saved.isActive,
        sortOrder: saved.sortOrder,
      },
      request,
    });

    return NextResponse.json(
      { success: true, slide: saved },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save hero slide.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "hero.upsert",
      resourceType: "hero_slide",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminForApi("admin:media:write");
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
    scope: "admin:hero:delete",
    limit: 25,
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
        action: "hero.delete",
        resourceType: "hero_slide",
        status: "failure",
        message: "Invalid delete payload.",
        request,
      });
      return NextResponse.json({ error: "Invalid delete payload." }, { status: 400 });
    }

    await deleteHeroSlideById(parsed.id);
    revalidateStorefrontCaches();
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "hero.delete",
      resourceType: "hero_slide",
      resourceId: parsed.id,
      status: "success",
      message: "Hero slide deleted.",
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
      error instanceof Error ? error.message : "Unable to delete hero slide.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "hero.delete",
      resourceType: "hero_slide",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
