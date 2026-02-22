"use client";
import Link from "next/link";
import {
  ChevronRight,
  Flame,
  Heart,
  LoaderCircle,
  PackageCheck,
  Scale,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/catalog";
interface AccountSummaryPayload {
  authenticated?: boolean;
  user?: { displayName?: string; email?: string } | null;
  summary?: {
    orderCount?: number;
    activeOrderCount?: number;
    completedOrderCount?: number;
    wishlistCount?: number;
    totalSpentCents?: number;
  };
}
function extractFirstName(displayName: string | undefined): string {
  if (!displayName) {
    return "Athlete";
  }
  const firstName = displayName.trim().split(/\s+/)[0];
  return firstName || "Athlete";
}
export function AccountRecommendationsCard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [displayName, setDisplayName] = useState<string | undefined>(undefined);
  const [summary, setSummary] = useState<{
    orderCount: number;
    activeOrderCount: number;
    completedOrderCount: number;
    wishlistCount: number;
    totalSpentCents: number;
  } | null>(null);
  useEffect(() => {
    let mounted = true;
    async function loadSummary() {
      try {
        const response = await fetch("/api/account/summary", {
          method: "GET",
          cache: "no-store",
        });
        if (!mounted) {
          return;
        }
        if (response.status === 401) {
          setIsAuthenticated(false);
          setSummary(null);
          return;
        }
        if (!response.ok) {
          setIsAuthenticated(false);
          setSummary(null);
          return;
        }
        const body = (await response.json()) as AccountSummaryPayload;
        const nextSummary = body.summary;
        setIsAuthenticated(Boolean(body.authenticated));
        setDisplayName(body.user?.displayName);
        setSummary(
          nextSummary
            ? {
                orderCount: nextSummary.orderCount ?? 0,
                activeOrderCount: nextSummary.activeOrderCount ?? 0,
                completedOrderCount: nextSummary.completedOrderCount ?? 0,
                wishlistCount: nextSummary.wishlistCount ?? 0,
                totalSpentCents: nextSummary.totalSpentCents ?? 0,
              }
            : null,
        );
      } catch {
        if (!mounted) {
          return;
        }
        setIsAuthenticated(false);
        setSummary(null);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }
    void loadSummary();
    return () => {
      mounted = false;
    };
  }, []);
  if (isLoading) {
    return (
      <div className="surface-card rounded-2xl px-6 py-8 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Personalized
          Recommendations
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-brand">
          Loading your account insights...
        </h3>
      </div>
    );
  }
  if (!isAuthenticated || !summary) {
    return (
      <div className="surface-card rounded-2xl px-6 py-8 text-center">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <Flame className="h-4 w-4" /> Personalized Recommendations
        </p>
        <h3 className="mt-3 text-2xl font-semibold text-brand">
          Sign in for your best experience
        </h3>
        <p className="mt-2 text-sm text-muted">
          Save favorites, track orders, compare products, and get alerts when
          your preferred gear is discounted.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link
            href="/auth/sign-in?next=%2Faccount"
            title="Sign in to sync wishlist, order tracking, and personalized discount alerts"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-[var(--color-on-solid)] transition hover:bg-accent-strong"
          >
            Sign In <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-2.5 text-sm font-semibold btn-secondary"
          >
            Continue Shopping <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }
  const firstName = extractFirstName(displayName);
  return (
    <div className="surface-card rounded-2xl px-6 py-8 text-center">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        <Flame className="h-4 w-4" /> Personalized Recommendations
      </p>
      <h3 className="mt-3 text-2xl font-semibold text-brand">
        Welcome back, {firstName}
      </h3>
      <p className="mt-2 text-sm text-muted">
        Your account is synced: {summary.wishlistCount} wishlist items,
        {summary.orderCount} tracked orders, and
        {formatPrice(summary.totalSpentCents)} in completed purchases. Compare
        saved gear and keep discount alerts active for faster decision-making.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1.5 text-brand">
          <Heart className="h-3.5 w-3.5 text-accent" /> {summary.wishlistCount}
          saved
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1.5 text-brand">
          <PackageCheck className="h-3.5 w-3.5 text-accent" />
          {summary.activeOrderCount} in tracking
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1.5 text-brand">
          <Scale className="h-3.5 w-3.5 text-accent" /> Compare ready
        </span>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href="/account"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-[var(--color-on-solid)] transition hover:bg-accent-strong"
        >
          Open Account Hub <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href="/account#wishlist"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-2.5 text-sm font-semibold btn-secondary"
        >
          Manage Wishlist <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
