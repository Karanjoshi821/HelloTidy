/**
 * Full A-to-Z QA run (see docs/QA-CHECKLIST.md). Drives a real Chrome against
 * a running server and writes docs/QA-REPORT.md.
 *
 *   BASE_URL=http://localhost:3100 \
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD=… \
 *   STAFF_EMAIL=staff@example.com STAFF_PASSWORD=… \
 *   SCREENSHOT_DIR=./qa-shots  npm run test:qa
 *
 * Needs a fresh database (it places orders and trips rate limits).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core";
import { reviews } from "../../src/config/reviews";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const SHOTS = process.env.SCREENSHOT_DIR;
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "", password: process.env.ADMIN_PASSWORD ?? "" };
const STAFF = { email: process.env.STAFF_EMAIL ?? "", password: process.env.STAFF_PASSWORD ?? "" };
const AXE = join(process.cwd(), "node_modules/axe-core/axe.min.js");

const chromePath = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].find((p) => p && existsSync(p));

type Result = { id: string; title: string; ok: boolean; details: string[] };
const results: Result[] = [];
const notes: string[] = [];

function record(id: string, title: string, problems: string[], info: string[] = []) {
  results.push({ id, title, ok: problems.length === 0, details: [...problems, ...info.map((i) => `ℹ ${i}`)] });
  console.log(
    `${problems.length ? "✗" : "✓"} ${id} ${title}${problems.length ? `\n    - ${problems.slice(0, 8).join("\n    - ")}` : ""}`,
  );
}

async function check(id: string, title: string, fn: () => Promise<string[] | { problems: string[]; info?: string[] }>) {
  try {
    const out = await fn();
    if (Array.isArray(out)) record(id, title, out);
    else record(id, title, out.problems, out.info);
  } catch (error) {
    record(id, title, [`threw: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`]);
  }
}

const PAGES: { path: string; status?: number; name: string }[] = [
  { name: "home", path: "/" },
  { name: "product", path: "/products/magic-eraser-sponge" },
  { name: "checkout", path: "/checkout?pack=pack-25&qty=1" },
  { name: "contact", path: "/contact" },
  { name: "track", path: "/track" },
  { name: "faq", path: "/faq" },
  { name: "guides", path: "/guides" },
  { name: "guide-crayon", path: "/guides/how-to-remove-crayon-from-walls" },
  { name: "guide-howto", path: "/guides/how-to-use-magic-eraser-sponge" },
  { name: "guide-switchboards", path: "/guides/clean-switchboards-tiles-kitchen-grime" },
  { name: "policy-privacy", path: "/policies/privacy" },
  { name: "policy-terms", path: "/policies/terms" },
  { name: "policy-refund", path: "/policies/refund" },
  { name: "policy-shipping", path: "/policies/shipping" },
  { name: "about", path: "/about" },
  { name: "not-found", path: "/this-page-does-not-exist", status: 404 },
  { name: "admin-login", path: "/admin/login" },
];

const WIDTHS = [320, 360, 390, 768, 1024, 1440];

type PageWatch = { errors: string[] };

/** Collects console errors, crashes and failed requests on a page. */
function watch(page: Page): PageWatch {
  const w: PageWatch = { errors: [] };
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // Third-party lookups that legitimately fail in a local test.
    if (/postalpincode|facebook|favicon/.test(t)) return;
    w.errors.push(`console: ${t.slice(0, 200)}`);
  });
  page.on("pageerror", (e) => w.errors.push(`crash: ${e.message.slice(0, 200)}`));
  page.on("response", (r) => {
    const url = r.url();
    if (r.status() >= 400 && url.startsWith(BASE) && !url.includes("this-page-does-not-exist") && r.status() !== 429) {
      w.errors.push(`HTTP ${r.status()} ${url.replace(BASE, "")}`);
    }
  });
  return w;
}

/** `ip` gives the context its own client IP (next start trusts x-real-ip locally), like a separate shopper. */
async function newContext(browser: Browser, width: number, ip?: string): Promise<BrowserContext> {
  const mobile = width < 768;
  const ctx = await browser.newContext({
    viewport: { width, height: mobile ? 800 : 900 },
    deviceScaleFactor: 1,
    isMobile: mobile,
    hasTouch: mobile,
    ...(ip ? { extraHTTPHeaders: { "x-real-ip": ip } } : {}),
  });
  // tsx compiles helpers like __name() into functions passed to page.evaluate; define it in the page.
  await ctx.addInitScript("window.__name = (fn) => fn;");
  return ctx;
}

/** Scrolls through the page so lazy images load, then back to the top. */
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await page.waitForTimeout(300);
}

async function brokenImages(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.images]
      .filter((img) => img.getClientRects().length && (!img.complete || img.naturalWidth === 0))
      .map((img) => img.currentSrc || img.src),
  );
}

/** Interactive elements whose centre point is covered by something else. */
async function coveredElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const els = [
      ...document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, textarea"),
    ];
    for (const el of els) {
      if (el.closest("[inert], [aria-hidden='true']")) continue;
      const details = el.closest("details");
      if (details && !details.open && !el.closest("summary")) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || el.classList.contains("sr-only")) continue;
      if (el.closest(".sr-only") && !el.matches(":focus")) continue;
      if (el.getClientRects().length === 0) continue;
      const fixedAncestor = (() => {
        for (let n: HTMLElement | null = el; n; n = n.parentElement) {
          const p = getComputedStyle(n).position;
          if (p === "fixed" || p === "sticky") return true;
        }
        return false;
      })();
      if (!fixedAncestor) el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit === el || el.contains(hit) || hit.contains(el)) continue;
      const label = el.closest("label");
      if (label && (label === hit || label.contains(hit))) continue;
      const name = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName)
        .trim()
        .slice(0, 40);
      const by = `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ""}.${[...hit.classList].slice(0, 3).join(".")}`;
      out.push(`"${name}" covered by <${by}>`);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
    return [...new Set(out)];
  });
}

async function shot(page: Page, name: string, fullPage = false) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage });
}

async function placeCodOrder(page: Page, opts: { pack?: string; phone?: string; name?: string } = {}) {
  await page.goto(`${BASE}/checkout?pack=${opts.pack ?? "pack-25"}&qty=1`);
  await page.waitForSelector('input[name="name"]');
  await page.fill('input[name="name"]', opts.name ?? "QA Customer");
  await page.fill('input[name="phone"]', opts.phone ?? "9876543210");
  await page.fill('input[name="pincode"]', "411001");
  await page.fill('input[name="city"]', "Pune");
  await page.selectOption('select[name="state"]', "Maharashtra");
  await page.fill('input[name="address1"]', "Flat 12, Shanti Apartments, MG Road");
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/order\//, { timeout: 30_000 });
  await page
    .getByText(/Thank you/)
    .first()
    .waitFor();
  const num = (await page.locator("text=/HT-[A-Z0-9]{6}/").first().textContent())?.match(/HT-[A-Z0-9]{6}/)?.[0];
  return { orderNumber: num ?? "", url: page.url() };
}

/**
 * Admin pages stream their content in after the load event, and React reveals
 * streamed sections in batches: wait until the page heading is visible.
 */
async function go(p: Page, url: string) {
  await p.goto(url);
  await p
    .locator("h1")
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
}

/** Access checks redirect in the browser once streaming starts; wait for the new URL. */
function redirected(p: Page, to: RegExp): Promise<boolean> {
  return p.waitForURL(to, { timeout: 10_000 }).then(
    () => true,
    () => false,
  );
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"), { timeout: 15_000 });
}

async function main() {
  if (!chromePath) throw new Error("No Chrome/Edge found; set CHROME_PATH");
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const started = new Date();

  // ───────────── A. Pages × widths ─────────────
  const perWidth: Record<string, string[]> = { A1: [], A2: [], A3: [], A4: [], A5: [] };
  for (const width of WIDTHS) {
    const ctx = await newContext(browser, width);
    const page = await ctx.newPage();
    for (const p of PAGES) {
      const w = watch(page);
      const res = await page.goto(`${BASE}${p.path}`, { waitUntil: "load" });
      const label = `${p.name}@${width}`;
      if (res?.status() !== (p.status ?? 200)) perWidth.A1.push(`${label}: status ${res?.status()}`);
      await page.waitForTimeout(250);
      await scrollThrough(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) perWidth.A2.push(`${label}: ${overflow}px wider than the screen`);
      for (const src of await brokenImages(page)) perWidth.A3.push(`${label}: ${src.replace(BASE, "")}`);
      for (const covered of await coveredElements(page)) perWidth.A5.push(`${label}: ${covered}`);
      for (const e of w.errors) {
        if (p.status === 404 && /status of 404/.test(e)) continue;
        perWidth.A4.push(`${label}: ${e}`);
      }
      page.removeAllListeners("console");
      page.removeAllListeners("pageerror");
      page.removeAllListeners("response");
      if (width === 390 || width === 1440) {
        await shot(page, `${p.name}-${width}-top`);
        if (width === 390) await shot(page, `${p.name}-${width}-full`, true);
      }
    }
    await ctx.close();
  }
  record("A1", "Pages return the right status at every width", perWidth.A1);
  record("A2", "No horizontal overflow", perWidth.A2);
  record("A3", "All images load", perWidth.A3);
  record("A4", "No console errors, crashes or failed requests", perWidth.A4);
  record("A5", "No interactive element is covered by another element", perWidth.A5);

  // ───────────── B. Header & menus ─────────────
  const mctx = await newContext(browser, 390);
  const m = await mctx.newPage();
  const mw = watch(m);

  await check("B1", "Mobile menu is a full-screen opaque panel", async () => {
    await m.goto(`${BASE}/`);
    await m.getByRole("button", { name: "Open menu" }).click();
    const panel = m.locator("#mobile-menu");
    await panel.waitFor();
    const info = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        top: r.top,
        height: r.height,
        width: r.width,
        bg: getComputedStyle(el).backgroundColor,
        vh: innerHeight,
        vw: innerWidth,
      };
    });
    await m.waitForTimeout(400); // let the fade-in finish before the screenshot
    await shot(m, "menu-open-390");
    const problems: string[] = [];
    if (info.top > 0.5 || info.height < info.vh - 1 || info.width < info.vw - 1)
      problems.push(`panel is ${info.width}×${info.height} at top ${info.top}, screen ${info.vw}×${info.vh}`);
    if (!/rgb\(255, 255, 255\)/.test(info.bg)) problems.push(`panel background is ${info.bg}`);
    return problems;
  });

  await check("B2", "Every mobile menu link is clickable and navigates; menu closes", async () => {
    const problems: string[] = [];
    const labels = await m.locator("#mobile-menu nav a").allTextContents();
    for (const label of labels) {
      await m.goto(`${BASE}/`);
      await m.getByRole("button", { name: "Open menu" }).click();
      const link = m.locator("#mobile-menu nav a", { hasText: label.trim() });
      const covered = await link.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !(hit === el || el.contains(hit!));
      });
      if (covered) problems.push(`"${label}" is covered`);
      const href = await link.getAttribute("href");
      await link.click();
      await m
        .waitForURL((u) => `${u.pathname}${u.hash}` === href || u.pathname === href?.split("#")[0], { timeout: 10_000 })
        .catch(() => problems.push(`"${label}" didn't navigate to ${href}`));
      await m.waitForTimeout(300);
      if (await m.locator("#mobile-menu").count()) problems.push(`menu still open after "${label}"`);
    }
    return { problems, info: [`${labels.length} links tested`] };
  });

  await check("B3", "Escape closes the menu; scroll lock is restored", async () => {
    await m.goto(`${BASE}/`);
    await m.getByRole("button", { name: "Open menu" }).click();
    const locked = await m.evaluate(() => document.body.style.overflow);
    await m.keyboard.press("Escape");
    await m.waitForTimeout(200);
    const problems: string[] = [];
    if (locked !== "hidden") problems.push("body not scroll-locked while open");
    if (await m.locator("#mobile-menu").count()) problems.push("Escape did not close the menu");
    if ((await m.evaluate(() => document.body.style.overflow)) !== "") problems.push("scroll lock not released");
    const focused = await m.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    if (focused !== "Open menu") problems.push(`focus went to ${focused}, expected the menu button`);
    return problems;
  });

  await check("B4", "Desktop navigation links work", async () => {
    const dctx = await newContext(browser, 1440);
    const d = await dctx.newPage();
    await d.goto(`${BASE}/`);
    const hrefs = await d
      .locator('header nav[aria-label="Main"] a')
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    const problems: string[] = [];
    for (const href of hrefs) {
      const r = await d.request.get(`${BASE}${href.split("#")[0]}`);
      if (r.status() !== 200) problems.push(`${href} → ${r.status()}`);
    }
    await dctx.close();
    return { problems, info: [`${hrefs.length} links`] };
  });

  await check("B5", "Cart icon opens the drawer; badge counts items", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m.evaluate(() => localStorage.clear());
    await m.reload();
    await m.locator("#buy").getByRole("button", { name: "Add to cart" }).click();
    await m.getByRole("dialog", { name: "Your cart" }).waitFor();
    await m.keyboard.press("Escape");
    const badge = await m.locator("header button[aria-label^='Open cart']").getAttribute("aria-label");
    await m.locator("header button[aria-label^='Open cart']").click();
    const open = await m.getByRole("dialog", { name: "Your cart" }).isVisible();
    await m.keyboard.press("Escape");
    return [...(badge?.includes("1 item") ? [] : [`badge label "${badge}"`]), ...(open ? [] : ["drawer didn't open"])];
  });

  await check("B7", "Announcement marquee scrolls and pauses on hover", async () => {
    const dctx = await newContext(browser, 1440);
    const d = await dctx.newPage();
    await d.goto(`${BASE}/`);
    const track = d.locator(".animate-marquee");
    const running = await track.evaluate((el) => getComputedStyle(el).animationName);
    const x1 = await track.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    await d.waitForTimeout(1200);
    const x2 = await track.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
    // The track never stops moving, so hover its (static) bar, as a user's pointer would.
    await track.locator("..").hover();
    await d.waitForTimeout(100);
    const paused = await track.evaluate((el) => getComputedStyle(el).animationPlayState);
    const items = await d.locator(".animate-marquee li").count();
    await dctx.close();
    const problems: string[] = [];
    if (running !== "marquee") problems.push(`animation is "${running}"`);
    if (!(x2 < x1)) problems.push("track didn't move");
    if (paused !== "paused") problems.push(`hover state "${paused}"`);
    return { problems, info: [`${items} items in the moving track`] };
  });

  await check("B6", "Skip link is the first focusable element", async () => {
    await m.goto(`${BASE}/`);
    await m.keyboard.press("Tab");
    const text = await m.evaluate(() => document.activeElement?.textContent?.trim());
    return text === "Skip to content" ? [] : [`first Tab focused "${text}"`];
  });

  // ───────────── C. Product page ─────────────
  await check("C1", "Gallery: photos, thumbnails and arrows", async () => {
    const dctx = await newContext(browser, 1440);
    const d = await dctx.newPage();
    await d.goto(`${BASE}/products/magic-eraser-sponge`);
    const count = await d.locator('[aria-label="Product photos"] img').count();
    const problems: string[] = [];
    if (count < 4) problems.push(`only ${count} gallery photos`);
    await d.getByRole("button", { name: /^Show photo 3/ }).click();
    await d.waitForTimeout(700);
    if ((await d.getByRole("button", { name: /^Show photo 3/ }).getAttribute("aria-current")) !== "true")
      problems.push("thumbnail 3 not active after click");
    await d.getByRole("button", { name: "Next photo" }).click();
    await d.waitForTimeout(700);
    if ((await d.getByRole("button", { name: /^Show photo 4/ }).getAttribute("aria-current")) !== "true")
      problems.push("Next arrow didn't move to photo 4");
    await shot(d, "product-gallery-1440");
    await dctx.close();
    return { problems, info: [`${count} photos`] };
  });

  await check("C2", "Selecting a pack updates price, badge and sticky bar", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    const problems: string[] = [];
    for (const [name, price, count] of [
      ["Starter Pack", "₹349", "10"],
      ["Mega Pack", "₹899", "50"],
      ["Home Pack", "₹549", "25"],
    ] as const) {
      await m.locator("#buy label", { hasText: name }).click();
      const priceText = await m.locator("#buy .text-4xl").first().textContent();
      if (priceText?.trim() !== price) problems.push(`${name}: price shows ${priceText}`);
      const badge = await m.locator('[aria-label="Product photos"] ~ span').first().textContent();
      if (!badge?.includes(`${count} sponges`)) problems.push(`${name}: photo badge "${badge}"`);
      const bar = await m.getByTestId("sticky-buy-bar").textContent();
      if (!bar?.includes(price)) problems.push(`${name}: sticky bar "${bar?.slice(0, 50)}"`);
    }
    return problems;
  });

  await check("C3", "Quantity stays between 1 and 5", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    const minus = m.locator("#buy").getByRole("button", { name: "Decrease quantity" });
    const plus = m.locator("#buy").getByRole("button", { name: "Increase quantity" });
    const problems: string[] = [];
    if (!(await minus.isDisabled())) problems.push("minus enabled at 1");
    for (let i = 0; i < 6; i++) if (await plus.isEnabled()) await plus.click();
    const qty = await m.locator("#buy [aria-live=polite]").first().textContent();
    if (qty?.trim() !== "5") problems.push(`qty reached ${qty}`);
    if (!(await plus.isDisabled())) problems.push("plus enabled at 5");
    return problems;
  });

  await check("C4", "?pack=pack-50 preselects the Mega Pack", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge?pack=pack-50`);
    await m.waitForTimeout(300);
    const checked = await m.locator('#buy input[name="pack"]:checked').getAttribute("value");
    return checked === "pack-50" ? [] : [`selected ${checked}`];
  });

  await check("C5", "Sticky bar on the first screen, hidden while Buy is visible, back after it", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    const bar = m.getByTestId("sticky-buy-bar");
    await m.waitForTimeout(400);
    const problems: string[] = [];
    if ((await bar.getAttribute("aria-hidden")) !== "false") problems.push("missing on first screen");
    await m.locator("#buy-buttons").scrollIntoViewIfNeeded();
    await m.waitForTimeout(600);
    if ((await bar.getAttribute("aria-hidden")) !== "true") problems.push("duplicates the visible Buy button");
    await m.locator("#how-it-works").scrollIntoViewIfNeeded();
    await m.waitForTimeout(600);
    if ((await bar.getAttribute("aria-hidden")) !== "false") problems.push("not shown after scrolling past Buy");
    await shot(m, "product-sticky-bar-390");
    await m.goto(`${BASE}/`);
    await m.waitForTimeout(400);
    if ((await m.getByTestId("sticky-buy-bar").getAttribute("aria-hidden")) !== "true")
      problems.push("home: visible on first screen");
    return problems;
  });

  await check("C6", "Buy now opens checkout with the pack and quantity", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m.locator("#buy label", { hasText: "Starter Pack" }).click();
    await m.locator("#buy").getByRole("button", { name: "Increase quantity" }).click();
    await m.locator("#buy").getByRole("button", { name: "Buy now" }).click();
    await m.waitForURL(/\/checkout/);
    const url = new URL(m.url());
    return url.searchParams.get("pack") === "pack-10" && url.searchParams.get("qty") === "2"
      ? []
      : [`went to ${url.pathname}${url.search}`];
  });

  await check("C7", "Add to cart adds the item and opens the cart", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m.evaluate(() => localStorage.clear());
    await m.reload();
    await m.locator("#buy").getByRole("button", { name: "Add to cart" }).click();
    const drawer = m.getByRole("dialog", { name: "Your cart" });
    await drawer.waitFor();
    const text = await drawer.textContent();
    await m.keyboard.press("Escape");
    return text?.includes("Home Pack") ? [] : ["Home Pack not in cart"];
  });

  await check("C8", "Sample reviews are never shown (no section, rating or menu link)", async () => {
    const genuine = reviews.filter((r) => !r.sample).length;
    const problems: string[] = [];
    for (const path of ["/products/magic-eraser-sponge", "/"]) {
      await m.goto(`${BASE}${path}`);
      if (await m.getByText("These look real but are fake.").count()) problems.push(`sample notice on ${path}`);
      if (await m.getByText(/sample reviews?/i).count()) problems.push(`"sample review" text on ${path}`);
      const section = await m.locator("#reviews").count();
      if (!genuine && section) problems.push(`reviews section shown on ${path} with no genuine reviews`);
    }
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    if (!genuine && (await m.locator("a[href='#reviews']").count())) problems.push("rating line or menu links to #reviews");
    return problems;
  });

  await check("C9", "Review photo lightbox (only when genuine reviews have photos)", async () => {
    if (!reviews.some((r) => !r.sample && r.photo)) return [];
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m
      .locator("#reviews")
      .getByRole("button", { name: /^Open photo from/ })
      .first()
      .click();
    const dialog = m.getByRole("dialog", { name: "Customer photo" });
    await dialog.waitFor();
    const first = await dialog.locator("p.font-bold").textContent();
    await m.keyboard.press("ArrowRight");
    const second = await dialog.locator("p.font-bold").textContent();
    await shot(m, "review-lightbox-390");
    await m.keyboard.press("Escape");
    await m.waitForTimeout(200);
    const problems: string[] = [];
    if (first === second) problems.push("ArrowRight didn't change photo");
    if (await dialog.count()) problems.push("Escape didn't close");
    return problems;
  });

  await check("C11", "Before/after slider works with mouse drag and keyboard", async () => {
    const dctx = await newContext(browser, 1440);
    const d = await dctx.newPage();
    await d.goto(`${BASE}/`);
    const slider = d.getByRole("slider", { name: "Compare before and after cleaning" });
    const box = (await d.locator(".cursor-ew-resize").first().boundingBox())!;
    await d.locator(".cursor-ew-resize").first().scrollIntoViewIfNeeded();
    const b = (await d.locator(".cursor-ew-resize").first().boundingBox()) ?? box;
    await d.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5);
    await d.mouse.down();
    await d.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.5, { steps: 6 });
    await d.mouse.up();
    const afterDrag = Number(await slider.inputValue());
    await slider.focus();
    for (let i = 0; i < 5; i++) await d.keyboard.press("ArrowRight");
    const afterKeys = Number(await slider.inputValue());
    await shot(d, "before-after-1440");
    await dctx.close();
    const problems: string[] = [];
    if (afterDrag < 15 || afterDrag > 25) problems.push(`drag to 20% gave ${afterDrag}`);
    if (afterKeys !== afterDrag + 5) problems.push(`5 × ArrowRight gave ${afterKeys} (from ${afterDrag})`);
    return problems;
  });

  await check("C10", "No ratings from sample reviews in structured data", async () => {
    const html = await (await m.request.get(`${BASE}/products/magic-eraser-sponge`)).text();
    return /aggregateRating|"@type":"Review"/.test(html) ? ["structured data contains review ratings"] : [];
  });

  // ───────────── D. Cart ─────────────
  await check("D1", "Cart quantity, limit, remove and empty state", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m.evaluate(() => localStorage.clear());
    await m.reload();
    await m.locator("#buy").getByRole("button", { name: "Add to cart" }).click();
    const drawer = m.getByRole("dialog", { name: "Your cart" });
    const plus = drawer.getByRole("button", { name: /Increase Home Pack/ });
    for (let i = 0; i < 6; i++) if (await plus.isEnabled()) await plus.click();
    const problems: string[] = [];
    if (!(await plus.isDisabled())) problems.push("+ not disabled at 5");
    const sub = await drawer.getByText("Subtotal").locator("..").textContent();
    if (!sub?.includes("2,745")) problems.push(`subtotal at 5 × ₹549: "${sub}"`);
    await drawer.getByRole("button", { name: "Remove" }).click();
    if (!(await drawer.getByText("Your cart is empty.").isVisible())) problems.push("empty state missing");
    if (!(await drawer.getByRole("link", { name: "Shop sponges" }).isVisible()))
      problems.push("no shop link when empty");
    await m.keyboard.press("Escape");
    return problems;
  });

  await check("D2", "Upsell suggests and adds the bigger pack", async () => {
    await m.goto(`${BASE}/products/magic-eraser-sponge`);
    await m.evaluate(() => localStorage.clear());
    await m.reload();
    await m.locator("#buy label", { hasText: "Starter Pack" }).click();
    await m.locator("#buy").getByRole("button", { name: "Add to cart" }).click();
    const drawer = m.getByRole("dialog", { name: "Your cart" });
    await drawer.getByRole("button", { name: /Add Home Pack/ }).click();
    const text = await drawer.textContent();
    await m.keyboard.press("Escape");
    return text?.includes("Home Pack") && text.includes("Starter Pack") ? [] : ["upsell didn't add the Home Pack"];
  });

  await check("D3", "Cart subtotal and savings are right", async () => {
    await m.locator("header button[aria-label^='Open cart']").click();
    const drawer = m.getByRole("dialog", { name: "Your cart" });
    const text = (await drawer.textContent()) ?? "";
    await m.keyboard.press("Escape");
    // Starter ₹349 + Home ₹549 = ₹898; MRP ₹599 + ₹1,099 = ₹1,698 → save ₹800
    return [
      ...(text.includes("₹898") ? [] : ["subtotal isn't ₹898"]),
      ...(text.includes("save ₹800") ? [] : ["savings isn't ₹800"]),
    ];
  });

  await check("D4", "Cart survives a reload", async () => {
    await m.reload();
    await m.locator("header button[aria-label^='Open cart']").click();
    const text = await m.getByRole("dialog", { name: "Your cart" }).textContent();
    await m.keyboard.press("Escape");
    return text?.includes("Starter Pack") ? [] : ["cart empty after reload"];
  });

  // ───────────── E. Checkout ─────────────
  await check("E1", "Buy-now uses only the chosen pack; cart checkout uses the cart", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-50&qty=1`);
    await m.waitForSelector('input[name="name"]');
    const buyNow = (await m.locator("aside").textContent()) ?? "";
    await m.goto(`${BASE}/checkout`);
    await m.waitForSelector('input[name="name"]');
    const cartMode = (await m.locator("aside").textContent()) ?? "";
    const problems: string[] = [];
    if (!buyNow.includes("₹899") || buyNow.includes("Starter")) problems.push("buy-now summary wrong");
    if (!cartMode.includes("₹898")) problems.push("cart summary wrong");
    return problems;
  });

  await check("E2", "Empty submit shows field errors and focuses the first", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
    await m.waitForSelector('input[name="name"]');
    await m.getByRole("button", { name: /Place order/ }).click();
    const errors = await m.locator('[role="alert"]').allTextContents();
    const focused = await m.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name);
    const problems: string[] = [];
    for (const field of ["name", "phone", "pincode", "city", "state", "address1"]) {
      if (!(await m.locator(`[name="${field}"][aria-invalid="true"]`).count()))
        problems.push(`${field} not marked invalid`);
    }
    if (focused !== "name") problems.push(`focus on ${focused}`);
    await shot(m, "checkout-errors-390", true);
    return { problems, info: [`${errors.length} messages`] };
  });

  await check("E3", "Invalid phone and pincode are rejected", async () => {
    await m.fill('input[name="phone"]', "12345");
    await m.fill('input[name="pincode"]', "01234");
    await m.getByRole("button", { name: /Place order/ }).click();
    const phoneErr = await m
      .locator("#phone-error")
      .textContent()
      .catch(() => null);
    const pinErr = await m
      .locator("#pincode-error")
      .textContent()
      .catch(() => null);
    return [...(phoneErr ? [] : ["no phone error"]), ...(pinErr ? [] : ["no pincode error"])];
  });

  await check("E4", "Pincode autofills city and state", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
    await m.waitForSelector('input[name="name"]');
    await m.fill('input[name="pincode"]', "560038");
    await m
      .waitForFunction(() => (document.querySelector('input[name="city"]') as HTMLInputElement)?.value !== "", null, {
        timeout: 12_000,
      })
      .catch(() => undefined);
    const city = await m.inputValue('input[name="city"]');
    const state = await m.inputValue('select[name="state"]');
    if (!city)
      return {
        problems: [],
        info: ["India Post API didn't answer (offline or slow), fallback hint shown; not counted as a failure"],
      };
    return { problems: state === "Karnataka" ? [] : [`state "${state}"`], info: [`560038 → ${city}, ${state}`] };
  });

  await check("E5", "COD charge shown before ordering; total = items + ₹49", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
    await m.waitForSelector('input[name="name"]');
    const text = (await m.locator("aside").textContent()) ?? "";
    const problems: string[] = [];
    if (!/COD charge.*₹49/.test(text)) problems.push("COD charge row missing");
    if (!text.includes("₹598")) problems.push("total isn't ₹598");
    return problems;
  });

  await check("E6", "COD blocked above the limit, with an explanation", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-50&qty=5`);
    await m.waitForSelector('input[name="name"]');
    const cod = m.locator('input[name="paymentMethod"]').last();
    const text = await m.locator("fieldset", { hasText: "Payment" }).textContent();
    return [
      ...((await cod.isDisabled()) ? [] : ["COD still selectable"]),
      ...(text?.includes("Available on orders up to") ? [] : ["no explanation"]),
    ];
  });

  await check("E7", "Invalid coupon shows an error", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
    await m.waitForSelector('input[name="name"]');
    await m.getByLabel("Coupon code").first().fill("NOTREAL");
    await m.getByRole("button", { name: "Apply" }).first().click();
    const ok = await m
      .getByText("This coupon code is not valid.")
      .first()
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    return ok ? [] : ["no coupon error"];
  });

  let orderNumber = "";
  let confirmationUrl = "";
  await check("E8", "COD order lands on confirmation with the right total", async () => {
    const o = await placeCodOrder(m, { pack: "pack-25" });
    orderNumber = o.orderNumber;
    confirmationUrl = o.url;
    const text = (await m.locator("main").textContent()) ?? "";
    await shot(m, "confirmation-390", true);
    return [...(orderNumber ? [] : ["no order number"]), ...(text.includes("₹598") ? [] : ["total ₹598 not shown"])];
  });

  await check("E9", "Double-clicking Place order creates one order", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-10&qty=1`);
    await m.waitForSelector('input[name="name"]');
    await m.fill('input[name="name"]', "Double Click");
    await m.fill('input[name="phone"]', "9811100000");
    await m.fill('input[name="pincode"]', "110001");
    await m.fill('input[name="city"]', "Delhi");
    await m.selectOption('select[name="state"]', "Delhi");
    await m.fill('input[name="address1"]', "House 1, Connaught Place");
    const btn = m.getByRole("button", { name: /Place order/ });
    await btn.dblclick();
    await m.waitForURL(/\/order\//, { timeout: 30_000 });
    return []; // verified in J2 by counting "Double Click" orders
  });

  await check("E10", "Honeypot submissions are rejected", async () => {
    await m.goto(`${BASE}/checkout?pack=pack-10&qty=1`);
    await m.waitForSelector('input[name="name"]');
    await m.fill('input[name="name"]', "Bot Person");
    await m.fill('input[name="phone"]', "9811100001");
    await m.fill('input[name="pincode"]', "110001");
    await m.fill('input[name="city"]', "Delhi");
    await m.selectOption('select[name="state"]', "Delhi");
    await m.fill('input[name="address1"]', "House 2, Connaught Place");
    await m.evaluate(() => {
      (document.querySelector('input[name="company"]') as HTMLInputElement).value = "spam co";
    });
    await m.getByRole("button", { name: /Place order/ }).click();
    await m.waitForTimeout(1500);
    return m.url().includes("/order/") ? ["bot order was accepted"] : [];
  });

  // ───────────── F. After the order ─────────────
  await check("F1", "Confirmation page content and noindex", async () => {
    await m.goto(confirmationUrl);
    await m
      .getByText(/Thank you/)
      .first()
      .waitFor();
    const text = (await m.locator("main").textContent()) ?? "";
    const robots = await m.locator('meta[name="robots"]').getAttribute("content");
    const problems: string[] = [];
    for (const want of [orderNumber, "Home Pack", "₹598", "Delivering to", "Track order"])
      if (!text.includes(want)) problems.push(`missing "${want}"`);
    if (!robots?.includes("noindex")) problems.push("not noindex");
    return problems;
  });

  await check("F2", "Tracking: wrong phone refused, right phone works", async () => {
    await m.goto(`${BASE}/track`);
    await m.fill('input[name="orderNumber"]', orderNumber);
    await m.fill('input[name="phone"]', "9999999999");
    await m.getByRole("button", { name: "Track order" }).click();
    const refused = await m
      .getByText(/couldn't find an order/)
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    await m.fill('input[name="phone"]', "9876543210");
    await m.getByRole("button", { name: "Track order" }).click();
    const found = await m
      .getByText(`Order ${orderNumber}`)
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    const kept = await m.inputValue('input[name="orderNumber"]');
    return [
      ...(refused ? [] : ["wrong phone not refused"]),
      ...(found ? [] : ["right phone didn't show order"]),
      ...(kept === orderNumber ? [] : ["form cleared after submit"]),
    ];
  });

  await check("F3", "Tracking is rate-limited", async () => {
    for (let i = 0; i < 10; i++) {
      await m.getByRole("button", { name: "Track order" }).click();
      await m.waitForTimeout(150);
    }
    const blocked = await m
      .getByText("Too many attempts")
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    return blocked ? [] : ["no rate limit after 12 attempts"];
  });

  await check("F4", "Contact form validates and sends", async () => {
    await m.goto(`${BASE}/contact`);
    await m.getByRole("button", { name: "Send message" }).click();
    const invalid = await m
      .locator('[name="name"][aria-invalid="true"]')
      .waitFor({ timeout: 8000 })
      .then(
        () => 1,
        () => 0,
      );
    await m.fill('input[name="name"]', "Xss Tester");
    await m.fill('input[name="phone"]', "9123456780");
    await m.selectOption('select[name="topic"]', "bulk");
    await m.fill(
      'textarea[name="message"]',
      '<script>window.__xss=1</script><img src=x onerror="window.__xss=1"> need 500 sponges',
    );
    await m.getByRole("button", { name: "Send message" }).click();
    const sent = await m
      .getByText("Message received")
      .waitFor({ timeout: 8000 })
      .then(
        () => true,
        () => false,
      );
    return [...(invalid ? [] : ["empty submit not flagged"]), ...(sent ? [] : ["message not sent"])];
  });

  for (const e of mw.errors) notes.push(`mobile flow: ${e}`);
  await mctx.close();

  // ───────────── G. SEO ─────────────
  const seoCtx = await newContext(browser, 1440);
  const s = await seoCtx.newPage();
  const g: Record<string, string[]> = { G1: [], G2: [], G3: [], G4: [], G5: [] };
  for (const p of PAGES.filter((p) => !p.status && !p.path.startsWith("/admin"))) {
    await s.goto(`${BASE}${p.path}`);
    await scrollThrough(s);
    const data = await s.evaluate(() => {
      const meta = (n: string) =>
        document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.getAttribute("content") ?? null;
      const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
      return {
        title: document.title,
        desc: meta("description"),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
        h1: document.querySelectorAll("h1").length,
        headings,
        noAlt: [...document.images].filter((i) => !i.hasAttribute("alt")).map((i) => i.src),
        og: meta("og:image"),
        jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((sc) => sc.textContent ?? ""),
        lang: document.documentElement.lang,
      };
    });
    const label = p.name;
    if (data.h1 !== 1) g.G1.push(`${label}: ${data.h1} h1`);
    if (data.title.length > 70 || data.title.length < 15) g.G1.push(`${label}: title ${data.title.length} chars`);
    if (!data.desc || data.desc.length < 50 || data.desc.length > 170)
      g.G1.push(`${label}: description ${data.desc?.length ?? 0} chars`);
    if (!data.canonical?.startsWith("http")) g.G1.push(`${label}: canonical ${data.canonical}`);
    if (data.lang !== "en-IN") g.G1.push(`${label}: lang ${data.lang}`);
    for (let i = 1; i < data.headings.length; i++) {
      if (data.headings[i] - data.headings[i - 1] > 1) {
        g.G2.push(`${label}: h${data.headings[i - 1]} → h${data.headings[i]}`);
        break;
      }
    }
    for (const src of data.noAlt) g.G3.push(`${label}: ${src}`);
    if (!data.og) g.G4.push(`${label}: no og:image`);
    else {
      const r = await s.request.get(data.og.replace(/^https?:\/\/[^/]+/, BASE));
      if (r.status() !== 200) g.G4.push(`${label}: og:image ${r.status()}`);
    }
    for (const j of data.jsonld) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(j);
      } catch {
        g.G5.push(`${label}: invalid JSON-LD`);
        continue;
      }
      // Every image/logo URL Google is pointed at must load.
      const urls: string[] = [];
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          for (const [k, val] of Object.entries(v)) {
            if ((k === "image" || k === "logo") && (typeof val === "string" || Array.isArray(val))) {
              urls.push(...[val].flat().filter((u): u is string => typeof u === "string"));
            } else walk(val);
          }
        }
      };
      walk(parsed);
      for (const u of urls) {
        const r = await s.request.get(u.replace(/^https?:\/\/[^/]+/, BASE));
        if (r.status() !== 200)
          g.G5.push(`${label}: structured-data image ${u.replace(/^https?:\/\/[^/]+/, "")} → ${r.status()}`);
      }
    }
  }
  record("G1", "One H1, title, description, canonical, lang on every page", g.G1);
  record("G2", "Headings don't skip levels", g.G2);
  record("G3", "Every image has alt text", g.G3);
  record("G4", "Open Graph image set and loads", g.G4);
  record("G5", "JSON-LD is valid", g.G5);

  await check("G6", "Sitemap URLs all 200; robots blocks private areas", async () => {
    const xml = await (await s.request.get(`${BASE}/sitemap.xml`)).text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1]);
    const problems: string[] = [];
    for (const u of urls) {
      const r = await s.request.get(u.replace(/^https?:\/\/[^/]+/, BASE));
      if (r.status() !== 200) problems.push(`${u} → ${r.status()}`);
    }
    const robots = await (await s.request.get(`${BASE}/robots.txt`)).text();
    for (const d of ["/admin", "/checkout", "/order/"])
      if (!robots.includes(`Disallow: ${d}`)) problems.push(`robots doesn't disallow ${d}`);
    return { problems, info: [`${urls.length} sitemap URLs`] };
  });

  await check("G7", "Manifest, icons and llms.txt load", async () => {
    const problems: string[] = [];
    for (const path of ["/manifest.webmanifest", "/icon.png", "/apple-icon.png", "/llms.txt", "/opengraph-image"]) {
      const r = await s.request.get(`${BASE}${path}`);
      if (r.status() !== 200) problems.push(`${path} → ${r.status()}`);
    }
    return problems;
  });

  // ───────────── H. Accessibility (axe) ─────────────
  const axeIssues: string[] = [];
  const axeInfo: string[] = [];
  for (const width of [390, 1440]) {
    const actx = await newContext(browser, width);
    const a = await actx.newPage();
    for (const p of PAGES) {
      await a.goto(`${BASE}${p.path}`);
      await a.waitForTimeout(300);
      await a.addScriptTag({ path: AXE });
      const violations = await a.evaluate(async () => {
        // @ts-expect-error axe is injected above
        const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
        return res.violations.map((v: { id: string; impact: string; nodes: { target: string[] }[] }) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
        }));
      });
      for (const v of violations) {
        const line = `${p.name}@${width}: ${v.id} (${v.impact}) → ${v.targets.join(" | ")}`;
        if (v.impact === "critical" || v.impact === "serious") axeIssues.push(line);
        else axeInfo.push(line);
      }
    }
    await actx.close();
  }
  record("H1", "axe-core: no critical/serious accessibility violations", axeIssues, axeInfo);

  // ───────────── I. Security ─────────────
  await check("I1", "Security headers present", async () => {
    const problems: string[] = [];
    for (const path of ["/", "/products/magic-eraser-sponge", "/admin/login"]) {
      const h = (await s.request.get(`${BASE}${path}`)).headers();
      if (!h["content-security-policy"]?.includes("frame-ancestors 'none'")) problems.push(`${path}: CSP`);
      if (!h["strict-transport-security"]) problems.push(`${path}: HSTS`);
      if (h["x-frame-options"] !== "DENY") problems.push(`${path}: X-Frame-Options`);
      if (h["x-content-type-options"] !== "nosniff") problems.push(`${path}: nosniff`);
      if (!h["referrer-policy"]) problems.push(`${path}: Referrer-Policy`);
      if (h["x-powered-by"]) problems.push(`${path}: X-Powered-By leaks`);
    }
    return problems;
  });

  await check("I2", "Admin requires login; export refused without a session", async () => {
    const problems: string[] = [];
    for (const path of [
      "/admin",
      "/admin/orders",
      "/admin/products",
      "/admin/customers",
      "/admin/discounts",
      "/admin/analytics",
      "/admin/settings",
      "/admin/print/orders",
      "/admin/messages",
      "/admin/account",
    ]) {
      const r = await s.request.get(`${BASE}${path}`, { maxRedirects: 0 });
      if (![307, 308, 302].includes(r.status()) || !r.headers().location?.includes("/admin/login"))
        problems.push(`${path} → ${r.status()}`);
    }
    for (const path of ["/admin/export", "/admin/export/customers"]) {
      const exp = await s.request.get(`${BASE}${path}`, { maxRedirects: 0 });
      if (exp.status() === 200) problems.push(`${path} returned data without a session`);
    }
    return problems;
  });

  await check("I3", "Wrong password refused; 6th failure blocked", async () => {
    const lctx = await newContext(browser, 1440);
    const l = await lctx.newPage();
    await l.goto(`${BASE}/admin/login`);
    const msgs: string[] = [];
    for (let i = 0; i < 6; i++) {
      // A throwaway address: locking out the real owner would break the admin checks below.
      await l.fill('input[name="email"]', "lockout-test@example.com");
      await l.fill('input[name="password"]', `wrong-password-${i}`);
      await l.getByRole("button", { name: "Sign in" }).click();
      await l.locator('form [role="alert"]').waitFor();
      await l.waitForTimeout(200);
      msgs.push((await l.locator('form [role="alert"]').textContent()) ?? "");
    }
    await lctx.close();
    const problems: string[] = [];
    if (!msgs[0].includes("Incorrect")) problems.push(`1st: ${msgs[0]}`);
    if (!msgs[5].includes("Too many")) problems.push(`6th: ${msgs[5]}`);
    return problems;
  });

  // ───────────── J. Admin (Shopify-style panel) + I4/I5 ─────────────
  if (ADMIN.email && ADMIN.password) {
    const actx = await newContext(browser, 1440, "198.51.100.10");
    const a = await actx.newPage();
    a.on("dialog", (d) => void d.accept());
    const aw = watch(a);
    await login(a, ADMIN.email, ADMIN.password);
    const until = (l: Locator, timeout = 10_000) =>
      l.waitFor({ timeout }).then(
        () => true,
        () => false,
      );
    const rows = () => a.locator('input[aria-label^="Select order"]').count();
    const mainText = async (p: Page) => (await p.locator("main").textContent()) ?? "";
    /** A fresh shopper with their own IP (checkout and coupon limits are per IP). */
    let shopperN = 20;
    const shopper = async (width = 1440) => {
      const ctx = await newContext(browser, width, `198.51.100.${shopperN++}`);
      return { ctx, page: await ctx.newPage() };
    };
    const fillCheckout = async (p: Page, phone: string, name = "QA Shopper") => {
      await p.waitForSelector('input[name="name"]');
      await p.fill('input[name="name"]', name);
      await p.fill('input[name="phone"]', phone);
      await p.fill('input[name="pincode"]', "411001");
      await p.fill('input[name="city"]', "Pune");
      await p.selectOption('select[name="state"]', "Maharashtra");
      await p.fill('input[name="address1"]', "Flat 12, Shanti Apartments, MG Road");
    };
    const checkoutTotal = async (p: Page) => (await p.locator("aside dd.text-2xl").textContent())?.trim() ?? "";
    const savePack = async () => {
      await a.getByRole("button", { name: "Save pack" }).click();
      return until(a.getByText("The store shows the change right away"));
    };
    const openOrder = async (number: string) => {
      await go(a, `${BASE}/admin/orders?q=${encodeURIComponent(number)}`);
      await a.getByRole("link", { name: number }).click();
      await a.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
      return a.url().split("?")[0];
    };
    let orderUrl = "";
    let discountUrl = "";
    let customerUrl = "";
    let manualOrderUrl = "";
    let cancelledOrderUrl = "";

    await check("J1", "Home: to-do queue, sales, setup guide and recent orders", async () => {
      await go(a, `${BASE}/admin`);
      await a.getByText("Recent orders").waitFor();
      const text = await mainText(a);
      await shot(a, "admin-home-1440", true);
      return [
        ...(text.includes(orderNumber) ? [] : ["new order not in recent orders"]),
        ...(text.includes("COD orders to verify") ? [] : ["COD verification missing from to-do"]),
        ...(text.includes("Sales today") ? [] : ["owner can't see sales"]),
        ...(text.includes("Setup guide") ? [] : ["setup guide missing"]),
      ];
    });

    await check("J2", "Orders: search, work-queue tabs and filters; double click made one order", async () => {
      await go(a, `${BASE}/admin/orders?q=${encodeURIComponent(orderNumber)}`);
      const byNumber = await rows();
      await go(a, `${BASE}/admin/orders?q=9811100000`);
      const dbl = await rows();
      await go(a, `${BASE}/admin/orders?q=9811100001`);
      const bot = await rows();
      await go(a, `${BASE}/admin/orders?status=to_verify`);
      const queue = await mainText(a);
      await shot(a, "admin-orders-1440", true);
      await go(a, `${BASE}/admin/orders?status=delivered`);
      const delivered = await rows();
      await go(a, `${BASE}/admin/orders?payment=prepaid`);
      const prepaid = await rows();
      return [
        ...(byNumber === 1 ? [] : [`search by order number found ${byNumber} rows`]),
        ...(dbl === 1 ? [] : [`double-click created ${dbl} orders`]),
        ...(bot === 0 ? [] : ["honeypot order exists"]),
        ...(queue.includes(orderNumber) ? [] : ["order missing from 'COD to verify'"]),
        ...(delivered === 0 && prepaid === 0 ? [] : [`filters leak: delivered ${delivered}, prepaid ${prepaid}`]),
      ];
    });

    await check("J3", "Order: verify COD, comment, tags, pack, ship with tracking, notes", async () => {
      orderUrl = await openOrder(orderNumber);
      const problems: string[] = [];
      await a.fill('input[name="note"]', "Confirmed on call");
      await a.getByRole("button", { name: "Verified", exact: true }).click();
      if (!(await until(a.getByText("COD confirmed with the customer"))))
        problems.push("COD verification not recorded");
      await a.fill("#comment", "Customer wants evening delivery");
      await a.getByRole("button", { name: "Post" }).click();
      if (!(await until(a.getByText("Customer wants evening delivery")))) problems.push("comment not shown");
      await a.fill('input[name="tags"]', "VIP, test-order");
      await a.locator('form:has(input[name="tags"])').getByRole("button", { name: "Save" }).click();
      if (!(await until(a.getByText("Tags: vip, test-order")))) problems.push("tags not saved");
      await a.getByRole("button", { name: "Mark as Packed" }).click();
      if (!(await until(a.getByText("Confirmed → Packed")))) problems.push("status change not in timeline");
      const shipping = a.locator('form:has(input[name="trackingUrl"])');
      await a.fill('input[name="trackingUrl"]', "http://insecure.example.com");
      await shipping.getByRole("button", { name: "Save", exact: true }).click();
      if (!(await until(a.getByText("must start with https://")))) problems.push("http tracking link accepted");
      await a.fill('input[name="courierName"]', "Delhivery");
      await a.fill('input[name="awbCode"]', "1234567890");
      await a.fill('input[name="trackingUrl"]', "https://www.delhivery.com/track/package/1234567890");
      await shipping.getByRole("button", { name: "Save & mark as shipped" }).click();
      if (!(await until(a.getByText("Saved and marked as shipped.")))) problems.push("ship + tracking not saved");
      if (!(await until(a.getByText("Packed → Shipped")))) problems.push("shipped not in timeline");
      await a.fill('textarea[name="notes"]', "Called customer, confirmed address.");
      await a.getByRole("button", { name: "Save notes" }).click();
      if (!(await until(a.getByText("Notes saved.")))) problems.push("notes not saved");
      await shot(a, "admin-order-1440", true);
      return problems;
    });

    await check("J4", "CSV export (filtered) contains the order, courier and tags", async () => {
      const r = await a.request.get(`${BASE}/admin/export?q=${encodeURIComponent(orderNumber)}`);
      const text = await r.text();
      const lines = text.trim().split("\r\n").length;
      return r.status() === 200 &&
        text.includes(orderNumber) &&
        text.includes("Delhivery") &&
        text.includes("vip") &&
        text.includes('"0.50"')
        ? lines === 2
          ? []
          : [`filtered export has ${lines - 1} rows`]
        : [`export ${r.status()}`];
    });

    await check("I4", "Contact-form HTML is shown as text in admin (no XSS)", async () => {
      await go(a, `${BASE}/admin/messages`);
      await a.getByText("Xss Tester").first().waitFor();
      await a.waitForTimeout(500);
      const executed = await a.evaluate(() => (window as unknown as { __xss?: number }).__xss === 1);
      const shownAsText = await a.getByText("<script>window.__xss=1</script>", { exact: false }).count();
      return [...(executed ? ["script executed!"] : []), ...(shownAsText ? [] : ["message text not shown literally"])];
    });

    await check("J5", "Messages: mark handled and back", async () => {
      await go(a, `${BASE}/admin/messages`);
      const card = a.locator("li", { hasText: "Xss Tester" }).first();
      await card.getByRole("button", { name: "Mark handled" }).click();
      await a.waitForTimeout(800);
      const goneFromNew = (await a.locator("li", { hasText: "Xss Tester" }).count()) === 0;
      await go(a, `${BASE}/admin/messages?show=handled`);
      const inHandled = (await a.locator("li", { hasText: "Xss Tester" }).count()) > 0;
      return [...(goneFromNew ? [] : ["still under New"]), ...(inHandled ? [] : ["not under Handled"])];
    });

    await check("J6", "A price edit reaches the store immediately (product, checkout, llms.txt)", async () => {
      await go(a, `${BASE}/admin/products/pack-25`);
      await a.fill('input[name="price"]', "599");
      const saved = await savePack();
      const { ctx, page } = await shopper();
      await page.goto(`${BASE}/products/magic-eraser-sponge?pack=pack-25`);
      const price = (await page.locator("#buy .text-4xl").first().textContent())?.trim();
      const llms = await (await page.request.get(`${BASE}/llms.txt`)).text();
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await page.waitForSelector('input[name="name"]');
      const total = await checkoutTotal(page);
      await ctx.close();
      return [
        ...(saved ? [] : ["save message missing"]),
        ...(price === "₹599" ? [] : [`product page shows ${price}`]),
        ...(llms.includes("25 sponges for ₹599") ? [] : ["llms.txt not updated"]),
        ...(total === "₹648" ? [] : [`checkout total ${total}, expected ₹648`]),
      ];
    });

    await check("J7", "A price change during checkout is caught: no order at a stale price", async () => {
      const { ctx, page } = await shopper();
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await fillCheckout(page, "9844400000", "Stale Price");
      const before = await checkoutTotal(page);
      await go(a, `${BASE}/admin/products/pack-25`);
      await a.fill('input[name="price"]', "549");
      await savePack();
      await page.getByRole("button", { name: /Place order/ }).click();
      const warned = await until(page.locator('aside [role="alert"]', { hasText: "Prices were just updated" }));
      const refreshed = await until(page.locator("aside dd.text-2xl", { hasText: "₹598" }));
      const stayed = !page.url().includes("/order/");
      await page.getByRole("button", { name: /Place order/ }).click();
      await page.waitForURL(/\/order\//, { timeout: 30_000 });
      const confirmed = (await mainText(page)).includes("₹598");
      await ctx.close();
      return [
        ...(before === "₹648" ? [] : [`checkout started at ${before}`]),
        ...(warned && stayed ? [] : ["order went through at the old price"]),
        ...(refreshed ? [] : ["total didn't refresh to ₹598"]),
        ...(confirmed ? [] : ["second attempt not confirmed at ₹598"]),
      ];
    });

    await check("J8", "Stock: a sell-out shows on the store; cancelling restocks it", async () => {
      const problems: string[] = [];
      await go(a, `${BASE}/admin/products/pack-10`);
      await a.check('input[name="trackInventory"]');
      await a.fill('input[name="stock"]', "1");
      if (!(await savePack())) problems.push("tracking not saved");
      const { ctx, page } = await shopper(390);
      const o = await placeCodOrder(page, { pack: "pack-10", phone: "9833300000", name: "Stock Tester" });
      await page.goto(`${BASE}/products/magic-eraser-sponge`);
      const starter = page.locator("label", { hasText: "Starter Pack" }).first();
      if (!((await starter.textContent()) ?? "").includes("Out of stock")) problems.push("store didn't show sold out");
      await go(a, `${BASE}/admin`);
      if (!(await a.getByText("Sold out").count())) problems.push("no stock alert on home");
      cancelledOrderUrl = await openOrder(o.orderNumber);
      await a.locator("summary", { hasText: "Cancel order" }).click();
      await a.selectOption('select[name="reason"]', "Out of stock");
      await a.locator('form:has(select[name="reason"])').getByRole("button", { name: "Cancel order" }).click();
      if (!(await until(a.getByText("→ Cancelled (Out of stock)")))) problems.push("cancel not recorded");
      await page.goto(`${BASE}/products/magic-eraser-sponge`);
      if (((await starter.textContent()) ?? "").includes("Out of stock"))
        problems.push("restock didn't reach the store");
      await go(a, `${BASE}/admin/products/pack-10`);
      const history = await mainText(a);
      if (!history.includes("Order cancelled") || !history.includes(o.orderNumber))
        problems.push("stock history incomplete");
      await shot(a, "admin-pack-1440", true);
      await a.uncheck('input[name="trackInventory"]');
      await savePack();
      await ctx.close();
      return problems;
    });

    await check("J9", "Discount codes: create, apply at checkout, count the use, disable", async () => {
      const problems: string[] = [];
      await go(a, `${BASE}/admin/discounts/new`);
      await a.fill('input[name="code"]', "qa10");
      await a.fill('input[name="description"]', "QA test: 10% off");
      await a.fill('input[name="percent"]', "10");
      await a.fill('input[name="maxDiscount"]', "100");
      await a.getByRole("button", { name: "Create code" }).click();
      await a.waitForURL(/\/admin\/discounts\/[0-9a-f-]{36}/);
      discountUrl = a.url().split("?")[0];
      const { ctx, page } = await shopper();
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await fillCheckout(page, "9855500000", "Coupon User");
      await page.fill('input[aria-label="Coupon code"]', "qa10");
      await page.getByRole("button", { name: "Apply" }).click();
      if (!(await until(page.getByText("QA10 applied")))) problems.push("code not applied");
      const total = await checkoutTotal(page);
      if (total !== "₹543.10") problems.push(`total ${total}, expected ₹543.10 (₹549 − 10% + ₹49)`);
      await page.getByRole("button", { name: /Place order/ }).click();
      await page.waitForURL(/\/order\//, { timeout: 30_000 });
      await go(a, discountUrl);
      const detail = await mainText(a);
      if (!detail.includes("Coupon User")) problems.push("order not listed on the discount");
      await shot(a, "admin-discount-1440", true);
      await a.getByRole("button", { name: "Disable" }).click();
      if (!(await until(a.getByText("Disabled", { exact: true }).first()))) problems.push("disable failed");
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await page.waitForSelector('input[aria-label="Coupon code"]');
      await page.fill('input[aria-label="Coupon code"]', "qa10");
      await page.getByRole("button", { name: "Apply" }).click();
      if (!(await until(page.getByText("This coupon code is not valid.")))) problems.push("disabled code still works");
      await ctx.close();
      return problems;
    });

    await check("J10", "COD charge setting updates product, checkout, FAQ and policies", async () => {
      const problems: string[] = [];
      const setFee = async (fee: string) => {
        await go(a, `${BASE}/admin/settings`);
        await a.fill('input[name="codFee"]', fee);
        await a.locator('form:has(input[name="codFee"])').getByRole("button", { name: "Save" }).click();
        return until(a.getByText("now use the new values"));
      };
      if (!(await setFee("29"))) problems.push("settings not saved");
      const { ctx, page } = await shopper();
      await page.goto(`${BASE}/products/magic-eraser-sponge`);
      if (!(await mainText(page)).includes("+₹29 COD charge")) problems.push("product page still shows old fee");
      await page.goto(`${BASE}/policies/shipping`);
      if (!(await mainText(page)).includes("₹29")) problems.push("shipping policy not updated");
      await page.goto(`${BASE}/faq`);
      if (!(await mainText(page)).includes("₹29 COD charge")) problems.push("FAQ not updated");
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await page.waitForSelector('input[name="name"]');
      const total = await checkoutTotal(page);
      if (total !== "₹578") problems.push(`checkout total ${total}, expected ₹578`);
      if (!(await setFee("49"))) problems.push("couldn't restore ₹49");
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await page.waitForSelector('input[name="name"]');
      if ((await checkoutTotal(page)) !== "₹598") problems.push("checkout didn't return to ₹598");
      await ctx.close();
      return problems;
    });

    await check("J11", "Create order (phone/WhatsApp): bulk qty, paid by UPI, stock taken", async () => {
      await go(a, `${BASE}/admin/orders/new`);
      await a.locator("section", { hasText: "Items" }).locator("select").first().selectOption("pack-50");
      await a.locator('section:has-text("Items") input[type="number"]').first().fill("6");
      await a.fill('input[name="customerName"]', "Phone Order");
      await a.fill('input[name="phone"]', "9822200000");
      await a.fill('input[name="pincode"]', "560038");
      await a.waitForTimeout(1500);
      await a.fill('input[name="city"]', "Bengaluru");
      await a.selectOption('select[name="state"]', "Karnataka");
      await a.fill('input[name="address1"]', "12 Lake View Road, Indiranagar");
      await a.check('input[name="payment"][value="paid"]');
      await a.fill('input[name="paymentReference"]', "UPI-QA-1");
      await shot(a, "admin-create-order-1440", true);
      await a.getByRole("button", { name: /^Create order/ }).click();
      await a.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}\?created=1/, { timeout: 20_000 });
      manualOrderUrl = a.url().split("?")[0];
      const text = await mainText(a);
      return [
        ...(text.includes("Order created") ? [] : ["no confirmation notice"]),
        ...(text.includes("Created by staff") ? [] : ["source not shown"]),
        ...(text.includes("Prepaid · paid") ? [] : ["not marked paid"]),
        ...(text.includes("₹5,394") ? [] : ["total ₹5,394 (6 × ₹899) not shown"]),
        ...(text.includes("UPI-QA-1") ? [] : ["payment reference missing"]),
      ];
    });

    await check("J12", "Refunds (owner): partial refund recorded against a paid order", async () => {
      await go(a, manualOrderUrl);
      await a.fill('input[name="amount"]', "100");
      await a.fill('input[name="reason"]', "QA partial refund");
      await a.getByRole("button", { name: "Record refund" }).click();
      const ok = await until(a.getByText("Refund recorded."));
      const badge = await until(a.getByText("Partly refunded").first());
      return [...(ok ? [] : ["refund not recorded"]), ...(badge ? [] : ["badge not updated"])];
    });

    await check("J13", "Customers: lifetime view; a COD block is enforced at checkout", async () => {
      const problems: string[] = [];
      await go(a, `${BASE}/admin/customers?q=9876543210`);
      await a.locator('main a[href^="/admin/customers/"]').first().click();
      await a.waitForURL(/\/admin\/customers\/[0-9a-f-]{36}/);
      customerUrl = a.url();
      if (!(await mainText(a)).includes(orderNumber)) problems.push("order missing from customer profile");
      await shot(a, "admin-customer-1440", true);
      const form = a.locator('form:has(input[name="codBlocked"])');
      await a.check('input[name="codBlocked"]');
      await form.getByRole("button", { name: "Save" }).click();
      if (!(await until(form.getByText("Saved.")))) problems.push("block not saved");
      const { ctx, page } = await shopper();
      await page.goto(`${BASE}/checkout?pack=pack-25&qty=1`);
      await fillCheckout(page, "9876543210");
      await page.getByRole("button", { name: /Place order/ }).click();
      if (!(await until(page.getByText("isn't available for this mobile number"))))
        problems.push("blocked number could order COD");
      await ctx.close();
      await go(a, customerUrl);
      await a.uncheck('input[name="codBlocked"]');
      await a.locator('form:has(input[name="codBlocked"])').getByRole("button", { name: "Save" }).click();
      await until(a.locator('form:has(input[name="codBlocked"])').getByText("Saved."));
      return problems;
    });

    await check("J14", "Bulk action: mark several orders packed at once", async () => {
      await go(a, `${BASE}/admin/orders?status=confirmed`);
      const boxes = a.locator('input[aria-label^="Select order"]');
      const n = Math.min(await boxes.count(), 2);
      if (n < 2) return [`only ${n} confirmed orders to test with`];
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      await a.selectOption('select[aria-label="Bulk action"]', "mark_packed");
      await a.getByRole("button", { name: "Apply" }).click();
      return (await until(a.getByText("Mark as packed: 2 updated."))) ? [] : ["bulk update not confirmed"];
    });

    await check("J15", "Abandoned checkouts and analytics load with real numbers", async () => {
      const problems: string[] = [];
      await go(a, `${BASE}/admin/checkouts`);
      if ((await a.locator("h1").textContent()) !== "Abandoned checkouts") problems.push("checkouts page");
      await go(a, `${BASE}/admin/analytics`);
      await a.getByRole("link", { name: "7 days" }).click();
      await a.waitForURL(/from=\d{4}-\d{2}-\d{2}/);
      const text = await mainText(a);
      if (!(await a.locator("table", { hasText: "Units" }).count())) problems.push("no packs-sold table");
      if (!text.includes("RTO rate")) problems.push("COD vs prepaid missing");
      if (text.includes("No sales in this period yet")) problems.push("sales chart empty despite orders");
      await shot(a, "admin-analytics-1440", true);
      return problems;
    });

    await check("J16", "Search finds orders, customers, packs and codes", async () => {
      await go(a, `${BASE}/admin/search?q=${encodeURIComponent(orderNumber)}`);
      const byOrder = await a.getByRole("link", { name: new RegExp(orderNumber) }).count();
      await go(a, `${BASE}/admin/search?q=98333`);
      const byPhone = await a.getByText("Stock Tester").count();
      await go(a, `${BASE}/admin/search?q=QA10`);
      const byCode = await a.getByText("QA10").count();
      return [
        ...(byOrder ? [] : ["order not found"]),
        ...(byPhone ? [] : ["customer not found by phone"]),
        ...(byCode ? [] : ["discount not found"]),
      ];
    });

    await check("J17", "Packing slip and receipt print pages", async () => {
      const id = orderUrl.split("/").pop();
      await go(a, `${BASE}/admin/print/orders?ids=${id}&type=slip`);
      const slip = await a.locator("article").first().textContent();
      await shot(a, "admin-print-slip-1440", true);
      await go(a, `${BASE}/admin/print/orders?ids=${id}&type=receipt`);
      const receipt = await a.locator("article").first().textContent();
      await go(a, `${BASE}/admin/print/orders?ids=${cancelledOrderUrl.split("/").pop()}&type=slip`);
      const cancelledSlip = await a.locator("article").first().textContent();
      return [
        ...(cancelledSlip?.includes("CANCELLED · do not ship")
          ? []
          : ["cancelled order's slip doesn't say do not ship"]),
        ...(slip?.includes(orderNumber) && slip.includes("Packing slip") && slip.includes("COD: collect ₹598")
          ? []
          : ["slip content"]),
        ...(slip?.includes("₹549") ? ["slip shows prices"] : []),
        ...(receipt?.includes("Order receipt") && receipt.includes("not a tax invoice") ? [] : ["receipt content"]),
      ];
    });

    await check("J18", "Staff: invite, forced password change, limited access, deactivate", async () => {
      const problems: string[] = [];
      await go(a, `${BASE}/admin/settings/staff`);
      await a.fill('input[name="name"]', "QA Packer");
      await a.fill('input[name="email"]', "packer@example.com");
      await a.getByRole("button", { name: /one-time password/ }).click();
      await until(a.locator("form code"));
      const temp = ((await a.locator("form code").first().textContent()) ?? "").trim();
      if (!/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/.test(temp)) return [`no one-time password shown (${temp})`];

      const sctx = await newContext(browser, 1440, "198.51.100.60");
      const sp = await sctx.newPage();
      await sp.goto(`${BASE}/admin/login`);
      await sp.fill('input[name="email"]', "packer@example.com");
      await sp.fill('input[name="password"]', temp);
      await sp.getByRole("button", { name: "Sign in" }).click();
      await sp.waitForURL(/\/admin\/account\?setup=1/, { timeout: 15_000 });
      if (await sp.locator('nav[aria-label="Admin"] a', { hasText: "Orders" }).count())
        problems.push("full menu before password change");
      await sp.goto(`${BASE}/admin/orders`);
      if (!(await redirected(sp, /\/admin\/account\?setup=1/)))
        problems.push("could open orders on a one-time password");
      if ((await (await sp.request.get(`${BASE}/admin/orders`)).text()).includes(orderNumber)) {
        problems.push("orders sent to a one-time-password session");
      }
      await sp.fill('input[name="current"]', temp);
      await sp.fill('input[name="password"]', "packer-new-password-1");
      await sp.fill('input[name="confirm"]', "packer-new-password-1");
      await sp.getByRole("button", { name: "Save and continue" }).click();
      await sp.waitForURL((u) => u.pathname === "/admin", { timeout: 15_000 });
      const nav = sp.locator('nav[aria-label="Admin"]');
      for (const hidden of ["Analytics", "Discounts", "Settings"]) {
        if (await nav.getByRole("link", { name: hidden }).count()) problems.push(`staff sees ${hidden}`);
      }
      if (!(await nav.getByRole("link", { name: /^Orders/ }).count())) problems.push("staff can't see Orders");
      if ((await mainText(sp)).includes("Sales today")) problems.push("staff sees sales figures");
      await sp.goto(`${BASE}/admin/analytics`);
      if (!(await redirected(sp, /denied=1/))) problems.push("staff opened analytics");
      if ((await (await sp.request.get(`${BASE}/admin/analytics`)).text()).includes("RTO rate")) {
        problems.push("analytics HTML sent to staff");
      }
      if ((await sp.request.get(`${BASE}/admin/export`)).status() !== 403) problems.push("staff could export");
      await go(sp, orderUrl);
      if (await sp.getByRole("button", { name: "Record refund" }).count()) problems.push("staff can refund");
      await go(sp, `${BASE}/admin/products/pack-25`);
      if (await sp.getByRole("button", { name: "Save pack" }).count()) problems.push("staff can edit prices");
      if (!(await sp.getByRole("button", { name: "Adjust stock" }).count())) problems.push("staff can't adjust stock");
      await go(sp, `${BASE}/admin/orders/new`);
      if (await sp.locator('input[name="manualDiscount"]').count())
        problems.push("staff can give discounts on manual orders");
      await shot(sp, "admin-staff-home-1440");

      await go(a, `${BASE}/admin/settings/staff`);
      await a.getByRole("link", { name: /QA Packer/ }).click();
      await a.waitForURL(/\/admin\/settings\/staff\/[0-9a-f-]{36}/);
      await a.uncheck('input[name="active"]');
      await a.getByRole("button", { name: "Save", exact: true }).click();
      if (!(await until(a.getByText("Saved.")))) problems.push("deactivation not saved");
      await sp.goto(`${BASE}/admin`);
      if (!(await redirected(sp, /\/admin\/login/))) problems.push("deactivated staff still signed in");
      await sctx.close();
      return problems;
    });

    await check("J19", "Activity log records catalogue, discount, settings, staff and sign-ins", async () => {
      await go(a, `${BASE}/admin/settings/activity`);
      const text = await mainText(a);
      const want = ["price ₹549 → ₹599", "Created QA10", "COD charge ₹49 → ₹29", "Added QA Packer", "Signed in"];
      return want.filter((w) => !text.includes(w)).map((w) => `missing "${w}"`);
    });

    for (const e of aw.errors) notes.push(`admin flow: ${e}`);

    // Every admin page at phone and desktop width: layout, console, overlap, accessibility.
    const orderId = orderUrl.split("/").pop();
    const adminPages = [
      "/admin",
      "/admin/orders",
      orderUrl.replace(BASE, ""),
      manualOrderUrl.replace(BASE, ""),
      "/admin/orders/new",
      "/admin/checkouts",
      "/admin/products",
      "/admin/products/pack-25",
      "/admin/products/new",
      "/admin/customers",
      customerUrl.replace(BASE, ""),
      "/admin/discounts",
      discountUrl.replace(BASE, ""),
      "/admin/discounts/new",
      "/admin/analytics",
      "/admin/messages",
      "/admin/settings",
      "/admin/settings/staff",
      "/admin/settings/activity",
      "/admin/account",
      `/admin/search?q=${orderNumber}`,
      `/admin/print/orders?ids=${orderId}`,
    ].filter((p) => p.startsWith("/admin"));
    const layout: string[] = [];
    const axeIssues: string[] = [];
    const axeInfo: string[] = [];
    let drawer: string[] = ["not run"];
    for (const width of [390, 1440]) {
      const ctx = await newContext(browser, width, `198.51.100.${70 + width / 10}`);
      const p = await ctx.newPage();
      await login(p, ADMIN.email, ADMIN.password);
      for (const path of adminPages) {
        const w = watch(p);
        const res = await p.goto(`${BASE}${path}`, { waitUntil: "load" });
        const label = `${path}@${width}`;
        if (res?.status() !== 200) layout.push(`${label}: status ${res?.status()}`);
        await p
          .locator("h1")
          .first()
          .waitFor({ timeout: 15_000 })
          .catch(() => undefined);
        await p.waitForTimeout(150);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 1) layout.push(`${label}: ${overflow}px wider than the screen`);
        if ((await p.locator("h1").count()) !== 1) layout.push(`${label}: ${await p.locator("h1").count()} h1`);
        for (const covered of await coveredElements(p)) layout.push(`${label}: ${covered}`);
        for (const e of w.errors) layout.push(`${label}: ${e}`);
        p.removeAllListeners("console");
        p.removeAllListeners("pageerror");
        p.removeAllListeners("response");
        await p.addScriptTag({ path: AXE });
        const violations = await p.evaluate(async () => {
          // @ts-expect-error axe is injected above
          const res = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] });
          return res.violations.map((v: { id: string; impact: string; nodes: { target: string[] }[] }) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
          }));
        });
        for (const v of violations) {
          const line = `${label}: ${v.id} (${v.impact}) → ${v.targets.join(" | ")}`;
          if (v.impact === "critical" || v.impact === "serious") axeIssues.push(line);
          else axeInfo.push(line);
        }
        await shot(
          p,
          `admin${path
            .split("?")[0]
            .replace(/\//g, "-")
            .replace(/-[0-9a-f-]{36}/, "-detail")}-${width}`,
          true,
        );
      }
      if (width === 390) {
        drawer = [];
        await go(p, `${BASE}/admin`);
        await p.getByRole("button", { name: "Open menu" }).click();
        const dialog = p.getByRole("dialog", { name: "Menu" });
        if (!(await until(dialog))) drawer.push("menu didn't open");
        await shot(p, "admin-menu-390");
        await dialog.getByRole("link", { name: /^Customers/ }).click();
        await p.waitForURL(/\/admin\/customers/);
        if (await dialog.count()) drawer.push("menu stayed open after navigating");
        await p.getByRole("button", { name: "Open menu" }).click();
        await p.keyboard.press("Escape");
        if (await dialog.count()) drawer.push("Escape didn't close the menu");
      }
      await ctx.close();
    }
    record("J20", "Every admin page at 390 and 1440 px: loads, fits, one h1, nothing covered, no errors", layout);
    record("J21", "Phone menu opens, navigates, closes on navigation and Escape", drawer);
    record("H3", "axe-core on every admin page: no critical/serious violations", axeIssues, axeInfo);
    await actx.close();
  } else {
    notes.push("Admin checks skipped: set ADMIN_EMAIL / ADMIN_PASSWORD");
  }

  if (STAFF.email && STAFF.password) {
    await check("I5", "Staff can't export, refund, or open owner pages", async () => {
      const sctx = await newContext(browser, 1440, "198.51.100.90");
      const st = await sctx.newPage();
      await login(st, STAFF.email, STAFF.password);
      await go(st, `${BASE}/admin/orders`);
      const problems: string[] = [];
      if (await st.getByRole("link", { name: "Export CSV" }).count()) problems.push("Export button visible to staff");
      for (const path of ["/admin/export", "/admin/export/customers"]) {
        const r = await st.request.get(`${BASE}${path}`);
        if (r.status() !== 403) problems.push(`${path} returned ${r.status()} for staff`);
      }
      // The owner-only pages redirect, and their HTML carries none of the owner's data.
      const leaks: Record<string, string> = {
        "/admin/discounts": "QA10",
        "/admin/settings": "COD available up to",
        "/admin/settings/staff": "owner@example.com",
        "/admin/settings/activity": "Signed in",
        "/admin/products/new": "Opening stock",
        "/admin/analytics": "RTO rate",
      };
      for (const [path, secret] of Object.entries(leaks)) {
        await st.goto(`${BASE}${path}`);
        if (!(await redirected(st, /denied=1/))) problems.push(`staff opened ${path}`);
        if ((await (await st.request.get(`${BASE}${path}`)).text()).includes(secret)) {
          problems.push(`${path} HTML contains owner data`);
        }
      }
      await sctx.close();
      return problems;
    });
  }

  await seoCtx.close();
  await browser.close();

  // ───────────── Report ─────────────
  const passed = results.filter((r) => r.ok).length;
  const lines = [
    "# QA report",
    "",
    `Run ${started.toISOString().slice(0, 16).replace("T", " ")} UTC against \`${BASE}\` (production build, real Chrome). Checklist: [QA-CHECKLIST.md](QA-CHECKLIST.md).`,
    "",
    `**${passed} / ${results.length} checks passed.**`,
    "",
    "| ID | Check | Result |",
    "|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? "✅ Pass" : "❌ Fail"} |`),
    "",
  ];
  const withDetails = results.filter((r) => r.details.length);
  if (withDetails.length) {
    lines.push("## Details", "");
    for (const r of withDetails) {
      lines.push(`### ${r.id}: ${r.title}`, "", ...r.details.slice(0, 40).map((d) => `- ${d}`), "");
    }
  }
  if (notes.length) lines.push("## Notes", "", ...notes.map((n) => `- ${n}`), "");
  writeFileSync(join(process.cwd(), "docs/QA-REPORT.md"), lines.join("\n"));
  console.log(`\n${passed}/${results.length} passed. Report: docs/QA-REPORT.md`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
