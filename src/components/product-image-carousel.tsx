"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
  getProductImageAt,
} from "@/lib/image-utils";
interface ProductImageCarouselProps {
  images: ProductImage[];
  productName?: string;
  className?: string;
}
export function ProductImageCarousel({
  images,
  productName = "Product",
  className,
}: ProductImageCarouselProps) {
  const safeImages = useMemo<ProductImage[]>(() => {
    if (images.length === 0) {
      return [getPrimaryProductImage({ images, name: productName })];
    }
    return images.map((_, index) =>
      getProductImageAt({ images, name: productName }, index),
    );
  }, [images, productName]);
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, Math.max(0, safeImages.length - 1));
  const activeImage = safeImages[activeIndex];
  const hasMultipleImages = safeImages.length > 1;
  function goNext() {
    setIndex((current) => (current + 1) % safeImages.length);
  }
  function goPrev() {
    setIndex(
      (current) => (current - 1 + safeImages.length) % safeImages.length,
    );
  }
  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-[5.25rem_minmax(0,1fr)]">
        {hasMultipleImages ? (
          <div className="order-2 flex gap-2 overflow-x-auto pb-1 md:order-1 md:max-h-[34rem] md:flex-col md:overflow-y-auto md:overflow-x-visible">
            {safeImages.map((image, imageIndex) => {
              const isActive = imageIndex === activeIndex;
              return (
                <button
                  key={`${image.src}-thumb-${imageIndex}`}
                  type="button"
                  onClick={() => setIndex(imageIndex)}
                  className={`image-frame relative h-20 w-20 shrink-0 rounded-lg transition ${isActive ? "border-[var(--brand-action)] shadow-[0_0_0_1px_var(--brand-action)]" : "border-brand/15 hover:border-brand/40"}`}
                  aria-label={`Select image ${imageIndex + 1}`}
                  title={`View image ${imageIndex + 1}`}
                >
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="80px"
                    quality={74}
                    placeholder="blur"
                    blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                    className="image-fit-cover"
                  />
                </button>
              );
            })}
          </div>
        ) : null}
        <div
          className={`image-frame relative rounded-2xl ${hasMultipleImages ? "order-1 md:order-2" : ""}`}
        >
          <div className="relative aspect-[4/5] w-full">
            <Image
              src={activeImage.src}
              alt={activeImage.alt}
              fill
              sizes="(min-width: 1024px) 56vw, 100vw"
              quality={88}
              priority
              placeholder="blur"
              blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
              className="image-fit-cover"
            />
          </div>
          {hasMultipleImages ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="media-action-btn absolute left-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-200"
                aria-label="Previous image"
                title="Previous image"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="media-action-btn absolute right-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition-colors duration-200"
                aria-label="Next image"
                title="Next image"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="absolute bottom-3 right-3 inline-flex rounded-full border border-brand/20 bg-surface/90 px-2.5 py-1 text-xs font-semibold text-brand">
                {activeIndex + 1}/{safeImages.length}
              </span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
