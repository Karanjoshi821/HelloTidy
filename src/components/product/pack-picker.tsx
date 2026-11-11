"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, Check, Minus, Plus, ShoppingBag, Zap } from "lucide-react";
import { commerce } from "@/config/products";
import { trackAddToCart, trackPackSelect, trackViewItem } from "@/lib/analytics/track";
import { badgeTone, discountPercent, findPack, perPiece, type Pack } from "@/lib/catalog/types";
import { formatPaise } from "@/lib/money";
import { quote } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useCart } from "../cart/cart-context";
import { useStorefront } from "../storefront-context";
import { Badge } from "../ui/layout";

type Selection = {
  /** Null only when no pack is on sale at all. */
  pack: Pack | null;
  setPackId: (id: string) => void;
  qty: number;
  setQty: (qty: number) => void;
};

const SelectionContext = createContext<Selection | null>(null);

const noopSubscribe = () => () => undefined;

/** Ads can deep-link a pack with ?pack=pack-50. Read on the client so the page stays static. */
function packParamFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("pack");
}

export function PackSelectionProvider({ children }: { children: ReactNode }) {
  const storefront = useStorefront();
  const urlPackId = useSyncExternalStore(noopSubscribe, packParamFromUrl, () => null);
  const [chosenPackId, setPackId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  const fromUrl = findPack(storefront, urlPackId);
  const pack =
    findPack(storefront, chosenPackId) ??
    (fromUrl?.available ? fromUrl : undefined) ??
    findPack(storefront, storefront.defaultPackId) ??
    null;
  const choosePack = (id: string) => {
    setPackId(id);
    const chosen = findPack(storefront, id);
    if (chosen && chosen.id !== pack?.id) trackPackSelect(chosen);
  };
  return (
    <SelectionContext
      value={{
        pack,
        setPackId: choosePack,
        qty,
        setQty: (q) => setQty(Math.min(Math.max(1, q), commerce.maxQtyPerPack)),
      }}
    >
      {children}
    </SelectionContext>
  );
}

function useSelection(): Selection {
  const ctx = use(SelectionContext);
  if (!ctx) throw new Error("Wrap in <PackSelectionProvider>");
  return ctx;
}

export function PriceBlock() {
  const { pack } = useSelection();
  if (!pack) return <p className="text-lg font-bold">Currently unavailable. Please check back soon.</p>;
  const off = discountPercent(pack);
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-extrabold tracking-tight">{formatPaise(pack.price)}</span>
        {off > 0 && (
          <>
            <span className="text-lg text-muted">
              MRP <span className="line-through">{formatPaise(pack.mrp)}</span>
            </span>
            <Badge tone="success">{off}% off</Badge>
          </>
        )}
      </div>
      {off > 0 && (
        <p className="mt-1 text-sm font-bold text-success">You save {formatPaise(pack.mrp - pack.price)} on MRP</p>
      )}
      <p className="mt-1 text-sm text-muted">
        {pack.count} sponges · {formatPaise(perPiece(pack))} per sponge · Inclusive of all taxes
      </p>
    </div>
  );
}

export function PackOptions({ compact = false }: { compact?: boolean }) {
  const { pack: selected, setPackId } = useSelection();
  const { packs } = useStorefront();
  if (!packs.length) return null;
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-bold">Choose your pack</legend>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-3" : "")}>
        {packs.map((pack) => {
          const active = pack.id === selected?.id;
          return (
            <label
              key={pack.id}
              className={cn(
                "relative flex cursor-pointer items-center gap-4 rounded-2xl border-2 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2",
                active ? "border-brand bg-brand-soft/60" : "border-line bg-white hover:border-ink/25",
                !pack.available && "cursor-not-allowed opacity-50",
                compact && "sm:flex-col sm:items-start sm:gap-2",
              )}
            >
              <input
                type="radio"
                name="pack"
                value={pack.id}
                checked={active}
                disabled={!pack.available}
                onChange={() => setPackId(pack.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full border-2",
                  active ? "border-brand bg-brand text-white" : "border-line",
                )}
              >
                {active && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className="flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{pack.name}</span>
                  {pack.badge && <Badge tone={badgeTone(pack.badge)}>{pack.badge}</Badge>}
                </span>
                <span className="block text-sm text-muted">
                  {pack.count} sponges · {formatPaise(perPiece(pack))}/sponge
                </span>
                {pack.blurb && <span className="mt-1 block text-xs text-ink-soft">{pack.blurb}</span>}
              </span>
              <span className={cn("text-right", compact && "sm:text-left")}>
                <span className="block text-lg font-extrabold">{formatPaise(pack.price)}</span>
                {pack.mrp > pack.price && (
                  <>
                    <span className="block text-xs text-muted">
                      MRP <span className="line-through">{formatPaise(pack.mrp)}</span>
                    </span>
                    <span className="block text-xs font-bold text-success">
                      Save {formatPaise(pack.mrp - pack.price)}
                    </span>
                  </>
                )}
              </span>
              {!pack.available && <span className="absolute top-2 right-3 text-xs font-bold">Out of stock</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Offers the next bigger pack, from live prices, only when it really is cheaper per sponge. */
export function PackUpgradeNudge() {
  const { pack, setPackId } = useSelection();
  const { packs } = useStorefront();
  if (!pack) return null;
  const next = packs.filter((p) => p.available && p.count > pack.count).sort((a, b) => a.count - b.count)[0];
  if (!next || perPiece(next) >= perPiece(pack)) return null;
  return (
    <button
      type="button"
      onClick={() => setPackId(next.id)}
      className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-soft px-4 py-3 text-left text-sm font-semibold text-brand-dark transition-colors hover:bg-mint"
    >
      <span>
        Get {next.count - pack.count} more sponges for {formatPaise(next.price - pack.price)} more, at{" "}
        {formatPaise(perPiece(next))} each
      </span>
      <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
    </button>
  );
}

export function SelectedOrderSummary({ onlinePayments }: { onlinePayments: boolean }) {
  const { pack, qty } = useSelection();
  const storefront = useStorefront();
  if (!pack?.available) return null;
  const { subtotal, codFee, codAvailable, total } = quote({
    lines: [{ packId: pack.id, qty }],
    paymentMethod: "cod",
    catalog: storefront,
  });
  return (
    <div className="rounded-2xl bg-surface p-4 text-sm" aria-live="polite" aria-atomic="true">
      <p className="font-bold">
        Your selection: {qty} {qty === 1 ? "pack" : "packs"} · {pack.count * qty} sponges
      </p>
      <p className="mt-1">{formatPaise(subtotal)} · Free delivery · Taxes included</p>
      <p className="mt-1 text-muted">
        {codAvailable
          ? `Pay on delivery: ${formatPaise(total)}${codFee > 0 ? ` (includes ${formatPaise(codFee)} COD fee)` : " (no COD fee)"}.`
          : "This selection exceeds the Cash on Delivery limit."}
        {onlinePayments ? ` Pay online: ${formatPaise(subtotal)} before any checkout discount.` : ""}
      </p>
      <p className="mt-1 text-xs text-muted">Review your final total and any discount at checkout.</p>
    </div>
  );
}

export function QtyStepper() {
  const { qty, setQty } = useSelection();
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-bold">Quantity</span>
      <div className="flex items-center rounded-full border border-line bg-white">
        <button
          type="button"
          onClick={() => setQty(qty - 1)}
          disabled={qty <= 1}
          className="grid size-10 place-items-center disabled:opacity-40"
          aria-label="Decrease quantity"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-8 text-center font-semibold" aria-live="polite">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => setQty(qty + 1)}
          disabled={qty >= commerce.maxQtyPerPack}
          className="grid size-10 place-items-center disabled:opacity-40"
          aria-label="Increase quantity"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

function useBuyActions() {
  const { pack, qty } = useSelection();
  const router = useRouter();
  const cart = useCart();

  return {
    buyNow: () => {
      if (!pack?.available) return;
      trackAddToCart(pack, qty, "buy_now");
      router.push(`/checkout?pack=${encodeURIComponent(pack.id)}&qty=${qty}`);
    },
    addToCart: () => {
      if (!pack?.available) return;
      trackAddToCart(pack, qty, "cart");
      cart.add(pack.id, qty);
      cart.open();
    },
    disabled: !pack?.available,
  };
}

export function BuyButtons({ id }: { id?: string }) {
  const { buyNow, addToCart, disabled } = useBuyActions();
  return (
    <div id={id} className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={buyNow}
        disabled={disabled}
        className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-brand px-6 text-base font-bold text-white shadow-lift transition-colors hover:bg-brand-dark disabled:opacity-50"
      >
        <Zap className="size-5" /> Buy now
      </button>
      <button
        type="button"
        onClick={addToCart}
        disabled={disabled}
        className="inline-flex h-13 items-center justify-center gap-2 rounded-full border-2 border-ink px-6 text-base font-bold transition-colors hover:bg-ink hover:text-white disabled:opacity-50"
      >
        <ShoppingBag className="size-5" /> Add to cart
      </button>
    </div>
  );
}

/**
 * True once `showAfterId` has scrolled above the viewport (or straight away
 * without one), unless `hideWhileVisibleId` is on screen. Uses scroll position rather than
 * IntersectionObserver, which can miss an element a fast fling skips over.
 */
function useStickyVisible(showAfterId?: string, hideWhileVisibleId?: string): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const target = showAfterId ? document.getElementById(showAfterId) : null;
      if (showAfterId && !target) return;
      const past = target ? target.getBoundingClientRect().bottom < 0 : true;
      const other = hideWhileVisibleId
        ? document.getElementById(hideWhileVisibleId)?.getBoundingClientRect()
        : undefined;
      const otherOnScreen = Boolean(other && other.bottom > 0 && other.top < window.innerHeight);
      setVisible(past && !otherOnScreen);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [showAfterId, hideWhileVisibleId]);
  return visible;
}

/**
 * Mobile-only bar that keeps the price and Buy button in reach. On the product
 * page it shows from the first screen, because the page's own button sits far
 * below it; it hides whenever that button is visible, so it never duplicates it.
 */
export function StickyBuyBar({
  showAfterId,
  hideWhileVisibleId,
}: {
  showAfterId?: string;
  hideWhileVisibleId?: string;
}) {
  const { pack, qty } = useSelection();
  const { buyNow, disabled } = useBuyActions();
  const visible = useStickyVisible(showAfterId, hideWhileVisibleId);
  if (!pack) return null;
  return (
    <div
      data-testid="sticky-buy-bar"
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-ink backdrop-blur transition-transform duration-300 md:hidden",
        visible ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {pack.name} · {pack.count} sponges{qty > 1 ? ` × ${qty}` : ""}
          </p>
          <p className="text-sm">
            <span className="font-extrabold">{formatPaise(pack.price * qty)}</span>{" "}
            {pack.mrp > pack.price && <span className="text-muted line-through">{formatPaise(pack.mrp * qty)}</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={buyNow}
          disabled={disabled}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-bold text-white shadow-lift disabled:opacity-50"
        >
          <Zap className="size-4" /> Buy now
        </button>
      </div>
    </div>
  );
}

export function ViewContentEvent() {
  const storefront = useStorefront();
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackViewItem(storefront.packs, findPack(storefront, storefront.defaultPackId));
  }, [storefront]);
  return null;
}

/** Chip showing how many sponges the selected pack has (overlaid on the gallery). */
export function SelectedPackBadge() {
  const { pack } = useSelection();
  if (!pack) return null;
  return (
    <span className="absolute top-3 left-3 rounded-full bg-ink/90 px-3 py-1.5 text-sm font-extrabold text-white shadow-lg">
      {pack.name} · {pack.count} sponges
    </span>
  );
}
