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
type WishlistToggleResult =
  | "added"
  | "removed"
  | "auth-required"
  | "forbidden"
  | "error";
interface WishlistContextValue {
  productIds: string[];
  isReady: boolean;
  isAuthenticated: boolean;
  hasItem: (productId: string) => boolean;
  toggleItem: (productId: string) => Promise<WishlistToggleResult>;
  refresh: () => Promise<void>;
}
interface WishlistResponsePayload {
  error?: string;
  productIds?: string[];
  authenticated?: boolean;
}
const WishlistContext = createContext<WishlistContextValue | undefined>(
  undefined,
);
function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0),
    ),
  );
}
export function WishlistProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const lastPathnameRef = useRef(pathname);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account/wishlist", {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as WishlistResponsePayload;
      const authenticated = body.authenticated === true;
      setIsAuthenticated(authenticated);
      setProductIds(authenticated ? normalizeIds(body.productIds) : []);
    } catch {
      /* Ignore transient network failures and keep the previous local state. */
    } finally {
      setIsReady(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!isReady) {
      return;
    }
    if (lastPathnameRef.current === pathname) {
      return;
    }
    lastPathnameRef.current = pathname;
    void refresh();
  }, [isReady, pathname, refresh]);
  const hasItem = useCallback(
    (productId: string) => productIds.includes(productId),
    [productIds],
  );
  const toggleItem = useCallback(
    async (productId: string): Promise<WishlistToggleResult> => {
      if (!isAuthenticated) {
        return "auth-required";
      }
      const alreadySaved = productIds.includes(productId);
      try {
        const response = await fetch("/api/account/wishlist", {
          method: alreadySaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId }),
        });
        if (response.status === 401) {
          setIsAuthenticated(false);
          setProductIds([]);
          return "auth-required";
        }
        if (response.status === 403) {
          return "forbidden";
        }
        const body = (await response.json()) as WishlistResponsePayload;
        if (!response.ok) {
          return "error";
        }
        const nextIds = normalizeIds(body.productIds);
        setProductIds(nextIds);
        return alreadySaved ? "removed" : "added";
      } catch {
        return "error";
      }
    },
    [isAuthenticated, productIds],
  );
  const value = useMemo(
    () => ({
      productIds,
      isReady,
      isAuthenticated,
      hasItem,
      toggleItem,
      refresh,
    }),
    [hasItem, isAuthenticated, isReady, productIds, refresh, toggleItem],
  );
  return (
    <WishlistContext.Provider value={value}>
      {children}
    </WishlistContext.Provider>
  );
}
export function useWishlist(): WishlistContextValue {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error("useWishlist must be used within a WishlistProvider.");
  }
  return context;
}
