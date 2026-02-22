import { NextResponse } from "next/server";

import { clearSessionCookieAndRecord } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await clearSessionCookieAndRecord();
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign out.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
