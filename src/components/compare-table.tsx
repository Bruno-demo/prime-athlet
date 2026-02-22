"use client";
import Image from "next/image";
import Link from "next/link";
import { Scale, ShoppingCart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  compareItemToProduct,
  CompareItem,
  useCompare,
} from "@/components/compare-context";
import { useCart } from "@/components/cart-context";
import { formatPrice } from "@/lib/catalog";
interface CompareRowDefinition {
  id: string;
  label: string;
  renderValue: (item: CompareItem) => string;
}
const rowDefinitions: CompareRowDefinition[] = [
  {
    id: "price",
    label: "Price",
    renderValue: (item) => formatPrice(item.priceCents),
  },
  { id: "sport", label: "Sport", renderValue: (item) => item.sport },
  { id: "category", label: "Category", renderValue: (item) => item.category },
  {
    id: "rating",
    label: "Rating",
    renderValue: (item) => `${item.rating.toFixed(1)} / 5`,
  },
  {
    id: "reviews",
    label: "Reviews",
    renderValue: (item) => `${item.reviews} total`,
  },
  { id: "badge", label: "Badge", renderValue: (item) => item.badge },
  {
    id: "description",
    label: "Description",
    renderValue: (item) => item.description,
  },
];
function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}
export function CompareTable() {
  const { items, clearItems, removeItem } = useCompare();
  const { addItem } = useCart();
  const [highlightDifferences, setHighlightDifferences] = useState(true);
  const rowDifferenceMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of rowDefinitions) {
      const uniqueValues = new Set(
        items.map((item) => normalizeValue(row.renderValue(item))),
      );
      map.set(row.id, uniqueValues.size > 1);
    }
    return map;
  }, [items]);
  if (items.length === 0) {
    return (
      <article className="surface-card rounded-2xl p-6 text-sm text-muted">
        Compare list is empty. Add products from shop cards or product detail
        pages, then come back for side-by-side analysis.
      </article>
    );
  }
  return (
    <section className="space-y-4">
      <div className="surface-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent">
            <Scale className="h-4 w-4" /> Compare Center
          </p>
          <p className="mt-1 text-sm text-muted">
            {items.length} products selected for side-by-side comparison.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setHighlightDifferences((current) => !current)}
            className={`inline-flex h-10 items-center rounded-lg border px-3 text-sm font-semibold transition ${highlightDifferences ? "btn-primary" : "btn-secondary"}`}
            title="Toggle highlighting for different values"
          >
            {highlightDifferences ? "Differences: On" : "Differences: Off"}
          </button>
          <button
            type="button"
            onClick={clearItems}
            className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold btn-secondary"
            title="Clear all compared products"
          >
            <Trash2 className="h-4 w-4" /> Clear all
          </button>
        </div>
      </div>
      <div className="admin-table-wrap admin-table-mobile rounded-2xl">
        <table className="admin-table min-w-[58rem] table-fixed text-sm">
          <thead>
            <tr>
              <th className="w-[12rem]">Feature</th>
              {items.map((item) => (
                <th
                  key={`compare-head-${item.id}`}
                  className="w-[14rem] align-top"
                >
                  <div className="space-y-2 text-left">
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-brand/15 bg-surface-soft">
                      <Image
                        src={item.imageSrc}
                        alt={item.imageAlt}
                        fill
                        sizes="(min-width: 1024px) 220px, 45vw"
                        className="image-fit-cover"
                      />
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold text-brand">
                      {item.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => addItem(compareItemToProduct(item), 1)}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold btn-primary"
                        title={`Add ${item.name} to cart`}
                      >
                        <ShoppingCart className="h-3.5 w-3.5" /> Add
                      </button>
                      <Link
                        href={`/shop/${item.id}`}
                        className="inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold btn-secondary"
                        title={`Open ${item.name} details`}
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="inline-flex h-8 items-center rounded-md px-2.5 text-[11px] font-semibold btn-secondary"
                        title={`Remove ${item.name} from compare`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowDefinitions.map((row) => {
              const differs = rowDifferenceMap.get(row.id) === true;
              const shouldHighlight = highlightDifferences && differs;
              return (
                <tr key={`compare-row-${row.id}`}>
                  <td className="font-semibold text-brand">{row.label}</td>
                  {items.map((item) => (
                    <td
                      key={`compare-row-${row.id}-${item.id}`}
                      className={
                        shouldHighlight
                          ? "bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface)_90%)]"
                          : ""
                      }
                    >
                      <span className="text-muted">
                        {row.renderValue(item)}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
