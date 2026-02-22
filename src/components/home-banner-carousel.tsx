"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { DEFAULT_IMAGE_BLUR_DATA_URL } from "@/lib/image-utils";
import { HomeHeroSlide } from "@/lib/hero-slides";
interface HomeBannerCarouselProps {
  slides: HomeHeroSlide[];
}
const heroBackgrounds = [
  "linear-gradient(120deg, color-mix(in oklab, var(--accent) 24%, var(--surface) 76%) 0%, color-mix(in oklab, var(--brand-action) 10%, var(--surface-soft) 90%) 100%)",
  "linear-gradient(120deg, color-mix(in oklab, var(--brand-action) 18%, var(--surface) 82%) 0%, color-mix(in oklab, var(--accent) 14%, var(--surface-soft) 86%) 100%)",
  "linear-gradient(120deg, color-mix(in oklab, var(--tone-fitness-to) 20%, var(--surface) 80%) 0%, color-mix(in oklab, var(--accent) 10%, var(--surface-soft) 90%) 100%)",
];
type HeroImageOrientation = "portrait" | "square" | "landscape";
function resolveImageOrientation(
  width: number | undefined,
  height: number | undefined,
): HeroImageOrientation | null {
  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }
  const ratio = width / height;
  if (ratio < 0.9) {
    return "portrait";
  }
  if (ratio > 1.1) {
    return "landscape";
  }
  return "square";
}
function getHeroMediaHeightClass(orientation: HeroImageOrientation): string {
  if (orientation === "portrait") {
    return "h-52 sm:h-72 lg:h-[20rem]";
  }
  if (orientation === "square") {
    return "h-48 sm:h-64 lg:h-[18.5rem]";
  }
  return "h-44 sm:h-56 lg:h-64";
}
export function HomeBannerCarousel({ slides }: HomeBannerCarouselProps) {
  const [index, setIndex] = useState(0);
  const [loadedOrientationBySlide, setLoadedOrientationBySlide] = useState<
    Record<string, HeroImageOrientation>
  >({});
  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [slides.length]);
  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }
    const nextSlide = slides[(index + 1) % slides.length];
    const preloadImage = new window.Image();
    preloadImage.src = nextSlide.image.src;
  }, [index, slides]);
  const previewSlides = useMemo(() => {
    if (slides.length <= 1) {
      return [];
    }
    const items: HomeHeroSlide[] = [];
    for (let offset = 1; offset < Math.min(slides.length, 4); offset += 1) {
      items.push(slides[(index + offset) % slides.length]);
    }
    return items;
  }, [index, slides]);
  const inferredOrientationBySlide = useMemo<
    Record<string, HeroImageOrientation>
  >(
    () =>
      slides.reduce<Record<string, HeroImageOrientation>>((acc, slide) => {
        const orientation = resolveImageOrientation(
          slide.image.width,
          slide.image.height,
        );
        if (orientation) {
          acc[slide.id] = orientation;
        }
        return acc;
      }, {}),
    [slides],
  );
  const activeBackground = heroBackgrounds[index % heroBackgrounds.length];
  if (slides.length === 0) {
    return (
      <div className="surface-card rounded-2xl p-8 text-sm text-muted">
        No featured banners available.
      </div>
    );
  }
  const activeSlide = slides[index];
  const activeOrientation =
    loadedOrientationBySlide[activeSlide.id] ||
    inferredOrientationBySlide[activeSlide.id] ||
    "landscape";
  const mediaHeightClass = getHeroMediaHeightClass(activeOrientation);
  function showNextSlide() {
    setIndex((current) => (current + 1) % slides.length);
  }
  function showPrevSlide() {
    setIndex((current) => (current - 1 + slides.length) % slides.length);
  }
  return (
    <section className="surface-card relative overflow-hidden rounded-2xl sm:rounded-3xl">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -left-24 h-56 w-56 rounded-full bg-[var(--overlay-white-20)] blur-3xl" />
        <div className="absolute right-0 bottom-0 h-56 w-56 rounded-full bg-[var(--overlay-black-08)] blur-3xl" />
      </div>
      <div
        className="relative grid min-h-[20rem] gap-5 px-5 py-6 sm:min-h-[22rem] sm:px-7 sm:py-7 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:gap-7 lg:px-9"
        style={{ background: activeBackground }}
      >
        <div className="z-10">
          <p className="inline-flex rounded-full border border-brand/20 bg-surface/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            {activeSlide.badge}
          </p>
          <h2 className="mt-4 max-w-xl text-2xl font-semibold leading-tight text-brand sm:text-4xl lg:text-5xl">
            {activeSlide.title}
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-brand sm:text-base">
            {activeSlide.subtitle}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link
              href={activeSlide.href}
              title={`Shop ${activeSlide.title} now`}
              className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold btn-primary"
            >
              Shop now <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/shop"
              title="Browse all sports collections"
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-surface/85 px-5 py-2.5 text-sm font-semibold text-brand transition hover:border-brand/45"
            >
              Explore all deals
            </Link>
          </div>
          {slides.length > 1 ? (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand/15 bg-surface/75 px-2.5 py-1.5">
              <button
                type="button"
                onClick={showPrevSlide}
                className="media-action-btn inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200"
                aria-label="Previous banner slide"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {slides.map((slide, slideIndex) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  className={`h-2.5 w-2.5 rounded-full transition ${slideIndex === index ? "bg-[var(--brand-action)]" : "bg-brand/20 hover:bg-brand/35"}`}
                  aria-label={`Go to banner ${slideIndex + 1}`}
                />
              ))}
              <button
                type="button"
                onClick={showNextSlide}
                className="media-action-btn inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200"
                aria-label="Next banner slide"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        <div className="z-10 grid gap-3">
          <Link
            href={activeSlide.href}
            className={`image-frame group relative ${mediaHeightClass} overflow-hidden rounded-2xl bg-surface/80 shadow-[var(--shadow)]`}
            title={`Open featured hero deal: ${activeSlide.title}`}
          >
            <div className="pointer-events-none absolute inset-2 z-[1] rounded-[1.05rem] border border-brand/12 bg-[linear-gradient(160deg,color-mix(in_oklab,var(--surface)_72%,transparent)_0%,color-mix(in_oklab,var(--surface-soft)_72%,transparent)_100%)]" />
            <div className="pointer-events-none absolute inset-x-8 bottom-4 z-[1] h-5 rounded-full bg-[var(--overlay-black-35)] blur-xl opacity-45" />
            <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_78%_20%,var(--overlay-white-35)_0%,transparent_55%)]" />
            <Image
              src={activeSlide.image.src}
              alt={activeSlide.image.alt}
              fill
              sizes="(min-width: 1024px) 38vw, 100vw"
              quality={90}
              placeholder="blur"
              blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
              fetchPriority={index === 0 ? "high" : "low"}
              loading={index === 0 ? "eager" : "lazy"}
              priority={index === 0}
              onLoad={(event) => {
                const orientation = resolveImageOrientation(
                  event.currentTarget.naturalWidth,
                  event.currentTarget.naturalHeight,
                );
                if (!orientation) {
                  return;
                }
                setLoadedOrientationBySlide((current) => {
                  if (current[activeSlide.id] === orientation) {
                    return current;
                  }
                  return { ...current, [activeSlide.id]: orientation };
                });
              }}
              className="z-[2] image-fit-cover transition duration-500 ease-out group-hover:scale-[1.03]"
            />
          </Link>
          {previewSlides.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5">
              {previewSlides.map((slide) => (
                <Link
                  key={`preview-${slide.id}`}
                  href={slide.href}
                  title={`Open ${slide.title}`}
                  className="rounded-xl border border-brand/15 bg-surface/82 p-2 text-center transition hover:-translate-y-0.5 hover:border-brand/35"
                >
                  <div className="image-frame relative mx-auto h-14 w-14 rounded-full sm:h-16 sm:w-16">
                    <Image
                      src={slide.image.src}
                      alt={slide.image.alt}
                      fill
                      sizes="64px"
                      quality={72}
                      placeholder="blur"
                      blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                      className="image-fit-cover"
                    />
                  </div>
                  <p className="mt-2 line-clamp-1 text-[11px] font-semibold text-brand sm:text-xs">
                    {slide.title}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
