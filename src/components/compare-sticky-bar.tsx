"use client";
import Image from "next/image";
import Link from "next/link";
import { Scale, Trash2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCompare } from "@/components/compare-context";
function shouldHideCompareBar(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/compare")
  );
}
export function CompareStickyBar() {
  const pathname = usePathname();
  const { items, itemCount, clearItems, removeItem, maxItems } = useCompare();
  if (itemCount === 0 || shouldHideCompareBar(pathname)) {
    return null;
  }
  return (
    <div className="fixed inset-x-0 bottom-3 z-50 px-2 sm:px-4">
      <div className="section-shell">
        <div className="surface-card mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-2xl border border-brand/20 p-3 shadow-[0_16px_32px_var(--overlay-black-30)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
              <Scale className="h-4 w-4 text-accent" /> Compare Bar
            </p>
            <p className="mt-1 text-xs text-muted">
              {itemCount}/{maxItems} selected
            </p>
            <div className="mt-2 flex max-w-full items-center gap-2 overflow-x-auto pb-1">
              {items.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full border border-brand/15 bg-surface-soft pr-2"
                  title={item.name}
                >
                  <span className="relative h-8 w-8 overflow-hidden rounded-full border border-brand/15 bg-surface">
                    <Image
                      src={item.imageSrc}
                      alt={item.imageAlt}
                      fill
                      sizes="32px"
                      className="image-fit-cover"
                    />
                  </span>
                  <span className="max-w-[9rem] truncate text-xs font-semibold text-brand">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full btn-secondary"
                    aria-label={`Remove ${item.name} from compare`}
                    title={`Remove ${item.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={clearItems}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold btn-secondary"
              title="Clear compare selections"
            >
              <Trash2 className="h-4 w-4" /> Clear
            </button>
            <Link
              href="/compare"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold btn-primary"
              title="Open compare table"
            >
              <Scale className="h-4 w-4" /> Compare ({itemCount})
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
