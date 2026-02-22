import Image from "next/image";
import Link from "next/link";
import {
  BadgePercent,
  ChevronRight,
  Clock3,
  PackageCheck,
  Star,
  Truck,
} from "lucide-react";

import { AccountRecommendationsCard } from "@/components/account-recommendations-card";
import { HomeBannerCarousel } from "@/components/home-banner-carousel";
import { RecommendationsGrid } from "@/components/recommendations-grid";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatPrice, Product } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
} from "@/lib/image-utils";
import { renderSportIcon } from "@/lib/sport-icons";
import {
  getCachedStorefrontHeroSlides,
  getCachedStorefrontProducts,
} from "@/lib/storefront-cache";
import { withResponseTimeLog } from "@/lib/response-time-log";

interface HomeCategoryCard {
  sport: string;
  title: string;
  href: string;
  preview: Product[];
}

function toHomeCategoryTitle(sport: string): string {
  const normalized = sport.trim().toLowerCase();
  if (normalized === "football") {
    return "Matchday Essentials";
  }
  if (normalized === "basketball") {
    return "Court Performance";
  }
  if (normalized === "running") {
    return "Distance Collection";
  }
  if (normalized === "training") {
    return "Gym & Conditioning";
  }
  return `${sport} Essentials`;
}

function toSportShopHref(sport: string): string {
  return `/shop?sport=${encodeURIComponent(sport.toLowerCase())}`;
}

function buildHomeCategoryCards(products: Product[]): HomeCategoryCard[] {
  if (products.length === 0) {
    return [];
  }

  const bySport = new Map<string, Product[]>();
  for (const product of products) {
    const sport = product.sport.trim();
    if (!sport) {
      continue;
    }
    const existing = bySport.get(sport) ?? [];
    existing.push(product);
    bySport.set(sport, existing);
  }

  const sortedSports = Array.from(bySport.entries()).sort((left, right) => {
    if (right[1].length !== left[1].length) {
      return right[1].length - left[1].length;
    }
    return left[0].localeCompare(right[0]);
  });

  return sortedSports.slice(0, 4).map(([sport, sportProducts]) => ({
    sport,
    title: toHomeCategoryTitle(sport),
    href: toSportShopHref(sport),
    preview: sportProducts.slice(0, 4),
  }));
}

export default async function Home() {
  return withResponseTimeLog("page:/", async () => {
    const sourceProducts = (await getCachedStorefrontProducts()).sort(
      (left, right) => left.id.localeCompare(right.id),
    );

    const heroSlides = await getCachedStorefrontHeroSlides();

  const categoryCards = buildHomeCategoryCards(sourceProducts);

  const bestDeals = [...sourceProducts]
    .sort((a, b) => a.priceCents - b.priceCents)
    .slice(0, 12);
  const topRated = [...sourceProducts]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 12);
  const recommendationProducts = [...sourceProducts]
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        b.reviews - a.reviews ||
        a.priceCents - b.priceCents,
    )
    .slice(0, 24);

  const rails = [
    {
      title: "Today's Best Deals",
      subtitle: "Price drops picked for serious athletes",
      icon: BadgePercent,
      products: bestDeals,
    },
    {
      title: "Top Rated Equipment",
      subtitle: "Most loved by players and runners",
      icon: Star,
      products: topRated,
    },
  ];

    return (
      <>
        <SiteHeader />
        <main className="min-h-screen pb-16">
        <section className="section-shell pt-6 pb-6 sm:pb-8">
          <HomeBannerCarousel slides={heroSlides} />
        </section>

        <section className="section-shell">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {categoryCards.map((category) => (
              <article
                key={category.title}
                className="surface-card motion-lift rounded-2xl p-4"
              >
                <h2 className="line-clamp-2 text-lg font-semibold text-brand">
                  {category.title}
                </h2>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-muted">
                  {renderSportIcon(category.sport, {
                    className: "h-3.5 w-3.5 text-brand",
                  })}
                  {category.sport}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {category.preview.map((item) => {
                    const primaryImage = getPrimaryProductImage(item);
                    return (
                      <Link
                        key={item.id}
                        href={`/shop/${item.id}`}
                        className="group block"
                      >
                        <div className="image-frame relative h-24 rounded-lg sm:h-20">
                          <Image
                            src={primaryImage.src}
                            alt={primaryImage.alt}
                            fill
                            sizes="(max-width: 640px) 42vw, 160px"
                            quality={80}
                            placeholder="blur"
                            blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                            className="image-fit-cover image-hover-zoom max-[640px]:object-contain max-[640px]:p-1.5"
                          />
                        </div>
                        <p className="mt-2 line-clamp-1 text-xs font-semibold text-brand group-hover:text-accent">
                          {item.name}
                        </p>
                      </Link>
                    );
                  })}
                </div>

                <Link
                  href={category.href}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-accent"
                >
                  See more <ChevronRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="section-shell mt-8 space-y-6">
          {rails.map((rail) => {
            const Icon = rail.icon;
            return (
              <article
                key={rail.title}
                className="surface-card rounded-2xl p-5"
              >
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="inline-flex items-center gap-2 text-2xl font-semibold text-brand">
                      <Icon className="h-5 w-5 text-accent" /> {rail.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted">{rail.subtitle}</p>
                  </div>
                  <Link
                    href="/shop"
                    className="text-sm font-semibold text-brand hover:text-accent"
                  >
                    View all deals
                  </Link>
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex min-w-max gap-4">
                    {rail.products.map((product) => {
                      const primaryImage = getPrimaryProductImage(product);
                      return (
                        <Link
                          key={`${rail.title}-${product.id}`}
                          href={`/shop/${product.id}`}
                          className="motion-lift w-52 shrink-0 rounded-xl border border-brand/10 bg-surface p-3 transition hover:-translate-y-1 hover:shadow-md"
                        >
                          <div className="image-frame relative h-36 rounded-lg">
                            <Image
                              src={primaryImage.src}
                              alt={primaryImage.alt}
                              fill
                              sizes="220px"
                              quality={80}
                              placeholder="blur"
                              blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                              className="image-fit-cover"
                            />
                          </div>
                          <p className="mt-3 line-clamp-2 text-sm font-semibold text-brand">
                            {product.name}
                          </p>
                          <p className="mt-1 text-lg font-bold text-brand">
                            {formatPrice(product.priceCents)}
                          </p>
                          <p className="text-xs text-muted">
                            {product.rating.toFixed(1)} stars -{" "}
                            {product.reviews} reviews
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="section-shell mt-8 grid gap-5 md:grid-cols-3">
          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <Truck className="h-4 w-4 text-accent" /> Fast Delivery
            </p>
            <p className="mt-2 text-sm text-muted">
              Most orders ship in 2 days across the U.S. with real-time
              tracking.
            </p>
          </article>

          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <Clock3 className="h-4 w-4 text-accent" /> Limited Time Offers
            </p>
            <p className="mt-2 text-sm text-muted">
              Daily deal drops and seasonal discounts across footwear and
              accessories.
            </p>
          </article>

          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-brand">
              <PackageCheck className="h-4 w-4 text-accent" /> Verified Quality
            </p>
            <p className="mt-2 text-sm text-muted">
              Products selected for durability, performance, and athlete
              feedback.
            </p>
          </article>
        </section>

        <section className="section-shell mt-8">
          <AccountRecommendationsCard />
        </section>

        <section className="section-shell mt-5">
          <RecommendationsGrid products={recommendationProducts} />
        </section>
        </main>
        <SiteFooter />
      </>
    );
  });
}
