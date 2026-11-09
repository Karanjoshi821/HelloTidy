# QA checklist (A to Z)

Every check here is run by `npm run test:qa` (a real Chrome against the production build), unless it is marked **manual**. Results of the last run are in [QA-REPORT.md](QA-REPORT.md).

Run it yourself:

```bash
npm run build
# a fresh database with an owner and a staff login
export ALLOW_PGLITE=1 PGLITE_DIR=.data/qa APP_SECRET=qa
ADMIN_PASSWORD=qa-owner-password-123 npm run admin:create -- --email owner@example.com --name Owner
ADMIN_PASSWORD=qa-staff-password-123 npm run admin:create -- --email staff@example.com --name Staff --role staff
npm start -- -p 3417                                                       # in one terminal
BASE_URL=http://localhost:3417 ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD=qa-owner-password-123 \
  STAFF_EMAIL=staff@example.com STAFF_PASSWORD=qa-staff-password-123 npm run test:qa   # in another
```

## A. Every page × every screen size
Pages: home, product, checkout, contact, track, FAQ, guides (index + 3), policies (4), about, 404, admin login.
Widths: 320, 360, 390 (phones), 768 (tablet), 1024, 1440 (desktop).

| ID | Check |
|---|---|
| A1 | Page returns the right status (200, or 404 for unknown URLs) |
| A2 | No horizontal scrolling / content wider than the screen |
| A3 | Every image loads (no broken images), including lazy-loaded ones further down |
| A4 | No browser console errors, page crashes, or failed (4xx/5xx) requests |
| A5 | Nothing overlaps a link, button or form field: every interactive element can actually be clicked at its centre (catches menus/bars/images covering content) |
| A6 | Screenshots of every page at phone and desktop width reviewed by eye (**manual**, done by me for this run) |

## B. Header, navigation and menus
| ID | Check |
|---|---|
| B1 | Mobile menu opens as a full-screen, opaque panel above all content |
| B2 | Every mobile menu link is clickable and navigates; the menu closes after navigating |
| B3 | Escape closes the mobile menu; page scrolling is locked while it is open and restored after |
| B4 | Desktop navigation links all lead to working pages |
| B5 | Cart icon opens the cart drawer; badge shows the item count |
| B6 | Skip-to-content link is the first focusable element |
| B7 | Announcement marquee scrolls, pauses on hover, and stands still for reduced-motion users |

## C. Product page
| ID | Check |
|---|---|
| C1 | Gallery shows all photos; thumbnails switch the main photo; arrows work on desktop |
| C2 | Selecting each pack updates price, MRP, per-sponge price, the photo badge and the sticky bar |
| C3 | Quantity stepper stays between 1 and 5 (buttons disable at the limits) |
| C4 | `?pack=pack-50` link from an ad preselects that pack |
| C5 | Sticky buy bar is hidden on the first screen and slides in after scrolling past the Buy buttons (mobile) |
| C6 | Buy now opens checkout with the chosen pack and quantity |
| C7 | Add to cart adds the item and opens the cart |
| C8 | Reviews: the "These look real but are fake" notice is shown at the top while sample reviews exist; rating line says "sample reviews" |
| C9 | Review photo lightbox opens, navigates with arrows/keys and closes with Escape |
| C10 | Google structured data never contains ratings from sample reviews |
| C11 | Before/after slider follows mouse/finger drag and keyboard arrows |

## D. Cart
| ID | Check |
|---|---|
| D1 | Quantity + / − work and stop at 5; remove works; empty state shows a shop link |
| D2 | Upsell suggests the next bigger pack and adds it |
| D3 | Subtotal and savings are correct |
| D4 | Cart survives a page reload |

## E. Checkout
| ID | Check |
|---|---|
| E1 | Buy-now checkout uses only the chosen pack; cart checkout uses the cart |
| E2 | Submitting empty shows clear errors on every required field and focuses the first one |
| E3 | Invalid phone and pincode are rejected with helpful messages |
| E4 | Pincode autofills city and state (India Post; needs internet) |
| E5 | COD charge shown before ordering; total = items + ₹49 |
| E6 | Orders above the COD limit can't choose COD and explain why |
| E7 | Invalid coupon shows an error |
| E8 | Placing a COD order lands on the confirmation page with the right total |
| E9 | Double-clicking "Place order" creates only one order |
| E10 | A bot filling the hidden honeypot field is rejected |
| E11 | Online payment with Razorpay test keys, including a failed payment → retry → switch to COD (**manual**, needs your Razorpay test keys) |

## F. After the order
| ID | Check |
|---|---|
| F1 | Confirmation page shows items, total, address and next steps; it is `noindex` |
| F2 | Track order: wrong phone is refused, right phone shows status |
| F3 | Tracking is rate-limited (11th rapid attempt is blocked) |
| F4 | Contact form validates, sends, and the message appears in admin |

## G. SEO
| ID | Check |
|---|---|
| G1 | Every page: one H1, title ≤ 70 chars, meta description 50–170 chars, canonical URL |
| G2 | Headings don't skip levels (e.g. H1 → H3) |
| G3 | Every content image has alt text |
| G4 | Open Graph image set and loads |
| G5 | JSON-LD is valid JSON on every page, and every image/logo URL in it loads |
| G6 | Every URL in sitemap.xml returns 200; robots.txt blocks admin/checkout/order |
| G7 | manifest, icons, llms.txt load |

## H. Accessibility
| ID | Check |
|---|---|
| H1 | axe-core scan (WCAG 2 A/AA) of every page: no critical or serious violations |
| H2 | Keyboard: menus, cart, lightbox and forms usable with Tab/Escape (spot checks within B, C, D) |
| H3 | axe-core scan of every admin page at 390 and 1440 px: no critical or serious violations |

## I. Security
| ID | Check |
|---|---|
| I1 | Security headers on every response (CSP, HSTS in production, frame, nosniff, referrer) |
| I2 | Admin pages (orders, products, customers, discounts, analytics, settings, print, messages, account) redirect to login without a session; both CSV exports are refused |
| I3 | Login: wrong password refused; 6th failure from the same browser is blocked |
| I4 | Script tags typed into the contact form are shown as plain text in admin (no XSS) |
| I5 | Staff can't export (both CSVs return 403) or open owner pages (discounts, settings, staff, activity, new pack, analytics); they're redirected, and the HTML they receive contains none of the owner's data |

## J. Admin (Shopify-style panel)
The shopper checks run in a separate browser, as a real customer would see the store.

| ID | Check |
|---|---|
| J1 | Home shows the to-do queue (COD to verify), owner sales figures, the setup guide and the new order |
| J2 | Orders: search by number and phone; double click made one order; honeypot order absent; *COD to verify* tab; delivered / prepaid filters |
| J3 | Order page: verify COD with a note, comment, tags, mark packed, http tracking link refused, *Save & mark as shipped*, notes |
| J4 | Filtered CSV export has exactly that order, with courier, tags and the pack's shipping weight |
| J5 | Messages: mark handled / new |
| J6 | A price edit shows on the product page, checkout total and llms.txt immediately |
| J7 | Price changed while a customer is on checkout: the order is refused, the page shows the new total, and the second attempt goes through at the new price |
| J8 | Stock: with 1 in stock, an order sells it out and the store shows *Out of stock*; Home shows the alert; cancelling with restock makes it available again; the stock history lists both |
| J9 | Discount code: create (10%, capped), apply at checkout (exact total), the order is listed on the code, disabling it makes checkout refuse it |
| J10 | Changing the COD charge updates the product page, checkout, FAQ and shipping policy; changing it back restores ₹49 |
| J11 | Create order: 6 × Mega Pack, paid by UPI with a reference → confirmed, *Created by staff*, *Prepaid · paid*, right total |
| J12 | Owner records a partial refund; the order shows *Partly refunded* |
| J13 | Customer profile lists their orders; blocking COD makes the checkout refuse COD for that number; unblock |
| J14 | Bulk action marks two confirmed orders packed |
| J15 | Abandoned checkouts page; analytics with a date preset, packs sold, COD vs prepaid, a non-empty chart |
| J16 | Search finds an order by number, a customer by phone and a discount code |
| J17 | Packing slip (no prices, *COD: collect* amount) and receipt (*not a tax invoice*); a cancelled order's slip says *do not ship* |
| J18 | Staff: owner adds a person, the one-time password works only for choosing a new one; then no Analytics, Discounts, Settings or sales figures, no export, no refunds, no price edits, but stock adjustment works; no discount field on Create order; deactivating signs them out |
| J19 | Activity log has the price change, the discount, the COD setting, the new staff member and sign-ins |
| J20 | Every admin page at 390 and 1440 px: loads, no horizontal overflow, one h1, nothing covered, no console errors |
| J21 | Phone menu opens, navigates, and closes on navigation and on Escape |

## K. Performance (Lighthouse, mobile)
| ID | Check |
|---|---|
| K1 | Home, product and checkout: Performance, Accessibility, Best Practices, SEO scores recorded (target ≥ 90) |

## L. Before launch (**manual**, needs your accounts/devices)
- [ ] Open the site on your own Android phone and an iPhone (Safari) over 4G.
- [ ] Open the admin on your phone: sign in, create a test order with **Create order**, mark it shipped, then cancel a test order with restock. Add your staff from Settings → Staff.
- [ ] Razorpay test-mode payment end to end (E11), then one real ₹ payment and refund.
- [ ] Telegram ping arrives for a test order.
- [ ] Meta Events Manager → Test events shows PageView, ViewContent, AddToCart, InitiateCheckout, Purchase (browser + server, deduplicated).
- [ ] Share the product link on WhatsApp: preview image and title look right.
- [ ] Replace sample reviews with real ones (`npm run check:launch` must pass).
- [ ] Cart-recovery calls, with n8n and the voice agent running and your own mobile number. Check that:
  - ticking the box at checkout and leaving creates a lead in Admin → Abandoned checkouts;
  - the call comes in calling hours;
  - saying "don't call" stops all further calls to that number;
  - the code works only from your number, once;
  - placing an order before the call means no call.
