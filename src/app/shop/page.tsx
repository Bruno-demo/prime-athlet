import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { ShopCatalog } from "@/components/shop-catalog";
import type {
  ShopCatalogLayout,
  ShopCatalogView,
  SortId,
} from "@/components/shop-catalog";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getCachedStorefrontProducts,
  getCachedStorefrontTaxonomyValues,
} from "@/lib/storefront-cache";
import { withResponseTimeLog } from "@/lib/response-time-log";
interface ShopPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
function pickFirstValue(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return Array.isArray(value) ? value[0] : undefined;
}
function parseSortId(value: string | undefined): SortId | undefined {
  if (!value) {
    return undefined;
  }
  const sort = value.toLowerCase();
  if (
    sort === "featured" ||
    sort === "name-asc" ||
    sort === "name-desc" ||
    sort === "price-low" ||
    sort === "price-high" ||
    sort === "rating"
  ) {
    return sort;
  }
  return undefined;
}
function parseCatalogView(value: string | undefined): ShopCatalogView {
  if (!value) {
    return "all";
  }
  const view = value.toLowerCase();
  if (
    view === "deals" ||
    view === "top-rated" ||
    view === "shipping" ||
    view === "new-releases"
  ) {
    return view;
  }
  return "all";
}
function parseSport(
  sportValue: string | undefined,
  departmentValue: string | undefined,
): string {
  const rawValue = (sportValue || departmentValue || "")
    .trim()
    .toLowerCase();
  const sportMap: Record<string, string> = {
    football: "Football",
    basketball: "Basketball",
    running: "Running",
    training: "Training",
    outdoor: "Outdoor",
  };
  if (!rawValue || rawValue === "all" || rawValue === "all-sports") {
    return "All Sports";
  }
  if (sportMap[rawValue]) {
    return sportMap[rawValue];
  }
  return rawValue
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  const rounded = Math.floor(parsed);
  return rounded >= 1 ? rounded : 1;
}
function parseCategory(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return "All Categories";
  }
  return normalized
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
function parseTone(value: string | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  const toneMap: Record<string, string> = {
    field: "Field",
    court: "Court",
    street: "Street",
    fitness: "Fitness",
    outdoor: "Outdoor",
  };
  return toneMap[normalized] || "All Colors";
}
function parseTag(value: string | undefined): string {
  const normalized = (value || "").trim();
  return normalized.length > 0 ? normalized : "All Tags";
}
function parseLayout(value: string | undefined): ShopCatalogLayout {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "list") {
    return "list";
  }
  return "grid";
}
function deriveInitialSort(
  explicitSort: SortId | undefined,
  view: ShopCatalogView,
): SortId {
  if (explicitSort) {
    return explicitSort;
  }
  if (view === "deals") {
    return "price-low";
  }
  if (view === "top-rated") {
    return "rating";
  }
  return "featured";
}
export default async function ShopPage({ searchParams }: ShopPageProps) {
  return withResponseTimeLog("page:/shop", async () => {
    const params = await searchParams;
    const [products, taxonomySports, taxonomyCategories] = await Promise.all([
      getCachedStorefrontProducts(),
      getCachedStorefrontTaxonomyValues("sport"),
      getCachedStorefrontTaxonomyValues("category"),
    ]);
    const view = parseCatalogView(pickFirstValue(params.view));
    const initialSport = parseSport(
      pickFirstValue(params.sport),
      pickFirstValue(params.department),
    );
    const initialSortBy = deriveInitialSort(
      parseSortId(pickFirstValue(params.sort)),
      view,
    );
    const initialSearch = (pickFirstValue(params.q) || "").trim();
    const initialPage = parsePage(pickFirstValue(params.page));
    const initialCategory = parseCategory(pickFirstValue(params.category));
    const initialTone = parseTone(pickFirstValue(params.tone));
    const initialTag = parseTag(pickFirstValue(params.tag));
    const initialLayout = parseLayout(
      pickFirstValue(params.layout) || pickFirstValue(params.view),
    );
    const catalogStateKey = `${view}|${initialSport}|${initialCategory}|${initialTone}|${initialTag.toLowerCase()}|${initialSortBy}|${initialSearch.toLowerCase()}|${initialPage}|${initialLayout}`;
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="section-shell py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                <ShoppingBag className="mr-1 inline h-4 w-4" /> Catalog
              </p>
              <h1 className="mt-2 text-4xl font-semibold leading-none text-brand sm:text-5xl">
                Products
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
                Browse all items with category filters, sorting, and flexible
                grid/list views.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold btn-secondary"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Home
            </Link>
          </div>
          <ShopCatalog
            key={catalogStateKey}
            products={products}
            taxonomySports={taxonomySports}
            taxonomyCategories={taxonomyCategories}
            initialSport={initialSport}
            initialSortBy={initialSortBy}
            initialSearch={initialSearch}
            initialView={view}
            initialPage={initialPage}
            initialCategory={initialCategory}
            initialTone={initialTone}
            initialTag={initialTag}
            initialLayout={initialLayout}
          />
        </main>
        <SiteFooter />
      </div>
    );
  });
}
