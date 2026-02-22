"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart, LoaderCircle } from "lucide-react";
import { useWishlist } from "@/components/wishlist-context";
interface WishlistToggleButtonProps {
  productId: string;
  productName: string;
  className?: string;
  showLabel?: boolean;
  stopPropagation?: boolean;
}
export function WishlistToggleButton({
  productId,
  productName,
  className,
  showLabel = true,
  stopPropagation = false,
}: WishlistToggleButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { hasItem, isReady, toggleItem } = useWishlist();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inWishlist = hasItem(productId);
  return (
    <button
      type="button"
      onClick={async (event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        if (isSubmitting) {
          return;
        }
        setIsSubmitting(true);
        setFeedback(null);
        try {
          const result = await toggleItem(productId);
          if (result === "auth-required") {
            const query =
              typeof window !== "undefined" ? window.location.search : "";
            const nextPath = `${pathname}${query}`;
            router.push(`/auth/sign-in?next=${encodeURIComponent(nextPath)}`);
            return;
          }
          if (result === "forbidden") {
            setFeedback("Verify your email first.");
            return;
          }
          if (result === "error") {
            setFeedback("Could not update wishlist.");
            return;
          }
          setFeedback(
            result === "added"
              ? "Saved to wishlist."
              : "Removed from wishlist.",
          );
        } finally {
          setIsSubmitting(false);
        }
      }}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-semibold btn-secondary"
      }
      aria-label={`${inWishlist ? "Remove" : "Add"} ${productName} ${inWishlist ? "from" : "to"} wishlist`}
      title={
        feedback || (inWishlist ? "Saved in wishlist" : "Save to wishlist")
      }
      disabled={isSubmitting || !isReady}
    >
      {isSubmitting ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Heart className={`h-4 w-4 ${inWishlist ? "fill-current" : ""}`} />
      )}
      {showLabel ? (inWishlist ? "Saved" : "Wishlist") : null}
    </button>
  );
}
