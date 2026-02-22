import Link from "next/link";
import { MessageSquareQuote, Star, TrendingUp } from "lucide-react";

import { ReviewsCommunityPanel } from "@/components/reviews-community-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getAuthenticatedUser } from "@/lib/auth";
import { getRecentProductReviews } from "@/lib/reviews-repository";
import { withResponseTimeLog } from "@/lib/response-time-log";
import { renderSportIcon } from "@/lib/sport-icons";
import { getCachedStorefrontProducts } from "@/lib/storefront-cache";

export default async function ReviewsPage() {
  return withResponseTimeLog("page:/reviews", async () => {
    const [products, recentReviews, user] = await Promise.all([
      getCachedStorefrontProducts(),
      getRecentProductReviews({ limit: 12 }),
      getAuthenticatedUser(),
    ]);

  const totalReviews = products.reduce(
    (sum, product) => sum + product.reviews,
    0,
  );
  const weightedRatingNumerator = products.reduce(
    (sum, product) => sum + product.rating * product.reviews,
    0,
  );
  const averageRating =
    totalReviews > 0 ? weightedRatingNumerator / totalReviews : 0;

  const topReviewed = [...products]
    .sort((a, b) => b.reviews - a.reviews)
    .slice(0, 5);

  const reviewProducts = [...products]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => ({
      id: product.id,
      name: product.name,
      sport: product.sport,
    }));

  const reviewHighlights = recentReviews.slice(0, 2);

    return (
      <div className="min-h-screen">
        <SiteHeader />
      <main className="section-shell py-10 sm:py-14">
        <div className="mb-10">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            <MessageSquareQuote className="h-4 w-4" /> Reviews
          </p>
          <h1 className="font-display mt-2 text-4xl leading-none text-brand sm:text-5xl">
            Athlete Feedback
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Verified ratings and testimonials from players, runners, and coaches
            who use Prime Athlete gear in real training and match-day scenarios.
          </p>
        </div>

        <section className="mb-12 grid gap-5 sm:grid-cols-3">
          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Average rating
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-3xl font-bold text-brand">
              <Star className="h-6 w-6 text-accent" />
              {averageRating.toFixed(2)}
            </p>
          </article>
          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Total verified reviews
            </p>
            <p className="mt-2 text-3xl font-bold text-brand">
              {totalReviews.toLocaleString()}
            </p>
          </article>
          <article className="surface-card motion-lift rounded-2xl p-5">
            <p className="text-xs uppercase tracking-[0.14em] text-muted">
              Top engagement sport
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-3xl font-bold text-brand">
              <TrendingUp className="h-6 w-6 text-accent" />
              {topReviewed[0]?.sport || "N/A"}
            </p>
          </article>
        </section>

        <section className="mb-12 grid gap-6 lg:grid-cols-2">
          {reviewHighlights.length > 0 ? (
            reviewHighlights.map((review) => (
              <article
                key={review.id}
                className="surface-card motion-lift rounded-2xl p-6"
              >
                <MessageSquareQuote className="h-5 w-5 text-accent" />
                <p className="mt-3 text-lg leading-relaxed text-brand">
                  &ldquo;{review.comment}&rdquo;
                </p>
                <p className="mt-5 font-semibold text-brand">
                  {review.userDisplayName}
                </p>
                <p className="text-sm text-muted">
                  {review.productName} - {review.sport}
                </p>
              </article>
            ))
          ) : (
            <article className="surface-card rounded-2xl p-6 text-sm text-muted">
              No review highlights yet. Published customer feedback will appear
              here automatically.
            </article>
          )}
        </section>

        <section className="mb-12">
          <ReviewsCommunityPanel
            products={reviewProducts}
            initialReviews={recentReviews}
            authenticated={Boolean(user)}
            emailVerified={Boolean(user?.emailVerifiedAt)}
          />
        </section>

        <section>
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-3xl leading-none text-brand sm:text-4xl">
              Most Reviewed Products
            </h2>
            <Link
              href="/shop"
              className="text-sm font-semibold text-brand hover:text-accent"
            >
              Shop now
            </Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {topReviewed.map((product) => (
              <article
                key={product.id}
                className="surface-card motion-lift rounded-2xl p-5"
              >
                <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-muted">
                  {renderSportIcon(product.sport, {
                    className: "h-4 w-4 text-brand",
                  })}
                  {product.sport}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-brand">
                  {product.name}
                </h3>
                <p className="mt-1 text-sm text-muted">{product.description}</p>
                <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-brand/8 px-3 py-1 text-sm font-semibold text-brand">
                  <Star className="h-4 w-4 text-accent" />
                  {product.rating.toFixed(1)} ({product.reviews} reviews)
                </div>
                <Link
                  href={`/shop/${product.id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:text-accent"
                >
                  Read product details
                  <MessageSquareQuote className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
        <SiteFooter />
      </div>
    );
  });
}
