import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.BASE_URL || "http://localhost:3201";
const out = ".data/reel-browser";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const errors = [];
const results = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/products/magic-eraser-sponge`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.locator('input[name="pack"]').first().waitFor({ state: "attached" });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: overflow`);
    assert.equal(await page.locator("#buy > ul").first().locator("li").count(), 3);
    const summary = page.locator('[aria-live="polite"][aria-atomic="true"]');
    await summary.waitFor();
    const radios = page.locator('input[name="pack"]:enabled');
    for (let i = 0; i < (await radios.count()); i++) {
      await radios.nth(i).check({ force: true });
      assert.match(await summary.innerText(), /1 pack/);
    }
    const selectedId = await page.locator('input[name="pack"]:checked').inputValue();
    await page.getByRole("button", { name: "Increase quantity" }).click();
    assert.match(await summary.innerText(), /2 packs/);
    await page.getByRole("button", { name: "Decrease quantity" }).click();
    for (const link of await page.locator('nav[aria-label="Product sections"] a').all()) {
      const href = await link.getAttribute("href");
      assert.equal(await page.locator(href).count(), 1);
    }
    await page.getByText("Can I cancel my order?", { exact: true }).click();
    assert(await page.getByText("Yes, any time before it is dispatched.", { exact: false }).isVisible());
    await page.getByRole("button", { name: "Add to cart", exact: true }).first().click();
    assert(await page.getByRole("dialog").isVisible());
    await page.getByRole("dialog").getByRole("button", { name: "Close cart" }).last().click();
    await page.locator("#buy-buttons").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/${width}-buy.png` });
    await page.screenshot({ path: `${out}/${width}-full.png`, fullPage: true });
    await page.getByRole("button", { name: "Buy now", exact: true }).first().click();
    await page.waitForURL(/checkout/);
    assert.equal(new URL(page.url()).searchParams.get("pack"), selectedId);
    assert.equal(new URL(page.url()).searchParams.get("qty"), "1");
    results.push(`${width}px: layout, benefits, packs, quantities, anchors, FAQ, cart, checkout passed`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(results.join("\n"));
  writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
} finally {
  await browser.close();
}
