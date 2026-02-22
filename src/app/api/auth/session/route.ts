import { NextResponse } from "next/server";

import { getAuthenticatedUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    return NextResponse.json(
      user ? { authenticated: true, user } : { authenticated: false, user: null },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to read session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
