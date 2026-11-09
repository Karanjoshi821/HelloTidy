/**
 * The public catalogue, as the storefront sees it. Safe for the browser: no
 * stock counts, costs or hidden packs. All amounts are paise (inclusive of GST).
 */

export type Pack = {
  /** Public id used in carts and ad links, e.g. "pack-50". */
  id: string;
  sku: string;
  name: string;
  /** Pieces in the pack. */
  count: number;
  price: number;
  mrp: number;
  badge: string | null;
  blurb: string;
  /** False when stock is tracked and has run out. */
  available: boolean;
};

export type Storefront = {
  /** Visible packs in display order (hidden packs are left out). */
  packs: Pack[];
  /** The pack selected when a visitor lands on the product page. */
  defaultPackId: string | null;
  codFee: number;
  /** COD isn't offered above this order total. */
  codMaxOrderValue: number;
};

export function findPack(storefront: Pick<Storefront, "packs">, id: string | null | undefined): Pack | undefined {
  return id ? storefront.packs.find((p) => p.id === id) : undefined;
}

/** Price per piece in paise, rounded to 10 paise (shown as e.g. "₹21.90"). */
export function perPiece(pack: Pick<Pack, "price" | "count">): number {
  return Math.round(pack.price / pack.count / 10) * 10;
}

/** Whole-percent saving against MRP; 0 when sold at MRP. */
export function discountPercent(pack: Pick<Pack, "price" | "mrp">): number {
  if (pack.mrp <= pack.price) return 0;
  return Math.round(((pack.mrp - pack.price) / pack.mrp) * 100);
}

/** Lowest price among packs a customer can buy right now, or null if none. */
export function lowestPrice(storefront: Pick<Storefront, "packs">): number | null {
  const available = storefront.packs.filter((p) => p.available);
  return available.length ? Math.min(...available.map((p) => p.price)) : null;
}

/** "10, 25 & 50": piece counts of the visible packs, smallest first. Null when nothing is listed. */
export function packSizesLabel(storefront: Pick<Storefront, "packs">): string | null {
  const counts = [...new Set(storefront.packs.map((p) => p.count))].sort((a, b) => a - b);
  if (!counts.length) return null;
  if (counts.length === 1) return String(counts[0]);
  return `${counts.slice(0, -1).join(", ")} & ${counts[counts.length - 1]}`;
}

/** Lowest per-piece price (paise) among packs on sale, for "from about ₹18 each" claims. */
export function lowestPerPiece(storefront: Pick<Storefront, "packs">): number | null {
  const available = storefront.packs.filter((p) => p.available);
  return available.length ? Math.min(...available.map(perPiece)) : null;
}

/** "Most popular" gets the mint badge, anything else the brand colour. */
export function badgeTone(badge: string): "mint" | "brand" {
  return badge.toLowerCase() === "most popular" ? "mint" : "brand";
}
