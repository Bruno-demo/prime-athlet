import { NextResponse } from "next/server";

import { requireAdminForApi } from "@/lib/admin-auth";
import { issueAdminCsrfToken } from "@/lib/admin-security";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminForApi("admin:dashboard:read");
  if (auth.response) {
    return auth.response;
  }

  try {
    const token = await issueAdminCsrfToken();
    return NextResponse.json(
      {
        token,
        role: auth.admin.role,
        permissions: auth.admin.permissions,
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
        : "Unable to initialize admin security token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
