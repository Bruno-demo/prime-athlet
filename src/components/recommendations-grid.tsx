"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { formatPrice, Product } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
} from "@/lib/image-utils";

interface RecommendationsGridProps {
  products: Product[];
}

const INITIAL_VISIBLE_COUNT = 8;
const LOAD_MORE_STEP = 4;

export function RecommendationsGrid({ products }: RecommendationsGridProps) {
  const recommendationProducts = useMemo(
    () => products.filter((product) => product.images.length > 0).slice(0, 32),
    [products],
  );

  const [visibleCount, setVisibleCount] = useState(
    Math.min(INITIAL_VISIBLE_COUNT, recommendationProducts.length),
  );

  if (recommendationProducts.length === 0) {
    return null;
  }

  const visibleProducts = recommendationProducts.slice(0, visibleCount);
  const canLoadMore = visibleCount < recommendationProducts.length;

  return (
    <article className="surface-card rounded-2xl p-5 sm:p-6">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold text-brand sm:text-3xl">
            Recommended Products
          </h3>
          <p className="mt-1 text-sm text-muted">
            Curated picks based on performance and athlete demand.
          </p>
        </div>
        <Link
          href="/shop"
          className="text-sm font-semibold text-brand transition hover:text-accent"
        >
          View all
        </Link>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {visibleProducts.map((product) => {
          const primaryImage = getPrimaryProductImage(product);
          return (
            <Link
              key={`recommend-${product.id}`}
              href={`/shop/${product.id}`}
              className="motion-lift rounded-xl border border-brand/12 bg-surface p-3 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="image-frame relative aspect-[4/5] rounded-lg">
                <Image
                  src={primaryImage.src}
                  alt={primaryImage.alt}
                  fill
                  sizes="(min-width: 1280px) 20vw, (min-width: 768px) 30vw, 50vw"
                  quality={80}
                  placeholder="blur"
                  blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                  className="image-fit-cover"
                />
              </div>
              <p className="mt-3 line-clamp-2 text-sm font-semibold text-brand">
                {product.name}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.1em] text-muted">
                {product.category}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-brand">
                  {formatPrice(product.priceCents)}
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                  View <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {canLoadMore ? (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((current) =>
                Math.min(current + LOAD_MORE_STEP, recommendationProducts.length),
              )
            }
            className="inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold btn-secondary"
            title="Load more recommendations"
          >
            Load more
          </button>
        </div>
      ) : null}
    </article>
  );
}

