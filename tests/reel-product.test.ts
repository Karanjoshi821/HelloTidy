import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { product } from "@/config/products";
import { quote } from "@/lib/pricing";

const pack = { id: "pack-10", sku: "TEST", name: "Pack of 10", count: 10, price: 39900, mrp: 59900, available: true };
const catalog = { packs: [pack], codFee: 4900, codMaxOrderValue: 85000 };

describe("reel-driven buying information", () => {
  it("keeps three scannable product benefits", () => {
    expect(product.highlights).toHaveLength(3);
    expect(product.highlights.every((text) => text.length < 65)).toBe(true);
  });

  it("quotes quantity and COD fee with the same engine as checkout", () => {
    const totals = quote({ catalog, lines: [{ packId: pack.id, qty: 2 }], paymentMethod: "cod" });
    expect(totals.subtotal).toBe(79800);
    expect(totals.total).toBe(84700);
    expect(totals.codAvailable).toBe(true);
    expect(
      quote({
        catalog: { ...catalog, codMaxOrderValue: 84699 },
        lines: [{ packId: pack.id, qty: 2 }],
        paymentMethod: "cod",
      }).codAvailable,
    ).toBe(false);
  });

  it("does not add a COD fee to prepaid checkout", () => {
    expect(quote({ catalog, lines: [{ packId: pack.id, qty: 2 }], paymentMethod: "prepaid" }).total).toBe(79800);
  });

  it("never quotes an unavailable pack", () => {
    expect(() =>
      quote({
        catalog: { ...catalog, packs: [{ ...pack, available: false }] },
        lines: [{ packId: pack.id, qty: 1 }],
        paymentMethod: "cod",
      }),
    ).toThrow(/stock/);
  });

  it("keeps selection totals connected to checkout pricing and guards sold-out packs", () => {
    const source = readFileSync(new URL("../src/components/product/pack-picker.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (!pack?.available) return null;");
    expect(source).toContain("catalog: storefront");
    expect(source).toContain("SelectedOrderSummary");
  });
});
