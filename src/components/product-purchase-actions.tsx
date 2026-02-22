"use client";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart-context";
import { CompareActionButton } from "@/components/compare-action-button";
import { WishlistToggleButton } from "@/components/wishlist-toggle-button";
import {
  getDefaultProductColors,
  getDefaultProductSizes,
  Product,
} from "@/lib/catalog";
interface ProductPurchaseActionsProps {
  product: Product;
}
export function ProductPurchaseActions({
  product,
}: ProductPurchaseActionsProps) {
  const { addItem } = useCart();
  const router = useRouter();
  const sizeOptions = useMemo(
    () =>
      Array.isArray(product.sizes) && product.sizes.length > 0
        ? product.sizes
        : getDefaultProductSizes(product.category),
    [product.category, product.sizes],
  );
  const colorOptions = useMemo(
    () =>
      Array.isArray(product.colors) && product.colors.length > 0
        ? product.colors
        : getDefaultProductColors(product.sport, product.category),
    [product.category, product.colors, product.sport],
  );
  const [selectedSize, setSelectedSize] = useState(
    sizeOptions[0] || "One Size",
  );
  const [selectedColor, setSelectedColor] = useState(
    colorOptions[0] || "Black",
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  function changeQuantity(delta: number) {
    setQuantity((current) => Math.min(12, Math.max(1, current + delta)));
  }
  function handleAddToCart() {
    addItem(product, quantity, {
      size: selectedSize,
      color: selectedColor,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1200);
  }
  function handleBuyNow() {
    addItem(product, quantity, {
      size: selectedSize,
      color: selectedColor,
    });
    router.push("/cart");
  }
  return (
    <div className="mt-6 space-y-4 sm:space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Size
          </span>
          <select
            value={selectedSize}
            onChange={(event) => setSelectedSize(event.target.value)}
            suppressHydrationWarning
            className="themed-input h-11 w-full rounded-lg px-3 text-sm focus:outline-none"
            title="Choose product size"
          >
            {sizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Color
          </span>
          <select
            value={selectedColor}
            onChange={(event) => setSelectedColor(event.target.value)}
            className="themed-input h-11 w-full rounded-lg px-3 text-sm focus:outline-none"
            title="Choose product color"
          >
            {colorOptions.map((color) => (
              <option key={color} value={color}>
                {color}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
            Quantity
          </span>
          <div className="themed-input flex h-11 items-center rounded-lg px-1.5">
            <button
              type="button"
              onClick={() => changeQuantity(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand transition hover:bg-surface-soft"
              aria-label="Decrease quantity"
              title="Decrease quantity"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="grid min-w-[2.25rem] flex-1 place-items-center text-sm font-semibold text-brand">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => changeQuantity(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-brand transition hover:bg-surface-soft"
              aria-label="Increase quantity"
              title="Increase quantity"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={handleAddToCart}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold btn-primary sm:h-11"
          title={`Add ${quantity} ${product.name} to cart`}
        >
          {added ? (
            <Check className="h-4 w-4" />
          ) : (
            <ShoppingCart className="h-4 w-4" />
          )}
          {added ? "Added" : "Add to cart"}
        </button>
        <button
          type="button"
          onClick={handleBuyNow}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold btn-secondary sm:h-11"
          title={`Buy ${quantity} ${product.name} now`}
        >
          Buy it now
        </button>
      </div>
      <div className="grid gap-2.5 pt-1 sm:grid-cols-2">
        <WishlistToggleButton
          productId={product.id}
          productName={product.name}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold btn-secondary sm:h-11"
        />
        <CompareActionButton
          product={product}
          showLabel
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold btn-secondary sm:h-11"
        />
      </div>
      <p className="text-xs text-muted">
        Selected:{" "}
        <span className="font-semibold text-brand">{selectedSize}</span>
        {" / "}
        <span className="font-semibold text-brand">{selectedColor}</span>
      </p>
    </div>
  );
}
