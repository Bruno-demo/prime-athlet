import { redirect } from "next/navigation";
import { BadgeCheck, LockKeyhole } from "lucide-react";
import { AuthForm } from "@/components/auth-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAuthenticatedUser } from "@/lib/auth";
import { sanitizeNextPath } from "@/lib/navigation";
interface SignUpPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}
export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const user = await getAuthenticatedUser();
  if (user) {
    if (!user.emailVerifiedAt) {
      redirect(`/auth/check-email?email=${encodeURIComponent(user.email)}`);
    }
    redirect("/account");
  }
  const resolvedSearchParams = await searchParams;
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
            <LockKeyhole className="h-4 w-4" /> Professional Account Setup
          </p>
          <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
            Create Your Account
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Set up secure authentication once and manage billing, checkout, and
            order records from a single account.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <AuthForm mode="sign-up" nextPath={nextPath} />
          <aside className="surface-card rounded-3xl p-6 sm:p-7">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-brand">
              <BadgeCheck className="h-5 w-5 text-accent" /> Security Standards
            </h2>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              <li>Passwords are stored using salted cryptographic hashing.</li>
              <li>
                Sessions run with httpOnly cookies and server-side validation.
              </li>
              <li>
                Billing profile updates are protected behind authenticated APIs.
              </li>
            </ul>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
