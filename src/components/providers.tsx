"use client";
import { ReactNode } from "react";
import { CartProvider } from "@/components/cart-context";
import { CompareProvider } from "@/components/compare-context";
import { CompareStickyBar } from "@/components/compare-sticky-bar";
import { ThemeProvider } from "@/components/theme-context";
import { WishlistProvider } from "@/components/wishlist-context";
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <WishlistProvider>
        <CartProvider>
          <CompareProvider>
            {children} <CompareStickyBar />
          </CompareProvider>
        </CartProvider>
      </WishlistProvider>
    </ThemeProvider>
  );
}
