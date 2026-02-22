import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck, ShieldCheck } from "lucide-react";
import { ResendVerificationForm } from "@/components/resend-verification-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAuthenticatedUser } from "@/lib/auth";
interface CheckEmailPageProps {
  searchParams: Promise<{
    email?: string | string[];
  }>;
}
export default async function CheckEmailPage({
  searchParams,
}: CheckEmailPageProps) {
  const currentUser = await getAuthenticatedUser();
  if (currentUser?.emailVerifiedAt) {
    redirect("/account");
  }
  const resolvedSearchParams = await searchParams;
  const email =
    typeof resolvedSearchParams.email === "string"
      ? resolvedSearchParams.email
      : currentUser?.email || "";
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <section className="glass-card mx-auto w-full max-w-2xl rounded-3xl p-6 sm:p-8">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            <MailCheck className="h-3.5 w-3.5 text-accent" /> Verification
            Required
          </p>
          <h1 className="mt-4 font-display text-4xl leading-none text-brand sm:text-5xl">
            Check Your Email
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            We sent a verification link to
            <span className="font-semibold text-brand">
              {email || "your email"}
            </span>
            . Open that link to activate your account.
          </p>
          <div className="mt-6 rounded-2xl border border-brand/15 bg-surface-soft p-4">
            <h2 className="inline-flex items-center gap-2 text-base font-semibold text-brand">
              <ShieldCheck className="h-4 w-4 text-accent" /> Didn&apos;t
              receive it?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Resend the email below, then check inbox and spam folders.
            </p>
            <div className="mt-4">
              <ResendVerificationForm initialEmail={email} />
            </div>
          </div>
          <p className="mt-5 text-sm text-muted">
            Already verified?
            <Link
              href="/auth/sign-in"
              className="font-semibold text-brand hover:text-accent"
            >
              Sign in
            </Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
