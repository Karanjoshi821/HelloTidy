import { commerce } from "@/config/products";
import type { Pack } from "./catalog/types";
import { formatPaise } from "./money";

/**
 * Order pricing. Pure and shared: the browser uses it for previews with the
 * cached storefront catalogue, the server uses it as the source of truth with
 * pack rows read (and locked) inside the order transaction. Coupon lookup is
 * server-only, so the browser only ever sees a code the customer typed.
 * All amounts are paise.
 */

export type PaymentMethod = "cod" | "prepaid";

export type CartLine = { packId: string; qty: number };

/** A discount code as the pricing engine sees it. */
export type Coupon = {
  code: string;
  type: "flat" | "percent";
  /** Paise for flat, whole percent (1–90) for percent. */
  value: number;
  /** Minimum subtotal. */
  minOrder: number;
  /** Cap for percent coupons. */
  maxDiscount: number | null;
  description: string;
};

export type PricingPack = Pick<Pack, "id" | "sku" | "name" | "count" | "price" | "mrp" | "available">;

/** What pricing needs to know about the store. A `Storefront` satisfies it. */
export type PricingCatalog = {
  packs: PricingPack[];
  codFee: number;
  codMaxOrderValue: number;
};

export type QuoteLimits = { maxQtyPerPack: number; maxLines: number };

/** Limits for customer checkouts. Staff creating an order in the admin may go higher. */
export const checkoutLimits: QuoteLimits = {
  maxQtyPerPack: commerce.maxQtyPerPack,
  maxLines: commerce.maxLinesPerOrder,
};

/** Staff creating an order in the admin: bulk quantities allowed. */
export const adminOrderLimits: QuoteLimits = { maxQtyPerPack: 100, maxLines: 10 };

export type QuoteLine = {
  packId: string;
  sku: string;
  name: string;
  count: number;
  qty: number;
  unitPrice: number;
  unitMrp: number;
  lineTotal: number;
};

export type Quote = {
  lines: QuoteLine[];
  itemCount: number;
  subtotal: number;
  mrpTotal: number;
  discount: number;
  coupon: { code: string; description: string } | null;
  couponError: string | null;
  shippingFee: number;
  codFee: number;
  total: number;
  codAvailable: boolean;
};

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

/** Merges duplicate packs and rejects anything not for sale. */
export function normalizeLines(
  lines: CartLine[],
  catalog: Pick<PricingCatalog, "packs">,
  limits: QuoteLimits = checkoutLimits,
): { pack: PricingPack; qty: number }[] {
  const merged = new Map<string, { pack: PricingPack; qty: number }>();
  for (const line of lines) {
    const pack = catalog.packs.find((p) => p.id === line.packId);
    if (!pack) throw new QuoteError("One of the items is no longer available.");
    if (!pack.available) throw new QuoteError(`${pack.name} is out of stock right now.`);
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new QuoteError("Invalid quantity.");
    const current = merged.get(pack.id);
    merged.set(pack.id, { pack, qty: (current?.qty ?? 0) + line.qty });
  }
  if (merged.size === 0) throw new QuoteError("Your cart is empty.");
  if (merged.size > limits.maxLines) throw new QuoteError("Too many items in one order.");
  for (const { pack, qty } of merged.values()) {
    if (qty > limits.maxQtyPerPack) {
      throw new QuoteError(
        `You can order up to ${limits.maxQtyPerPack} of the ${pack.name} at a time. For bulk orders, please contact us.`,
      );
    }
  }
  return [...merged.values()];
}

export function couponDiscount(coupon: Coupon, subtotal: number): number {
  if (coupon.type === "flat") return Math.min(coupon.value, subtotal);
  const pct = Math.min(Math.max(coupon.value, 0), 90);
  let discount = Math.floor((subtotal * pct) / 100);
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  return discount;
}

/** Computes an order total from catalogue prices. */
export function quote(input: {
  lines: CartLine[];
  paymentMethod: PaymentMethod;
  catalog: PricingCatalog;
  coupon?: Coupon | null;
  limits?: QuoteLimits;
  /** Admin orders only: a flat discount instead of a code. */
  manualDiscount?: number;
  /** Admin orders only: don't charge the COD fee. */
  waiveCodFee?: boolean;
}): Quote {
  const normalized = normalizeLines(input.lines, input.catalog, input.limits);

  const lines: QuoteLine[] = normalized.map(({ pack, qty }) => ({
    packId: pack.id,
    sku: pack.sku,
    name: pack.name,
    count: pack.count,
    qty,
    unitPrice: pack.price,
    unitMrp: pack.mrp,
    lineTotal: pack.price * qty,
  }));

  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const mrpTotal = lines.reduce((sum, l) => sum + l.unitMrp * l.qty, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.qty, 0);

  let discount = 0;
  let coupon: Quote["coupon"] = null;
  let couponError: string | null = null;
  if (input.coupon) {
    if (subtotal < input.coupon.minOrder) {
      couponError = `Add items worth ${formatPaise(input.coupon.minOrder)} or more to use ${input.coupon.code}.`;
    } else {
      discount = couponDiscount(input.coupon, subtotal);
      coupon = { code: input.coupon.code, description: input.coupon.description };
    }
  } else if (input.manualDiscount) {
    discount = Math.min(Math.max(Math.floor(input.manualDiscount), 0), subtotal);
  }

  const shippingFee = commerce.shippingFee;
  const beforeCod = subtotal - discount + shippingFee;
  const codFeeAmount = input.waiveCodFee ? 0 : input.catalog.codFee;
  const codAvailable = beforeCod + codFeeAmount <= input.catalog.codMaxOrderValue;
  const codFee = input.paymentMethod === "cod" ? codFeeAmount : 0;

  return {
    lines,
    itemCount,
    subtotal,
    mrpTotal,
    discount,
    coupon,
    couponError,
    shippingFee,
    codFee,
    total: beforeCod + codFee,
    codAvailable,
  };
}
