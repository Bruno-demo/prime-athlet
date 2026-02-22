"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Grid3X3,
  Home,
  Menu,
  MoonStar,
  PackageSearch,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  SunMedium,
  TicketPercent,
  UserRound,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCart } from "@/components/cart-context";
import { useTheme } from "@/components/theme-context";
const mainLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/shop", label: "Shop", icon: Store },
  { href: "/categories", label: "Categories", icon: Grid3X3 },
] as const;
const utilityLinks = [
  { href: "/shop?view=deals", label: "Today's Deals", icon: TicketPercent },
  { href: "/shop?view=top-rated", label: "Top Rated", icon: Star },
  { href: "/shop?view=new-releases", label: "New Releases", icon: Sparkles },
] as const;
interface SiteHeaderClientProps {
  isAuthenticated: boolean;
}
function isMainLinkActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
function isUtilityLinkActive(
  pathname: string,
  searchParams: Pick<URLSearchParams, "get">,
  href: string,
): boolean {
  const [path, queryString] = href.split("?");
  if (!queryString) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  if (path !== pathname) {
    return false;
  }
  const queryParams = new URLSearchParams(queryString);
  for (const [key, value] of queryParams.entries()) {
    if (searchParams.get(key) !== value) {
      return false;
    }
  }
  return true;
}
function navPillClass(isActive: boolean): string {
  if (isActive) {
    return "btn-primary";
  }
  return "border-brand/20 bg-surface !text-brand hover:border-brand/35 hover:bg-surface-soft hover:!text-brand";
}
export function SiteHeaderClient({ isAuthenticated }: SiteHeaderClientProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { itemCount } = useCart();
  const { toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const accountHref = isAuthenticated
    ? "/account"
    : "/auth/sign-in?next=%2Faccount";
  const accountLabel = isAuthenticated ? "Your Account" : "Sign in / Up";
  const ordersHref = isAuthenticated
    ? "/account/orders"
    : "/auth/sign-in?next=%2Faccount%2Forders";
  const utilityLinksForMenu = useMemo(
    () => [
      ...utilityLinks,
      { href: ordersHref, label: "Track Orders", icon: PackageSearch },
      { href: accountHref, label: accountLabel, icon: UserRound },
    ],
    [accountHref, accountLabel, ordersHref],
  );
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    function handleOutsidePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      const inDropdown = dropdownRef.current?.contains(target);
      const inMenuButton = menuButtonRef.current?.contains(target);
      if (!inDropdown && !inMenuButton) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleOutsidePointer);
    document.addEventListener("touchstart", handleOutsidePointer);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleOutsidePointer);
      document.removeEventListener("touchstart", handleOutsidePointer);
    };
  }, [menuOpen]);
  return (
    <header className="topbar sticky top-0 z-40 border-b border-brand/10 shadow-[0_8px_18px_var(--overlay-black-08)]">
      <div className="border-b border-[var(--overlay-white-24)] bg-[linear-gradient(90deg,var(--topbar-primary-from)_0%,var(--topbar-primary-to)_100%)] text-[var(--color-on-solid)]">
        <div className="section-shell py-1.5 lg:py-1.5">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:gap-2.5">
            <Link
              href="/"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] px-2 py-1 text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] sm:w-[128.58px] sm:justify-start max-[390px]:gap-1 max-[390px]:px-1.5 max-[390px]:py-0.5"
              title="Open Prime Athlete home"
            >
              <BrandLogo size="sm" inverted hideTextOnMobile />
            </Link>
            <form
              action="/shop"
              suppressHydrationWarning
              className="hidden min-w-0 flex-1 items-center gap-0.5 rounded-xl border border-[var(--overlay-white-24)] bg-surface p-0.5 lg:flex"
            >
              <select
                name="department"
                suppressHydrationWarning
                className="h-8 w-28 shrink-0 rounded-lg border border-brand/15 bg-surface px-2 text-xs font-semibold text-brand focus:outline-none"
                defaultValue="all"
              >
                <option value="all">All Sports</option>
                <option value="football">Football</option>
                <option value="basketball">Basketball</option>
                <option value="running">Running</option>
                <option value="training">Training</option>
              </select>
              <input
                name="q"
                type="text"
                suppressHydrationWarning
                placeholder="Search products, shoes, accessories..."
                className="h-8 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-brand placeholder:text-muted focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex h-8 w-10 items-center justify-center rounded-lg bg-accent text-[var(--color-on-solid)] transition hover:bg-accent-strong"
                aria-label="Search products"
                title="Search products"
              >
                <Search className="h-4 w-4" />
              </button>
            </form>
            <div className="ml-auto flex items-center gap-1 max-[390px]:gap-0.5">
              <Link
                href={accountHref}
                className="hidden h-8 shrink-0 flex-col justify-center rounded-lg border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] px-2.5 text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] sm:inline-flex"
                title={
                  isAuthenticated
                    ? "Open account hub"
                    : "Sign in or create account"
                }
              >
                <span className="text-[10px] leading-none text-[var(--color-on-solid-75)]">
                  {isAuthenticated ? "Welcome back" : "Hello, sign in"}
                </span>
                <span className="mt-1 text-xs font-semibold leading-none">
                  {accountLabel}
                </span>
              </Link>
              <Link
                href={ordersHref}
                className="hidden h-8 shrink-0 flex-col justify-center rounded-lg border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] px-2.5 text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] lg:inline-flex"
                title="Open your order timeline"
              >
                <span className="text-[10px] leading-none text-[var(--color-on-solid-75)]">
                  Returns
                </span>
                <span className="mt-1 text-xs font-semibold leading-none">
                  & Orders
                </span>
              </Link>
              <Link
                href="/cart"
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] px-2.5 text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] max-[390px]:gap-1 max-[390px]:px-1.5"
                title="Open cart"
              >
                <ShoppingCart className="h-4 w-4" />
                <span className="text-sm font-semibold max-[390px]:hidden sm:inline">
                  Cart
                </span>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--overlay-white-24)] px-1 text-[11px] font-bold text-[var(--color-on-solid)]">
                  {itemCount}
                </span>
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] max-[390px]:h-7 max-[390px]:w-7"
                aria-label="Toggle color theme"
                title="Toggle color theme"
              >
                <span className="theme-toggle-light">
                  <MoonStar className="h-4 w-4" />
                </span>
                <span className="theme-toggle-dark">
                  <SunMedium className="h-4 w-4" />
                </span>
              </button>
              <button
                ref={menuButtonRef}
                type="button"
                onClick={() => setMenuOpen((current) => !current)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--overlay-white-35)] bg-[var(--overlay-white-12)] text-[var(--color-on-solid)] transition hover:bg-[var(--overlay-white-20)] max-[390px]:h-7 max-[390px]:w-7 xl:hidden"
                aria-label="Toggle navigation menu"
                aria-expanded={menuOpen}
                aria-controls="mobile-nav-dropdown"
                title="Toggle navigation menu"
              >
                {menuOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          <form
            action="/shop"
            suppressHydrationWarning
            className="mt-1.5 flex items-center gap-0.5 rounded-xl border border-[var(--overlay-white-24)] bg-surface p-0.5 lg:hidden"
          >
            <input
              name="q"
              type="text"
              suppressHydrationWarning
              placeholder="Search Prime Athlete"
              className="h-8 min-w-0 flex-1 border-0 bg-transparent px-3 text-sm text-brand placeholder:text-muted focus:outline-none max-[390px]:h-7 max-[390px]:text-[13px]"
            />
            <button
              type="submit"
              className="inline-flex h-8 w-10 items-center justify-center rounded-lg bg-accent text-[var(--color-on-solid)] transition hover:bg-accent-strong max-[390px]:h-7 max-[390px]:w-9"
              aria-label="Search products"
              title="Search products"
            >
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
      <div className="border-b border-brand/10 bg-surface-soft">
        <div className="section-shell py-1 lg:py-0.5">
          <nav className="sportiva-subnav-scroll flex items-center gap-1.5 overflow-x-auto lg:h-8 lg:gap-1">
            {mainLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isMainLinkActive(pathname, link.href);
              return (
                <Link
                  key={`main-nav-${link.label}`}
                  href={link.href}
                  className={`sportiva-subnav-item inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition lg:h-7 lg:px-2.5 lg:py-0 lg:text-[11px] lg:leading-none ${navPillClass(isActive)}`}
                  title={`Open ${link.label}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {link.label}
                </Link>
              );
            })}
            {utilityLinks.map((link) => {
              const Icon = link.icon;
              const isActive = isUtilityLinkActive(
                pathname,
                searchParams,
                link.href,
              );
              return (
                <Link
                  key={`utility-nav-${link.label}`}
                  href={link.href}
                  className={`sportiva-subnav-item inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition lg:h-7 lg:px-2.5 lg:py-0 lg:text-[11px] lg:leading-none ${navPillClass(isActive)}`}
                  title={`Open ${link.label}`}
                >
                  <Icon className="h-3.5 w-3.5" /> {link.label}
                </Link>
              );
            })}
            <Link
              href={ordersHref}
              className={`sportiva-subnav-item inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition lg:h-7 lg:px-2.5 lg:py-0 lg:text-[11px] lg:leading-none ${navPillClass(isMainLinkActive(pathname, "/account/orders"))}`}
              title="Track your orders"
            >
              <PackageSearch className="h-3.5 w-3.5" /> Track Orders
            </Link>
          </nav>
        </div>
      </div>
      {menuOpen ? (
        <div className="section-shell">
          <div
            id="mobile-nav-dropdown"
            ref={dropdownRef}
            className="surface-card motion-dropdown-enter mt-2.5 max-h-[70vh] overflow-y-auto rounded-2xl p-3 xl:hidden"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href={accountHref}
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm font-semibold btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-4 w-4" /> {accountLabel}
                </span>
              </Link>
              <Link
                href={ordersHref}
                onClick={() => setMenuOpen(false)}
                className="inline-flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-sm font-semibold btn-secondary"
              >
                <span className="inline-flex items-center gap-1.5">
                  <PackageSearch className="h-4 w-4" /> Track Orders
                </span>
              </Link>
            </div>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Main Navigation
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {mainLinks.map((link) => {
                const Icon = link.icon;
                const isActive = isMainLinkActive(pathname, link.href);
                return (
                  <Link
                    key={`menu-main-${link.label}`}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`inline-flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${isActive ? "btn-primary" : "btn-secondary"}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-4 w-4" /> {link.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Shopping Shortcuts
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {utilityLinksForMenu.map((link) => {
                const Icon = link.icon;
                const isActive = link.href.includes("?")
                  ? isUtilityLinkActive(pathname, searchParams, link.href)
                  : isMainLinkActive(pathname, link.href);
                return (
                  <Link
                    key={`menu-utility-${link.label}`}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className={`inline-flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-semibold transition ${isActive ? "btn-primary" : "btn-secondary"}`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-4 w-4" /> {link.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
