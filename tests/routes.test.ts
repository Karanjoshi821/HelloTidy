import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { product } from "@/config/products";

describe("routes", () => {
  it("has a product page folder matching product.slug", () => {
    expect(existsSync(join(process.cwd(), "src/app/(site)/products", product.slug, "page.tsx"))).toBe(true);
  });
});
