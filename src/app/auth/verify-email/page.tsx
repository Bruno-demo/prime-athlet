import { VerifyEmailPanel } from "@/components/verify-email-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const resolvedSearchParams = await searchParams;
  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token
      : null;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <VerifyEmailPanel token={token} />
      </main>
      <SiteFooter />
    </div>
  );
}
