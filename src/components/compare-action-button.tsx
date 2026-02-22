"use client";
import { useState } from "react";
import { LoaderCircle, Scale } from "lucide-react";
import { useCompare } from "@/components/compare-context";
import { Product } from "@/lib/catalog";
interface CompareActionButtonProps {
  product: Product;
  className?: string;
  showLabel?: boolean;
  stopPropagation?: boolean;
}
export function CompareActionButton({
  product,
  className,
  showLabel = false,
  stopPropagation = false,
}: CompareActionButtonProps) {
  const { hasItem, toggleProduct, maxItems } = useCompare();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const inCompare = hasItem(product.id);
  return (
    <button
      type="button"
      onClick={(event) => {
        if (stopPropagation) {
          event.stopPropagation();
        }
        if (isSubmitting) {
          return;
        }
        setIsSubmitting(true);
        setFeedback(null);
        try {
          const result = toggleProduct(product);
          if (result === "added") {
            setFeedback("Added to compare.");
            return;
          }
          if (result === "removed") {
            setFeedback("Removed from compare.");
            return;
          }
          if (result === "limit-reached") {
            setFeedback(`Compare limit reached (${maxItems}).`);
            return;
          }
          setFeedback("Already in compare.");
        } finally {
          setIsSubmitting(false);
        }
      }}
      className={
        className ||
        "inline-flex items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm font-semibold btn-secondary"
      }
      aria-label={`${inCompare ? "Remove" : "Add"} ${product.name} ${inCompare ? "from" : "to"} compare`}
      title={feedback || (inCompare ? "Remove from compare" : "Add to compare")}
      disabled={isSubmitting}
    >
      {isSubmitting ? (
        <LoaderCircle className="h-4 w-4 animate-spin" />
      ) : (
        <Scale className={`h-4 w-4 ${inCompare ? "fill-current" : ""}`} />
      )}
      {showLabel ? (inCompare ? "Compared" : "Compare") : null}
    </button>
  );
}
