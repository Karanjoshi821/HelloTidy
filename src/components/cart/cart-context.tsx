"use client";

import { createContext, use, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { commerce } from "@/config/products";
import { findPack } from "@/lib/catalog/types";
import { useStorefront } from "../storefront-context";

export type CartLine = { packId: string; qty: number };

type CartContextValue = {
  /** Lines for packs that can be bought right now (hidden or sold-out packs are left out). */
  lines: CartLine[];
  count: number;
  hydrated: boolean;
  isOpen: boolean;
  add: (packId: string, qty?: number) => void;
  setQty: (packId: string, qty: number) => void;
  remove: (packId: string) => void;
  clear: () => void;
  open: () => void;
  close: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const STORAGE_KEY = "hellotidy_cart_v1";
const EMPTY: CartLine[] = [];
/** Structural cap on stored lines; the order limits are checked when pricing. */
const MAX_STORED_LINES = 20;

/** Shape-checks stored data. Whether a pack exists or is in stock is decided against the live catalogue. */
function sanitize(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const out: CartLine[] = [];
  for (const item of value) {
    const packId = typeof item?.packId === "string" ? item.packId.slice(0, 40) : "";
    const qty = Math.floor(Number(item?.qty));
    if (packId && qty > 0 && !out.some((l) => l.packId === packId)) {
      out.push({ packId, qty: Math.min(qty, commerce.maxQtyPerPack) });
    }
  }
  return out.slice(0, MAX_STORED_LINES);
}

/**
 * localStorage-backed cart store, read through useSyncExternalStore so the
 * server render and hydration see an empty cart, and other tabs stay in sync.
 */
const listeners = new Set<() => void>();
let snapshot: CartLine[] | null = null;

function readCart(): CartLine[] {
  if (snapshot) return snapshot;
  try {
    snapshot = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
  } catch {
    snapshot = [];
  }
  return snapshot;
}

function writeCart(update: (current: CartLine[]) => CartLine[]) {
  snapshot = sanitize(update(readCart()));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage can be unavailable (private mode); the cart still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      snapshot = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const noopSubscribe = () => () => undefined;

const actions = {
  add: (packId: string, qty = 1) =>
    writeCart((current) =>
      current.some((l) => l.packId === packId)
        ? current.map((l) => (l.packId === packId ? { ...l, qty: Math.min(l.qty + qty, commerce.maxQtyPerPack) } : l))
        : [...current, { packId, qty }],
    ),
  setQty: (packId: string, qty: number) =>
    writeCart((current) =>
      qty <= 0
        ? current.filter((l) => l.packId !== packId)
        : current.map((l) => (l.packId === packId ? { ...l, qty } : l)),
    ),
  remove: (packId: string) => writeCart((current) => current.filter((l) => l.packId !== packId)),
  clear: () => writeCart(() => []),
};

/** Client-only cart. The server re-prices everything at checkout. */
export function CartProvider({ children }: { children: ReactNode }) {
  const storefront = useStorefront();
  const stored = useSyncExternalStore(subscribe, readCart, () => EMPTY);
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [isOpen, setIsOpen] = useState(false);

  const lines = useMemo(() => stored.filter((l) => findPack(storefront, l.packId)?.available), [stored, storefront]);

  const value = useMemo<CartContextValue>(
    () => ({
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      hydrated,
      isOpen,
      ...actions,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [lines, hydrated, isOpen],
  );

  return <CartContext value={value}>{children}</CartContext>;
}

export function useCart(): CartContextValue {
  const ctx = use(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
