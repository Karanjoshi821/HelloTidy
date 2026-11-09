"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { commerce, product } from "@/config/products";
import { findPack, perPiece } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { quote, QuoteError } from "@/lib/pricing";
import { PackThumb } from "../product/pack-thumb";
import { useStorefront } from "../storefront-context";
import { buttonClasses } from "../ui/button";
import { useCart } from "./cart-context";

export function CartDrawer({ onlinePayments }: { onlinePayments: boolean }) {
  const { lines, isOpen, close, setQty, remove, add } = useCart();
  const storefront = useStorefront();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, close]);

  const { totals, error } = useMemo(() => {
    if (!lines.length) return { totals: null, error: null };
    try {
      return { totals: quote({ lines, paymentMethod: "prepaid", catalog: storefront }), error: null };
    } catch (e) {
      return { totals: null, error: e instanceof QuoteError ? e.message : "Something went wrong." };
    }
  }, [lines, storefront]);

  // Suggest the next pack up, so the cart nudges towards better value.
  const upsell = useMemo(() => {
    if (lines.length !== 1) return null;
    const current = findPack(storefront, lines[0].packId);
    if (!current) return null;
    return (
      [...storefront.packs].sort((a, b) => a.count - b.count).find((p) => p.count > current.count && p.available) ??
      null
    );
  }, [lines, storefront]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your cart">
      <button
        type="button"
        aria-label="Close cart"
        onClick={close}
        className="animate-fade-in absolute inset-0 bg-ink/40"
      />
      <div className="animate-sheet-in absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold">Your cart</h2>
          <button
            type="button"
            onClick={close}
            className="grid size-9 place-items-center rounded-full hover:bg-surface"
            aria-label="Close cart"
          >
            <X className="size-5" />
          </button>
        </div>

        {!lines.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <ShoppingBag className="size-10 text-muted" />
            <p className="text-muted">Your cart is empty.</p>
            <Link href={`/products/${product.slug}`} onClick={close} className={buttonClasses("primary")}>
              Shop sponges
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {lines.map((line) => {
                const pack = findPack(storefront, line.packId)!;
                return (
                  <li key={line.packId} className="flex gap-4 py-4">
                    <PackThumb count={pack.count} />
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{pack.name}</p>
                          <p className="text-sm text-muted">{pack.count} sponges</p>
                        </div>
                        <p className="font-semibold">{formatPaise(pack.price * line.qty)}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center rounded-full border border-line">
                          <button
                            type="button"
                            className="grid size-8 place-items-center"
                            onClick={() => setQty(line.packId, line.qty - 1)}
                            aria-label={`Decrease ${pack.name} quantity`}
                          >
                            <Minus className="size-4" />
                          </button>
                          <span className="w-6 text-center text-sm font-semibold" aria-live="polite">
                            {line.qty}
                          </span>
                          <button
                            type="button"
                            className="grid size-8 place-items-center disabled:opacity-40"
                            onClick={() => setQty(line.packId, line.qty + 1)}
                            disabled={line.qty >= commerce.maxQtyPerPack}
                            aria-label={`Increase ${pack.name} quantity`}
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(line.packId)}
                          className="flex items-center gap-1 text-sm text-muted hover:text-danger"
                        >
                          <Trash2 className="size-4" /> Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
              {upsell && (
                <li className="py-4">
                  <div className="rounded-2xl bg-mint-soft p-4">
                    <p className="text-sm font-semibold">
                      Get the {upsell.name} — {upsell.count} sponges at {formatPaise(perPiece(upsell))} each
                    </p>
                    <button
                      type="button"
                      onClick={() => add(upsell.id)}
                      className="mt-2 text-sm font-bold text-brand hover:underline"
                    >
                      Add {upsell.name} for {formatPaise(upsell.price)}
                    </button>
                  </div>
                </li>
              )}
            </ul>
            <div className="border-t border-line p-5">
              {error && (
                <p className="mb-4 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              {totals && (
                <div className="mb-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Subtotal</span>
                    <span className="font-semibold">{formatPaise(totals.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Delivery</span>
                    <span className="font-semibold text-success">Free</span>
                  </div>
                  {totals.mrpTotal > totals.subtotal && (
                    <p className="pt-1 text-success">
                      You save {formatPaise(totals.mrpTotal - totals.subtotal)} on MRP
                    </p>
                  )}
                </div>
              )}
              {error ? (
                <button type="button" disabled className={buttonClasses("primary", "lg", "w-full")}>
                  Checkout
                </button>
              ) : (
                <Link href="/checkout" onClick={close} className={buttonClasses("primary", "lg", "w-full")}>
                  Checkout
                </Link>
              )}
              <p className="mt-3 text-center text-xs text-muted">
                {onlinePayments
                  ? "UPI, cards, netbanking or Cash on Delivery"
                  : "Cash on Delivery: pay when it arrives"}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
