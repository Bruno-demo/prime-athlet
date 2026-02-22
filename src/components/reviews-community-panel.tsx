"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LoaderCircle, MessageSquareQuote, Send, Star } from "lucide-react";
export interface ReviewsCommunityProductOption {
  id: string;
  name: string;
  sport: string;
}
export interface CommunityReviewItem {
  id: string;
  userDisplayName: string;
  productId: string;
  productName: string;
  sport: string;
  rating: number;
  title: string;
  comment: string;
  status?: "approved" | "hidden";
  createdAt: string;
  updatedAt: string;
}
interface ReviewsCommunityPanelProps {
  products: ReviewsCommunityProductOption[];
  initialReviews: CommunityReviewItem[];
  authenticated: boolean;
  emailVerified: boolean;
}
const reviewDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
function formatReviewDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }
  return reviewDateFormatter.format(date);
}
function renderStarRow(rating: number) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, index) => {
        const filled = index < Math.round(rating);
        return (
          <Star
            key={`review-star-${index}`}
            className={`h-3.5 w-3.5 ${filled ? "fill-current text-accent" : "text-muted/45"}`}
          />
        );
      })}
    </span>
  );
}
export function ReviewsCommunityPanel({
  products,
  initialReviews,
  authenticated,
  emailVerified,
}: ReviewsCommunityPanelProps) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmedTitle = title.trim();
  const trimmedComment = comment.trim();
  const canSubmit =
    authenticated &&
    emailVerified &&
    !isSubmitting &&
    productId.length > 0 &&
    trimmedTitle.length >= 3 &&
    trimmedComment.length >= 12;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    if (!authenticated) {
      router.push("/auth/sign-in?next=%2Freviews");
      return;
    }
    if (!emailVerified) {
      setErrorMessage("Verify your email before posting reviews.");
      return;
    }
    if (!canSubmit) {
      setErrorMessage(
        "Please complete product, rating, title, and review message.",
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          rating,
          title: trimmedTitle,
          comment: trimmedComment,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        review?: CommunityReviewItem;
        error?: string;
      } | null;
      if (response.status === 401) {
        router.push("/auth/sign-in?next=%2Freviews");
        return;
      }
      if (!response.ok || !payload?.review) {
        setErrorMessage(
          payload?.error || "Could not post review. Please try again.",
        );
        return;
      }
      const savedReview = payload.review;
      if (savedReview.status === "hidden") {
        setNotice("Review submitted and pending moderation approval.");
        setTitle("");
        setComment("");
        return;
      }
      setReviews((current) => {
        const next = [
          savedReview,
          ...current.filter((item) => item.id !== savedReview.id),
        ];
        return next.slice(0, 20);
      });
      setNotice("Thanks. Your review is now live.");
      setTitle("");
      setComment("");
    } catch {
      setErrorMessage("Could not post review. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <article className="surface-card rounded-2xl p-5 sm:p-6">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          <Send className="h-4 w-4" /> Post A Review
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-brand">
          Share your product experience
        </h2>
        <p className="mt-2 text-sm text-muted">
          Help other athletes decide faster with clear feedback on fit, comfort,
          and performance.
        </p>
        {!authenticated ? (
          <div className="mt-5 rounded-xl border border-brand/15 bg-surface-soft p-4 text-sm text-muted">
            Sign in to post reviews.
            <Link
              href="/auth/sign-in?next=%2Freviews"
              className="ml-1 font-semibold text-brand hover:text-accent"
              title="Sign in to post a review"
            >
              Go to sign in
            </Link>
            .
          </div>
        ) : !emailVerified ? (
          <div className="mt-5 rounded-xl border border-brand/15 bg-surface-soft p-4 text-sm text-muted">
            Verify your email before posting reviews.
            <Link
              href="/auth/check-email"
              className="ml-1 font-semibold text-brand hover:text-accent"
              title="Open email verification page"
            >
              Verify now
            </Link>
            .
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Product
            </label>
            <select
              value={productId}
              onChange={(event) => setProductId(event.target.value)}
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Select product to review"
            >
              {products.map((product) => (
                <option key={`review-product-${product.id}`} value={product.id}>
                  {product.name} ({product.sport})
                </option>
              ))}
            </select>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Rating
            </label>
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value) || 5)}
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              title="Select product rating"
            >
              <option value={5}>5 - Excellent</option>
              <option value={4}>4 - Very Good</option>
              <option value={3}>3 - Good</option>
              <option value={2}>2 - Fair</option>
              <option value={1}>1 - Poor</option>
            </select>
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
              placeholder="Example: Great grip and stable fit"
              title="Write a short review title"
            />
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              Review
            </label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="themed-input min-h-28 w-full rounded-xl px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
              placeholder="Share what worked well and what could improve."
              title="Write detailed review feedback"
            />
            {errorMessage ? (
              <p className="text-sm text-red-600">{errorMessage}</p>
            ) : null}
            {notice ? (
              <p className="text-sm text-emerald-600">{notice}</p>
            ) : null}
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold btn-primary disabled:cursor-not-allowed disabled:opacity-55"
              title="Submit your review"
            >
              {isSubmitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquareQuote className="h-4 w-4" />
              )}
              Submit Review
            </button>
          </form>
        )}
      </article>
      <article className="surface-card rounded-2xl p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold text-brand">
            Latest Community Reviews
          </h2>
          <span className="rounded-full bg-brand/8 px-3 py-1 text-xs font-semibold text-brand">
            {reviews.length} shown
          </span>
        </div>
        {reviews.length === 0 ? (
          <p className="rounded-xl border border-brand/15 bg-surface-soft px-4 py-5 text-sm text-muted">
            No community reviews yet. Be the first to post one.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-xl border border-brand/15 bg-surface-soft p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold text-brand">
                      {review.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {review.userDisplayName} -
                      {formatReviewDate(review.createdAt)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand/8 px-2.5 py-1 text-xs font-semibold text-brand">
                    {renderStarRow(review.rating)} {review.rating.toFixed(1)}
                  </span>
                </div>
                <p
                  className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted sm:line-clamp-5"
                  title={review.comment}
                >
                  {review.comment}
                </p>
                <p className="mt-3 text-xs text-muted">
                  {review.sport} -{" "}
                  <Link
                    href={`/shop/${review.productId}`}
                    className="font-semibold text-brand hover:text-accent"
                    title={`Open reviewed product: ${review.productName}`}
                  >
                    {review.productName}
                  </Link>
                </p>
              </article>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
