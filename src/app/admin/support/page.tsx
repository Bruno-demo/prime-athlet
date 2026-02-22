import Link from "next/link";
import { ArrowLeft, CircleHelp, ShieldCheck } from "lucide-react";

import { AdminSupportPanel } from "@/components/admin-support-panel";
import { requireAdminForPage } from "@/lib/admin-auth";
import { hasAdminPermission } from "@/lib/admin-roles";

export const runtime = "nodejs";

export default async function AdminSupportPage() {
  const { user: adminUser, admin: adminAccess } =
    await requireAdminForPage("admin:orders:read");
  const canWrite = hasAdminPermission(adminAccess.role, "admin:orders:write");

  return (
    <div className="min-h-screen admin-page-shell">
      <main className="section-shell py-6 sm:py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              <ShieldCheck className="h-4 w-4" />
              Administrator Console
            </p>
            <h1 className="font-display mt-2 text-3xl leading-tight text-brand sm:text-4xl">
              Support Operations
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
              Central queue for customer concerns across orders, payment,
              account, and technical requests.
            </p>
          </div>
          <div className="space-y-2 text-left sm:text-right">
            <div className="rounded-xl border border-brand/15 bg-surface-soft px-4 py-3">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                <CircleHelp className="h-3.5 w-3.5" />
                Signed in as {adminAccess.role}
              </p>
              <p className="mt-1 text-sm font-semibold text-brand">
                {adminUser.email}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to admin
              </Link>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold btn-secondary"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to website
              </Link>
            </div>
          </div>
        </div>

        <AdminSupportPanel canWriteByRole={canWrite} />
      </main>
    </div>
  );
}
