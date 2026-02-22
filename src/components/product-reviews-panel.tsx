"use client";
import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, MessageSquareQuote, Star } from "lucide-react";
interface ProductReviewItem {
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
interface ProductReviewsPanelProps {
  productId: string;
  productName: string;
  initialReviews: ProductReviewItem[];
  authenticated: boolean;
  emailVerified: boolean;
}
const reviewDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
function formatReviewDate(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently";
  }
  return reviewDateFormatter.format(parsed);
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
            key={`product-review-star-${index}`}
            className={`h-3.5 w-3.5 ${filled ? "fill-current text-accent" : "text-muted/45"}`}
          />
        );
      })}
    </span>
  );
}
export function ProductReviewsPanel({
  productId,
  productName,
  initialReviews,
  authenticated,
  emailVerified,
}: ProductReviewsPanelProps) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const reviewCount = reviews.length;
  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return 0;
    }
    const weighted = reviews.reduce((sum, review) => sum + review.rating, 0);
    return weighted / reviews.length;
  }, [reviews]);
  const trimmedTitle = title.trim();
  const trimmedComment = comment.trim();
  const canSubmit =
    authenticated &&
    emailVerified &&
    !isSubmitting &&
    trimmedTitle.length >= 3 &&
    trimmedComment.length >= 12;
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    if (!authenticated) {
      router.push(
        `/auth/sign-in?next=${encodeURIComponent(`/shop/${productId}`)}`,
      );
      return;
    }
    if (!emailVerified) {
      setErrorMessage("Verify your email before posting reviews.");
      return;
    }
    if (!canSubmit) {
      setErrorMessage("Please complete rating, title, and review details.");
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
        review?: ProductReviewItem;
        error?: string;
      } | null;
      if (response.status === 401) {
        router.push(
          `/auth/sign-in?next=${encodeURIComponent(`/shop/${productId}`)}`,
        );
        return;
      }
      if (!response.ok || !payload?.review) {
        setErrorMessage(payload?.error || "Could not submit review.");
        return;
      }
      const savedReview = payload.review;
      if (savedReview.status === "hidden") {
        setNotice("Review submitted and pending moderation approval.");
        setTitle("");
        setComment("");
        router.refresh();
        return;
      }
      setReviews((current) => {
        const next = [
          savedReview,
          ...current.filter((review) => review.id !== savedReview.id),
        ];
        return next;
      });
      setTitle("");
      setComment("");
      setNotice("Your review is published.");
      router.refresh();
    } catch {
      setErrorMessage("Could not submit review.");
    } finally {
      setIsSubmitting(false);
    }
  }
  return (
    <section className="surface-card rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
            <MessageSquareQuote className="h-4 w-4" /> Product Reviews
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-brand">
            Real feedback for {productName}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-brand">
            {averageRating.toFixed(2)} / 5
          </p>
          <p className="text-xs text-muted">{reviewCount} community reviews</p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div>
          {reviews.length === 0 ? (
            <p className="rounded-xl border border-brand/15 bg-surface-soft px-4 py-5 text-sm text-muted">
              No published reviews yet for this product.
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
                      <p className="text-sm font-semibold text-brand">
                        {review.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {review.userDisplayName} ·
                        {formatReviewDate(review.createdAt)}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand/8 px-2.5 py-1 text-xs font-semibold text-brand">
                      {renderStarRow(review.rating)} {review.rating.toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {review.comment}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-brand/15 bg-surface p-4">
          {!authenticated ? (
            <p className="text-sm text-muted">
              Sign in to submit a review.
              <Link
                href={`/auth/sign-in?next=${encodeURIComponent(`/shop/${productId}`)}`}
                className="ml-1 font-semibold text-brand hover:text-accent"
                title="Sign in to submit review"
              >
                Sign in
              </Link>
              .
            </p>
          ) : !emailVerified ? (
            <p className="text-sm text-muted">
              Verify your email before posting.
              <Link
                href="/auth/check-email"
                className="ml-1 font-semibold text-brand hover:text-accent"
                title="Open email verification page"
              >
                Verify now
              </Link>
              .
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-sm font-semibold text-brand">Write a review</p>
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Rating
              </label>
              <select
                value={rating}
                onChange={(event) => setRating(Number(event.target.value) || 5)}
                className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                title={`Select rating for ${productName}`}
              >
                <option value={5}>5 - Excellent</option>
                <option value={4}>4 - Very Good</option>
                <option value={3}>3 - Good</option>
                <option value={2}>2 - Fair</option>
                <option value={1}>1 - Poor</option>
              </select>
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="themed-input h-10 w-full rounded-xl px-3 text-sm focus:outline-none"
                placeholder="Short summary of your experience"
                title={`Write review title for ${productName}`}
              />
              <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Review
              </label>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="themed-input min-h-28 w-full rounded-xl px-3 py-2.5 text-sm leading-relaxed focus:outline-none"
                placeholder="Describe fit, durability, comfort, and performance."
                title={`Write detailed review for ${productName}`}
              />
              {errorMessage ? (
                <p className="text-sm text-[var(--status-error-text)]">
                  {errorMessage}
                </p>
              ) : null}
              {notice ? (
                <p className="text-sm text-[var(--status-success-text)]">
                  {notice}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                title={`Submit review for ${productName}`}
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
        </div>
      </div>
    </section>
  );
}
