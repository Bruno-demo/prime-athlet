"use client";
import Image from "next/image";
interface BrandLogoProps {
  className?: string;
  inverted?: boolean;
  showTagline?: boolean;
  hideTextOnMobile?: boolean;
  size?: "sm" | "md" | "lg";
}
const LOGO_MARK_LIGHT_THEME_SRC =
  "/branding/prime-athlete-mark-light-theme.png";
const LOGO_MARK_DARK_THEME_SRC = "/branding/prime-athlete-mark-dark-theme.png";
const LOGO_WORDMARK_LIGHT_THEME_SRC =
  "/branding/prime-athlete-wordmark-light-theme.png";
const LOGO_WORDMARK_DARK_THEME_SRC =
  "/branding/prime-athlete-wordmark-dark-theme.png";
const sizeClasses = {
  sm: {
    iconClass: "h-8 w-auto",
    wordmarkClass: "h-6 w-auto",
    gapClass: "gap-2",
    taglineClass: "text-[8px]",
  },
  md: {
    iconClass: "h-9 w-auto",
    wordmarkClass: "h-7 w-auto",
    gapClass: "gap-2.5",
    taglineClass: "text-[9px]",
  },
  lg: {
    iconClass: "h-11 w-auto",
    wordmarkClass: "h-9 w-auto",
    gapClass: "gap-3",
    taglineClass: "text-[10px]",
  },
} as const;
export function BrandLogo({
  className = "",
  inverted = false,
  showTagline = false,
  hideTextOnMobile = false,
  size = "md",
}: BrandLogoProps) {
  const scale = sizeClasses[size];
  const wordmarkVisibility = hideTextOnMobile ? "hidden sm:block" : "block";
  const taglineTone = inverted
    ? "text-[var(--color-on-solid-75)]"
    : "text-muted";
  return (
    <span className={`inline-flex items-center ${scale.gapClass} ${className}`}>
      <span className="theme-logo-for-light">
        <Image
          src={LOGO_MARK_LIGHT_THEME_SRC}
          alt="Prime Athlete"
          width={215}
          height={329}
          className={`${scale.iconClass} object-contain`}
          priority
        />
      </span>
      <span className="theme-logo-for-dark">
        <Image
          src={LOGO_MARK_DARK_THEME_SRC}
          alt="Prime Athlete"
          width={215}
          height={329}
          className={`${scale.iconClass} object-contain`}
          priority
        />
      </span>
      <span className={`${wordmarkVisibility} leading-none`}>
        <span className="theme-logo-for-light">
          <Image
            src={LOGO_WORDMARK_LIGHT_THEME_SRC}
            alt="Prime Athlete"
            width={502}
            height={187}
            className={scale.wordmarkClass}
            priority
          />
        </span>
        <span className="theme-logo-for-dark">
          <Image
            src={LOGO_WORDMARK_DARK_THEME_SRC}
            alt="Prime Athlete"
            width={502}
            height={187}
            className={scale.wordmarkClass}
            priority
          />
        </span>
        {showTagline ? (
          <span
            className={`mt-1 block font-semibold uppercase tracking-[0.12em] ${scale.taglineClass} ${taglineTone}`}
          >
            Performance Marketplace
          </span>
        ) : null}
      </span>
    </span>
  );
}
