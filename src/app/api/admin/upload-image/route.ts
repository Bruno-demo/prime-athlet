import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { recordAdminAuditEvent } from "@/lib/admin-audit";
import {
  enforceAdminMutationRateLimit,
  requireAdminCsrf,
} from "@/lib/admin-security";
import { readImageDimensions } from "@/lib/image-dimensions";
import {
  IMAGE_PRESETS,
  formatFileSize,
  isKnownImagePreset,
  matchesExactImagePreset,
} from "@/lib/image-standards";
import { storeMediaInObjectStorage } from "@/lib/media-storage";

export const runtime = "nodejs";

function slugifyFileName(value: string): string {
  const lowered = value.toLowerCase().trim();
  const safe = lowered.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-");
  return safe.replace(/^-+|-+$/g, "") || "image";
}

function extensionFromMimeType(mimeType: string): ".jpg" | ".png" | null {
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  return null;
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
    scope: "admin:upload-image:post",
    limit: 20,
    windowMs: 60_000,
  });
  if (rateLimitError) {
    return rateLimitError;
  }

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const presetEntry = formData.get("preset");

    if (!(fileEntry instanceof File)) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Image file is missing.",
        request,
      });
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const presetValue = typeof presetEntry === "string" ? presetEntry : "product";
    if (!isKnownImagePreset(presetValue)) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Unknown image preset.",
        request,
      });
      return NextResponse.json({ error: "Unknown image preset." }, { status: 400 });
    }
    const preset = IMAGE_PRESETS[presetValue];

    if (!preset.acceptedMimeTypes.includes(fileEntry.type)) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Unsupported image mime type.",
        metadata: {
          mimeType: fileEntry.type,
        },
        request,
      });
      return NextResponse.json(
        {
          error: `Unsupported format. Allowed: ${preset.acceptedMimeTypes.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    if (fileEntry.size > preset.maxFileSizeBytes) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Image exceeded max file size.",
        metadata: {
          fileSizeBytes: fileEntry.size,
          maxFileSizeBytes: preset.maxFileSizeBytes,
        },
        request,
      });
      return NextResponse.json(
        {
          error: `Image is too large. Max size is ${formatFileSize(preset.maxFileSizeBytes)}.`,
        },
        { status: 400 },
      );
    }

    const extension = extensionFromMimeType(fileEntry.type);
    if (!extension) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Unsupported file extension.",
        request,
      });
      return NextResponse.json({ error: "Unsupported file format." }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
    const dimensions = readImageDimensions(fileBuffer);
    if (!dimensions) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Unable to detect image dimensions.",
        request,
      });
      return NextResponse.json(
        { error: "Unable to detect image dimensions." },
        { status: 400 },
      );
    }

    if (
      !matchesExactImagePreset(
        presetValue,
        dimensions.width,
        dimensions.height,
      )
    ) {
      await recordAdminAuditEvent({
        actorUserId: auth.user.id,
        actorEmail: auth.user.email,
        actorRole: auth.admin.role,
        action: "media.upload",
        resourceType: "media",
        status: "failure",
        message: "Image dimensions do not match preset.",
        metadata: {
          requiredWidth: preset.exactWidth,
          requiredHeight: preset.exactHeight,
          width: dimensions.width,
          height: dimensions.height,
        },
        request,
      });
      return NextResponse.json(
        {
          error: `Invalid dimensions. Required ${preset.exactWidth}x${preset.exactHeight}px for ${preset.label}.`,
        },
        { status: 400 },
      );
    }

    const safeFileName = slugifyFileName(fileEntry.name.replace(/\.[^.]+$/, ""));
    const uniqueStamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const objectKey = path.posix.join("products", "admin", `${uniqueStamp}-${safeFileName}${extension}`);

    const objectStorage = await storeMediaInObjectStorage({
      key: objectKey,
      body: fileBuffer,
      contentType: fileEntry.type,
    });

    let src: string;
    let storage: "local" | "s3";
    if (objectStorage) {
      src = objectStorage.src;
      storage = "s3";
    } else {
      const destination = path.join(process.cwd(), "public", ...objectKey.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, fileBuffer);
      src = `/${objectKey}`;
      storage = "local";
    }

    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "media.upload",
      resourceType: "media",
      resourceId: src,
      status: "success",
      message: "Image uploaded.",
      metadata: {
        preset: presetValue,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: fileEntry.size,
        storage,
      },
      request,
    });

    return NextResponse.json(
      {
        src,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: fileEntry.size,
        preset: presetValue,
        storage,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image upload failed.";
    await recordAdminAuditEvent({
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
      actorRole: auth.admin.role,
      action: "media.upload",
      resourceType: "media",
      status: "failure",
      message,
      request,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
