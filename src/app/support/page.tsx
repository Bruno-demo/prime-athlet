import Link from "next/link";
import {
  ArrowRight,
  CircleHelp,
  type LucideIcon,
  FileText,
  Lock,
  PackageSearch,
  ScrollText,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { SiteFooter } from "@/components/site-footer";
import { SupportFaqSection } from "@/components/support-faq-section";
import { SiteHeader } from "@/components/site-header";
import { SupportCenterPanel } from "@/components/support-center-panel";
import { getSupportCenterContent } from "@/lib/site-content-repository";

const supportIconMap: Record<string, LucideIcon> = {
  "circle-help": CircleHelp,
  "shield-check": ShieldCheck,
  "package-search": PackageSearch,
  truck: Truck,
  "scroll-text": ScrollText,
  lock: Lock,
  "file-text": FileText,
};

function getSupportIcon(iconKey: string): LucideIcon {
  return supportIconMap[iconKey] || CircleHelp;
}

export default async function SupportPage() {
  const { customerServiceItems, policyItems } = await getSupportCenterContent();

  return (
    <div className="min-h-screen">
      <SiteHeader />

      <main className="section-shell py-10 sm:py-14">
        <section className="glass-card rounded-3xl p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <CircleHelp className="h-4 w-4" />
            Support & Policies
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-brand sm:text-5xl">
            Customer Service & Policy Center
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
            All footer links under Customer Service and Policies resolve to this
            page. Use the sections below to review support procedures and policy
            terms, and submit trackable support tickets.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="#help-center"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold btn-primary"
            >
              Open Support
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#terms-of-use"
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold btn-secondary"
            >
              Open Policies
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <SupportFaqSection />

        <div className="mt-7">
          <SupportCenterPanel />
        </div>

        <section className="mt-7">
          <h2 className="text-2xl font-semibold text-brand sm:text-3xl">
            Customer Service
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {customerServiceItems.map((item) => {
              const Icon = getSupportIcon(item.icon);
              return (
                <article
                  key={item.id}
                  id={item.id}
                  className="surface-card scroll-mt-28 rounded-2xl p-5"
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {item.content}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-brand sm:text-3xl">
            Policies
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {policyItems.map((item) => {
              const Icon = getSupportIcon(item.icon);
              return (
                <article
                  key={item.id}
                  id={item.id}
                  className="surface-card scroll-mt-28 rounded-2xl p-5"
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                    <Icon className="h-4 w-4" />
                    {item.title}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">
                    {item.content}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
