"use client";

import { createContext, use, type ReactNode } from "react";
import type { Storefront } from "@/lib/catalog/types";

/**
 * The cached public catalogue (packs, prices, COD settings), handed from the
 * server to client components such as the pack picker, cart and checkout.
 */
const StorefrontContext = createContext<Storefront | null>(null);

export function StorefrontProvider({ value, children }: { value: Storefront; children: ReactNode }) {
  return <StorefrontContext value={value}>{children}</StorefrontContext>;
}

export function useStorefront(): Storefront {
  const ctx = use(StorefrontContext);
  if (!ctx) throw new Error("useStorefront must be used inside <StorefrontProvider>");
  return ctx;
}
