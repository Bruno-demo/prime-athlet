"use client";

import Link from "next/link";
import { MessageCircleMore, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function FloatingSupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function onOutsidePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (!containerRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onOutsidePointer);
    document.addEventListener("touchstart", onOutsidePointer);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onOutsidePointer);
      document.removeEventListener("touchstart", onOutsidePointer);
    };
  }, [isOpen]);

  return (
    <div
      ref={containerRef}
      className="fixed bottom-6 right-2 z-[55] sm:bottom-8 sm:right-4"
    >
      <div className="flex flex-col items-end gap-2.5 sm:gap-3">
        {isOpen ? (
          <div className="w-[14.5rem] rounded-2xl border border-brand/15 bg-surface p-3 shadow-[0_16px_34px_var(--overlay-black-30)] backdrop-blur sm:w-[16rem]">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-brand">Need help fast?</p>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full btn-secondary"
                title="Close support popup"
                aria-label="Close support popup"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Open FAQ or submit a support ticket and track updates in one
              place.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <Link
                href="/support#help-center"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl text-xs font-semibold btn-secondary"
                title="Open FAQ and help center"
              >
                Open FAQ
              </Link>
              <Link
                href="/support#report-concern"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl text-xs font-semibold btn-primary"
                title="Open support ticket center"
              >
                Open Support Ticket
              </Link>
            </div>
          </div>
        ) : null}

        <Link
          href="/support#help-center"
          className="inline-flex h-11 w-[4.8rem] items-center justify-center rounded-[1.2rem] border border-[var(--overlay-white-24)] bg-[linear-gradient(165deg,var(--brand-action)_0%,color-mix(in_oklab,var(--brand-action)_74%,var(--brand)_26%)_100%)] text-[1.6rem] font-semibold tracking-tight text-[var(--color-on-solid)] shadow-[0_14px_30px_var(--overlay-black-45)] transition hover:brightness-105 sm:h-[3.3rem] sm:w-[5.8rem] sm:rounded-[1.4rem] sm:text-[1.95rem]"
          title="FAQ"
        >
          FAQ
        </Link>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--overlay-white-24)] bg-[linear-gradient(165deg,var(--brand-action)_0%,color-mix(in_oklab,var(--brand-action)_66%,var(--brand)_34%)_100%)] text-[var(--color-on-solid)] shadow-[0_16px_34px_var(--overlay-black-45)] transition hover:brightness-105 sm:h-[4.1rem] sm:w-[4.1rem]"
          title="Open support popup"
          aria-label="Open support popup"
          aria-expanded={isOpen}
        >
          <MessageCircleMore className="h-7 w-7 sm:h-8 sm:w-8" />
        </button>
      </div>
    </div>
  );
}
