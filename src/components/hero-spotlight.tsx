"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { DEFAULT_IMAGE_BLUR_DATA_URL } from "@/lib/image-utils";
import { renderSportIcon } from "@/lib/sport-icons";
export interface HeroSpotlightSlide {
  id: string;
  name: string;
  sport: string;
  badge: string;
  description: string;
  priceCents: number;
  image: { src: string; alt: string };
}
interface HeroSpotlightProps {
  slides: HeroSpotlightSlide[];
}
export function HeroSpotlight({ slides }: HeroSpotlightProps) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [slides.length]);
  if (slides.length === 0) {
    return null;
  }
  const activeSlide = slides[index];
  function goNext() {
    setIndex((current) => (current + 1) % slides.length);
  }
  function goPrev() {
    setIndex((current) => (current - 1 + slides.length) % slides.length);
  }
  return (
    <div className="surface-card image-frame relative rounded-3xl">
      <div className="relative h-[23rem]">
        <Image
          src={activeSlide.image.src}
          alt={activeSlide.image.alt}
          fill
          sizes="(min-width: 1280px) 36vw, (min-width: 1024px) 40vw, 100vw"
          quality={84}
          placeholder="blur"
          blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
          className="image-fit-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--overlay-black-75)] via-[var(--overlay-black-30)] to-[var(--overlay-black-05)]" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-[var(--color-on-solid)]">
          <p className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-[var(--color-on-solid-90)]">
            {renderSportIcon(activeSlide.sport, {
              className: "h-4 w-4",
              toned: true,
            })}
            {activeSlide.sport}
          </p>
          <h3 className="mt-2 text-2xl font-semibold leading-tight">
            {activeSlide.name}
          </h3>
          <p className="mt-2 line-clamp-2 text-sm text-[var(--color-on-solid-85)]">
            {activeSlide.description}
          </p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-on-solid-75)]">
                {activeSlide.badge}
              </p>
              <p className="text-lg font-semibold">
                {formatPrice(activeSlide.priceCents)}
              </p>
            </div>
            <Link
              href={`/shop/${activeSlide.id}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--overlay-white-35)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-on-solid)] transition hover:border-[var(--color-on-solid)] hover:bg-[var(--overlay-white-15)] whitespace-nowrap"
            >
              Explore <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        {slides.length > 1 ? (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="media-action-btn absolute left-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200"
              aria-label="Previous hero slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="media-action-btn absolute right-3 top-4 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-200"
              aria-label="Next hero slide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
      {slides.length > 1 ? (
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[var(--overlay-black-30)] px-3 py-1.5">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setIndex(slideIndex)}
              className={`h-2.5 w-2.5 rounded-full transition ${slideIndex === index ? "bg-[var(--color-on-solid)]" : "bg-[var(--overlay-white-40)] hover:bg-[var(--overlay-white-70)]"}`}
              aria-label={`Go to slide ${slideIndex + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
