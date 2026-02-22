import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
import { ProductImageCarousel } from "@/components/product-image-carousel";
import { ProductPurchaseActions } from "@/components/product-purchase-actions";
import { ProductReviewsPanel } from "@/components/product-reviews-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAuthenticatedUser } from "@/lib/auth";
import { formatPrice } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
} from "@/lib/image-utils";
import {
  resolveProductIdAlias,
} from "@/lib/products-repository";
import { getProductReviewsByProductId } from "@/lib/reviews-repository";
import { withResponseTimeLog } from "@/lib/response-time-log";
import { renderSportIcon } from "@/lib/sport-icons";
import {
  getCachedStorefrontProductById,
  getCachedStorefrontProducts,
} from "@/lib/storefront-cache";
interface ProductDetailPageProps {
  params: Promise<{ id: string }>;
}
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
export async function generateMetadata({
  params,
}: ProductDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const canonicalId = resolveProductIdAlias(id);
  const product = await getCachedStorefrontProductById(canonicalId);
  if (!product) {
    return { title: "Product not found | Prime Athlete" };
  }
  return {
    title: `${product.name} | Prime Athlete`,
    description: product.description,
  };
}
export default async function ProductDetailPage({
  params,
}: ProductDetailPageProps) {
  return withResponseTimeLog("page:/shop/[id]", async () => {
    const { id } = await params;
    const canonicalId = resolveProductIdAlias(id);
    if (canonicalId !== id) {
      redirect(`/shop/${canonicalId}`);
    }
    const product = await getCachedStorefrontProductById(canonicalId);
    if (!product) {
      notFound();
    }
    const relatedProducts = (await getCachedStorefrontProducts())
      .filter(
        (candidate) =>
          candidate.id !== product.id && candidate.sport === product.sport,
      )
      .slice(0, 4);
    const [productReviews, user] = await Promise.all([
      getProductReviewsByProductId({ productId: product.id }),
      getAuthenticatedUser(),
    ]);
    return (
      <div className="min-h-screen">
        <SiteHeader />
      <main className="section-shell py-6 sm:py-10 lg:py-12">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <Link href="/" className="transition hover:text-brand">
            Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link href="/shop" className="transition hover:text-brand">
            Shop
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="line-clamp-1 text-brand">{product.name}</span>
        </div>
        <div className="mb-5">
          <Link
            href="/shop"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-accent"
          >
            <ArrowLeft className="h-4 w-4" /> Back to shop
          </Link>
        </div>
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-7">
          <article className="surface-card rounded-2xl p-3 sm:p-5">
            <ProductImageCarousel
              images={product.images}
              productName={product.name}
            />
          </article>
          <article className="surface-card rounded-2xl p-4 sm:p-6 lg:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                {product.badge}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                {renderSportIcon(product.sport, {
                  className: "h-3.5 w-3.5",
                })}
                {product.sport}
              </span>
              <span className="inline-flex rounded-full border border-brand/20 bg-surface-soft px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-brand">
                {product.category}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold leading-tight text-brand sm:text-3xl lg:text-4xl">
              {product.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <p className="inline-flex items-center gap-1 text-muted">
                <Star className="h-4 w-4 text-accent" />
                {product.rating.toFixed(1)} ({product.reviews} reviews)
              </p>
              <span className="inline-flex rounded-full bg-[color-mix(in_oklab,var(--status-success-bg)_78%,var(--surface)_22%)] px-2.5 py-1 text-xs font-semibold text-[var(--status-success-text)]">
                In stock
              </span>
            </div>
            <p className="mt-5 text-3xl font-semibold text-brand sm:text-4xl">
              {formatPrice(product.priceCents)}
            </p>
            <p className="mt-1 text-sm text-muted">
              Tax included. Shipping calculated at checkout.
            </p>
            <div className="mt-5 border-t border-brand/10 pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Product Overview
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {product.description}
              </p>
            </div>
            <ProductPurchaseActions product={product} />
            <div className="mt-7 space-y-3 border-t border-brand/10 pt-5 text-sm text-muted">
              <p className="inline-flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                Built for athletes who need confidence under pressure, this item
                is selected for durability, fit consistency, and in-session
                comfort.
              </p>
              <p className="inline-flex items-start gap-2">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                Estimated shipping: 2 business days in the U.S. Free exchanges
                for sizing issues within 30 days.
              </p>
            </div>
          </article>
        </section>
        <section className="mt-9 space-y-3">
          <details open className="surface-card rounded-xl px-5 py-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.1em] text-brand">
              Product Details
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>{product.description}</p>
              <p>
                Category:
                <span className="font-semibold text-brand">
                  {product.category}
                </span>
              </p>
              <p>
                Sport:
                <span className="font-semibold text-brand">
                  {product.sport}
                </span>
              </p>
            </div>
          </details>
          <details className="surface-card rounded-xl px-5 py-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.1em] text-brand">
              Shipping & Returns
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>Ships within 1-2 business days with tracking updates.</p>
              <p>
                Free size exchanges and easy returns within 30 days of delivery.
              </p>
            </div>
          </details>
          <details className="surface-card rounded-xl px-5 py-4">
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-[0.1em] text-brand">
              Reviews
            </summary>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>
                Average rating:
                <span className="font-semibold text-brand">
                  {product.rating.toFixed(1)}/5
                </span>
                based on {product.reviews} verified reviews.
              </p>
              <p>
                Top feedback highlights comfort, reliable fit, and strong
                in-session durability.
              </p>
            </div>
          </details>
        </section>
        <section className="mt-10">
          <ProductReviewsPanel
            productId={product.id}
            productName={product.name}
            initialReviews={productReviews}
            authenticated={Boolean(user)}
            emailVerified={Boolean(user?.emailVerifiedAt)}
          />
        </section>
        {relatedProducts.length > 0 ? (
          <section className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-3">
              <h2 className="text-2xl font-semibold text-brand sm:text-3xl">
                Related {product.sport} Gear
              </h2>
              <Link
                href={`/shop?sport=${slugify(product.sport)}`}
                className="text-sm font-semibold text-brand transition hover:text-accent"
              >
                View all
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {relatedProducts.map((related) => {
                const primaryImage = getPrimaryProductImage(related);
                return (
                  <Link
                    key={related.id}
                    href={`/shop/${related.id}`}
                    className="surface-card group rounded-xl p-3 transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                    title={`Open ${related.name}`}
                  >
                    <div className="image-frame relative aspect-[4/5] rounded-lg">
                      <Image
                        src={primaryImage.src}
                        alt={primaryImage.alt}
                        fill
                        sizes="(min-width: 1280px) 20vw, (min-width: 640px) 42vw, 100vw"
                        quality={82}
                        placeholder="blur"
                        blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                        className="image-fit-cover image-hover-zoom"
                      />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm font-semibold text-brand">
                      {related.name}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.1em] text-muted">
                      {related.category}
                    </p>
                    <p className="mt-1 text-base font-semibold text-brand">
                      {formatPrice(related.priceCents)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
        <SiteFooter />
      </div>
    );
  });
}
