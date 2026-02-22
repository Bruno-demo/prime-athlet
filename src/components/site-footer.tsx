import Image from "next/image";
import Link from "next/link";
import {
  Apple,
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  CircleHelp,
  Facebook,
  Instagram,
  MessageCircleHeart,
  PlayCircle,
  ScanSearch,
  ShieldCheck,
  Truck,
  WalletCards,
  Youtube,
  type LucideIcon,
} from "lucide-react";

import { BackToTopButton } from "@/components/back-to-top-button";
import { BrandLogo } from "@/components/brand-logo";
import { FloatingSupportWidget } from "@/components/floating-support-widget";

const footerGroups: Array<{
  title: string;
  links: Array<{ href: string; label: string }>;
}> = [
  {
    title: "Customer Service",
    links: [
      { href: "/support", label: "Support" },
      { href: "/support#help-center", label: "Help Center" },
      { href: "/support#returns-refunds", label: "Returns & Refunds" },
      { href: "/support#order-tracking", label: "Order Tracking" },
      { href: "/support#shipping-delivery", label: "Shipping & Delivery" },
      { href: "/support#report-concern", label: "Report a Concern" },
    ],
  },
  {
    title: "Shop & Discover",
    links: [
      { href: "/shop?view=new-releases", label: "New Arrivals" },
      { href: "/shop?view=deals", label: "Flash Deals" },
      { href: "/shop?view=top-rated", label: "Top Rated" },
      { href: "/categories", label: "All Categories" },
      { href: "/shop", label: "Gift Picks" },
    ],
  },
  {
    title: "About Prime Athlet",
    links: [
      { href: "/account", label: "My Account" },
      { href: "/shop", label: "Affiliate Program" },
      { href: "/reviews", label: "Reviews" },
      { href: "/reviews", label: "Community Reviews" },
      { href: "/categories", label: "Sports Collections" },
      { href: "/cart", label: "Smart Cart" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/support#terms-of-use", label: "Terms of Use" },
      { href: "/support#privacy-policy", label: "Privacy Policy" },
      { href: "/support#cookie-preferences", label: "Cookie Preferences" },
      {
        href: "/support#intellectual-property",
        label: "Intellectual Property",
      },
      { href: "/support#accessibility", label: "Accessibility" },
    ],
  },
];

const socialLinks: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
}> = [
  { href: "https://www.facebook.com", label: "Facebook", icon: Facebook },
  { href: "https://www.instagram.com", label: "Instagram", icon: Instagram },
  { href: "https://www.youtube.com", label: "YouTube", icon: Youtube },
];

const paymentMethods: Array<{
  label: string;
  src: string;
  width: number;
  height: number;
  nudgeClass?: string;
}> = [
  {
    label: "Visa",
    src: "/payments/visa.svg",
    width: 92,
    height: 34,
    nudgeClass: "translate-y-px",
  },
  {
    label: "Mastercard",
    src: "/payments/mastercard.svg",
    width: 108,
    height: 34,
  },
  {
    label: "PayPal",
    src: "/payments/paypal.svg",
    width: 92,
    height: 34,
    nudgeClass: "translate-y-px",
  },
  {
    label: "Bank Transfer",
    src: "/payments/bank-transfer.svg",
    width: 128,
    height: 34,
    nudgeClass: "translate-y-px",
  },
  {
    label: "Apple Pay",
    src: "/payments/apple-pay.svg",
    width: 108,
    height: 34,
  },
  {
    label: "Google Pay",
    src: "/payments/google-pay.svg",
    width: 118,
    height: 34,
    nudgeClass: "translate-y-px",
  },
  { label: "Stripe", src: "/payments/stripe.svg", width: 92, height: 34 },
];

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-brand/15 bg-surface">
      <BackToTopButton />
      <FloatingSupportWidget />

      <div className="border-b border-brand/10 bg-[linear-gradient(92deg,color-mix(in_oklab,var(--accent)_22%,var(--surface)_78%)_0%,color-mix(in_oklab,var(--brand-action)_12%,var(--surface-soft)_88%)_100%)]">
        <div className="section-shell py-5 sm:py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                <ScanSearch className="h-4 w-4" />
                App Exclusive Offers
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-brand sm:text-3xl">
                Download Prime Athlete App For Daily Athlete Deals
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Get app-only drops, faster order tracking, and personalized gear
                alerts by sport.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/shop"
                title="Open iOS app download offer"
                className="inline-flex items-center gap-2 rounded-xl border border-brand/25 bg-surface px-4 py-2 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-surface-soft"
              >
                <Apple className="h-4 w-4" />
                App Store
              </Link>
              <Link
                href="/shop"
                title="Open Android app download offer"
                className="inline-flex items-center gap-2 rounded-xl border border-brand/25 bg-surface px-4 py-2 text-sm font-semibold text-brand transition hover:border-brand/50 hover:bg-surface-soft"
              >
                <PlayCircle className="h-4 w-4" />
                Google Play
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="section-shell py-9">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <BrandLogo size="lg" />
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Marketplace-grade footer experience with quick support access,
              trust signals, and clear purchase confidence.
            </p>
            <div className="mt-5 space-y-2.5 text-sm text-brand">
              <p className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-accent" />
                Secure checkout and protected payments
              </p>
              <p className="inline-flex items-center gap-2">
                <Truck className="h-4 w-4 text-accent" />
                Real-time order tracking and fast shipping
              </p>
              <p className="inline-flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-accent" />
                Quality-assured catalog for athletes
              </p>
              <p className="inline-flex items-center gap-2">
                <CircleHelp className="h-4 w-4 text-accent" />
                Dedicated support for returns and fit issues
              </p>
            </div>
          </div>

          <div className="space-y-2 sm:hidden">
            {footerGroups.map((group) => (
              <details
                key={group.title}
                className="group rounded-xl border border-brand/15 bg-surface-soft px-3 py-2.5"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold uppercase tracking-[0.12em] text-brand">
                  {group.title}
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="mt-2.5 flex flex-col gap-2 pb-1">
                  {group.links.map((link) => (
                    <Link
                      key={`${group.title}-${link.label}`}
                      href={link.href}
                      title={`Open ${link.label}`}
                      className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-brand"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {link.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <div className="hidden gap-6 sm:grid sm:grid-cols-2 xl:grid-cols-4">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-brand">
                  {group.title}
                </h3>
                <div className="mt-3 flex flex-col gap-2">
                  {group.links.map((link) => (
                    <Link
                      key={`${group.title}-${link.label}`}
                      href={link.href}
                      title={`Open ${link.label}`}
                      className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-brand"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-brand/10">
        <div className="section-shell py-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                <WalletCards className="h-4 w-4 text-accent" />
                We accept
              </p>
              {paymentMethods.map((method) => (
                <span
                  key={method.label}
                  className="inline-flex h-9 items-center rounded-xl border border-brand/18 bg-surface-soft px-1"
                  title={`Payment option: ${method.label}`}
                >
                  <Image
                    src={method.src}
                    alt={method.label}
                    width={method.width}
                    height={method.height}
                    className={`h-6 w-auto ${method.nudgeClass || ""}`}
                    loading="lazy"
                  />
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Follow us
              </p>
              {socialLinks.map((social) => {
                const Icon = social.icon;
                return (
                  <a
                    key={social.label}
                    href={social.href}
                    target="_blank"
                    rel="noreferrer"
                    title={`Open ${social.label}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface btn-secondary"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-brand/10 pt-4 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>
              (c) {currentYear} Prime Athlet Marketplace. All rights reserved.
            </p>
            <p className="inline-flex items-center gap-1.5">
              <MessageCircleHeart className="h-3.5 w-3.5 text-accent" />
              Built for serious athletes and everyday training.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
