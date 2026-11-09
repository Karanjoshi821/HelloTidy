# Hello Tidy store

A direct-to-consumer store for magic eraser (melamine sponge) packs, built for Meta-ads traffic in India.

Decisions, pricing and research live in `docs/DECISIONS.md`, kept out of this public repository.

- **Stack:** Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4, Postgres + Drizzle ORM, Zod.
- **Payments:** Cash on Delivery always works. Razorpay switches on when keys are set.
- **Admin panel:** `/admin`, modelled on Shopify's admin. It covers:
  - orders (work queues, bulk actions, COD verification, shipping, refunds, packing slips) and abandoned checkouts;
  - products and stock, customers, discount codes and analytics;
  - settings, staff accounts and an activity log.

  It works on a phone. See [docs/DECISIONS.md §17](docs/DECISIONS.md#17-round-4-shopify-style-admin-panel-25-oct).

## Run locally

```bash
npm install
npm run dev                # http://localhost:3000 (uses an embedded database, no setup)
npm run admin:create -- --email you@example.com --name "Your Name"   # prints a password
```

Then open http://localhost:3000/admin and sign in. Add staff from **Settings → Staff**: each person gets a one-time password and must choose their own on first sign-in.

> The local database lives in `.data/pglite`. Delete that folder to start fresh. Stop `npm run dev` before running `admin:create`; the embedded database allows one process at a time.

## Where things live

| Change…                                                                                                    | Edit                                                 |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Business name, phone, WhatsApp, address, grievance officer, GSTIN                                          | `src/config/site.ts`                                 |
| Packs, prices, MRP, stock, pack visibility                                                                 | **Admin → Products** (stored in the database)        |
| COD charge and COD order limit                                                                             | **Admin → Settings**                                 |
| Discount codes                                                                                             | **Admin → Discounts**                                |
| Product copy, photos, uses, legal declarations                                                             | `src/config/products.ts`                             |
| FAQ                                                                                                        | `src/config/faq.ts`                                  |
| Customer reviews: currently **sample (fake) reviews**, clearly labelled; replace with real ones before ads | `src/config/reviews.ts`                              |
| Product photos (currently AI-generated; swap in photos of your stock)                                      | `public/images/product/`, listed in `product.images` |
| Policies / guides                                                                                          | `src/content/policies.tsx`, `src/content/guides.tsx` |

`npm run check:launch` lists every placeholder (`TODO…`) and missing env var.

## Deploy to Vercel

```bash
npm i -g vercel
vercel link                       # create/link the project
vercel integration add neon       # provisions Postgres and sets DATABASE_URL
vercel env pull .env.local        # optional: use the real DB locally
```

1. In Vercel → Settings → Environment Variables, set `NEXT_PUBLIC_SITE_URL`, `APP_SECRET`, and any integrations from [.env.example](.env.example).
2. Deploy (`vercel --prod`, or push to the connected Git repo). The `build` script applies database migrations automatically when `DATABASE_URL` is set.
3. Create the owner login against the production database (add everyone else later from Admin → Settings → Staff):
   ```bash
   vercel env pull .env.production.local
   DATABASE_URL="<from that file>" npm run admin:create -- --email you@example.com --name "Your Name"
   ```
4. Add your domain in Vercel → Domains and update `NEXT_PUBLIC_SITE_URL`.

**After changing env vars, redeploy.** Store pages are prerendered, so payment options shown on them are fixed at build time. Prices, stock and the COD charge are different: they come from the database, and an admin save refreshes the store pages right away. No redeploy is needed for those.

A build needs a database to prerender the store. On Vercel that's your Neon database. A local `npm run build` with no `DATABASE_URL` uses a throwaway in-memory copy with the default catalogue.

## Integrations checklist

- **Razorpay:** add the keys, then the webhook `https://<domain>/api/webhooks/razorpay` with events `payment.authorized`, `payment.captured`, `payment.failed` and `order.paid`. Test with `rzp_test_…` keys first. Enable auto-capture in the Razorpay dashboard; the code also captures authorized payments itself.
- **Meta:** set the pixel ID and CAPI token, verify your domain in Business Manager, and check events in Events Manager → Test events. Purchases are de-duplicated by order number.
- **Telegram:** set the bot token and chat ID to get a ping on every order.
- **Cart-recovery calls (AI voice agent + n8n):** off until `RECOVERY_API_KEY` is set. Then:
  - Checkout shows an unticked "you may call me" box. Ticking it saves the cart (`cart_leads`) and posts its id to `RECOVERY_WEBHOOK_URL`.
  - n8n and the voice agent use `/api/recovery/leads/<id>` (plus `/claim`, `/coupon`, `/result`, `/coupon-sent`) with that key as a Bearer token.
  - A call is placed only between 9 am and 9 pm India time, never after an order, and never to a number that said "don't call".
  - Discount codes from a call work once and only for that customer's number (`discounts.customer_phone`).
  - Results show in Admin → Abandoned checkouts. The agent and the n8n workflow live in a separate project (`AI_Agent\asap_call`).
- **Shiprocket (manual for now):**
  1. Admin → Orders: filter what to ship, then **Export CSV** (Shiprocket's bulk-upload columns).
  2. Create the shipments in Shiprocket.
  3. Paste each AWB back into its order with **Save & mark as shipped**. The customer sees the tracking link, and gets a shipping email if Resend is set up.

## Scripts

| Command                              | What it does                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                        | Dev server                                                                                                                                       |
| `npm run build` / `npm start`        | Production build (runs migrations if a DB is configured) / serve                                                                                 |
| `npm test`                           | Unit + integration tests (pricing, validation, security, order lifecycle on an in-memory Postgres)                                               |
| `npm run test:e2e`                   | Browser smoke test against a running server (`BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`); uses your installed Chrome                            |
| `npm run test:qa`                    | Full A-to-Z QA (every page × 6 screen sizes, flows, SEO, accessibility, security, admin); writes `docs/QA-REPORT.md`. See `docs/QA-CHECKLIST.md` |
| `npm run format`                     | Format code with Prettier                                                                                                                        |
| `npm run db:generate`                | Create a migration after editing `src/lib/db/schema.ts`                                                                                          |
| `npm run db:migrate`                 | Apply migrations                                                                                                                                 |
| `npm run admin:create`               | Create the first owner, or reset a password from the command line (staff are managed in Admin → Settings → Staff)                                |
| `npm run check:launch`               | Pre-launch checklist                                                                                                                             |
| `npm run lint` / `npm run typecheck` | Static checks                                                                                                                                    |

## Security notes

- Prices and discount codes are computed on the server from the database; the browser's numbers are never trusted. If a price changed while the customer was on checkout, the order is refused and the page shows the new total, so nobody is charged a price they didn't see.
- Admin auth:
  - scrypt password hashes and database sessions; only token hashes are stored.
  - `__Host-` httpOnly cookie, rate-limited login.
  - Every admin page and action re-checks the session; `src/proxy.ts` is only a redirect shortcut.
  - Two roles: **owner** and **staff**. Staff can't see sales figures, change prices or discounts, record refunds, export data, or change settings and staff.
  - New and reset accounts must replace their one-time password before anything else.
  - Admin changes (prices, stock, discounts, settings, staff, customers, sign-ins) go to **Settings → Activity log**.
- Razorpay: the checkout signature is verified and the payment is re-fetched from Razorpay before an order is marked paid. The webhook signature is verified, and events are de-duplicated.
- CSP, HSTS, frame and nosniff headers are set in `next.config.ts`.
- Rate limits are stored in Postgres: checkout, contact, tracking, coupons and login.
