import { describe, expect, it } from "vitest";
import { commerce } from "@/config/products";
import {
  discountPercent,
  lowestPerPiece,
  lowestPrice,
  packSizesLabel,
  perPiece,
  type Pack,
  type Storefront,
} from "@/lib/catalog/types";
import { checkoutLimits, quote, QuoteError, type Coupon } from "@/lib/pricing";

/** The seeded catalogue (drizzle/0001), as the storefront sees it. Amounts in paise. */
const pack = (id: string, count: number, price: number, mrp: number, available = true): Pack => ({
  id,
  sku: `HT-SPONGE-${count}`,
  name: `${count} pack`,
  count,
  price,
  mrp,
  badge: null,
  blurb: "",
  available,
});
const catalog: Storefront = {
  packs: [pack("pack-10", 10, 34900, 59900), pack("pack-25", 25, 54900, 109900), pack("pack-50", 50, 89900, 199900)],
  defaultPackId: "pack-25",
  codFee: 4900,
  codMaxOrderValue: 300000,
};

const flat50: Coupon = {
  code: "FLAT50",
  type: "flat",
  value: 5000,
  minOrder: 50000,
  maxDiscount: null,
  description: "",
};
const pct10: Coupon = { code: "PCT10", type: "percent", value: 10, minOrder: 0, maxDiscount: 6000, description: "" };

describe("quote", () => {
  it("prices a prepaid order from the catalogue with free shipping", () => {
    const q = quote({ lines: [{ packId: "pack-25", qty: 1 }], paymentMethod: "prepaid", catalog });
    expect(q.subtotal).toBe(54900);
    expect(q.shippingFee).toBe(0);
    expect(q.codFee).toBe(0);
    expect(q.total).toBe(54900);
    expect(q.mrpTotal).toBe(109900);
  });

  it("adds the store's COD fee for cash on delivery", () => {
    const q = quote({ lines: [{ packId: "pack-25", qty: 1 }], paymentMethod: "cod", catalog });
    expect(q.codFee).toBe(4900);
    expect(q.total).toBe(54900 + 4900);
    const free = quote({
      lines: [{ packId: "pack-25", qty: 1 }],
      paymentMethod: "cod",
      catalog: { ...catalog, codFee: 0 },
    });
    expect(free.codFee).toBe(0);
    expect(free.total).toBe(54900);
  });

  it("can waive the COD fee (admin orders only)", () => {
    const q = quote({ lines: [{ packId: "pack-25", qty: 1 }], paymentMethod: "cod", catalog, waiveCodFee: true });
    expect(q.codFee).toBe(0);
  });

  it("merges duplicate lines", () => {
    const q = quote({
      lines: [
        { packId: "pack-25", qty: 1 },
        { packId: "pack-25", qty: 2 },
      ],
      paymentMethod: "prepaid",
      catalog,
    });
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].qty).toBe(3);
  });

  it("rejects unknown packs, bad quantities and over-limit quantities", () => {
    const bad = (lines: { packId: string; qty: number }[]) => () => quote({ lines, paymentMethod: "cod", catalog });
    expect(bad([{ packId: "pack-999", qty: 1 }])).toThrow(QuoteError);
    expect(bad([{ packId: "pack-25", qty: 0 }])).toThrow(QuoteError);
    expect(bad([{ packId: "pack-25", qty: 1.5 }])).toThrow(QuoteError);
    expect(bad([{ packId: "pack-25", qty: commerce.maxQtyPerPack + 1 }])).toThrow(QuoteError);
    expect(bad([])).toThrow(QuoteError);
  });

  it("allows bigger quantities when the caller raises the limits (staff bulk orders)", () => {
    const q = quote({
      lines: [{ packId: "pack-25", qty: 40 }],
      paymentMethod: "prepaid",
      catalog,
      limits: { ...checkoutLimits, maxQtyPerPack: 100 },
    });
    expect(q.itemCount).toBe(40);
  });

  it("rejects packs that are out of stock", () => {
    const soldOut = {
      ...catalog,
      packs: catalog.packs.map((p) => (p.id === "pack-10" ? { ...p, available: false } : p)),
    };
    expect(() => quote({ lines: [{ packId: "pack-10", qty: 1 }], paymentMethod: "cod", catalog: soldOut })).toThrow(
      /out of stock/,
    );
  });

  it("disables COD above the COD cap", () => {
    const q = quote({ lines: [{ packId: "pack-50", qty: 5 }], paymentMethod: "prepaid", catalog });
    expect(89900 * 5 + 4900).toBeGreaterThan(catalog.codMaxOrderValue);
    expect(q.codAvailable).toBe(false);
    expect(quote({ lines: [{ packId: "pack-25", qty: 1 }], paymentMethod: "prepaid", catalog }).codAvailable).toBe(
      true,
    );
  });

  it("applies a flat coupon above its minimum", () => {
    const q = quote({ lines: [{ packId: "pack-25", qty: 1 }], paymentMethod: "prepaid", coupon: flat50, catalog });
    expect(q.discount).toBe(5000);
    expect(q.total).toBe(54900 - 5000);
    expect(q.coupon?.code).toBe("FLAT50");
  });

  it("refuses a coupon below its minimum order", () => {
    const q = quote({ lines: [{ packId: "pack-10", qty: 1 }], paymentMethod: "prepaid", coupon: flat50, catalog });
    expect(q.discount).toBe(0);
    expect(q.couponError).toMatch(/₹500/);
  });

  it("caps percent coupons at maxDiscount", () => {
    const q = quote({ lines: [{ packId: "pack-50", qty: 1 }], paymentMethod: "prepaid", coupon: pct10, catalog });
    expect(q.discount).toBe(6000); // 10% of ₹899 = ₹89.90, capped at ₹60
  });

  it("applies a manual discount, never below zero", () => {
    const q = quote({
      lines: [{ packId: "pack-10", qty: 1 }],
      paymentMethod: "prepaid",
      catalog,
      manualDiscount: 5000,
    });
    expect(q.discount).toBe(5000);
    expect(q.total).toBe(34900 - 5000);
    const all = quote({
      lines: [{ packId: "pack-10", qty: 1 }],
      paymentMethod: "prepaid",
      catalog,
      manualDiscount: 1e9,
    });
    expect(all.total).toBe(0);
  });
});

describe("catalogue helpers", () => {
  it("computes per-piece price, discount and the lowest price", () => {
    expect(perPiece(catalog.packs[2])).toBe(1800); // ₹899 / 50 = ₹17.98 → ₹18.0
    expect(perPiece(catalog.packs[0])).toBe(3490);
    expect(discountPercent(catalog.packs[1])).toBe(50);
    expect(discountPercent({ price: 100, mrp: 100 })).toBe(0);
    expect(lowestPrice(catalog)).toBe(34900);
    expect(lowestPerPiece(catalog)).toBe(1800);
  });

  it("ignores sold-out packs for 'from' prices", () => {
    const soldOut = { packs: catalog.packs.map((p) => ({ ...p, available: p.id === "pack-50" })) };
    expect(lowestPrice(soldOut)).toBe(89900);
    expect(lowestPrice({ packs: [] })).toBeNull();
  });

  it("labels the pack sizes for titles", () => {
    expect(packSizesLabel(catalog)).toBe("10, 25 & 50");
    expect(packSizesLabel({ packs: [catalog.packs[1]] })).toBe("25");
    expect(packSizesLabel({ packs: [] })).toBeNull();
  });
});
