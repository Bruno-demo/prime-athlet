"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { isKnownProductImagePath, Product } from "@/lib/catalog";
const COMPARE_STORAGE_KEY = "prime-athlete-compare-v1";
export const MAX_COMPARE_ITEMS = 4;
export interface CompareItem {
  id: string;
  name: string;
  priceCents: number;
  sport: string;
  category: string;
  tone: Product["tone"];
  rating: number;
  reviews: number;
  badge: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}
export type CompareMutationResult =
  | "added"
  | "removed"
  | "already"
  | "limit-reached";
interface CompareContextValue {
  items: CompareItem[];
  itemCount: number;
  maxItems: number;
  hasItem: (productId: string) => boolean;
  addProduct: (product: Product) => CompareMutationResult;
  removeItem: (productId: string) => void;
  clearItems: () => void;
  toggleProduct: (product: Product) => CompareMutationResult;
}
const fallbackCompareContextValue: CompareContextValue = {
  items: [],
  itemCount: 0,
  maxItems: MAX_COMPARE_ITEMS,
  hasItem: () => false,
  addProduct: () => "already",
  removeItem: () => {},
  clearItems: () => {},
  toggleProduct: () => "already",
};
const CompareContext = createContext<CompareContextValue>(
  fallbackCompareContextValue,
);
const productToneSet = new Set<Product["tone"]>([
  "field",
  "court",
  "street",
  "fitness",
  "outdoor",
]);
interface CompareApiResponsePayload {
  authenticated?: boolean;
  productIds?: unknown;
  products?: unknown;
}
function getSafeImageSrc(value: unknown): string {
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    isKnownProductImagePath(value)
  ) {
    return value;
  }
  return "/products/photo-01.jpg";
}
function toCompareItem(product: Product): CompareItem {
  return {
    id: product.id,
    name: product.name,
    priceCents: product.priceCents,
    sport: product.sport,
    category: product.category,
    tone: product.tone,
    rating: product.rating,
    reviews: product.reviews,
    badge: product.badge,
    description: product.description,
    imageSrc: getSafeImageSrc(product.images[0]?.src),
    imageAlt: product.images[0]?.alt || `${product.name} image`,
  };
}
function sanitizeCompareItem(value: unknown): CompareItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<CompareItem>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.priceCents !== "number" ||
    typeof candidate.sport !== "string" ||
    typeof candidate.category !== "string" ||
    typeof candidate.tone !== "string" ||
    !productToneSet.has(candidate.tone as Product["tone"]) ||
    typeof candidate.rating !== "number" ||
    typeof candidate.reviews !== "number" ||
    typeof candidate.badge !== "string" ||
    typeof candidate.description !== "string"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    priceCents: candidate.priceCents,
    sport: candidate.sport,
    category: candidate.category,
    tone: candidate.tone,
    rating: candidate.rating,
    reviews: candidate.reviews,
    badge: candidate.badge,
    description: candidate.description,
    imageSrc: getSafeImageSrc(candidate.imageSrc),
    imageAlt:
      typeof candidate.imageAlt === "string" &&
      candidate.imageAlt.trim().length > 0
        ? candidate.imageAlt
        : `${candidate.name} image`,
  };
}
function normalizeProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  ).slice(0, MAX_COMPARE_ITEMS);
}
function normalizeCompareItems(items: CompareItem[]): CompareItem[] {
  const seen = new Set<string>();
  const normalized: CompareItem[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    normalized.push(item);
    if (normalized.length >= MAX_COMPARE_ITEMS) {
      break;
    }
  }
  return normalized;
}
function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
function getCompareItemIds(items: CompareItem[]): string[] {
  return items.map((item) => item.id);
}
function mergeCompareItems(
  primary: CompareItem[],
  secondary: CompareItem[],
): CompareItem[] {
  return normalizeCompareItems([...primary, ...secondary]);
}
function toCompareItemsFromApiProducts(value: unknown): CompareItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items = value
    .map((rawProduct) => {
      if (!rawProduct || typeof rawProduct !== "object") {
        return null;
      }
      const candidate = rawProduct as Partial<Product>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string" ||
        typeof candidate.priceCents !== "number" ||
        Number.isNaN(candidate.priceCents) ||
        typeof candidate.sport !== "string" ||
        typeof candidate.category !== "string" ||
        typeof candidate.tone !== "string" ||
        !productToneSet.has(candidate.tone as Product["tone"]) ||
        typeof candidate.rating !== "number" ||
        Number.isNaN(candidate.rating) ||
        typeof candidate.reviews !== "number" ||
        Number.isNaN(candidate.reviews) ||
        typeof candidate.badge !== "string" ||
        typeof candidate.description !== "string"
      ) {
        return null;
      }
      const firstImage = Array.isArray(candidate.images)
        ? candidate.images[0]
        : undefined;
      return {
        id: candidate.id,
        name: candidate.name,
        priceCents: candidate.priceCents,
        sport: candidate.sport,
        category: candidate.category,
        tone: candidate.tone as Product["tone"],
        rating: candidate.rating,
        reviews: candidate.reviews,
        badge: candidate.badge,
        description: candidate.description,
        imageSrc: getSafeImageSrc(firstImage?.src),
        imageAlt:
          typeof firstImage?.alt === "string" &&
          firstImage.alt.trim().length > 0
            ? firstImage.alt
            : `${candidate.name} image`,
      } satisfies CompareItem;
    })
    .filter((item): item is CompareItem => item !== null);
  return normalizeCompareItems(items);
}
export function compareItemToProduct(item: CompareItem): Product {
  return {
    id: item.id,
    name: item.name,
    priceCents: item.priceCents,
    sport: item.sport,
    category: item.category,
    tone: item.tone,
    rating: item.rating,
    reviews: item.reviews,
    badge: item.badge,
    description: item.description,
    images: [{ src: item.imageSrc, alt: item.imageAlt }],
  };
}
export function CompareProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  const [items, setItems] = useState<CompareItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const itemsRef = useRef<CompareItem[]>([]);
  const isAuthenticatedRef = useRef(false);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setHydrated(true);
        return;
      }
      const cleanItems = parsed
        .map((item) => sanitizeCompareItem(item))
        .filter((item): item is CompareItem => item !== null)
        .slice(0, MAX_COMPARE_ITEMS);
      setItems(cleanItems);
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, []);
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);
  const syncIdsToServer = useCallback(async (productIds: string[]) => {
    if (!isAuthenticatedRef.current) {
      return;
    }
    try {
      const response = await fetch("/api/account/compare", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      if (response.status === 401) {
        setIsAuthenticated(false);
        return;
      }
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as CompareApiResponsePayload;
      const authenticated = body.authenticated === true;
      setIsAuthenticated(authenticated);
      if (!authenticated) {
        return;
      }
      const serverItems = toCompareItemsFromApiProducts(body.products);
      const serverIds = getCompareItemIds(serverItems);
      if (
        serverItems.length > 0 ||
        productIds.length === 0 ||
        serverIds.length === 0
      ) {
        setItems(serverItems);
      }
    } catch {
      /* Keep local compare state on transient failures. */
    }
  }, []);
  const refreshFromServer = useCallback(
    async (mergeLocalGuestItems: boolean) => {
      try {
        const response = await fetch("/api/account/compare", {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as CompareApiResponsePayload;
        const authenticated = body.authenticated === true;
        setIsAuthenticated(authenticated);
        if (!authenticated) {
          return;
        }
        const serverItems = toCompareItemsFromApiProducts(body.products);
        const serverIds = normalizeProductIds(body.productIds);
        let nextItems = serverItems;
        if (mergeLocalGuestItems) {
          nextItems = mergeCompareItems(serverItems, itemsRef.current);
          const mergedIds = getCompareItemIds(nextItems);
          const canonicalServerIds =
            serverIds.length > 0 ? serverIds : getCompareItemIds(serverItems);
          if (!sameStringArray(mergedIds, canonicalServerIds)) {
            await syncIdsToServer(mergedIds);
            return;
          }
        }
        setItems(nextItems);
      } catch {
        /* Keep local compare state if the network is unavailable. */
      }
    },
    [syncIdsToServer],
  );
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    void refreshFromServer(true);
  }, [hydrated, refreshFromServer]);
  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (lastPathnameRef.current === pathname) {
      return;
    }
    lastPathnameRef.current = pathname;
    void refreshFromServer(false);
  }, [hydrated, pathname, refreshFromServer]);
  const hasItem = useCallback(
    (productId: string) => items.some((item) => item.id === productId),
    [items],
  );
  const addProduct = useCallback(
    (product: Product): CompareMutationResult => {
      let result: CompareMutationResult = "already";
      let nextItemsSnapshot: CompareItem[] | null = null;
      setItems((currentItems) => {
        const exists = currentItems.some((item) => item.id === product.id);
        if (exists) {
          result = "already";
          return currentItems;
        }
        if (currentItems.length >= MAX_COMPARE_ITEMS) {
          result = "limit-reached";
          return currentItems;
        }
        result = "added";
        nextItemsSnapshot = normalizeCompareItems([
          ...currentItems,
          toCompareItem(product),
        ]);
        return nextItemsSnapshot;
      });
      if (nextItemsSnapshot && isAuthenticatedRef.current) {
        void syncIdsToServer(getCompareItemIds(nextItemsSnapshot));
      }
      return result;
    },
    [syncIdsToServer],
  );
  const removeItem = useCallback(
    (productId: string) => {
      let nextItemsSnapshot: CompareItem[] | null = null;
      setItems((currentItems) => {
        const nextItems = currentItems.filter((item) => item.id !== productId);
        if (nextItems.length !== currentItems.length) {
          nextItemsSnapshot = nextItems;
        }
        return nextItems;
      });
      if (nextItemsSnapshot && isAuthenticatedRef.current) {
        void syncIdsToServer(getCompareItemIds(nextItemsSnapshot));
      }
    },
    [syncIdsToServer],
  );
  const clearItems = useCallback(() => {
    setItems([]);
    if (isAuthenticatedRef.current) {
      void syncIdsToServer([]);
    }
  }, [syncIdsToServer]);
  const toggleProduct = useCallback(
    (product: Product): CompareMutationResult => {
      let result: CompareMutationResult = "already";
      let nextItemsSnapshot: CompareItem[] | null = null;
      setItems((currentItems) => {
        const exists = currentItems.some((item) => item.id === product.id);
        if (exists) {
          result = "removed";
          nextItemsSnapshot = currentItems.filter(
            (item) => item.id !== product.id,
          );
          return nextItemsSnapshot;
        }
        if (currentItems.length >= MAX_COMPARE_ITEMS) {
          result = "limit-reached";
          return currentItems;
        }
        result = "added";
        nextItemsSnapshot = normalizeCompareItems([
          ...currentItems,
          toCompareItem(product),
        ]);
        return nextItemsSnapshot;
      });
      if (nextItemsSnapshot && isAuthenticatedRef.current) {
        void syncIdsToServer(getCompareItemIds(nextItemsSnapshot));
      }
      return result;
    },
    [syncIdsToServer],
  );
  const itemCount = items.length;
  const value = useMemo(
    () => ({
      items,
      itemCount,
      maxItems: MAX_COMPARE_ITEMS,
      hasItem,
      addProduct,
      removeItem,
      clearItems,
      toggleProduct,
    }),
    [
      addProduct,
      clearItems,
      hasItem,
      itemCount,
      items,
      removeItem,
      toggleProduct,
    ],
  );
  return (
    <CompareContext.Provider value={value}>{children}</CompareContext.Provider>
  );
}
export function useCompare(): CompareContextValue {
  return useContext(CompareContext);
}
