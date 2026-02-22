"use client";
import { useState } from "react";
import { Check, ShoppingCart } from "lucide-react";
import { Product } from "@/lib/catalog";
import { useCart } from "@/components/cart-context";
interface AddToCartButtonProps {
  product: Product;
  className?: string;
}
export function AddToCartButton({ product, className }: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  function handleAddToCart() {
    addItem(product, 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }
  return (
    <button type="button" onClick={handleAddToCart} className={className}>
      {added ? (
        <Check className="h-4 w-4" />
      ) : (
        <ShoppingCart className="h-4 w-4" />
      )}
      {added ? "Added" : "Add to Cart"}
    </button>
  );
}
