"use client";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { isKnownProductImagePath, Product } from "@/lib/catalog";
const CART_STORAGE_KEY = "sportiva-cart-v1";

interface CartVariantSelection {
  size?: string;
  color?: string;
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  priceCents: number;
  quantity: number;
  sport: string;
  category: string;
  tone: Product["tone"];
  size: string;
  color: string;
  imageSrc: string;
  imageAlt: string;
}
interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  subtotalCents: number;
  addItem: (
    product: Product,
    quantity?: number,
    variant?: CartVariantSelection,
  ) => void;
  removeItem: (itemId: string) => void;
  setItemQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
}
const fallbackCartContextValue: CartContextValue = {
  items: [],
  itemCount: 0,
  subtotalCents: 0,
  addItem: () => {},
  removeItem: () => {},
  setItemQuantity: () => {},
  clearCart: () => {},
};
const CartContext = createContext<CartContextValue>(fallbackCartContextValue);
const productToneSet = new Set<Product["tone"]>([
  "field",
  "court",
  "street",
  "fitness",
  "outdoor",
]);
function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(99, quantity));
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

function normalizeVariantValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}

function createCartItemId(productId: string, size: string, color: string): string {
  const normalizedSize = size.trim().toLowerCase();
  const normalizedColor = color.trim().toLowerCase();
  return `${productId}::${normalizedSize}::${normalizedColor}`;
}

function sanitizeCartItem(value: unknown): CartItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<CartItem>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.priceCents !== "number" ||
    typeof candidate.quantity !== "number" ||
    typeof candidate.sport !== "string" ||
    typeof candidate.category !== "string" ||
    typeof candidate.tone !== "string" ||
    !productToneSet.has(candidate.tone as Product["tone"])
  ) {
    return null;
  }
  return {
    productId:
      typeof candidate.productId === "string" && candidate.productId.trim()
        ? candidate.productId
        : candidate.id,
    id:
      typeof candidate.productId === "string" &&
      candidate.productId.trim().length > 0
        ? candidate.id
        : createCartItemId(
            candidate.id,
            normalizeVariantValue((candidate as Partial<CartItem>).size, "One Size"),
            normalizeVariantValue((candidate as Partial<CartItem>).color, "Standard"),
          ),
    name: candidate.name,
    priceCents: candidate.priceCents,
    quantity: clampQuantity(candidate.quantity),
    sport: candidate.sport,
    category: candidate.category,
    tone: candidate.tone,
    size: normalizeVariantValue((candidate as Partial<CartItem>).size, "One Size"),
    color: normalizeVariantValue((candidate as Partial<CartItem>).color, "Standard"),
    imageSrc: getSafeImageSrc(candidate.imageSrc),
    imageAlt:
      typeof candidate.imageAlt === "string" &&
      candidate.imageAlt.trim().length > 0
        ? candidate.imageAlt
        : `${candidate.name} image`,
  };
}
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
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
        .map((item) => sanitizeCartItem(item))
        .filter((item): item is CartItem => item !== null);
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
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);
  const addItem = useCallback(
    (product: Product, quantity = 1, variant?: CartVariantSelection) => {
      const selectedSize = normalizeVariantValue(variant?.size, "One Size");
      const selectedColor = normalizeVariantValue(variant?.color, "Standard");
      const itemId = createCartItemId(product.id, selectedSize, selectedColor);
      const safeQuantity = clampQuantity(quantity);
      setItems((currentItems) => {
        const existingItem = currentItems.find((item) => item.id === itemId);
        if (existingItem) {
          return currentItems.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  quantity: clampQuantity(item.quantity + safeQuantity),
                }
              : item,
          );
        }
        return [
          ...currentItems,
          {
            id: itemId,
            productId: product.id,
            name: product.name,
            priceCents: product.priceCents,
            quantity: safeQuantity,
            sport: product.sport,
            category: product.category,
            tone: product.tone,
            size: selectedSize,
            color: selectedColor,
            imageSrc: getSafeImageSrc(product.images[0]?.src),
            imageAlt: product.images[0]?.alt || `${product.name} image`,
          },
        ];
      });
    },
    [],
  );
  const removeItem = useCallback((itemId: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.id !== itemId));
  }, []);
  const setItemQuantity = useCallback(
    (itemId: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(itemId);
        return;
      }
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? { ...item, quantity: clampQuantity(quantity) }
            : item,
        ),
      );
    },
    [removeItem],
  );
  const clearCart = useCallback(() => {
    setItems([]);
  }, []);
  const itemCount = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );
  const subtotalCents = useMemo(
    () => items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0),
    [items],
  );
  const value = useMemo(
    () => ({
      items,
      itemCount,
      subtotalCents,
      addItem,
      removeItem,
      setItemQuantity,
      clearCart,
    }),
    [
      addItem,
      clearCart,
      itemCount,
      items,
      removeItem,
      setItemQuantity,
      subtotalCents,
    ],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart(): CartContextValue {
  return useContext(CartContext);
}
