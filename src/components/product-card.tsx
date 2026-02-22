"use client";
import Image from "next/image";
import Link from "next/link";
import { ShoppingCart, View } from "lucide-react";
import { useCart } from "@/components/cart-context";
import { CompareActionButton } from "@/components/compare-action-button";
import { WishlistToggleButton } from "@/components/wishlist-toggle-button";
import { formatPrice, Product } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
} from "@/lib/image-utils";
interface ProductCardProps {
  product: Product;
}
export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const primaryImage = getPrimaryProductImage(product);
  return (
    <article className="group motion-lift">
      <div className="image-frame relative rounded-sm">
        <Link
          href={`/shop/${product.id}`}
          className="relative block aspect-[4/5] overflow-hidden"
          title={`Open ${product.name}`}
        >
          <Image
            src={primaryImage.src}
            alt={primaryImage.alt}
            fill
            sizes="(min-width: 1280px) 24vw, (min-width: 640px) 45vw, 100vw"
            quality={80}
            placeholder="blur"
            blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
            className="image-fit-cover transition-transform duration-[560ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
          />
        </Link>
        <div className="touch-visible-actions absolute right-2.5 top-2.5 z-10 flex flex-col gap-2 transition-all duration-300 ease-out">
          <WishlistToggleButton
            productId={product.id}
            productName={product.name}
            showLabel={false}
            className="media-action-btn inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200"
          />
          <Link
            href={`/shop/${product.id}`}
            title={`View details for ${product.name}`}
            className="media-action-btn inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200"
          >
            <View className="h-4 w-4" />
          </Link>
          <CompareActionButton
            product={product}
            className="media-action-btn inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-200"
          />
        </div>
        <button
          type="button"
          onClick={() => addItem(product, 1)}
          className="touch-visible-cta absolute inset-x-3 bottom-3 z-10 inline-flex h-10 items-center justify-center text-xs font-semibold uppercase tracking-[0.12em] transition-all duration-300 ease-out btn-primary"
          title={`Add ${product.name} to cart`}
        >
          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Add To Cart
        </button>
      </div>
      <div className="pt-3.5 text-center">
        <h3 className="text-[14px] font-medium leading-snug text-brand">
          <Link
            href={`/shop/${product.id}`}
            className="transition-colors duration-200 hover:text-accent"
          >
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-muted">
          {product.category}
        </p>
        <p className="mt-1.5 text-[15px] font-semibold text-brand">
          {formatPrice(product.priceCents)}
        </p>
      </div>
    </article>
  );
}
