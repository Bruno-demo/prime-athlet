import { redirect } from "next/navigation";
import { ShieldCheck, Sparkles } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAuthenticatedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/navigation";
interface SignInPageProps {
  searchParams: Promise<{
    next?: string | string[];
    adminReauth?: string | string[];
  }>;
}
export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const adminReauthParam =
    typeof resolvedSearchParams.adminReauth === "string"
      ? resolvedSearchParams.adminReauth
      : undefined;
  const adminReauth = adminReauthParam === "1" || adminReauthParam === "true";
  const user = await getAuthenticatedUser();
  if (user && !adminReauth) {
    if (!user.emailVerifiedAt) {
      redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
    }
    redirect("/account");
  }
  const nextParam =
    typeof resolvedSearchParams.next === "string"
      ? resolvedSearchParams.next
      : undefined;
  const nextPath = sanitizeNextPath(nextParam);
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-8 max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            <ShieldCheck className="h-4 w-4" /> Secure Authentication
          </p>
          <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
            Welcome Back
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Sign in to continue checkout with protected billing details and
            consistent order tracking.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <AuthForm mode="sign-in" nextPath={nextPath} />
          <aside className="surface-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
              <Sparkles className="h-5 w-5 text-accent" /> Why Sign In
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>
                Store billing details securely for faster Stripe checkout.
              </li>
              <li>
                Review payment status and purchase history in one dashboard.
              </li>
              <li>
                Keep your order activity tied to a verified account email.
              </li>
            </ul>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
