# QA report

Run 2026-11-11 10:43 UTC against `http://localhost:3423` (production build, real Chrome). Checklist: [QA-CHECKLIST.md](QA-CHECKLIST.md).

**82 / 82 checks passed.**

| ID | Check | Result |
|---|---|---|
| A1 | Pages return the right status at every width | ✅ Pass |
| A2 | No horizontal overflow | ✅ Pass |
| A3 | All images load | ✅ Pass |
| A4 | No console errors, crashes or failed requests | ✅ Pass |
| A5 | No interactive element is covered by another element | ✅ Pass |
| B1 | Mobile menu is a full-screen opaque panel | ✅ Pass |
| B2 | Every mobile menu link is clickable and navigates; menu closes | ✅ Pass |
| B3 | Escape closes the menu; scroll lock is restored | ✅ Pass |
| B4 | Desktop navigation links work | ✅ Pass |
| B5 | Cart icon opens the drawer; badge counts items | ✅ Pass |
| B7 | Announcement marquee scrolls and pauses on hover | ✅ Pass |
| B6 | Skip link is the first focusable element | ✅ Pass |
| C1 | Gallery: photos, thumbnails and arrows | ✅ Pass |
| C2 | Selecting a pack updates price, badge and sticky bar | ✅ Pass |
| C3 | Quantity stays between 1 and 5 | ✅ Pass |
| C4 | ?pack=pack-50 preselects the Mega Pack | ✅ Pass |
| C5 | Sticky bar on the first screen, hidden while Buy is visible, back after it | ✅ Pass |
| C6 | Buy now opens checkout with the pack and quantity | ✅ Pass |
| C7 | Add to cart adds the item and opens the cart | ✅ Pass |
| C8 | Sample reviews always sit under the fake notice and say "sample" | ✅ Pass |
| C9 | Review photo lightbox (only when genuine reviews have photos) | ✅ Pass |
| C11 | Before/after slider works with mouse drag and keyboard | ✅ Pass |
| C10 | No ratings from sample reviews in structured data | ✅ Pass |
| D1 | Cart quantity, limit, remove and empty state | ✅ Pass |
| D2 | Upsell suggests and adds the bigger pack | ✅ Pass |
| D3 | Cart subtotal and savings are right | ✅ Pass |
| D4 | Cart survives a reload | ✅ Pass |
| E1 | Buy-now uses only the chosen pack; cart checkout uses the cart | ✅ Pass |
| E2 | Empty submit shows field errors and focuses the first | ✅ Pass |
| E3 | Invalid phone and pincode are rejected | ✅ Pass |
| E4 | Pincode autofills city and state | ✅ Pass |
| E5 | COD charge shown before ordering; total = items + ₹49 | ✅ Pass |
| E6 | COD blocked above the limit, with an explanation | ✅ Pass |
| E7 | Invalid coupon shows an error | ✅ Pass |
| E8 | COD order lands on confirmation with the right total | ✅ Pass |
| E9 | Double-clicking Place order creates one order | ✅ Pass |
| E10 | Honeypot submissions are rejected | ✅ Pass |
| F1 | Confirmation page content and noindex | ✅ Pass |
| F2 | Tracking: wrong phone refused, right phone works | ✅ Pass |
| F3 | Tracking is rate-limited | ✅ Pass |
| F4 | Contact form validates and sends | ✅ Pass |
| G1 | One H1, title, description, canonical, lang on every page | ✅ Pass |
| G2 | Headings don't skip levels | ✅ Pass |
| G3 | Every image has alt text | ✅ Pass |
| G4 | Open Graph image set and loads | ✅ Pass |
| G5 | JSON-LD is valid | ✅ Pass |
| G6 | Sitemap URLs all 200; robots blocks private areas | ✅ Pass |
| G7 | Manifest, icons and llms.txt load | ✅ Pass |
| H1 | axe-core: no critical/serious accessibility violations | ✅ Pass |
| I1 | Security headers present | ✅ Pass |
| I2 | Admin requires login; export refused without a session | ✅ Pass |
| I3 | Wrong password refused; 6th failure blocked | ✅ Pass |
| K1@390 | Cookie banner: asks once, Decline is respected, Cookie settings reopens it | ✅ Pass |
| K1@1440 | Cookie banner: asks once, Decline is respected, Cookie settings reopens it | ✅ Pass |
| K2 | Privacy policy explains cookies and analytics | ✅ Pass |
| K3 | A shopper who accepts: cookie set, visit and order recorded (checked in J20) | ✅ Pass |
| K4 | Product feeds for Google Merchant Center and Meta | ✅ Pass |
| J1 | Home: to-do queue, sales, setup guide and recent orders | ✅ Pass |
| J2 | Orders: search, work-queue tabs and filters; double click made one order | ✅ Pass |
| J3 | Order: verify COD, comment, tags, pack, ship with tracking, notes | ✅ Pass |
| J4 | CSV export (filtered) contains the order, courier and tags | ✅ Pass |
| I4 | Contact-form HTML is shown as text in admin (no XSS) | ✅ Pass |
| J5 | Messages: mark handled and back | ✅ Pass |
| J6 | A price edit reaches the store immediately (product, checkout, llms.txt) | ✅ Pass |
| J7 | A price change during checkout is caught: no order at a stale price | ✅ Pass |
| J8 | Stock: a sell-out shows on the store; cancelling restocks it | ✅ Pass |
| J9 | Discount codes: create, apply at checkout, count the use, disable | ✅ Pass |
| J10 | COD charge setting updates product, checkout, FAQ and policies | ✅ Pass |
| J11 | Create order (phone/WhatsApp): bulk qty, paid by UPI, stock taken | ✅ Pass |
| J12 | Refunds (owner): partial refund recorded against a paid order | ✅ Pass |
| J13 | Customers: lifetime view; a COD block is enforced at checkout | ✅ Pass |
| J14 | Bulk action: mark several orders packed at once | ✅ Pass |
| J15 | Abandoned checkouts and analytics load with real numbers | ✅ Pass |
| J16 | Search finds orders, customers, packs and codes | ✅ Pass |
| J17 | Packing slip and receipt print pages | ✅ Pass |
| J18 | Staff: invite, forced password change, limited access, deactivate | ✅ Pass |
| J19 | Activity log records catalogue, discount, settings, staff and sign-ins | ✅ Pass |
| J20 | Visitors: overview, funnel, sources, list, timeline and the order's source | ✅ Pass |
| J20 | Every admin page at 390 and 1440 px: loads, fits, one h1, nothing covered, no errors | ✅ Pass |
| J21 | Phone menu opens, navigates, closes on navigation and Escape | ✅ Pass |
| H3 | axe-core on every admin page: no critical/serious violations | ✅ Pass |
| I5 | Staff can't export, refund, or open owner pages | ✅ Pass |

## Details

### B2: Every mobile menu link is clickable and navigates; menu closes

- ℹ 5 links tested

### B4: Desktop navigation links work

- ℹ 5 links

### B7: Announcement marquee scrolls and pauses on hover

- ℹ 20 items in the moving track

### C1: Gallery: photos, thumbnails and arrows

- ℹ 5 photos

### E2: Empty submit shows field errors and focuses the first

- ℹ 8 messages

### E4: Pincode autofills city and state

- ℹ 560038 → Bangalore, Karnataka

### G6: Sitemap URLs all 200; robots blocks private areas

- ℹ 14 sitemap URLs
