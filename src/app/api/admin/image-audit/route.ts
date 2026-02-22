import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { readLocalImageMetadata } from "@/lib/admin-images";
import { IMAGE_PRESETS, matchesExactImagePreset } from "@/lib/image-standards";
import { getAllProducts } from "@/lib/products-repository";

export const runtime = "nodejs";

interface AuditIssue {
  src: string;
  reason: string;
  width?: number;
  height?: number;
}

export async function GET() {
  const auth = await requireAdminForApi("admin:media:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const products = await getAllProducts();
    const imageEntries = Array.from(
      new Map(
        products.flatMap((product) =>
          product.images.map((image) => [
            image.src,
            {
              src: image.src,
              width: image.width,
              height: image.height,
            },
          ]),
        ),
      ).values(),
    );

    const issues: AuditIssue[] = [];
    const preset = IMAGE_PRESETS.product;
    let compliantCount = 0;

    for (const entry of imageEntries) {
      if (entry.src.startsWith("/")) {
        const metadata = await readLocalImageMetadata(entry.src);
        if (!metadata) {
          issues.push({
            src: entry.src,
            reason: "Missing local file or unsupported image format.",
          });
          continue;
        }

        if (!matchesExactImagePreset("product", metadata.width, metadata.height)) {
          issues.push({
            src: entry.src,
            reason: `Expected ${preset.exactWidth}x${preset.exactHeight}px.`,
            width: metadata.width,
            height: metadata.height,
          });
          continue;
        }

        compliantCount += 1;
        continue;
      }

      if (
        typeof entry.width !== "number" ||
        typeof entry.height !== "number" ||
        !matchesExactImagePreset("product", entry.width, entry.height)
      ) {
        issues.push({
          src: entry.src,
          reason: `Remote image metadata missing or invalid. Expected ${preset.exactWidth}x${preset.exactHeight}px.`,
          width: entry.width,
          height: entry.height,
        });
        continue;
      }

      compliantCount += 1;
    }

    return NextResponse.json(
      {
        standards: {
          product: preset,
        },
        summary: {
          totalImages: imageEntries.length,
          compliantImages: compliantCount,
          nonCompliantImages: issues.length,
          complianceRate:
            imageEntries.length > 0
              ? Number(((compliantCount / imageEntries.length) * 100).toFixed(2))
              : 100,
        },
        issues,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to audit images.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
