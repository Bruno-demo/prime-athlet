import { NextResponse } from "next/server";

import { getShippingSettings } from "@/lib/shipping-settings-repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getShippingSettings();
    return NextResponse.json(
      {
        flatRateCents: settings.flatRateCents,
        freeShippingThresholdCents: settings.freeShippingThresholdCents,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load shipping settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
