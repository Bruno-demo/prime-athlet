import Link from "next/link";
import { ArrowRight, Layers3 } from "lucide-react";

import { ProductCard } from "@/components/product-card";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  formatPrice,
  Product,
  ProductTone,
  productToneClasses,
} from "@/lib/catalog";
import { renderSportIcon } from "@/lib/sport-icons";
import {
  getCachedStorefrontProducts,
  getCachedStorefrontTaxonomyValues,
} from "@/lib/storefront-cache";
import { withResponseTimeLog } from "@/lib/response-time-log";

interface SportCategoryCard {
  sport: string;
  title: string;
  description: string;
  href: string;
  tone: ProductTone;
  productCount: number;
  minPriceCents: number | null;
}

interface CategoryCollectionCard {
  category: string;
  description: string;
  href: string;
  tone: ProductTone;
  productCount: number;
  minPriceCents: number | null;
}

function slugifyParam(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function dedupeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function toSportTone(sport: string): ProductTone {
  const normalized = sport.trim().toLowerCase();
  if (normalized === "football") {
    return "field";
  }
  if (normalized === "basketball") {
    return "court";
  }
  if (normalized === "running") {
    return "street";
  }
  if (normalized === "training") {
    return "fitness";
  }
  return "outdoor";
}

function toSportCategoryTitle(sport: string): string {
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

function toSportCategoryDescription(sport: string): string {
  const normalized = sport.trim().toLowerCase();
  if (normalized === "football") {
    return "Cleats, gloves, and training gear trusted by serious athletes.";
  }
  if (normalized === "basketball") {
    return "Breathable apparel and durable carry systems for every session.";
  }
  if (normalized === "running") {
    return "Shoes and recovery accessories engineered for repeat mileage.";
  }
  if (normalized === "training") {
    return "Bags and accessories built for heavy use and daily training.";
  }
  return `Curated ${sport.toLowerCase()} gear for performance-focused athletes.`;
}

function toCategoryTone(category: string): ProductTone {
  const normalized = category.trim().toLowerCase();
  if (normalized === "footwear") {
    return "street";
  }
  if (normalized === "apparel") {
    return "field";
  }
  if (normalized === "accessories") {
    return "fitness";
  }
  if (normalized === "bags") {
    return "outdoor";
  }
  return "court";
}

function toCategoryDescription(category: string): string {
  const normalized = category.trim().toLowerCase();
  if (normalized === "footwear") {
    return "Performance shoes and sport-specific traction for repeat training blocks.";
  }
  if (normalized === "apparel") {
    return "Breathable tops, jerseys, and layers tuned for movement and comfort.";
  }
  if (normalized === "accessories") {
    return "Gloves, bottles, and daily extras that complete your training setup.";
  }
  if (normalized === "bags") {
    return "Gym bags and carry systems for organized transport and quick access.";
  }
  return `Curated ${category.toLowerCase()} picks for high-consistency sessions.`;
}

function buildSportCategories(
  products: Product[],
  taxonomySports: string[],
): SportCategoryCard[] {
  const bySport = new Map<string, { name: string; products: Product[] }>();
  for (const product of products) {
    const sport = product.sport.trim().replace(/\s+/g, " ");
    if (!sport) {
      continue;
    }
    const key = sport.toLowerCase();
    const existing = bySport.get(key);
    if (existing) {
      existing.products.push(product);
    } else {
      bySport.set(key, { name: sport, products: [product] });
    }
  }

  const orderedSports = dedupeValues([
    ...taxonomySports,
    ...Array.from(bySport.values()).map((entry) => entry.name),
  ]);

  return orderedSports
    .map((sport) => {
      const sportProducts = bySport.get(sport.toLowerCase())?.products ?? [];
      const minPrice = sportProducts.reduce(
        (min, product) => Math.min(min, product.priceCents),
        Number.POSITIVE_INFINITY,
      );

      return {
        sport,
        title: toSportCategoryTitle(sport),
        description: toSportCategoryDescription(sport),
        href: `/shop?sport=${encodeURIComponent(slugifyParam(sport))}`,
        tone: toSportTone(sport),
        productCount: sportProducts.length,
        minPriceCents: Number.isFinite(minPrice) ? minPrice : null,
      };
    })
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }
      return left.sport.localeCompare(right.sport);
    });
}

function buildCategoryCollections(
  products: Product[],
  taxonomyCategories: string[],
): CategoryCollectionCard[] {
  const byCategory = new Map<string, { name: string; products: Product[] }>();
  for (const product of products) {
    const category = product.category.trim().replace(/\s+/g, " ");
    if (!category) {
      continue;
    }
    const key = category.toLowerCase();
    const existing = byCategory.get(key);
    if (existing) {
      existing.products.push(product);
    } else {
      byCategory.set(key, { name: category, products: [product] });
    }
  }

  const orderedCategories = dedupeValues([
    ...taxonomyCategories,
    ...Array.from(byCategory.values()).map((entry) => entry.name),
  ]);

  return orderedCategories
    .map((category) => {
      const categoryProducts =
        byCategory.get(category.toLowerCase())?.products ?? [];
      const minPrice = categoryProducts.reduce(
        (min, product) => Math.min(min, product.priceCents),
        Number.POSITIVE_INFINITY,
      );
      return {
        category,
        description: toCategoryDescription(category),
        href: `/shop?category=${encodeURIComponent(slugifyParam(category))}`,
        tone: toCategoryTone(category),
        productCount: categoryProducts.length,
        minPriceCents: Number.isFinite(minPrice) ? minPrice : null,
      };
    })
    .sort((left, right) => {
      if (right.productCount !== left.productCount) {
        return right.productCount - left.productCount;
      }
      return left.category.localeCompare(right.category);
    });
}

export default async function CategoriesPage() {
  return withResponseTimeLog("page:/categories", async () => {
    const [products, taxonomySports, taxonomyCategories] = await Promise.all([
      getCachedStorefrontProducts(),
      getCachedStorefrontTaxonomyValues("sport"),
      getCachedStorefrontTaxonomyValues("category"),
    ]);
    const categories = buildSportCategories(products, taxonomySports);
    const categoryCollections = buildCategoryCollections(
      products,
      taxonomyCategories,
    );

    return (
      <div className="min-h-screen">
        <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              <Layers3 className="h-4 w-4" /> Categories
            </p>
            <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
              Shop by Sport
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              Discover gear collections built for your discipline, with curated
              products and performance-focused essentials.
            </p>
          </div>
          <Link
            href="/shop"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold btn-secondary"
          >
            Browse all products <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {categories.length > 0 ? (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {categories.map((category) => (
              <article
                key={category.sport}
                className="surface-card motion-lift rounded-2xl p-5"
              >
                <div
                  className={`mb-4 rounded-xl bg-gradient-to-r px-3 py-3 text-[var(--color-on-solid)] ${productToneClasses[category.tone]}`}
                >
                  <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-[var(--color-on-solid-90)]">
                    {renderSportIcon(category.sport, {
                      className: "h-4 w-4",
                      toned: true,
                    })}
                    {category.sport}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">
                    {category.title}
                  </h2>
                </div>

                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {category.description}
                </p>

                <div className="mt-4 rounded-xl border border-brand/10 bg-brand/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                  {category.productCount} products
                  {category.minPriceCents !== null ? (
                    <span className="ml-2 text-muted normal-case tracking-normal">
                      from {formatPrice(category.minPriceCents)}
                    </span>
                  ) : null}
                </div>

                <Link
                  href={category.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-accent"
                >
                  Explore {category.sport} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </section>
        ) : (
          <section className="surface-card rounded-2xl p-8 text-sm text-muted">
            No sport categories are available yet. Add products from the admin
            dashboard to populate this page.
          </section>
        )}

        {categoryCollections.length > 0 ? (
          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 className="font-display text-3xl leading-none text-brand sm:text-4xl">
                Shop by Category
              </h2>
              <Link
                href="/shop"
                className="text-sm font-semibold text-brand hover:text-accent"
              >
                View catalog
              </Link>
            </div>
            <div className="grid gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
              {categoryCollections.map((category) => (
                <article
                  key={category.category}
                  className="surface-card motion-lift rounded-2xl p-5"
                >
                  <div
                    className={`mb-4 rounded-xl bg-gradient-to-r px-3 py-3 text-[var(--color-on-solid)] ${productToneClasses[category.tone]}`}
                  >
                    <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-on-solid-90)]">
                      Category
                    </p>
                    <h3 className="mt-1 text-xl font-semibold">
                      {category.category}
                    </h3>
                  </div>

                  <p className="text-sm leading-relaxed text-muted">
                    {category.description}
                  </p>

                  <div className="mt-4 rounded-xl border border-brand/10 bg-brand/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                    {category.productCount} products
                    {category.minPriceCents !== null ? (
                      <span className="ml-2 text-muted normal-case tracking-normal">
                        from {formatPrice(category.minPriceCents)}
                      </span>
                    ) : null}
                  </div>

                  <Link
                    href={category.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-accent"
                  >
                    Explore {category.category}{" "}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl leading-none text-brand sm:text-4xl">
              Recommended Picks
            </h2>
            <Link
              href="/shop"
              className="text-sm font-semibold text-brand hover:text-accent"
            >
              View catalog
            </Link>
          </div>
          <div className="grid gap-4 min-[380px]:grid-cols-2 md:grid-cols-2 xl:grid-cols-4">
            {products.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </main>
        <SiteFooter />
      </div>
    );
  });
}
