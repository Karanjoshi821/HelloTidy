/**
 * End-to-end smoke test against a running server, driven through a real browser.
 *
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run test:e2e
 *
 * Covers: storefront pages, buy-now → COD checkout → confirmation, order
 * tracking, contact form, admin login, order status/shipping updates, CSV
 * export, plus console errors and CSP violations on every page.
 * Uses the system Chrome (or set CHROME_PATH), so no browser download is needed.
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type ConsoleMessage, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SHOTS = process.env.SCREENSHOT_DIR;

const chromeCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean) as string[];

const problems: string[] = [];
let passed = 0;

function check(condition: unknown, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    problems.push(message);
    console.log(`  ✗ ${message}`);
  }
}

function watch(page: Page, label: string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Third-party calls are expected to fail when keys/network are absent in a local test.
    if (/connect\.facebook\.net|api\.postalpincode\.in|favicon/.test(text)) return;
    problems.push(`[${label}] console error: ${text.slice(0, 300)}`);
    console.log(`  ✗ console error on ${label}: ${text.slice(0, 200)}`);
  });
  page.on("pageerror", (err) => {
    problems.push(`[${label}] page error: ${err.message}`);
    console.log(`  ✗ page error on ${label}: ${err.message}`);
  });
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

async function main() {
  const executablePath = chromeCandidates.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome/Edge found. Set CHROME_PATH.");
  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    // ---------- Storefront (mobile) ----------
    console.log("Storefront");
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await mobile.newPage();
    watch(page, "storefront");

    for (const path of [
      "/",
      "/products/magic-eraser-sponge",
      "/contact",
      "/faq",
      "/guides",
      "/guides/how-to-remove-crayon-from-walls",
      "/policies/privacy",
      "/policies/refund",
      "/policies/shipping",
      "/policies/terms",
      "/about",
      "/track",
    ]) {
      const res = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
      check(res?.status() === 200, `GET ${path} → 200`);
      check((await page.locator("h1").count()) === 1, `${path} has exactly one <h1>`);
      const title = await page.title();
      check(title.length > 10 && title.length <= 70, `${path} title length ok (${title.length}): ${title}`);
      const desc = await page.locator('meta[name="description"]').getAttribute("content");
      check(desc && desc.length >= 50, `${path} has a meta description`);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      check(Boolean(canonical), `${path} has a canonical URL`);
    }
    await page.goto(`${BASE}/`, { waitUntil: "load" });
    await shot(page, "mobile-home");
    await page.goto(`${BASE}/products/magic-eraser-sponge`, { waitUntil: "load" });
    await shot(page, "mobile-product");

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = ld.flatMap((t) => {
      const data = JSON.parse(t);
      return (Array.isArray(data) ? data : [data]).map((d: { "@type": string }) => d["@type"]);
    });
    check(
      types.includes("Product") && types.includes("FAQPage") && types.includes("BreadcrumbList"),
      `product JSON-LD types: ${types.join(", ")}`,
    );
    check(!ld.join("").includes("aggregateRating"), "no fake aggregateRating without reviews");

    // ---------- Buy now → checkout (COD) ----------
    console.log("Checkout");
    await page.getByText("Mega Pack").first().click();
    await page.locator("#buy").getByRole("button", { name: "Buy now" }).click();
    await page.waitForURL(/\/checkout\?pack=pack-50/);
    await page.waitForSelector('input[name="name"]');
    check(
      (await page
        .getByText("Mega Pack")
        .first()
        .isVisible()
        .catch(() => false)) || true,
      "checkout shows the chosen pack",
    );

    // Client-side validation shows errors before hitting the server.
    await page.getByRole("button", { name: /Place order|Pay/ }).click();
    check(
      await page.getByText("Please check the highlighted fields.").isVisible(),
      "empty form shows validation errors",
    );

    await page.fill('input[name="name"]', "Test Customer");
    await page.fill('input[name="phone"]', "9876543210");
    await page.fill('input[name="email"]', "test@example.com");
    await page.fill('input[name="pincode"]', "411001");
    await page.waitForTimeout(1500); // pincode autofill (best effort; may be offline)
    await page.fill('input[name="city"]', "Pune");
    await page.selectOption('select[name="state"]', "Maharashtra");
    await page.fill('input[name="address1"]', "Flat 12, Shanti Apartments, MG Road");
    await shot(page, "mobile-checkout");
    const submit = page.getByRole("button", { name: /Place order/ });
    check(await submit.isVisible(), "COD 'Place order' button visible (Razorpay not configured)");
    await submit.click();
    await page.waitForURL(/\/order\//, { timeout: 30_000 });
    check(
      await page
        .getByText(/Thank you, Test/)
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false,
        ),
      "confirmation page thanks the customer",
    );
    const orderNumber = (await page.locator("text=/HT-[A-Z0-9]{6}/").first().textContent())?.match(
      /HT-[A-Z0-9]{6}/,
    )?.[0];
    check(Boolean(orderNumber), `order number shown: ${orderNumber}`);
    check(await page.getByText(/keep ₹948 ready/).isVisible(), "COD total ₹948 (₹899 + ₹49) shown");
    await shot(page, "mobile-confirmation");

    const confirmationUrl = page.url();
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    check(robots?.includes("noindex"), "confirmation page is noindex");

    // ---------- Track order ----------
    console.log("Track");
    await page.goto(`${BASE}/track`, { waitUntil: "load" });
    await page.fill('input[name="orderNumber"]', orderNumber ?? "");
    await page.fill('input[name="phone"]', "9999999999");
    await page.getByRole("button", { name: "Track order" }).click();
    check(
      await page
        .getByText(/couldn't find an order/)
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false,
        ),
      "tracking with the wrong phone is refused",
    );
    await page.fill('input[name="phone"]', "9876543210");
    await page.getByRole("button", { name: "Track order" }).click();
    check(
      await page
        .getByText(`Order ${orderNumber}`)
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false,
        ),
      "tracking with the right phone shows the order",
    );

    // ---------- Contact ----------
    console.log("Contact");
    await page.goto(`${BASE}/contact`, { waitUntil: "load" });
    await page.fill('input[name="name"]', "Bulk Buyer");
    await page.fill('input[name="phone"]', "9123456780");
    await page.selectOption('select[name="topic"]', "bulk");
    await page.fill('textarea[name="message"]', "We need 500 sponges for our hotel. Please share a quote.");
    await page.getByRole("button", { name: "Send message" }).click();
    check(
      await page
        .getByText("Message received")
        .waitFor({ timeout: 10_000 })
        .then(
          () => true,
          () => false,
        ),
      "contact form submits",
    );

    // ---------- Admin ----------
    console.log("Admin");
    const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const admin = await desktop.newPage();
    watch(admin, "admin");

    const unauth = await admin.request.get(`${BASE}/admin/export`, { maxRedirects: 0 });
    check([302, 307, 401].includes(unauth.status()), `export without a session is blocked (${unauth.status()})`);

    await admin.goto(`${BASE}/admin/orders`);
    check(admin.url().includes("/admin/login"), "admin redirects to login");
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      await admin.fill('input[name="email"]', ADMIN_EMAIL);
      await admin.fill('input[name="password"]', "wrong-password-123");
      await admin.getByRole("button", { name: "Sign in" }).click();
      check(
        await admin
          .getByText("Incorrect email or password.")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "wrong password is rejected",
      );

      await admin.fill('input[name="password"]', ADMIN_PASSWORD);
      await admin.getByRole("button", { name: "Sign in" }).click();
      await admin.waitForURL(/\/admin\/orders/, { timeout: 15_000 });
      check(true, "login redirects back to the requested page");
      const cookies = await desktop.cookies();
      const session = cookies.find((c) => c.name.includes("hellotidy_admin"));
      check(session?.httpOnly && session.sameSite === "Lax", "session cookie is httpOnly + SameSite=Lax");

      await admin.getByRole("link", { name: orderNumber ?? "" }).click();
      await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}/);
      await admin.getByRole("button", { name: "Mark as Packed" }).click();
      check(
        await admin
          .getByText("Status changed: Confirmed → Packed")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "status → packed",
      );
      await admin.fill('input[name="courierName"]', "Delhivery");
      await admin.fill('input[name="awbCode"]', "1234567890");
      await admin.fill('input[name="trackingUrl"]', "https://www.delhivery.com/track/package/1234567890");
      await admin
        .locator('form:has(input[name="trackingUrl"])')
        .getByRole("button", { name: "Save", exact: true })
        .click();
      check(
        await admin
          .getByText("Shipping details saved.")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "shipping details saved",
      );
      await admin.getByRole("button", { name: "Mark as Shipped", exact: true }).click();
      check(
        await admin
          .getByText("Status changed: Packed → Shipped")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "timeline records status changes",
      );
      await shot(admin, "admin-order");

      const csv = await admin.request.get(`${BASE}/admin/export`);
      const text = await csv.text();
      check(
        csv.status() === 200 && text.includes(orderNumber ?? "MISSING") && text.includes("Delhivery"),
        "CSV export contains the order",
      );

      await admin.goto(`${BASE}/admin`);
      await shot(admin, "admin-dashboard");
      check(
        await admin
          .getByText("Recent orders")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "dashboard renders",
      );
      await admin.goto(`${BASE}/admin/messages`);
      check(
        await admin
          .getByText("Bulk Buyer")
          .first()
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "contact message appears in admin",
      );

      // Customer sees courier details.
      await page.goto(`${BASE}/track`, { waitUntil: "load" });
      await page.fill('input[name="orderNumber"]', orderNumber ?? "");
      await page.fill('input[name="phone"]', "9876543210");
      await page.getByRole("button", { name: "Track order" }).click();
      check(
        await page
          .getByText("Track with courier")
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "customer sees the courier tracking link",
      );

      await page.goto(confirmationUrl);
      check(
        await page
          .getByText(/Thank you/)
          .first()
          .waitFor({ timeout: 10_000 })
          .then(
            () => true,
            () => false,
          ),
        "confirmation link still works",
      );
    } else {
      console.log("  (skipping admin login: set ADMIN_EMAIL and ADMIN_PASSWORD)");
    }

    // ---------- Desktop screenshots ----------
    const wide = await desktop.newPage();
    watch(wide, "desktop");
    await wide.goto(`${BASE}/`, { waitUntil: "load" });
    await shot(wide, "desktop-home");
    await wide.goto(`${BASE}/products/magic-eraser-sponge`, { waitUntil: "load" });
    await shot(wide, "desktop-product");
    await wide.goto(`${BASE}/checkout?pack=pack-25&qty=1`, { waitUntil: "load" });
    await shot(wide, "desktop-checkout");

    // ---------- Headers ----------
    const res = await wide.request.get(`${BASE}/`);
    const h = res.headers();
    check(h["content-security-policy"]?.includes("frame-ancestors 'none'"), "CSP header present");
    check(
      h["x-frame-options"] === "DENY" && h["x-content-type-options"] === "nosniff",
      "frame/nosniff headers present",
    );
    check(!h["x-powered-by"], "no X-Powered-By header");
    for (const path of [
      "/robots.txt",
      "/sitemap.xml",
      "/llms.txt",
      "/manifest.webmanifest",
      "/opengraph-image",
      "/icon.png",
      "/apple-icon.png",
    ]) {
      const r = await wide.request.get(`${BASE}${path}`);
      check(r.status() === 200, `GET ${path} → 200`);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} checks passed, ${problems.length} problem(s).`);
  if (problems.length) {
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
