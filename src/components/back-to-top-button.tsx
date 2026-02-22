"use client";
import { ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
const SHOW_AFTER_SCROLL_Y = 420;
export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > SHOW_AFTER_SCROLL_Y);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Back to top"
      aria-label="Back to top"
      className={`theme-fab-button fixed bottom-5 right-4 z-[70] inline-flex h-10 w-10 items-center justify-center rounded-full sm:bottom-6 sm:right-6 ${isVisible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}
    >
      <ChevronUp className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
