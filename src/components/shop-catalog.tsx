"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Grid3X3,
  List,
  Search,
  SlidersHorizontal,
  ShoppingCart,
  View,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart-context";
import { CompareActionButton } from "@/components/compare-action-button";
import { WishlistToggleButton } from "@/components/wishlist-toggle-button";
import { formatPrice, Product } from "@/lib/catalog";
import {
  DEFAULT_IMAGE_BLUR_DATA_URL,
  getPrimaryProductImage,
} from "@/lib/image-utils";
import { renderSportIcon } from "@/lib/sport-icons";
const sortOptions = [
  { id: "featured", label: "Featured" },
  { id: "name-asc", label: "Alphabetically, A-Z" },
  { id: "name-desc", label: "Alphabetically, Z-A" },
  { id: "price-low", label: "Price, low to high" },
  { id: "price-high", label: "Price, high to low" },
  { id: "rating", label: "Top rated" },
] as const;
const toneFilterOptions = [
  { value: "All Colors", label: "All Colors", swatch: "bg-surface-soft" },
  {
    value: "Field",
    label: "Field",
    swatch: "bg-[color-mix(in_oklab,var(--tone-field-to)_65%,white_35%)]",
  },
  {
    value: "Court",
    label: "Court",
    swatch: "bg-[color-mix(in_oklab,var(--tone-court-to)_65%,white_35%)]",
  },
  {
    value: "Street",
    label: "Street",
    swatch: "bg-[color-mix(in_oklab,var(--tone-street-to)_65%,white_35%)]",
  },
  {
    value: "Fitness",
    label: "Fitness",
    swatch: "bg-[color-mix(in_oklab,var(--tone-fitness-to)_65%,white_35%)]",
  },
  {
    value: "Outdoor",
    label: "Outdoor",
    swatch: "bg-[color-mix(in_oklab,var(--tone-outdoor-to)_65%,white_35%)]",
  },
] as const;
const tagSwatchClassBySlug: Record<string, string> = {
  football: "bg-[var(--sport-icon-football)]",
  basketball: "bg-[var(--sport-icon-basketball)]",
  running: "bg-[var(--sport-icon-running)]",
  training: "bg-[var(--sport-icon-training)]",
  outdoor: "bg-[var(--sport-icon-outdoor)]",
  accessories: "bg-[color-mix(in_oklab,var(--tone-fitness-to)_72%,white_28%)]",
  apparel: "bg-[color-mix(in_oklab,var(--tone-field-to)_72%,white_28%)]",
  bags: "bg-[color-mix(in_oklab,var(--tone-outdoor-to)_72%,white_28%)]",
  footwear: "bg-[color-mix(in_oklab,var(--tone-street-to)_72%,white_28%)]",
  "all-tags": "bg-surface-soft",
};
const releaseBadgePattern = /\b(new|arrival|drop|latest)\b/i;
const PRODUCTS_PER_PAGE = 12;
export type SortId = (typeof sortOptions)[number]["id"];
export type ShopCatalogLayout = "grid" | "list";
export type ShopCatalogView =
  | "all"
  | "deals"
  | "top-rated"
  | "shipping"
  | "new-releases";
interface ShopCatalogProps {
  products: Product[];
  taxonomySports?: string[];
  taxonomyCategories?: string[];
  initialSport?: string;
  initialCategory?: string;
  initialTone?: string;
  initialTag?: string;
  initialSortBy?: SortId;
  initialSearch?: string;
  initialView?: ShopCatalogView;
  initialLayout?: ShopCatalogLayout;
  initialPage?: number;
}
function getViewLabel(view: ShopCatalogView): string | null {
  if (view === "all") {
    return null;
  }
  if (view === "top-rated") {
    return "Top Rated";
  }
  if (view === "new-releases") {
    return "New Releases";
  }
  if (view === "shipping") {
    return "Fast Shipping";
  }
  return "Deals";
}
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function resolveOptionValue(
  candidate: string | undefined,
  options: string[],
  fallback: string,
): string {
  const raw = (candidate || "").trim();
  if (!raw) {
    return fallback;
  }
  const rawToken = slugify(raw);
  const matched = options.find((option) => {
    if (option === raw) {
      return true;
    }
    return slugify(option) === rawToken;
  });
  return matched || fallback;
}
function matchesSearch(product: Product, query: string): boolean {
  if (!query) {
    return true;
  }
  const text =
    `${product.name} ${product.sport} ${product.category} ${product.badge} ${product.description}`.toLowerCase();
  return text.includes(query);
}
function matchesTag(product: Product, tag: string): boolean {
  if (!tag) {
    return true;
  }
  const normalizedTag = tag.toLowerCase();
  return [product.badge, product.sport, product.category].some(
    (value) => value.toLowerCase() === normalizedTag,
  );
}
function getTagSwatchClass(tag: string): string {
  const token = slugify(tag);
  return (
    tagSwatchClassBySlug[token] ||
    "bg-[color-mix(in_oklab,var(--brand-soft)_68%,white_32%)]"
  );
}
function buildPaginationItems(
  totalPages: number,
  currentPage: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages];
  }
  if (currentPage >= totalPages - 2) {
    return [
      1,
      "ellipsis",
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ];
}
export function ShopCatalog({
  products,
  taxonomySports = [],
  taxonomyCategories = [],
  initialSport = "All Sports",
  initialCategory = "All Categories",
  initialTone = "All Colors",
  initialTag = "All Tags",
  initialSortBy = "featured",
  initialSearch = "",
  initialView = "all",
  initialLayout = "grid",
  initialPage = 1,
}: ShopCatalogProps) {
  const { addItem } = useCart();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeSport, setActiveSport] = useState(initialSport);
  const [activeCategory, setActiveCategory] = useState(initialCategory);
  const [activeTone, setActiveTone] = useState(initialTone);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [sortBy, setSortBy] = useState<SortId>(initialSortBy);
  const [layout, setLayout] = useState<ShopCatalogLayout>(initialLayout);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const activeView = initialView;
  const [debouncedSearchQuery, setDebouncedSearchQuery] =
    useState(initialSearch);
  const skipNextUrlSyncRef = useRef(true);
  const sports = useMemo(
    () => [
      "All Sports",
      ...Array.from(
        new Set([
          ...products.map((item) => item.sport),
          ...taxonomySports.map((value) => value.trim()),
        ]),
      )
        .filter((value) => value.length > 0)
        .sort((a, b) => a.localeCompare(b)),
    ],
    [products, taxonomySports],
  );
  const categories = useMemo(
    () => [
      "All Categories",
      ...Array.from(
        new Set([
          ...products.map((item) => item.category),
          ...taxonomyCategories.map((value) => value.trim()),
        ]),
      )
        .filter((value) => value.length > 0)
        .sort((a, b) => a.localeCompare(b)),
    ],
    [products, taxonomyCategories],
  );
  const tags = useMemo(() => {
    const derived = Array.from(
      new Set(
        [
          ...products.flatMap((item) => [item.badge, item.category, item.sport]),
          ...taxonomySports,
          ...taxonomyCategories,
        ].map((value) => value.trim()),
      ),
    )
      .filter((value) => value.trim().length > 0)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 18);
    return ["All Tags", ...derived];
  }, [products, taxonomyCategories, taxonomySports]);
  const tones = useMemo<string[]>(
    () => toneFilterOptions.map((option) => option.value),
    [],
  );
  const sportTagTokenSet = useMemo(
    () =>
      new Set(
        sports
          .filter((sport) => sport !== "All Sports")
          .map((sport) => sport.toLowerCase()),
      ),
    [sports],
  );
  const categoryTagTokenSet = useMemo(
    () =>
      new Set(
        categories
          .filter((category) => category !== "All Categories")
          .map((category) => category.toLowerCase()),
      ),
    [categories],
  );
  const normalizedSport = resolveOptionValue(activeSport, sports, "All Sports");
  const normalizedCategory = resolveOptionValue(
    activeCategory,
    categories,
    "All Categories",
  );
  const normalizedTone = resolveOptionValue(activeTone, tones, "All Colors");
  const normalizedTag = resolveOptionValue(activeTag, tags, "All Tags");
  const normalizedQuery = debouncedSearchQuery.trim().toLowerCase();
  const activeViewLabel = getViewLabel(activeView);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (normalizedSport !== "All Sports") {
      count += 1;
    }
    if (normalizedCategory !== "All Categories") {
      count += 1;
    }
    if (normalizedTone !== "All Colors") {
      count += 1;
    }
    if (normalizedTag !== "All Tags") {
      count += 1;
    }
    if (debouncedSearchQuery.trim().length > 0) {
      count += 1;
    }
    return count;
  }, [
    debouncedSearchQuery,
    normalizedCategory,
    normalizedSport,
    normalizedTag,
    normalizedTone,
  ]);
  const shouldClampTags = tags.length > 8;
  function clearFilters() {
    setActiveSport("All Sports");
    setActiveCategory("All Categories");
    setActiveTone("All Colors");
    setActiveTag("All Tags");
    setTagsExpanded(false);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSortBy("featured");
    setCurrentPage(1);
  }
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 260);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);
  const visibleProducts = useMemo(() => {
    const tagToken =
      normalizedTag === "All Tags" ? "" : normalizedTag.toLowerCase();
    const toneToken =
      normalizedTone === "All Colors" ? "" : normalizedTone.toLowerCase();
    const filtered = products.filter((item) => {
      if (normalizedSport !== "All Sports" && item.sport !== normalizedSport) {
        return false;
      }
      if (
        normalizedCategory !== "All Categories" &&
        item.category !== normalizedCategory
      ) {
        return false;
      }
      if (toneToken && item.tone !== toneToken) {
        return false;
      }
      if (!matchesTag(item, tagToken)) {
        return false;
      }
      return matchesSearch(item, normalizedQuery);
    });
    let viewFiltered = filtered;
    if (activeView === "new-releases") {
      viewFiltered = filtered.filter((item) =>
        releaseBadgePattern.test(item.badge),
      );
    }
    const sorted = [...viewFiltered];
    switch (sortBy) {
      case "name-asc":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "price-low":
        sorted.sort((a, b) => a.priceCents - b.priceCents);
        break;
      case "price-high":
        sorted.sort((a, b) => b.priceCents - a.priceCents);
        break;
      case "rating":
        sorted.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
        break;
      default:
        break;
    }
    return sorted;
  }, [
    activeView,
    normalizedCategory,
    normalizedQuery,
    normalizedSport,
    normalizedTag,
    normalizedTone,
    products,
    sortBy,
  ]);
  const totalProducts = visibleProducts.length;
  const totalPages = Math.max(1, Math.ceil(totalProducts / PRODUCTS_PER_PAGE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const pageStart = (safeCurrentPage - 1) * PRODUCTS_PER_PAGE;
  const pageEnd = pageStart + PRODUCTS_PER_PAGE;
  const paginatedProducts = useMemo(
    () => visibleProducts.slice(pageStart, pageEnd),
    [pageEnd, pageStart, visibleProducts],
  );
  const paginationItems = useMemo(
    () => buildPaginationItems(totalPages, safeCurrentPage),
    [safeCurrentPage, totalPages],
  );
  useEffect(() => {
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    const nextParams = new URLSearchParams(searchParams.toString());
    if (normalizedSport === "All Sports") {
      nextParams.delete("sport");
    } else {
      nextParams.set("sport", slugify(normalizedSport));
    }
    nextParams.delete("department");
    if (normalizedCategory === "All Categories") {
      nextParams.delete("category");
    } else {
      nextParams.set("category", slugify(normalizedCategory));
    }
    if (normalizedTone === "All Colors") {
      nextParams.delete("tone");
    } else {
      nextParams.set("tone", normalizedTone.toLowerCase());
    }
    if (normalizedTag === "All Tags") {
      nextParams.delete("tag");
    } else {
      nextParams.set("tag", slugify(normalizedTag));
    }
    if (sortBy === "featured") {
      nextParams.delete("sort");
    } else {
      nextParams.set("sort", sortBy);
    }
    const searchToken = debouncedSearchQuery.trim();
    if (searchToken.length > 0) {
      nextParams.set("q", searchToken);
    } else {
      nextParams.delete("q");
    }
    if (activeView === "all") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", activeView);
    }
    if (layout === "grid") {
      nextParams.delete("layout");
    } else {
      nextParams.set("layout", layout);
    }
    if (safeCurrentPage <= 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(safeCurrentPage));
    }
    const currentQuery = searchParams.toString();
    const nextQuery = nextParams.toString();
    if (currentQuery === nextQuery) {
      return;
    }
    router.push(nextQuery.length > 0 ? `${pathname}?${nextQuery}` : pathname, {
      scroll: false,
    });
  }, [
    activeView,
    debouncedSearchQuery,
    layout,
    normalizedCategory,
    normalizedSport,
    normalizedTag,
    normalizedTone,
    pathname,
    router,
    safeCurrentPage,
    searchParams,
    sortBy,
  ]);
  return (
    <section className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8">
      <div className="lg:hidden">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand/15 bg-surface px-3 py-2.5">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((current) => !current)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-brand/20 px-3 text-sm font-semibold text-brand transition hover:border-brand hover:bg-surface-soft"
            aria-expanded={mobileFiltersOpen}
            aria-controls="shop-mobile-filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {mobileFiltersOpen ? "Hide filters" : "Show filters"}
          </button>
          <span className="rounded-md border border-brand/20 bg-surface-soft px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            {activeFilterCount} active
          </span>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-9 items-center rounded-md border border-brand/20 px-3 text-sm font-semibold text-brand transition hover:border-brand hover:bg-surface-soft"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <aside
        id="shop-mobile-filters"
        className={`${mobileFiltersOpen ? "block" : "hidden"} space-y-4 rounded-xl border border-brand/15 bg-surface p-3 sm:p-4 lg:block lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:pr-3`}
      >
        <div className="rounded-lg border border-brand/15 bg-surface px-3 py-2.5">
          <label className="inline-flex w-full items-center gap-2 text-[13px] text-brand">
            <Search className="h-4 w-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search products"
              className="w-full border-0 bg-transparent text-[13px] text-brand placeholder:text-muted focus:outline-none"
            />
          </label>
        </div>
        <div className="border-b border-brand/10 pb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            Categories
          </h3>
          <div className="mt-2.5 flex flex-col gap-0.5">
            {categories.map((category) => {
              const isActive = category === normalizedCategory;
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => {
                    setActiveCategory(category);
                    setCurrentPage(1);
                  }}
                  className={`rounded-md px-1 py-1 text-left text-[13px] leading-5 transition ${isActive ? "bg-[color-mix(in_oklab,var(--brand-action)_11%,var(--surface)_89%)] font-semibold text-brand" : "text-muted hover:bg-surface-soft hover:text-brand"}`}
                >
                  {category}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-b border-brand/10 pb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            Sports
          </h3>
          <div className="mt-2.5 flex flex-col gap-0.5">
            {sports.map((sport) => {
              const isActive = sport === normalizedSport;
              return (
                <button
                  key={sport}
                  type="button"
                  onClick={() => {
                    setActiveSport(sport);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-left text-[13px] leading-5 transition ${isActive ? "bg-[color-mix(in_oklab,var(--brand-action)_11%,var(--surface)_89%)] font-semibold text-brand" : "text-muted hover:bg-surface-soft hover:text-brand"}`}
                >
                  {sport !== "All Sports"
                    ? renderSportIcon(sport, { className: "h-3.5 w-3.5" })
                    : null}
                  {sport}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-b border-brand/10 pb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            Color
          </h3>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {toneFilterOptions.map((tone) => {
              const isActive = tone.value === normalizedTone;
              return (
                <button
                  key={tone.value}
                  type="button"
                  onClick={() => {
                    setActiveTone(tone.value);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition duration-200 ${isActive ? "btn-primary" : "border-brand/20 text-muted hover:border-brand/35 hover:text-brand"}`}
                >
                  <span
                    className={`h-3 w-3 rounded-full border border-brand/20 ${tone.swatch}`}
                  />
                  {tone.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-b border-brand/10 pb-4">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
            Tags
          </h3>
          <div
            className={`mt-2.5 flex flex-wrap gap-1.5 overflow-hidden transition-[max-height] duration-200 ${shouldClampTags && !tagsExpanded ? "max-h-[3.6rem]" : "max-h-[18rem]"}`}
          >
            {tags.map((tag) => {
              const isActive = tag === normalizedTag;
              const tagToken = tag.toLowerCase();
              const isSportTag = sportTagTokenSet.has(tagToken);
              const isCategoryTag = categoryTagTokenSet.has(tagToken);
              const inactiveClass = isSportTag
                ? "border-[color-mix(in_oklab,var(--brand-action)_24%,transparent)] bg-[color-mix(in_oklab,var(--brand-action)_10%,var(--surface)_90%)] text-brand hover:border-[color-mix(in_oklab,var(--brand-action)_46%,transparent)] hover:bg-[color-mix(in_oklab,var(--brand-action)_14%,var(--surface)_86%)]"
                : isCategoryTag
                  ? "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_9%,var(--surface)_91%)] text-brand hover:border-[color-mix(in_oklab,var(--accent)_55%,transparent)] hover:bg-[color-mix(in_oklab,var(--accent)_14%,var(--surface)_86%)]"
                  : "border-brand/20 text-muted hover:border-brand/35 hover:bg-surface-soft hover:text-brand";
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setActiveTag(tag);
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition duration-200 ${isActive ? "btn-primary" : inactiveClass}`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${getTagSwatchClass(tag)}`}
                  />
                  {tag}
                </button>
              );
            })}
          </div>
          {shouldClampTags ? (
            <button
              type="button"
              onClick={() => setTagsExpanded((current) => !current)}
              className="mt-2 inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold btn-secondary"
            >
              {tagsExpanded ? "Show less" : "More tags"}
            </button>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 lg:hidden">
          <button
            type="button"
            onClick={clearFilters}
            className="inline-flex h-9 items-center rounded-md border border-brand/20 px-3 text-sm font-semibold text-brand transition hover:border-brand hover:bg-surface-soft"
          >
            Reset all filters
          </button>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold btn-primary"
          >
            Done
          </button>
        </div>
      </aside>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 rounded-lg border border-brand/15 bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex items-center rounded-md border border-brand/20 bg-surface-soft p-1">
            <button
              type="button"
              onClick={() => {
                setLayout("grid");
                setCurrentPage(1);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-sm transition duration-200 ${layout === "grid" ? "bg-[var(--brand-action)] !text-[var(--color-on-solid)]" : "text-brand hover:bg-surface"}`}
              aria-label="Grid view"
              title="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setLayout("list");
                setCurrentPage(1);
              }}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-sm transition duration-200 ${layout === "list" ? "bg-[var(--brand-action)] !text-[var(--color-on-solid)]" : "text-brand hover:bg-surface"}`}
              aria-label="List view"
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-[13px] font-medium text-brand">
              <ArrowUpDown className="h-4 w-4 text-muted" /> Sort By
            </label>
            <select
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as SortId);
                setCurrentPage(1);
              }}
              className="h-8 min-w-0 rounded-md border border-brand/20 bg-surface px-2.5 text-[13px] text-brand focus:border-brand focus:outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-brand/20 bg-surface px-2.5 py-1 text-brand">
              {totalProducts.toLocaleString()} items
            </span>
            <span className="rounded-md border border-brand/20 bg-surface px-2.5 py-1 text-brand">
              Page {safeCurrentPage}/{totalPages}
            </span>
            {activeViewLabel ? (
              <span className="rounded-md border border-brand/20 bg-surface px-2.5 py-1 text-brand">
                {activeViewLabel}
              </span>
            ) : null}
          </div>
          <p>
            Showing {totalProducts > 0 ? pageStart + 1 : 0}-
            {Math.min(pageEnd, totalProducts)}
          </p>
        </div>
        {totalProducts === 0 ? (
          <article className="surface-card rounded-xl p-8 text-sm text-muted">
            No matching products found for your selected filters.
          </article>
        ) : (
          <>
            {layout === "grid" ? (
              <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2 xl:grid-cols-3">
                {paginatedProducts.map((product) => {
                  const primaryImage = getPrimaryProductImage(product);
                  return (
                    <article key={product.id} className="group motion-lift">
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
                          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Add To
                          Cart
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
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {paginatedProducts.map((product) => {
                  const primaryImage = getPrimaryProductImage(product);
                  return (
                    <article
                      key={`list-${product.id}`}
                      className="flex flex-col gap-4 rounded-lg border border-brand/12 bg-surface p-3 sm:flex-row"
                    >
                      <Link
                        href={`/shop/${product.id}`}
                        className="image-frame relative block h-52 w-full rounded-lg sm:h-40 sm:w-40 sm:shrink-0"
                        title={`Open ${product.name}`}
                      >
                        <Image
                          src={primaryImage.src}
                          alt={primaryImage.alt}
                          fill
                          sizes="(min-width: 640px) 160px, 100vw"
                          quality={80}
                          placeholder="blur"
                          blurDataURL={DEFAULT_IMAGE_BLUR_DATA_URL}
                          className="image-fit-cover"
                        />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                        <div>
                          <p className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.1em] text-muted">
                            {renderSportIcon(product.sport, {
                              className: "h-3.5 w-3.5",
                            })}
                            {product.sport}
                          </p>
                          <h3 className="mt-1 text-lg font-semibold text-brand">
                            <Link
                              href={`/shop/${product.id}`}
                              className="transition-colors duration-200 hover:text-accent"
                            >
                              {product.name}
                            </Link>
                          </h3>
                          <p className="mt-2 line-clamp-2 text-sm text-muted">
                            {product.description}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-lg font-semibold text-brand">
                            {formatPrice(product.priceCents)}
                          </p>
                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                            <WishlistToggleButton
                              productId={product.id}
                              productName={product.name}
                              showLabel={false}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface transition-colors duration-200 btn-secondary"
                            />
                            <CompareActionButton
                              product={product}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface transition-colors duration-200 btn-secondary"
                            />
                            <button
                              type="button"
                              onClick={() => addItem(product, 1)}
                              className="inline-flex h-9 items-center rounded-md px-3.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-200 btn-primary"
                              title={`Add ${product.name} to cart`}
                            >
                              Add To Cart
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {totalPages > 1 ? (
              <nav
                className="mt-1 flex flex-col gap-3 rounded-lg border border-brand/15 bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                aria-label="Shop catalog pagination"
              >
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.max(1, page - 1))
                  }
                  disabled={safeCurrentPage === 1}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-brand/20 px-3 text-sm font-semibold text-brand transition-colors duration-200 hover:border-brand hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <div className="w-full overflow-x-auto sm:w-auto">
                  <div className="mx-auto flex min-w-max items-center gap-1.5">
                    {paginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <span
                          key={`ellipsis-${index}`}
                          className="inline-flex h-9 w-9 items-center justify-center text-sm font-semibold text-muted"
                        >
                          ...
                        </span>
                      ) : (
                        <button
                          key={`page-${item}`}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                          className={`inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold transition-colors duration-200 ${item === safeCurrentPage ? "btn-primary" : "border-brand/20 text-brand hover:border-brand hover:bg-surface-soft"}`}
                          aria-current={
                            item === safeCurrentPage ? "page" : undefined
                          }
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
                  disabled={safeCurrentPage === totalPages}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-brand/20 px-3 text-sm font-semibold text-brand transition-colors duration-200 hover:border-brand hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
