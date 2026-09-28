# Handoff — read this first

## ▶ CURRENT STATE — end of 2026-09-28 (read this box first)

**Git:** see `git log` (Projects work pushed 2026-09-28). **Git == live** for all jenix app code: every
previously "deployed but uncommitted" change was committed on 2026-09-27, grouped by feature (see
`git log`). Only untracked leftovers remain, deliberately not committed: `p.images` (repo root),
`VPS/extra-pages/` (parked older VPS copies), `VPS/backend/src/database/console.log('` (empty junk
file from a mistyped command), `.claude/settings.local.json`.

**Shipped 2026-09-26/27** (each has its own entry below):
1. Shree Maruti tracking links fixed (`11cc707`)
2. Razorpay webhooks actually create orders + no-double-order lock (`8f5efc6`)
3. nginx upload limits: api.jenixindia.com 25m, sitemitra 12m (server config, not in git)
4. Backend "crashing" = pm2 memory restarts ~20/day → root cause (recovery-store bloat) fixed,
   store 33 MB → 1.6 MB, ₹0 abandoned-cart rows repaired (`83ca900`). **Verified: pm2
   "exceeds --max-memory-restart" count still 3842 = zero memory restarts since the fix.**
5. Admin dashboard: Week/Month/Year trend, clickable tiles, Product Visits vs Sales (`dffc6c1`)
6. Customer cart-recovery page redesigned (`5b99877`) and matching recovery email (`be6ae26`)
7. Older live work committed: specs editor, orders/invoices, cart email capture, Cashfree webhook
   URL fix, SMTP attachments, shipping, storefront fixes, Tally export, walk-in Repeat Order.

**Shipped 2026-09-28:**
8. Backend health check: stable, zero memory restarts; pm2 restart counter reset to 0 (`df71b93`).
9. Google Shopping check: feed read automatically twice a day by Merchant Center 246583266, all
   active products included, feed and page prices/stock consistent (20-product sample). Optional
   feed clean-up offered, not done: 338 descriptions contain HTML, 96 titles > 150 chars,
   2 products without an image (JNX-000331, JNX-000398 → disapproved until a photo is added).
10. Return & Replacement Policy: per-product "Return eligible" / "Sold as is", admin tick box +
   bulk action + filter, badges on product page/cart/checkout, new /refund-policy text and invoice
   terms, per-product Google return data (`35cf2f6`).
11. og:image / Product JSON-LD image were "[object Object]" on 414 of 417 product pages → fixed
   (`3bbb16f`); duplicate heading removed from the policy page.
12. **Project Series** — custom IoT projects sold on quotation (no prices): `/projects` +
   `/projects/:slug`, admin "Projects & Enquiries", enquiry alerts by email + WhatsApp. First
   project live: Smart Parking Space Calculation for Basement Parking. See the entry below.
13. Two more projects: **FloodGuard** (underpass water logging alarm) and **FireGuard** (fire alarm &
   fire-fighting system monitoring), seeded by `scripts/seed-projects-flood-fire.js`; new optional
   "product website" link per project (externalUrl/externalLabel). Commit `757bd71`.
14. "Sold as is" badge made a quiet grey label; "not returnable" wording removed from the badge,
   product-page note and checkout notice (user request — don't highlight it). Full terms still on
   /refund-policy. All 423 products are already "Sold as is" (0 marked return eligible).

**PENDING / TODO (in priority order):**
- **VPS DNS fix — user will run it** (see "PENDING: VPS DNS fix" entry). Until then every outbound
  call on the VPS (checkout create-attempt ~6 s, emails, WhatsApp, Cashfree…) randomly waits 5 s.
  First attempt on 2026-09-26 landed on the wrong server.
- **Real Razorpay order test** to confirm the webhook path on a live payment, then delete
  `razorpay.gateway.js.bak-webhook` and `cart-checkout.service.js.bak-webhook`.
- **Backups to delete after a few days** (user decision: wait, confirm nothing else broke):
  `apps/admin-panel/dist.bak-20260924-editfix-prev`, `apps/front/dist.bak-20260917-100600`
  (keep the `-20260927-*-prev` ones as the single rollback point until then), and
  `/root/{deploy-bak-20260924-repeat, jenix-bak-2026-09-27-*, nginx-bak-2026-09-26,
  sitemitra-bak-2026-09-26}`. Keep the two `recovery-store.archive-2026-09-27*.json` (archived
  data, not backups).
- **Watch** that pm2 memory restarts stay at 0 (`grep -a -c "exceeds --max-memory-restart"
  /root/.pm2/pm2.log` — should stay 3842) and that the Product Visits panel fills in.
  **2026-09-28 check:** no restart for 21 h, zero memory restarts since the fix, RSS steady
  259–297 MB (JS heap ~82 MB) vs the 600 MB limit — healthy. The pm2 "restarts" column (was 520)
  is a lifetime counter incl. deploys; it was **reset to 0 with `pm2 reset jenix-backend`**
  (counter only, no restart). From now on any increase that isn't a deploy is a real signal.
- **Return policy — user actions:** tick "Return eligible" on trusted products (Products list →
  select → Return Policy bulk action; until then EVERY product shows "Sold as is"). Backups from
  this deploy: `/root/jenix-bak-2026-09-28-return-policy/`,
  `apps/{admin-panel,front}/dist.bak-20260928-returnpolicy-prev`.
- **Google Merchant Center 246583266 (the active account) — user actions:**
  (a) JNX-000135 "Product page unavailable" → click Request review / Revalidate (page is fixed);
  (b) fill the return-policy form: India, https://jenixindia.com/refund-policy, 5 days, by mail,
  customer pays return shipping, no restocking fee, exchange/replacement only — Claude could not:
  the Claude-in-Chrome Google login only has access to a SECOND account 128835410 "Jenix";
  (c) decide whether to close the unused account 128835410 (duplicate/conflict risk);
  (d) check Diagnostics, Shipping settings (feed has no shipping costs) and Free listings.
- **58 of 406 recovery emails ever sent have status "failed"** — not investigated yet (user said
  leave for now). Separate from the redesign.
- **MDR feature** (Sep 17 entry) still off, needs its real-order test before switching on.
- **SSL: the CLAUDE.md "renewal gap" warning is STALE.** nginx uses `/etc/letsencrypt/live/
  jenixindia.com-0001` and `test.jenixindia.com-0001` (valid to 2026-10-30), both have renewal
  configs (authenticator = nginx) and `certbot-renew.timer` is active. The non-`-0001` copies
  (expiring Oct 5 / expired Sep 26) are unused leftovers. Worth one `certbot renew --dry-run` to
  confirm the nginx authenticator works on this VPS (shared infra — ask first).

**SiteMitra (separate repo `D:\IOT Device\SiteMistri\SiteMitra`, see its HANDOFF.md):** v1.2.4
(versionCode 6) AAB built for the Play Store at
`sitework/frontend/android-app/release/build-v1.2.4/sitemitra-v1.2.4.aab` — user to upload; after it
is live set app-config `latestVersionCode: 6`. PWA already on v1.2.4. Photo upload/display fixed
server-side. Committed locally (`c406da3`, `b003fc7`) — **that repo has no git remote**.

> **Update 2026-09-27:** backend memory-restart loop (~20/day) root-caused and fixed — abandoned-cart
> recovery store bloat, see the first entry below (includes "why it happened" + rules so it doesn't
> repeat). DNS fix below is still pending on the user.
>
> **Update 2026-09-26:** `origin/main` HEAD is now **`8f5efc6`** (Razorpay
> webhook fix) after `11cc707` (Shree Maruti tracking). Both deployed. One
> **pending VPS DNS fix, to be applied by the user** — see the first entry
> below. The paragraph after this box is the older Sep 17 status.

Last updated: **2026-09-17**. `origin/main` HEAD is now **`8d69d14`**,
pushed and **deployed to the new VPS** (103.118.183.243) — see entry
below for exactly what's live vs. still pending before the MDR feature
itself can be switched on. Working tree also has one unrelated stray
empty file (`p.images` at repo root, dated Jul 7, predates every
feature in this file — leave it alone unless the user asks about it).

## Sep 28 2026 — Project Series: custom IoT projects sold on quotation (DEPLOYED)

**Why:** user wants to sell complete projects (hardware + software, customised per site) rather
than boxed products — buyer must understand the intent/use and contact us for a quotation.
Decisions: **no prices anywhere**; enquiry collects name, mobile/WhatsApp, email (+ optional
company, city, package, per-project questions).

**What's live:**
- Storefront: `/projects` (list) and `/projects/:slug` (hero, problem/solution, how-it-works
  steps, packages with "Get quote for X", gallery w/ lightbox, software features, use cases,
  why us, FAQs, quote form). "IoT Projects" link in header nav + footer. Service JSON-LD.
- Backend: `modules/projects/*`, store `database/json/projects-store.json`
  (`{projects, enquiries}`, atomic write + queue). Public `GET /api/projects`,
  `GET /api/projects/:slug`, `POST /api/projects/:slug/enquiry` (honeypot, 10-min same-mobile
  duplicate guard). Admin `/api/admin/projects/*` guarded by the **blogs** permissions (reused so
  the roles model is untouched).
- Alerts (best-effort, never block the enquiry): `project_enquiry_admin` email →
  storeProfile.supportEmail (jenixjain@gmail.com), `project_enquiry_admin_whatsapp` →
  supportWhatsApp/supportMobile (07240226566), `project_enquiry_received` ack to the customer's
  email if given. Editable in Marketing templates (group "Projects").
  WhatsApp session creds were refreshed 2026-09-28 11:48 → looks paired; if alerts don't arrive,
  re-pair via admin panel.
- Sitemap: `/sitemaps/projects.xml` (in the index) lists `/projects` + each published project.
- Admin: **Projects & Enquiries** (`/projects`) — create/edit projects (lists one per line,
  steps/FAQs as `Title | text`, image upload to `uploads/projects/`), Enquiries tab with status
  new → contacted → quoted → won/lost + notes, tel/WhatsApp links.
- First project seeded with `scripts/seed-project-smart-parking.js --apply` (idempotent; dry-run
  without the flag): slug `smart-parking-space-calculation-basement-parking`, packages Basic /
  Advanced (boom barrier) / More Advanced (sensor per slot + mobile app). 4 WebP images from the
  user's ChatGPT drafts in `uploads/projects/` (the "project package" image aimed at students was
  deliberately left out).

**Backups:** `/root/jenix-bak-2026-09-28-projects/backend-files.tgz`; previous dists moved to
`/tmp/{admin-panel,front}-dist-superseded` (tmp — gone on reboot, no dist.bak made).

## Sep 28 2026 — Google "Product page unavailable": broken og:image + Product image on 414 pages (FIXED, DEPLOYED)

- Merchant Center 246583266 (**this is the active account** — data source "jenixndia"; a second
  account 128835410 "Jenix" also exists and is the one the Claude-in-Chrome Google login can see)
  flagged JNX-000135 "Product page unavailable". The page itself returned 200 to every Google
  crawler (incl. Storebot-Google) in the available logs (from 25 Sep); the likely trigger was an
  older crawl during the pre-fix memory-restart period.
- Real bug found while checking: 414 of 417 active products store images as
  `{url, thumbnail, medium, large, alt}` (migration format). `seo.service.buildProductPageMeta`
  put that object into og:image → `content="[object Object]"` (broken WhatsApp/Facebook/Google
  previews; crawlers then requested `/products/[object Object]` → 404s in nginx logs), and
  `buildProductJsonLd` put objects into Product `image` (invalid structured data). Fixed with
  `resolveImageUrl()` (large → url → medium → thumbnail). Google/Facebook feeds and sitemaps were
  already fine. Verified live: og:image and Product.image[0] are real URLs, 0 "[object" on page.
- Other Google-crawler 404s in logs (78) are deleted/renamed (11) or inactive (3) product URLs —
  correct behaviour, none are active products.
- Also: removed the duplicate `<h2>` heading from the /refund-policy page content (live data +
  `scripts/content/return-policy-2026-09.html`); backup
  `/root/jenix-bak-2026-09-28-return-policy/static-pages-store.before-h2fix.json`.
- Merchant Center return-policy form: not filled — Chrome's Google account has no access to
  246583266. User to fill it (URL https://jenixindia.com/refund-policy, India, 5 days, by mail,
  customer pays return shipping, replacement/exchange) or sign Chrome into that account.

## Sep 28 2026 — Return & Replacement Policy: per-product "Return eligible" / "Sold as is" (DEPLOYED)

User-approved policy: returns ONLY for products explicitly marked return-eligible, only for a
manufacturing defect on arrival, reported within **5 days** of delivery **with an unboxing video
(required)**, **replacement only (no cash refunds)**, **return shipping paid by the buyer**.
Everything not marked is **"Sold as is — not returnable"** (wholesale / untested trading items).
Two defaults chosen by Claude (user didn't answer; change if needed): every product starts as NOT
returnable; if WE ship the wrong item, WE pay its return shipping (policy section 7).

- **Product field `returnEligible`** (default false): validator (create default false, update
  optional), createProduct, `toPublicProduct`, and the bulk-patch whitelist.
- **Admin:** "Return eligible (defective on arrival, 5 days)" tick box on Add/Edit Product;
  Products list → select → **"Return Policy"** bulk action (✅ Mark return eligible / ⚠️ Mark sold
  as is) and an **"All Returns / Return eligible / Sold as is"** filter.
- **Cart/order snapshot:** cart lines carry `returnEligible` (line builder + `sanitizeCartLine`);
  orders store `items: lines`, so each order keeps the status **as it was at purchase**.
- **Storefront:** shared `apps/front/src/modules/products/return-policy-badge.jsx` — green
  "✅ Return eligible — replacement if defective on arrival (5 days)" / orange "⚠️ Sold as is — not
  returnable", linking to /refund-policy. On product page (under the GST-invoice line + one-line
  explanation), cart items, checkout items, and a notice directly above Pay Now / Place Order
  ("N of M items are sold as is… By placing this order you agree to our Return Policy").
- **Google:** `seo.service.buildProductReturnPolicyJsonLd(product)` — eligible → 5-day window, by
  mail, customer pays return fees, exchange only; otherwise MerchantReturnNotPermitted. Replaces
  the old invoice-wording sniffing (kept, unused). **User must set the matching account-level
  return policy in Merchant Center.**
- **Policy text:** `VPS/scripts/content/return-policy-2026-09.html` applied by
  `VPS/scripts/apply-return-policy.js` (dry run by default, `--apply` with backend stopped) to the
  existing **/refund-policy** page (title now "Return & Replacement Policy") and to **invoice
  terms**. The OLD texts contradicted each other (page: "15-day warranty, we reimburse return
  shipping, 100% refund"; invoice: "10-day warranty") — saved to
  `json/return-policy-previous-2026-09-28T07-08-29-090Z.json`.
- Deployed 2026-09-28 (~9 s downtime): backups `/root/jenix-bak-2026-09-28-return-policy/`
  (6 backend files + static-pages-store + settings), admin/front `dist.bak-20260928-returnpolicy-prev`.
  Verified live: policy page, "Sold as is" badge above Add to Cart, API `returnEligible:false`.
  Regression checks + both builds pass; bulk patch tested locally.
- Cosmetic TODO: the policy page shows its title twice (page banner + the content's own `<h2>`).
  Remove the `<h2>` from the page content in admin Static Pages if it bothers the user.

## Sep 27 2026 — Cart recovery EMAIL redesigned to match the page (DEPLOYED)

- `order_left_in_cart` email (~8/day; 245 sent in the last 30 days, 58 failed historically) now
  mirrors /recover: dark header + red accent, "Hi <first name>, your cart is waiting", "You left N
  items … today at 1:37 pm" + step-aware line, the Cart → Address → Payment → Order progress bar,
  product rows **with photos**, links, "In stock"/"Unavailable", per-unit price incl. GST, items
  total vs total with GST & delivery, one bulletproof button (label = "Continue to checkout" /
  "Resume checkout" / "Complete your order" / "Try payment again"), trust badges, WhatsApp help
  box (falls back to a tel: link if no WhatsApp number). Table layout + inline styles only
  (Outlook/Gmail safe); the old template used display:flex.
- New `backend/src/modules/abandoned-cart/recovery-email.builder.js` builds all variables;
  `runReminderDispatch` uses it (old variables block kept commented). The WhatsApp early-nudge and
  WhatsApp reminder templates are unchanged and still get the same values.
- `marketing.model.js`: new default body/subject via its own `recoveryEmailShell` (the shared
  `emailShell` used by every other email is untouched); new TEMPLATE_VARIABLES firstName,
  itemsTotal, itemCountText, leftAtText, resumeLine, ctaLabel, progressHtml. Old design kept as
  `order_left_in_cart_v1_reference` (not in TEMPLATE_KEYS, never sent/listed).
- **Rollout:** the new subject makes `ensureTemplateCoverage` replace the stored copy because no
  admin ever edited it (`updatedAt: null`, checked on live). That happens on the next marketing
  store read — i.e. just before the next reminder email is sent. If an admin later edits the
  template in Marketing, their version wins (tested).
- Admin Marketing → Preview for this template now fills realistic sample data (2 real products,
  progress bar) instead of blank rows (`buildRecoveryEmailPreviewSample` in marketing.service).
- Backups: `/root/jenix-bak-2026-09-27-recovery-email/backend-files.tgz`. Regression checks pass;
  the regression-sent email rendered in the new design with 0 unfilled placeholders.

## Sep 27 2026 — Cart recovery page redesigned (/recover/:token) (DEPLOYED)

User: the page behind the "you left something in your cart" link wasn't convincing. The old page
used internal wording ("Recovery link", "Stage: Cart Added", "Restore to This Device", "Snapshot from
the last tracked cart activity"), no product photos, a ₹ total that didn't match the items, and a
"What Stopped You?" survey in the middle.

- New `apps/front/src/modules/recovery/recovery-resume-page.jsx` + `recovery-parts.jsx`; the router
  points `/recover/:recoveryToken` at `RecoveryResumePage` (old import kept commented; old
  `recovery-page.jsx` unchanged — switching back is a one-line router change).
- Page: "Welcome back, <first name>", "You left N items … earlier today at 12:35 pm", a 4-step
  progress bar (Cart → Address & delivery → Payment → Order placed) marking **where they stopped**,
  product photos + links + "In stock"/"Currently unavailable", price per unit **incl. GST** (the old
  "1 × ₹11 = ₹12.98" looked wrong), items total vs "cart total with GST & delivery", one sticky
  CTA whose label depends on the step ("Continue to checkout" / "Resume checkout" / "Complete your
  order" / "Try payment again"), trust badges, WhatsApp/call help (WhatsApp prefilled with the
  items), and the feedback survey collapsed at the bottom with friendlier reasons. Friendly screens
  for expired (410) / invalid (404) links and for already-ordered carts.
- Restore flow unchanged: `restoreRecoveryCart` then navigate to `/checkout` (resuming the checkout
  session when there was one).
- Backend (`getPublicRecoveryPreview`, additive): `itemDetails` {imageUrl (same first-image rule as
  the cart), slug, available, stockStatus} and `resumePoint` (cart/checkout/payment/payment_failed/
  ordered — derived from checkoutSessionId/paymentAttemptId/failureReason, because the
  "abandoned" stage overwrites where they stopped).
- Deployed: backend backup `/root/jenix-bak-2026-09-27-recovery-page/`; storefront
  `apps/front/dist.bak-20260927-recovery-prev` (pre-redesign). Older `dist.bak-20260917-100600`
  still there — delete later per one-backup rule once the user confirms.

## Sep 27 2026 — Dashboard: trend toggle, clickable tiles, product visits vs sales (DEPLOYED, commit `dffc6c1`)

- **Order Trend** (`dashboard/order-trend-chart.jsx`, `GET /admin/dashboard/trend?range=week|month|year`):
  7 daily / 30 daily / 12 monthly bars (IST), Orders ↔ Sales ₹ toggle. "Sales" = all non-cancelled
  orders; "Paid" = paymentStatus paid (the old chart's meaning). Week/Month bars link to
  `/orders?date=<IST day>`. Old `BarChart` kept in dashboard-page.jsx, unused.
- **Clickable tiles** (only when count > 0): Today's Orders/Revenue → `/orders?date=<todayIstDate>`,
  Pending Payments → `/orders?tab=pending`, Low/Out of Stock → `/products?stock=attention` (new
  "Low + Out of Stock" filter option). Orders page reads `?tab`/`?date` on load; its date filter now
  compares the **IST** day (was UTC slice → 00:00–05:29 IST orders showed under the previous date).
- **Pending Payments tile** now counts with `resolveAcceptanceStatus` (exported from orders.service)
  = exactly the Orders "Payment Pending" tab. Old `isPendingPayment` also counted failed online
  payments, so tile and tab disagreed. The number can drop after this change — that's the fix.
- **Product Page Visits vs Sales** (`dashboard/product-performance-panel.jsx`,
  `GET /admin/dashboard/product-performance?range=7d|30d|90d|365d`): views, unique visitors,
  website orders/units/revenue (walk-in + cancelled excluded), conversion = orders ÷ visitors,
  flags ("High visits, low sales", "Converting well").
  - Counting: `recordProductView` in `products.controller.publicGetProductBySlug` (storefront calls it
    once per product page view). Bots filtered by UA; unique visitor ≈ hash(ip+UA) per product per
    IST day, in memory (resets on restart → slight overcount).
  - Store `database/product-views-store.js` → `json/product-views-store.json`, designed per the rules
    below: `{days:{"YYYY-MM-DD":{productId:{v,u}}}}`, in-memory, flushed every 30 s, 400-day
    retention. A page view never touches disk. A restart can lose ≤30 s of counts.
  - Tracking started 2026-09-27 (one deploy-check view on that day came from the deploy script).
    The panel says so until a full period has passed.
- Backups: `/root/jenix-bak-2026-09-27-dashboard/backend-files.tgz`; admin
  `apps/admin-panel/dist.bak-20260927-dashboard-prev` (older `dist.bak-20260924-editfix-prev` to be
  deleted once the new dashboard is confirmed — one-backup rule).

## Sep 27 2026 — Backend "crashing again and again": pm2 memory restarts, root cause fixed (DEPLOYED, commit `83ca900`)

Symptom: `jenix-backend` restarted 15–27×/day (517 total). Not crashes — every exit is `code 0 via SIGINT`
from pm2: `[PM2][WORKER] Process 4 restarted because it exceeds --max-memory-restart value` (600M; one
sample 1,066 MB). Each restart = a few seconds of API downtime + any in-flight request (cart, checkout,
payment confirm) fails.

Root cause: `recovery-store.json` had grown to **32.6 MB / 25,728 records**, 24,602 of them junk (empty
cart, anonymous, expired, never reached checkout, never reminded). `getCart()` runs on every page view
(header loads the cart) and calls `trackCartSaved` → `writeTrackedRecovery`, which for an empty cart
found no *open* record (all prior ones already expired) and so **created a new, instantly-expired record
every time** (~550/day), then re-parsed + rewrote the whole 32 MB file — ~150–300 MB heap per call;
two or three concurrent page views blew past 600 MB.

Fix:
- `abandoned-cart.service.js` `writeTrackedRecovery`: empty cart + no existing record (by payment
  attempt / checkout session / open-by-owner) → `return null`, no create, no write. An existing open
  record is still found and closed exactly as before (`deleteCartItem` relies on the next `getCart`
  to close it). No caller uses the return value (checked).
- New `VPS/scripts/archive-empty-recoveries.js` (`--dry-run` supported): moves junk records to
  `recovery-store.archive-<date>.json`, verifies the archive, then atomically rewrites the store. Must
  run with the backend stopped.
- Run 2026-09-27: 24,603 archived → `backend/src/database/json/recovery-store.archive-2026-09-27.json`
  (23 MB, not loaded by the app), 1,126 kept; store 33.4 MB → 2.3 MB. Downtime ~9 s (pm2 stop/start).
  Backups: `/root/jenix-bak-2026-09-27-memfix/`.
- Verified: online, API/cart 200, empty guest cart creates no record, memory 166–277 MB over 2 min,
  no memory restarts. Regression checks pass locally.
- Side effect: admin "Abandoned Cart Report" `recoveryCount` drops sharply — it was counting the
  empty junk; recovered/reminder counts unchanged.

**Follow-up same day — ₹0 rows in admin Abandoned Carts (DEPLOYED, commit `83ca900`):** 533 kept records
showed 0 items/₹0. (a) 504 were the same getCart junk but for logged-in customers (the first cleanup only
took anonymous ones). (b) 29 were real carts that reached checkout — 9 of them "recovered" with an order
(e.g. JNX-ORD-20260731-00006 ₹20,862) — whose saved cart was **overwritten by an empty cart**: the live
cart is cleared when an order is placed (`clearOwnerCart` in startCheckout for manual payments and after
online payment), and the next page view's getCart → writeTrackedRecovery replaced items/value with the
empty snapshot. Fix in `writeTrackedRecovery`: when the new cart is empty and the record has items, keep
the last known cart (record still closes as before), never downgrade a `recovered` record, and set
`expiredAt` (was left null). New `VPS/scripts/repair-recovery-store.js` (dry-run by default, `--apply`):
refilled the 29 from their checkout sessions, archived 489 logged-in created-empty records to
`recovery-store.archive-2026-09-27-b.json`. Result: 638 records, 60/60 recovered carts with value,
15 zero-value left (logged-in carts wiped by the old bug with no checkout session to rebuild from).
Backups: `/root/jenix-bak-2026-09-27-repair/`. Regression checks pass.

**Why it happened — NOT a recent change; latent since the feature was written.** `git log -S` shows every
piece dates from the original abandoned-cart work on **2026-05-26**: `getCart → trackCartSaved` on every
cart fetch, `writeTrackedRecovery` creating a record for an empty cart and overwriting the saved cart
with an empty snapshot (commit `58d7141` "phase 12"), and `clearOwnerCart` at order time (`f5deeab`
"phase 11"). It stayed invisible while traffic was tiny; after the late-July move to the new VPS real
traffic arrived (records/month: Jul 1,360 → Aug 12,295 → Sep 12,073) and the file grew ~550 junk
records/day until memory broke. The Sep 16 memory-ceiling bump (WhatsApp entry below) raised the limit
and masked the growth for a while — it treated the symptom.

**Rules so it doesn't repeat:**
1. **Never write to a store from a read path.** `getCart` (called on every page view) must not create
   or rewrite records. Tracking belongs on real state changes (add/update/remove item, checkout, payment).
2. **Never create a record for an empty/nothing state.** Check "is there anything to track?" before
   `findOrCreate`-style helpers.
3. **Never overwrite a meaningful snapshot with an empty one.** Closing/expiring a record must keep what
   it recorded; admin reports and recovery depend on it.
4. **Every append-only JSON store needs a retention/cleanup path** from day one (archive, not delete).
   Known unbounded ones to watch: recovery-store, marketing-store notificationLogs, payment-store
   processedWebhooks, activity logs.
5. **Check store sizes when adding a feature and after traffic grows.** Any JSON store > ~5 MB that is
   read per request is a memory risk (whole file parsed each time; ~5–10× its size in heap).
   Quick check: `ls -la --block-size=K /root/projects/jenixindia/VPS/backend/src/database/json/`.
6. **pm2 restarts are a signal, not noise.** `exited with code [0] via signal [SIGINT]` + "exceeds
   --max-memory-restart" in `/root/.pm2/pm2.log` = memory problem. Find what grows before raising
   `max_memory_restart`.

Watch: `grep -a -c "exceeds --max-memory-restart" /root/.pm2/pm2.log` was 3842 at deploy time —
it should stop climbing. If restarts continue, look at other large stores (auth/marketing/catalog
~3.5 MB each are fine) and at concurrent read-modify-write of the recovery store (not locked).

## Sep 26 2026 — ⚠️ PENDING (user will do later): VPS DNS fix — every outbound call randomly stalls 5 s

**Status: NOT APPLIED.** User was given the commands and said they'd apply
it later. A first attempt on Sep 26 did not land on this VPS (config,
`resolv.conf` and backup file all unchanged — probably ran on the old VPS
154.61.69.200 by mistake). Auto-mode blocked Claude from applying it itself
(shared infra — CLAUDE.md rule 4), so the user runs it.

**Problem (measured on 103.118.183.243):** `/etc/resolv.conf` lists
`nameserver 4.2.2.4` then `8.8.4.4`. `4.2.2.4` drops ~half of DNS queries, so
each dropped lookup waits the 5 s resolver timeout before falling back to
`8.8.4.4` (which answers in 3–4 ms). `getent ahostsv4 api.razorpay.com` x10
→ `5015 79 5012 5014 5015 74 5013 5015 5012 5013` ms. Same for
smtp.gmail.com, api.cashfree.com, web.whatsapp.com, apiv2.shiprocket.in,
fcm.googleapis.com (all ~5 s).

**Impact:** every app on this VPS (jenix, fireguard, floodguard, sitemitra,
smartpos, jenibooks) gets random +5 s on outbound calls — emails, WhatsApp,
payment gateways, courier APIs, FCM push, dnf, certbot. Most visible symptom:
**checkout "create-attempt" takes ~6 s** (pm2 log shows `create-attempt 201
~6000 ms` on every checkout), because creating the Razorpay order waits on
DNS. Slow create-attempt also widens a stale-write window: that function
reads auth-store, awaits Razorpay, then writes — other auth-store writes in
those seconds can be overwritten.

**Fix — run as root on 103.118.183.243** (check `hostname -I` first):
```bash
cp -p /etc/sysconfig/network-scripts/ifcfg-ens192 /root/ifcfg-ens192.bak-dns
nmcli con mod ens192 ipv4.dns "8.8.8.8 1.1.1.1 8.8.4.4"
nmcli device reapply ens192
grep nameserver /etc/resolv.conf
for i in 1 2 3 4 5 6; do s=$(date +%s%N); getent ahostsv4 api.razorpay.com >/dev/null; echo "$(( ($(date +%s%N)-s)/1000000 ))ms"; done
```
Expect nameservers `8.8.8.8 / 1.1.1.1 / 8.8.4.4` and lookups of a few ms.
`resolv.conf` is generated by NetworkManager (connection `ens192`, file
`ifcfg-ens192`, `PEERDNS=no`) — don't hand-edit `resolv.conf`, it gets
overwritten. `reapply` changes DNS without taking the interface down.

**Rollback:** `nmcli con mod ens192 ipv4.dns "4.2.2.4 8.8.4.4" && nmcli device reapply ens192`

**Effect on other projects:** nothing restarts or shuts down; nginx, pm2,
MongoDB, SSL untouched; inbound visitor traffic doesn't use this setting.
Outbound calls for every app just stop stalling. No RAM/CPU change (only a
config line; no new service runs).

**After applying:** re-run the timing loop above, and check pm2 log —
`POST /api/payments/create-attempt` should drop from ~6000 ms to well under
1 s.

## Sep 26 2026 — nginx upload limits raised: jenix API + sitemitra (APPLIED on VPS, user-approved)

Trigger: user reported sitemitra app showing "Network Error". Not a crash —
`sitemitra-api` online 6+ days, 2 restarts total, empty error log. nginx
error.log showed `client intended to send too large body: 4399711 bytes`
on `POST /api/technician/photo` (2x, 12:47): sitemitra.conf `/api/` block had
`client_max_body_size 1m` while its backend multer allows 10 MB. nginx's 413
carries no CORS headers, so the mobile app only sees "Network Error". Same log
showed 3 rejected jenix POD uploads (`/api/admin/shipping/shipments/*/pod`):
the `api.jenixindia.com` block had no limit (nginx default 1 MB) while the
backend allows 5 MB (POD/images, `MAX_UPLOAD_SIZE_BYTES`) and 25 MB (customer
print uploads) — so large print uploads were silently failing too.

Changed (user explicitly approved touching shared nginx + sitemitra conf):
- `/etc/nginx/conf.d/sitemitra.conf` line 25: `1m` → `12m`
- `/etc/nginx/conf.d/jenixindia.conf`: added `client_max_body_size 25m;`
  inside the `api.jenixindia.com` `location / {}`
- `nginx -t` ok, reloaded. All 8 sites 200/302 after. 4.5 MB test uploads to
  both endpoints now reach the apps (401 unauthenticated) instead of 413.
- Backups: `/root/nginx-bak-2026-09-26/{sitemitra,jenixindia}.conf`
  (outside conf.d on purpose). Rollback = copy back + `nginx -t && systemctl reload nginx`.

Still open (sitemitra app, not touched): its backend comment says the app
compresses photos before upload, yet a 4.4 MB photo arrived — check the
app's compression. Jenix product-video uploads (multer 200 MB) are still
capped at 25 MB by nginx — raise only for that route if ever needed.

## Sep 26 2026 — Razorpay webhook fix + no-double-order lock (DEPLOYED, commit `8f5efc6`)

Trigger: customer Shubh Agarwal (₹5,096, `order_TgImlyUQndKhgQ`, Sep 25
~7:55 PM IST) — Razorpay showed a refund. **Not our bug:** Razorpay API shows
0 payments on that order; a separate UPI payment `pay_TgIpWm2lD1nMb6` came
in at 7:58:30 PM with **no order attached** and was auto-refunded 2 s later,
reason *"The checkout order associated to the QR is closed"* (buyer paid a QR
after the checkout window had closed). Refund status `processed`. Customer
to be told to re-order.

Real bug found while investigating: **every real Razorpay webhook returned
400** (`Invalid payment webhook payload`). `razorpay.gateway.js` read
`attemptId` from the *payment's* notes, but we only set it on the Razorpay
*order's* notes; payments have no `receipt`. So the webhook safety net never
worked — orders were created only if the browser called `razorpay-confirm`.
Fixed:
- `handleWebhook`: `payment.captured` → returns `gatewayOrderId`
  (`payment.order_id`); every other event (incl. `payment.failed`) →
  `{ ignored: true }` → 200. `payment.failed` deliberately stays
  browser-handled (buyer can retry in the same window; acting on it would
  send "payment failed" messages to buyers who then succeed).
- `processPaymentWebhook`: matches attempt by `gatewayOrderId` when there's
  no `attemptId`; signed events with no matching attempt (payment links,
  standalone QR) → 200 ignored instead of 400.
- New `modules/cart-checkout/payment-finalize-lock.js`: confirm (razorpay +
  cashfree), webhook, mock webhook and `cancelPaymentAttempt` are wrapped at
  the service's `module.exports` so they run one at a time (single pm2 fork
  process → in-process queue is enough; 30 s max hold). Without it, confirm
  + webhook for the same payment could both create an order. Separate from
  the existing `withAuthStoreLock` (cart lock) on purpose — that one isn't
  re-entrant, reusing it could deadlock.
- Razorpay client built via `createRazorpayClient()` with a keep-alive
  agent. Its `family: 4` is ignored by axios — the 6 s delay is the DNS issue
  above, not IPv6 (first theory, disproved by measurement).
- Regression checks: native Razorpay payloads (order.paid / payment.failed /
  unmatched QR → 200 ignored; confirm + payment.captured concurrently → same
  single order). All pass.
- Verified live: signed ignorable webhook → 200; bad signature still
  rejected (500, same as before). Backend online, no errors.

**Pending:** VPS backups `backend/src/integrations/payment-gateways/razorpay.gateway.js.bak-webhook`
and `backend/src/modules/cart-checkout/cart-checkout.service.js.bak-webhook`
— delete once a real Razorpay order is confirmed working (one-backup rule).
Pre-existing, not touched: bad-signature webhook returns 500 not 400
(`handleWebhook` throws a plain Error).

## Sep 26 2026 — Shree Maruti tracking links fixed (DEPLOYED, commit `11cc707`)

Customers' "Track" links were dead. Courier profile template was
`https://www.shreemaruti.com/tracking.aspx?awbnumber={awb}` — that page 404s,
and the provider only filled `{trackingId}`, so links had a literal `{awb}`.
Built-in default `shreemaruticourier.com/tracking.php?awb=` 301s to the
homepage. New `database/legacy-tracking-urls.js` rewrites both to
`https://shreemaruti.com/track-shipment/?awb=<AWB>` on read (integrations
store persisted; shipping store in-memory, persisted on next write), fills
`{awb}`/`{{awb}}` placeholders, and patches existing shipments with their own
AWB (37 live Shree Maruti shipments verified). User confirmed tracking works.
Backups deleted. Customers who got the old broken link need the shipping
notification resent.

## Sep 24 2026 — Walk-in "Repeat Order" button (DEPLOYED, committed 2026-09-27 `7b22b4a`)

Ask: a repeat walk-in customer (Binary Infom) meant re-entering the whole
order by hand. Added a **Repeat Order** button on every Walk-in Orders
row (any status, including paid/completed/cancelled, gated on
`orders.create`). It opens `/walk-in-orders/add?repeatFrom=<orderId>`
pre-filled with the same linked customer, products, qty, per-line
discount %, shipping method and payment method. Mark-as-paid, payment ref
and note start fresh. Nothing is saved until the admin clicks Save.

- **Price rule (user decision):** every line carries over **last price
  paid** as an editable `custom` price. Under each line: "Last: ₹X × qty ·
  today ₹Y" plus a **"Use today's price"** link that restores the line's
  original price mode. Deleted/inactive products are dropped and listed in
  red in the banner. There's a low-stock hint when available < last qty.
- **Double-discount trap avoided:** order detail's `unitPriceUsed` is
  *post*-discount (`taxableValue / qty`), so the last gross price is
  rebuilt as `(taxableValue + discountAmount) / qty`
  (`walkin-order-prefill.js → resolveLastGrossUnitPrice`).
  The Edit Order flow had this exact bug: it pre-filled
  `customUnitPrice = unitPriceUsed` for custom lines, so editing an unpaid
  order with custom price + discount applied the discount twice. **Fixed +
  deployed the same day.** The edit loader now uses
  `resolveLastGrossUnitPrice(item)` (old line kept as a comment).
  User confirmed Repeat Order works on the live site.
- Backend: optional `repeatedFromOrderId` on create (omitted from the
  update schema). The order stores `repeatedFromOrderId`/`…No`, the list
  shows "Repeat of JNX-…", and the activity log records it.
- Files: new `apps/admin-panel/src/modules/walkin-orders/walkin-order-prefill.js`;
  additions only in `add-walkin-order-page.jsx`, `walkin-orders-page.jsx`,
  backend walk-in `validator/service/model`. `check:backend` passed.
- Deploy: the 3 backend files were copied individually (md5-verified), the
  admin dist was built locally and swapped atomically, restorecon ran,
  pm2 restarted clean. Backups: `/root/deploy-bak-20260924-repeat/`
  (backend, pre-Repeat-Order versions). Admin dist backups were rotated
  after user confirmation: the only one left is
  `admin-panel/dist.bak-20260924-editfix-prev`, the Repeat Order build
  that was live just before the edit fix. The Sep 17 and pre-repeat admin
  backups were deleted. Storefront keeps its single
  `dist.bak-20260917-100600`.

### Local vs VPS comparison (same day) — important for future deploys

- **All backend JS on VPS == local working tree**, except
  `backend/src/checks/run-regression-checks.js`. The VPS copy is older
  (Aug 17); local kept; the VPS copy is parked in
  `VPS/extra-pages/vps-older-2026-09-24/`.
- **Live admin + storefront `dist/` are byte-identical to builds of the
  local working tree** (verified by content-hashed asset names). So the
  many "uncommitted" local changes (tally export, orders, products,
  shipping, checkout, etc.) are **already live, just never committed**.
  Committed `HEAD` alone does not even build: `orders-page.jsx` imports
  `resendInvoice`, which only exists in the uncommitted `orders.api.js`.
- **The VPS's own admin/storefront *source* is stale** (VPS git HEAD
  `53076ef`). Never build the frontends on the VPS; build locally and
  upload `dist/`.

## Sep 24 2026 — Admin password reset (VPS only, no code change)

User forgot the admin panel password and asked for a reset. The only
staff account is `admin@jenixindia.com` (super_admin). Updated its
`passwordHash` (bcrypt, cost 10) straight in the live
`backend/src/database/json/auth-store.json` on the new VPS. The script
wrote a temp file and renamed it over the store. No restart was needed
because the backend reads the store from disk on every login. Checked
with a real `POST https://api.jenixindia.com/api/auth/admin/login` →
200. Backup of the store from before the change:
`/root/auth-store.pre-pwreset-<epoch>.json` on the VPS (safe to delete).
The new password is intentionally **not** recorded here (this file is
tracked in git). Ask the user if needed. This HANDOFF update was also
left uncommitted at the user's request.

## Sep 17 2026 — MDR pass-through pricing, replaces direct-payment discount (CODE DEPLOYED, FEATURE STILL OFF — real-order test required before toggling on)

Recent MDR-charge changes mean manual UPI collection may no longer be
free to the merchant, so the old model (silently discount 2% for
buyers paying by bank transfer/manual UPI, funded by the PG fee the
merchant saves) no longer reflects reality. Replaced with a
transparent add-on model at the user's request: Subtotal → GST → Gross
Total, then **+ MDR for whichever payment method the buyer picks + GST
on that MDR** = Total Payment. Buyer sees the real add-on cost per
method and chooses freely; no more silent discount messaging.

**Status**: code complete, committed (`2bfedd6`, `8d69d14`), pushed to
`origin/main`, and **deployed to the new VPS** (103.118.183.243) on
2026-09-17 — 12 backend files copied individually (md5-verified, no
`git pull`, since the VPS has its own uncommitted local diffs that must
not be disturbed), both admin-panel and storefront rebuilt fresh and
their `dist/` folders atomically swapped in, SELinux context fixed,
`jenix-backend` restarted clean (no crash, memory normal), smoke-tested
(storefront/admin/API/SSR product page all 200, real live traffic
flowing normally after restart). Pre-deploy backups kept on the VPS
(`dist.bak-20260917-100600` for both apps, `payment-store.json.bak-
20260917-100600`) and pre-deploy backend file versions reconstructed
from git — not yet deleted, safe to remove once the team is confident
nothing needs rolling back.

Defaults to fully OFF (`mdrCharges.enabled: false`) everywhere — no
buyer sees any change right now, even though the code is live in
production, because the feature is inert until the toggle is switched
on.

1. **New settings** (`payment-gateways.model.js`/`.service.js`):
   `mdrCharges` config, 3 buckets — UPI, Payment Gateway (online), Bank
   Transfer (NEFT/RTGS/IMPS) — each with its own MDR% and GST-on-MDR%,
   admin-editable (not hardcoded, since this is exactly the kind of
   rate that changes again). Default rates: UPI 0.4%/18%, Payment
   Gateway 2.5%/18%, Bank Transfer 0%/18%.
2. **"Expose Payment MDR to Buyer" toggle** — Admin panel → Discounts &
   Coupons → Payment Processing Charges (MDR). This is the master
   switch (`mdrCharges.enabled`) — while off, zero MDR is added
   anywhere (checkout, invoices, walk-in orders); rates stay
   pre-configured and ready. **User's plan: flip this on around
   2026-10-15** — no further dev work needed to do that, just toggle it
   in the admin UI.
3. **Pricing math**: `calculatePricing` (storefront,
   `cart-checkout.service.js`) and `calculateWalkInPricing` (walk-in,
   `walkin-orders.service.js`) both fold MDR + GST-on-MDR into
   `grandTotal`, computed on the full pre-MDR gross total (goods + GST
   + shipping + shipping GST), mirroring exactly how shipping is
   already folded in. Walk-in's `online_payment_link` method maps to
   the "online" bucket; `cash`/`cheque`/`credit_pay_later` get no MDR
   (no electronic processing fee involved). Old
   `directPaymentDiscount` discount mechanism left fully intact in
   code (not deleted) — just inert while its own `enabled` flag is off.
4. **Invoice**: MDR shows as a genuine taxable line item — own SAC code
   **997158** (confirmed with the business's CA, not a guess), flows
   into CGST/SGST/IGST automatically via the exact same
   `buildShippingItemSnapshot`-style mechanism already used for
   shipping (`invoices.service.js`).
5. **Frontend**: checkout page, order-detail modal, and admin order
   detail all show the transparent MDR/GST-on-MDR breakdown when
   present. Cart page's old hardcoded "save 2%" teaser replaced with a
   neutral note (cart page doesn't know the payment method yet, so it
   can't show a real number). Walk-in admin order page's on-screen
   preview mirrors the exact same MDR math as the backend — this
   parity was the critical piece given walk-in's payment-method-based
   pricing already caused a real bug once (see 2026-09-10 discount
   removal below).
6. **Found and fixed 3 instances of the same "pricing whitelist" bug
   class** while wiring this up: `sanitizeCartView`
   (`cart-checkout.model.js`), the admin orders pricing sanitizer
   (`orders.service.js`), and the walk-in order summary sanitizer
   (`walkin-orders.model.js`) all silently drop any pricing field not
   explicitly listed in their return object — exactly the same pattern
   that once silently dropped `shippingGstAmount` for 25 of 27 orders
   in August (see that fix further below). All three now carry the new
   MDR fields through. **Whenever a new pricing field is added
   anywhere in this codebase, check for this exact trap** — the field
   can be computed correctly everywhere upstream and still vanish in
   an API response because of one of these whitelists.
7. **Verified via an isolated local dry run** (not the shared
   `pnpm run check:backend` suite — a separate one-off script): real
   HTTP checkout with a ₹15,000 test product, all 3 payment methods
   priced correctly, a full manual-UPI payment verified end-to-end,
   invoice fetched and reconciled exactly (Taxable Value + Tax + Round
   Off === Grand Total), walk-in orders for both `online_payment_link`
   and `cash`, and toggle-off confirmed to zero MDR everywhere. This is
   what caught bug #6 above — the isolated arithmetic check done first
   would not have caught it.
8. **Not done yet**: Tally export (`tally-export.service.js`) doesn't
   know how to categorize the new MDR invoice line item —
   deliberately left untouched since that file was already mid-edit
   from unrelated work in this same session's working tree. It won't
   miscategorize anything, the line will just be silently absent from
   GST-books export until this is addressed.
9. **⚠️ BEFORE flipping "Expose Payment MDR to Buyer" ON (planned
   ~2026-10-15): a real order test is still required**, not yet done.
   Code is deployed and verified via an isolated local dry run only —
   that dry run used a mock gateway, not a real one. Specifically still
   needed, in this order:
   - Enable the toggle on the **live** VPS (or a controlled test
     window) and place one real order through the actual configured
     online gateway (Razorpay/Cashfree, whichever is enabled) with a
     small real amount, for the "online" MDR bucket.
   - Confirm the amount **actually charged by the gateway** (what the
     buyer's card/UPI app shows, and what the gateway's own dashboard
     records) matches `order.grandTotal` **exactly** — this is the one
     number that must never silently mismatch, since it's real money
     leaving the buyer's account. The dry run only confirmed internal
     consistency (order/invoice math agreeing with itself), not that
     the gateway is actually told to charge the post-MDR amount.
   - Also do one real manual UPI order and one real bank-transfer
     order to see the live checkout page and printed invoice exactly
     as a real buyer/the admin would.
   - Check the invoice PDF under both an intra-state and inter-state
     buyer address (CGST+SGST vs IGST split) — the local dry run tested
     one buyer address only (Delhi, came out inter-state relative to
     the seller by chance).
   - Only after all of the above look correct on a real order, flip
     the toggle on for real.
10. **Also not done yet**: Tally export categorization gap (item 8
    above) — resolve before relying on GST-books export once the
    feature is switched on, since MDR revenue/tax won't appear there
    otherwise.

## Sep 16 2026 — WhatsApp crash-loop root cause + fix, memory ceiling bump (DEPLOYED)

`jenix-backend` on the new VPS was crash-looping — 328+ pm2 restarts in
a single day, roughly every 30-90 seconds, taking the *entire* shared
commerce backend down each time (not just WhatsApp). Root-caused and
fixed:

1. **Real cause**: Baileys (`@whiskeysockets/baileys`, the WhatsApp
   library) defaults to decrypting and processing every chat-history
   sync blob offered on each reconnect
   (`shouldSyncHistoryMessage` defaults to `() => true`). On the
   paired number's real chat history, this repeatedly spiked memory
   past pm2's `max_memory_restart` ceiling (350M at the time). The
   "Bad MAC" decrypt errors filling the logs were a **symptom**, not
   the cause — each restart interrupted the sync mid-way, corrupting
   session state further, so it never once completed cleanly.
2. **Fix**: `whatsapp.service.js` now passes `syncFullHistory: false`
   and `shouldSyncHistoryMessage: () => false` to `makeWASocket()` —
   this account only ever sends order/cart notifications, so it never
   needs the counterparty's chat history.
3. **Separate finding while verifying the fix**: even with WhatsApp
   fully disconnected, a real crawler/bot traffic burst
   (`/prerender/products/*`, `/api/categories`, `/api/products`
   hit repeatedly) independently pushed memory to 446M — confirming
   350M was too tight for this app's own baseline+traffic peaks
   regardless of WhatsApp. Backend re-reads/re-parses the JSON catalog
   store on every request with no in-memory caching, so concurrent
   bursts cause transient spikes. **Not fixed** (would mean adding a
   caching layer — bigger change, not requested yet); only mitigated
   by raising `max_memory_restart` from 350M → 600M in
   `ecosystem.config.cjs` (VPS RAM headroom confirmed fine — whole box
   was at ~20% usage). If restarts under load resume even at 600M,
   the catalog-read caching is the real next step, not a further ceiling bump.
4. **Operational side-effects of the incident response** (both done
   directly on the VPS, not via code): the corrupted WhatsApp session
   at `backend/src/database/whatsapp-session` was moved aside to
   `whatsapp-session.bak-20260916` (not deleted) rather than left in
   place — **WhatsApp needs a fresh QR re-pair via the admin panel**,
   user was told and will do this themselves. `pm2 save` was run after
   the ecosystem config change so the new ceiling survives a VPS reboot.
5. While investigating, also confirmed via live `pm2 list` on both
   VPS what other projects actually share each box — see
   `project_jenix_vps_migration` memory for the full current list;
   the new VPS (103.118.183.243) is **not** jenix-only as previously
   assumed — it also runs fireguard-api, floodguard-api, sitemitra-api,
   smartpos-api.

## Aug 29 2026 — Support case: order `JNX-ORD-20260829-00039` invoice (₹4,214) vs. amount buyer paid (₹4,318) — NOT A BUG, no code changed

User asked why this order's invoice/payment-demand amount (₹4,214) didn't
match what the buyer actually paid (₹4,318). Investigated at length
(walked through `walkin-orders.service.js`'s `ensureWalkInOrderInvoice` /
`forceRegenerate` staleness-on-edit logic, which turned out to be a red
herring — that logic already works correctly and wasn't the cause here)
before the user identified the real story from talking to the buyer
directly:

1. Buyer started checkout via the payment gateway (PG), which correctly
   quoted **₹4,318 — the full price, no discount** (this order's PG
   flow doesn't apply the manual-payment-method discount, see below).
2. PG's **mobile web view** tried to hand off to a UPI app on his phone;
   he had none installed, and — unlike the **desktop** PG view — mobile
   doesn't offer a fallback scannable QR code. He got stuck mid-checkout.
3. He contacted the store directly; admin sent him the store's own manual
   UPI QR code (out-of-band, not through the PG) and he paid **₹4,318**
   against that.
4. Admin manually verified the payment. Since this ended up being paid by
   a **non-PG method** (direct UPI to the store, not through the
   gateway), the order correctly got the **PG-fee-passthrough discount**
   (₹87.48, ≈₹104 after GST) applied when booked/invoiced — landing on
   **₹4,214**, exactly ₹104 less than what he paid via the PG's own
   quote.

**Confirmed by the user as working as intended, not a bug**: the
discount in question only ever applies for non-PG payment methods — it's
how PG processing-fee costs are passed on as savings to buyers who pay
by bank/UPI transfer directly instead of through the gateway. The buyer
was never overcharged; he simply paid the PG's own (correct, undiscounted)
quoted amount via an alternate channel, and then received the discount
he was entitled to once verified as a non-PG payment. No refund owed, no
checkout/pricing code involved, no code changes made.

**If a similar ticket comes up again** ("invoice/demand amount doesn't
match what the buyer paid" for a `manual_upi`/bank-transfer order that
started life as an online PG checkout): check whether the buyer paid via
the PG's own quoted amount (no discount) vs. an out-of-band manual
transfer that later got the non-PG discount applied on verification —
that alone explains a gap of roughly the order's `discountAmount` (grossed
up for GST). Don't re-walk the `walkin-orders.service.js` invoice-
regeneration code for this pattern — it isn't the cause.

**Separately identified real gap, not yet acted on**: manually-verified
payments (`manualPaymentStatus: "verified"`) have no field recording the
*actual amount confirmed* — it's a bare boolean, no amount captured
separately from `order.grandTotal`. Fine for this case since the numbers
were understood after the fact via conversation with the buyer, but there
is currently no way to audit "amount buyer says they paid" vs. "amount
system says was received" for manual-payment orders after the fact,
unlike gateway (Razorpay/Cashfree) orders where the captured amount is in
the payment-store records. Not fixed, not requested — noting it here in
case a future reconciliation task revisits it.

## Aug 26 2026 — Proforma invoice preview + GST-on-shipping fix (walk-in orders) + invoice Taxable Value reconciliation fix (DEPLOYED)

User asked for a way to preview the Proforma Invoice from the Walk-in
Orders list before clicking "Send for Payment" ("so before pressing
button for send for payment we can also see what exactly we are sending
to buyer"). While building that, spotted and asked about two real GST
issues on the resulting invoices.

1. **New "View Proforma" preview** — small link next to the
   payment-status pill on the Walk-in Orders list (any order not yet
   paid/cancelled). Opens the exact rendered invoice HTML in a new tab
   (`window.open("", "_blank")` first, synchronously, then filled in once
   the fetch resolves — avoids popup-blocker issues). Backend: new
   `previewWalkInInvoice` service fn + `GET
   /admin/walkin-orders/:orderId/invoice-preview` — lazily generates the
   Proforma if the order doesn't have one yet (e.g. older orders, or
   `generateInvoice` was left off), idempotent (repeated previews reuse
   the same invoice number, confirmed via test — never duplicates).
   Shared the invoice-ensuring logic with `sendWalkInPaymentRequest` via a
   new `ensureWalkInOrderInvoice` helper.

2. **Real revenue gap, not just display**: `calculateWalkInPricing`
   (`walkin-orders.service.js`) never applied GST to the shipping charge
   at all — unlike `cart-checkout.service.js`'s `calculatePricing`, which
   already does this correctly for regular storefront orders. Walk-in
   buyers were simply never charged the GST due on shipping. Fixed to
   mirror the same blended, value-weighted GST-rate approach (rate
   weighted by each line's taxable value, applied to the shipping
   charge), folded into `order.gstTotal`/`grandTotal` and stored as
   `order.shippingGstAmount`. **This does actually increase what future
   walk-in orders with a non-zero shipping charge charge the buyer** —
   confirmed correct behavior, not a bug, per GST law (freight billed
   alongside goods is taxable).
   - Also fixed a real bug found alongside this: the admin-panel "Save as
     Order" button (unpaid path) was silently forcing
     `generateInvoice: false` regardless of the checkbox, so a fresh
     unpaid walk-in order never got its Proforma generated at creation
     time — only lazily on first "Send for Payment" or "View Proforma".
     Checkbox now only governs the *paid* path (whether to also generate
     the Tax Invoice immediately); unpaid non-draft orders always request
     a Proforma up front again, matching the original design intent.
   - Frontend on-screen pricing preview (`add-walkin-order-page.jsx`)
     updated to include the same shipping-GST math, so what admin sees
     while building an order now matches what gets charged.

3. **Invoice "Taxable Value" row didn't reconcile with Grand Total** —
   confirmed for BOTH order types, not just walk-in. `invoices.service.js`
   printed only the goods taxable value in the "Taxable Value" summary
   row, never folding in the shipping charge — even though shipping's GST
   *is* already included in the CGST/SGST/IGST totals shown right below
   it. Result: manually summing "Taxable Value + Tax + Round Off" on a
   printed invoice came up short by exactly the shipping charge, even
   though Grand Total itself was always correct (this affected regular
   storefront/cart-checkout order invoices too, since their
   `shippingGstAmount` was already being computed and charged correctly —
   this part was a pure display/reconciliation bug there, not a revenue
   gap. For walk-in orders it compounded with bug #2 above, which *was* a
   revenue gap.) Fixed: invoice's `pricing.taxableValue` = goods
   (post-discount) + shipping, standard GST-invoice convention, now
   reconciles exactly. **Scoped to `buildInvoiceDocument` only** (runs
   when generating a NEW invoice) — per explicit instruction, already-
   generated invoices in `invoice-store.json` are untouched, nothing
   about past/already-issued invoices was changed or regenerated.
   Updated one stale regression assertion in `run-regression-checks.js`
   that had encoded the old (shipping-excluded) reconciliation formula —
   this is what caught the fix needing a matching test update, the
   full suite failed once before being corrected.

**Verified end-to-end** against the dev backend: a real walk-in order
with a ₹200 shipping charge (18% GST product) now shows Taxable Value
₹10,200 (₹10,000 goods + ₹200 shipping), CGST+SGST ₹1,836 (includes ₹36
shipping GST), Grand Total ₹12,036 — Taxable Value + Tax + Round Off now
equals Grand Total exactly. `pnpm run check:backend` passing (after the
assertion fix). Committed `3153f5f`, pushed, deployed (backend files
synced individually, admin panel rebuilt/swapped in with
`restorecon -Rv`, new route confirmed live via `401` not `404`).

## Aug 25 2026 — Demand/payment-request WhatsApp now inlines bank details for bank-transfer orders (DEPLOYED)

User asked: when Direct Bank Transfer is the payment method, does the
payment-demand/payment-request message actually send the buyer bank
account number, IFSC, bank name etc. so they can pay by NEFT/RTGS/IMPS?
Checked: the **email** side of this was already correct for both flows
(added in the Aug 23 work below) — verified against real production
gateway config (Union Bank of India, account ending `...0423`, IFSC
`UBIN0825964`, "Accepted Methods: NEFT, RTGS, IMPS, UPI"). Found one real
gap: the regular Orders page's **"Demand for Payment"** button's
**WhatsApp** message (`manual-payments.service.js`,
`demandManualPayment`) only ever included a link back to the order page
for bank-transfer orders — the account details themselves weren't in the
message text, unlike email and unlike the walk-in orders WhatsApp
flow (which already inlines them). Fixed: when
`order.paymentMethod === "direct_bank_transfer"`, the WhatsApp message
now includes a "Please transfer via NEFT/RTGS/IMPS to:" line followed by
the same formatted instructions block (`formatDemandPaymentInstructionsText`)
already used in the email — account holder, bank, account number, IFSC,
accepted methods, beneficiary, and any admin-configured free-text note.

Verified end-to-end with a scratch Node script that mocked
`whatsappService.sendMessage` to capture the actual outgoing message text
against real production bank-transfer instructions (test order + payment
gateway config written to the dev store, cleaned up after) — confirmed
the rendered WhatsApp text contains the full account block, not just a
link. `pnpm run check:backend` regression suite passing. Committed
`f619bfc`, pushed, deployed (backend file synced + `pm2 restart
jenix-backend --update-env`, health-checked). No admin-panel change
needed for this one — pure backend message-formatting fix.

## Aug 23 2026 — Walk-in Orders: per-line discounts, Proforma workflow, customer save, payment-request send, full order editing (DEPLOYED)

User's asks, in order: "give option of discount for each product basis"
on walk-in orders; walk-in orders should "remain in PROFORMA Invoice
until payment receipt is not confirm[ed]"; a "Save customer" option so
re-entering the same customer isn't needed if an order doesn't get
confirmed; an option to "send to customer for payment" once an order is
saved, by email (subject exactly **"PROFORMA Invoice for Payment
Request"**) and WhatsApp; and, raised mid-session, a way to edit an
order that was created/saved earlier but never confirmed.

**Backend** (`backend/src/modules/walkin-orders/`):
- `buildWalkInLine` (`walkin-orders.service.js`) now takes a per-line
  `discountPercent`, applied to the gross line subtotal *before* GST and
  before the existing automatic payment-method discount
  (`calculateWalkInPricing`) — the two stack rather than needing
  reconciliation. Validated 0-100 in `walkin-orders.validator.js`.
- `createWalkInOrder`'s unpaid branch now always generates a Proforma
  Invoice immediately (previously: no invoice at all until paid) —
  `ensureInvoiceForOrder`'s existing `documentType` derivation (purely
  from `order.paymentStatus`) naturally produces `proforma_invoice` while
  unpaid and re-derives `tax_invoice` once payment is confirmed, so no
  new branching was needed there.
- New `saveWalkInCustomer(payload, actor)` — standalone customer save,
  independent of placing an order, reusing the same dedup-by-email/mobile
  logic `createWalkInOrder` already used inline. `POST
  /admin/walkin-orders/customers`.
- New `sendWalkInPaymentRequest(orderId, actor)` — ensures a Proforma
  exists (generates one if `generateInvoice` was left off at creation),
  then calls `notifyCustomerEvent` with a new `walkin_payment_request` /
  `walkin_payment_request_whatsapp` template pair
  (`marketing.model.js`, subject **"PROFORMA Invoice for Payment
  Request"**, exact string per the user's ask), with payment instructions
  pulled from `settings.storeProfile` (bank/UPI details). `POST
  /admin/walkin-orders/:orderId/send-payment-request`.
- New `updateWalkInOrder(orderId, payload, actor)` — full edit (customer,
  items, discounts, shipping, payment method) for an existing walk-in
  order, locked with a `409` once `paymentStatus === "paid"` or the order
  is cancelled (mirrors the "stays a Proforma until confirmed, then
  locks" rule). `PATCH /admin/walkin-orders/:orderId`.
  - If the order already had a Proforma, editing regenerates it with the
    corrected totals rather than leaving a stale PDF referenced. This
    needed a **new `forceRegenerate` option on
    `invoices.service.js`'s `ensureInvoiceForOrder`** — it previously
    always handed back whatever invoice already existed for the order
    (by design, for its normal callers), which would have kept
    surfacing the pre-edit total. `forceRegenerate` only ever removes
    `proforma_invoice` records for that order (never a real
    `tax_invoice`) before rebuilding — found and fixed via direct
    end-to-end testing (create → edit → check invoice number actually
    changed), not just code review; the first version of this change
    looked correct but silently returned the stale invoice because
    `ensureInvoiceForOrder` also matches by `orderId` in the invoice
    store independent of `order.invoiceId`.
- **Bug fix, found while wiring the edit form's pre-fill**:
  `orders.service.js`'s shared `buildOrderDetail` (used by the generic
  `GET /admin/orders/:orderId`, which every order type's admin UI reads)
  was stripping `discountPercent`/`discountAmount` off order line items
  entirely — the field existed on the stored order but the response
  mapping never included it. Fixed; this is what the edit form and any
  other admin order-detail view now correctly shows.

**Admin panel** (`apps/admin-panel/src/modules/walkin-orders/`):
- `add-walkin-order-page.jsx` now doubles as the edit form: routed at
  both `/walk-in-orders/add` and `/walk-in-orders/:orderId/edit`. Edit
  mode pre-fills from `GET /admin/orders/:orderId`, re-fetches full
  product records (`fetchProduct`) for accurate live pricing preview
  (search-result products aren't available for an already-placed order),
  shows a locked read-only notice instead of the form if the order is
  already paid/cancelled, and posts to `updateWalkInOrder` instead of
  `createWalkInOrder` on save (single "Save Changes" button, no
  draft/paid toggle — payment is confirmed separately from the order
  list).
  - New "Discount %" column in the line-items table; new "Discount"
    line in the summary bar when any line has one.
  - New "Save Customer" button in the Walk-In/New customer tab.
- `walkin-orders-page.jsx` (list page): new "Edit" and "Send for
  Payment" row actions, shown while `paymentStatus !== "paid"` and the
  order isn't cancelled.
- New API functions in `walkin-orders.api.js`: `updateWalkInOrder`,
  `saveWalkInCustomer`, `sendWalkInPaymentRequest`.

**Verification**: full `pnpm run check:backend` regression suite passing
(twice, before and after the `forceRegenerate` fix); a scratch Node
script hitting the live dev API end-to-end confirmed customer dedup on
repeat save, Proforma auto-generation on unpaid creation, the edit
endpoint's discount math, invoice regeneration on edit (new invoice
number + id, old Proforma correctly dropped), the 409 lock once paid,
and that `GET /admin/orders/:id` reflects post-edit items/pricing/latest
invoice correctly. `pnpm run build:admin` clean (one pre-existing,
unrelated warning in `dashboard-page.jsx` — a duplicate object key not
touched by this work).

**Deployed**: backend files synced individually via `pscp` + syntax-
checked on the VPS + `pm2 restart jenix-backend --update-env`; new routes
confirmed live (`401` not `404` on unauthenticated hits). Admin panel
rebuilt, uploaded to a staging dir, swapped into `dist` with a timestamped
backup (`dist_backup_20260823_085002`) and `restorecon -Rv` (SELinux),
verified live via bundle-hash check on `admin.jenixindia.com`. Committed
as `883d71c`, pushed to `origin/main`.

## Aug 21–22 2026 — Job Vacancies module + admin product-save UX fix (DEPLOYED)

- **Job Vacancies / Careers**, full admin-managed feature: backend CRUD
  module (`backend/src/modules/job-vacancies/`), admin panel management
  page, public `/careers` list + `/careers/:slug` detail pages on the
  storefront, `schema.org` `JobPosting` structured data for Google Jobs /
  AI-search visibility, bot-prerendered via the existing
  `prerender.service.js` pattern, careers entries added to the sitemap.
  Nginx updated live (`/careers/:slug` location block mirroring the
  existing `/guides/:slug` pattern) after `nginx -t` validation. First
  real posting published: ITI Electrical/Electronics fresher role.
  Committed `5b79c14`, deployed including the nginx change.
- **Admin product edit/add pages**: save failures on validation errors
  (e.g. `PATCH /admin/products/:id` 400) previously showed only a raw,
  unhelpful error. Added `describeValidationIssue()` + field-level
  error/ref wiring so the actual invalid field (short/full description,
  key features, meta title/description/keywords, etc.) is highlighted
  and named in the error message instead of a generic failure. Committed
  `f172ae0`.
- Admin login: user's remembered password had gone stale (account was
  updated more recently than the `.env` seed fallback). Reset directly
  on the VPS via `node scripts/seed-admin.js --password '...'` per the
  user's explicit instruction **not** to commit the new password to git
  — it wasn't.

## Aug 23 2026 — regular Orders "Demand for Payment" now also emails, not just WhatsApp (DEPLOYED)

User tested the walk-in orders "Send for Payment" flow above, then asked
for the same on regular orders: the Orders page's existing **"Demand for
Payment"** button (`manual-payments.service.js`'s `demandManualPayment`)
was WhatsApp-only. Added an email send alongside it, reusing the existing
`payment_pending` template (the same one sent automatically at checkout)
rather than a new one — same customerName/orderNo/orderTotal/
paymentMethod/paymentInstructions already being computed for the
WhatsApp message. Best-effort and independent of the WhatsApp send (no
email on file, inactive template, or SMTP failure doesn't block or fail
the WhatsApp side); the admin notice after clicking the button now says
which channels actually went out. This is also the flow the Aug 25
bank-details fix above builds on. Committed `20a047f`, deployed.

## Aug 19–20 2026 — cart-abandonment investigation + fixes (now committed + deployed)

Started from a customer-reported checkout error, expanded into a full
audit after fixing it. Committed as part of `02bd4fd`/`c98b47f` and
deployed; deploy status noted per-item below reflects the state at the
time this section was originally written.

### Round 1 — the reported bug (root cause + fix, DEPLOYED to VPS)
Customer hit **"Guest sessionId is required when customer authentication
is not present"** on the Review & Place step, with items still in cart and
a live Pay Now button that would keep failing forever. Root cause: access
tokens are short-lived (15min, `JWT_ACCESS_TTL`); when one expired
mid-checkout, `attachRequestContext` (`middlewares/request-context.js`)
silently swallowed the verify failure into `req.authTokenError` instead of
rejecting the request, and the frontend — believing `isAuthenticated` was
still true — never sent a fallback guest `sessionId`. `resolveCartOwner`
then had neither identifier and threw a generic 400. Worse: since the
backend was returning 400 not 401, the frontend's *existing*
`SESSION_EXPIRED_EVENT` mechanism (which only fires on 401) never
triggered, so the stale session was never cleared either — customer was
stuck with no recovery path short of a hard refresh.
- **Backend**: `resolveCartOwner` (`cart-checkout.service.js`) now checks
  `context.authTokenError` and throws a clear `401` ("Your session has
  expired...") instead of the generic 400. Propagated through all 12
  `cartContext`/`resolveCartOwner` call sites.
- **Frontend**: `checkout-page.jsx` catches the 401 in `handleSubmit` and
  `handleCreatePaymentLink`, shows a `sessionExpiredNotice` on the
  existing `CheckoutLoginGate` screen (forces `guestOverride` back to
  `false` so a stale `?session=` param can't suppress the gate), instead
  of leaving the broken form on screen.
- **Also added**: silent access-token refresh (`http-client.js`
  `ensureFreshAccessToken`) — every authenticated request now checks the
  token's own `exp` claim and refreshes via the existing (previously
  unused) `/auth/customer/refresh` + 30-day refresh token before firing,
  rather than relying on a background timer (which browsers throttle/kill
  on backgrounded tabs) — user specifically asked for this to cover a tab
  left open for days.
- **Deployed**: backend files synced + `pm2 restart jenix-backend
  --update-env`; storefront rebuilt and swapped into
  `apps/front/dist` on the VPS with `restorecon -Rv` (the known SELinux
  gotcha on this box). Old build kept at
  `apps/front/dist_backup_20260819_123045` on the VPS, not deleted.
  Verified live via `/health` and asset-hash check on `jenixindia.com`.

### Round 2 — critical audit + fixes (LOCAL ONLY, not yet deployed)
User asked for a critical audit of the rest of the codebase for other
causes of cart abandonment. Ran 4 parallel investigations (payment/stock-
reservation flow, cart/session/pricing integrity, frontend UX dead-ends,
auth/identity edge cases). Findings, all fixed:

1. **CRITICAL — payment could be captured with no order ever created,
   customer shown a fake "success" page.** The stock reservation TTL
   (15min) was fixed at payment-attempt creation and never extended;
   realistic UPI/net-banking flows (bank OTP, 3D-secure, app-switch)
   routinely exceed that, so the reservation could expire and the item
   sell out *while the gateway was processing the actual charge*. When
   `finalizeSuccessfulPaymentAttempt` (`cart-checkout.service.js`) then
   tried to re-reserve stock, it threw an unhandled 409 — after the
   gateway had already taken the money. The frontend's Razorpay success
   handler (`checkout-page.jsx`) explicitly swallowed that error
   ("non-fatal: webhook will also process it" — false, the webhook hits
   the identical failure) and unconditionally showed the success page.
   Fixed:
   - Bumped `CART_STOCK_RESERVATION_MINUTES` default 15→25
     (`config/env.js`).
   - `finalizeSuccessfulPaymentAttempt` now catches the stock-unavailable
     case, marks the attempt with a new status
     `PAYMENT_ATTEMPT_STATUSES.CAPTURED_UNFULFILLED`
     (`cart-checkout.model.js`), and returns a defined
     `captured_unfulfilled` result instead of throwing — covers both the
     webhook path and the browser-confirm path (shared function).
   - New urgent admin email alert (`payment_captured_unfulfilled_admin`
     template, `marketing.model.js`) sent to `storeProfile.supportEmail`
     via the existing `safeSendTemplateNotification` pattern — flags the
     payment attempt ID, gateway txn ID, customer contact, and amount for
     manual refund/order creation. **No admin UI surfaces this state
     yet** — it's email-alert only; if this fires often, worth a proper
     admin panel view.
   - Frontend (`checkout-page.jsx`): new `resolvePaymentConfirmOutcome`
     helper used by both the Razorpay `handler` and the Cashfree
     confirm flow — only shows the success page when confirm actually
     reports success; on `captured_unfulfilled` or a thrown confirm
     error, shows an honest message instead (with the payment reference
     ID for support) rather than a fabricated success page.
2. **Same auth-fallthrough bug as Round 1, unpatched in two sibling
   modules** — `manual-payments.service.js` (`resolveContextOwner`, hit
   when a customer with an expired token picks Direct Bank Transfer /
   Manual UPI instead of online payment) and
   `abandoned-cart.service.js`'s `resolveRestoreOwner` (cart-recovery
   link restore). Both mirrored the Round 1 fix exactly — 401 with a
   clear message instead of the generic 400.
3. **Guest cart items silently vanishing** — `guest-session.js`'s
   `getOrCreateGuestSessionId()` handed back a brand-new, unpersisted
   random ID on every single call whenever `localStorage` threw (Safari
   private browsing, storage-blocked browsers/extensions) — every cart
   request got a different guest cart, no error shown. Added an
   in-memory module-scoped fallback so at least one tab/page-load gets a
   consistent ID even when storage is unavailable.
4. **Cart writes not actually atomic** — `auth-store.js`'s mutex only
   serialized the disk write, not the read-modify-write cycle every cart
   mutation does. Two near-simultaneous requests (double-tap qty,
   multi-tab edits) could silently lose one edit. Added
   `withAuthStoreLock()` (new export in `auth-store.js`) and wrapped
   `addCartItem`, `updateCartItem`, `deleteCartItem`, and
   `mergeGuestCartIntoCustomer` in it — scoped to cart mutations only,
   not the larger checkout/payment write paths (lower risk of
   introducing a deadlock across a much bigger surface for a lower-
   frequency operation).
5. **No fetch timeout anywhere in the storefront** — `http-client.js`'s
   `apiFetch` used a bare `fetch()` with no `AbortController`. On a
   stalled connection, every busy/submitting-gated button (Pay Now,
   Place Order, Add to Cart) froze forever with zero feedback — same
   *symptom* as the Round 1 bug, far more common trigger. Added a 25s
   timeout with a clear "Request timed out" error.
6. **Cross-tab refresh race (self-introduced by the Round 1 silent-
   refresh feature)** — refresh tokens rotate/are single-use
   server-side; two tabs racing a refresh near-simultaneously with the
   same stored token could have the losing tab's request come back
   "already revoked" and incorrectly log that tab out. `http-client.js`
   now re-checks storage for a newer token (written by the winning tab)
   before treating a refresh failure as real.
7. **Ad-blocked payment gateway script with no fallback offered** —
   error message on Razorpay/Cashfree script load failure now
   explicitly suggests trying Bank Transfer/UPI instead of just "check
   your connection."
8. Audited every other `req.customer` usage across the backend for the
   same fallthrough pattern — the rest are either hard-gated by
   `requireCustomerAuth` (already a clean 401 regardless of cause) or
   treat a missing customer as "anonymous, no error" by design (search,
   product recommendations, reviews) — not a bug. One endpoint
   (`shipping.service.js` `estimateCartShipping`, `/api/shipping/cart-
   estimate`) has the same unguarded-throw shape but has **no frontend
   caller at all** — left alone as dead code, flagged here in case it's
   wired up later.

**Verification**: `node --check` on every edited file, full
`pnpm run check:backend` regression suite (passing), `pnpm run build`
on `apps/front` (clean). Since committed and deployed — see the
top-of-file banner.

This file is the project-folder counterpart to Claude's own memory system
(which also has a fuller version of this under the name
"project-session-handoff-2026-08" plus several topic-specific memories).
Keeping a copy here means a fresh session can resume correctly even if
memory isn't available for some reason — read this file first, before
`CLAUDE.md`'s architecture reference.

## Aug 18 2026 — what shipped (commit `c34a739`, pushed to origin/main)

1. **Major notification bug found and fixed: `buildTemplateVariables()`
   in `marketing.service.js` was a separate, manually-maintained field
   list that silently dropped any variable not on it** — `recoveryUrl`,
   `whatsappLink`, `whatsappNumber`, `itemsTable`, `customerEmail`,
   `customerMobile`, `rejectionReason` were all declared in the real
   source of truth (`TEMPLATE_VARIABLES` in `marketing.model.js`) but
   never added to this second hardcoded copy. Confirmed via real
   production notification logs (`marketing-store.json` on the VPS):
   the abandoned-cart email's "Continue My Order" button had
   `href=""`, its WhatsApp box had no number, and — much bigger —
   **every single `order_placed` confirmation email had a completely
   blank items list** (no product names/qty/price at all, just order
   no/total/payment method), since it too depends on `{{itemsTable}}`.
   review_rejected/print_job_rejected emails also silently dropped the
   rejection reason. User's original report was specifically about the
   abandoned-cart email/WhatsApp; investigating "check if this is in
   other templates too" surfaced the order-confirmation bug, which is
   larger. Fixed by rewriting `buildTemplateVariables` to derive its
   field list from `TEMPLATE_VARIABLES` directly (loop + default `""`)
   instead of a hand-maintained duplicate — structurally eliminates this
   whole bug class going forward, verified via a script that diffed
   every `{{placeholder}}` actually used in template bodies against
   `TEMPLATE_VARIABLES` (zero gaps after the fix). Added regression
   assertions (Phase 12 abandoned-cart section, Phase 17 order-placed
   section) that check the *rendered body*, not just "did it send" —
   asserting the real recovery URL and a real `<tr>` items row actually
   appear in the notification log's stored body, which is what would
   have caught this originally.
2. **Admin Orders (mobile view): fulfillment status was invisible** —
   the desktop table shows both a payment badge (`PayBadge`: Paid/
   Verify Pending/Failed) and a separate fulfillment badge (`ShipBadge`:
   Awaiting/Packing/Shipped/Delivered/Cancelled), but the mobile card
   only ever rendered `PayBadge` — so on mobile, every order looked
   permanently stuck at "Paid" with no way to see Packed/Shipped/
   Delivered progress. Added `ShipBadge` to the mobile card.
3. **Admin Order Detail: Cancel Order button was too easy to hit by
   mistake** — it was a full-size `.btn.btn-secondary`, same size as
   and directly adjacent to the primary pipeline action button (Mark as
   Processing / Generate Invoice / etc.), distinguished only by red
   text. Restyled as a small, low-emphasis text link, separated from
   the primary action button group (`justify-content: space-between`)
   instead of sitting right next to it — still requires the same
   `window.confirm()` before acting, just no longer visually competing
   with the button admins actually want to press 99% of the time.
4. Backend regression suite re-run and passing with the new assertions
   included.
5. **Fix verified with a real send**, not just regression assertions —
   ran a one-off script through the actual `safeSendTemplateNotification`
   pipeline (SMTP, not simulated) sending a corrected `order_left_in_cart`
   email to a real test inbox. Confirmed status `"sent"` and the real
   rendered email had a working recovery link, a populated 2-row items
   table, and a working WhatsApp deep-link with the real support number —
   all three previously blank. Script was scratch-only (uploaded to the
   VPS, run once, deleted immediately after) — nothing added to the repo.

## Aug 15–17 2026 — what shipped (commit `02153c8`)

1. **New product type: Custom Print** — a product where the buyer uploads
   their own design, picks option choices that each add/subtract from the
   price, and the order needs human review of the file before print.
   Added as a new `fulfillmentType` field (`"standard" | "custom_print"`)
   rather than overloading the existing free-text `productType` SEO
   field. Full pipeline built and deployed:
   - **Schema**: `uploadMode` (`single_design` | `unique_batch`),
     `uploadSpec` (card mm size, min px resolution, max file size,
     allowed formats), `customOptions` (option groups → choices, each
     with a `priceDelta`), `printTemplates` (safe-zone hole
     position/diameter/margin, for products like ID cards that get
     physically drilled).
   - **Pricing injection point**: `buildCartLineFromItem`
     (`cart-checkout.service.js`) resolves the selected choices' price
     deltas into `unitPrice` before `lineSubtotal`/GST are computed — one
     injection point, everything downstream (GST, invoices, order totals)
     handles it automatically.
   - **Private file upload**: `backend/src/modules/print-uploads/` — new
     `image-assets/print-uploads/` directory, deliberately **not** under
     the publicly-mounted `image-assets/uploads/`. Files only ever
     served through an authenticated admin route.
   - **Cart line identity**: added `lineId` to every cart item (new
     `generateId("cartline")`) — needed because custom-print items never
     merge (each design is its own line), unlike standard products.
   - **Admin**: Fulfillment Type section + Custom Options editor + safe-
     zone template editor on the product edit page; new **Print Jobs**
     page (queue of every uploaded design across all paid orders, with
     safe-zone overlay preview, Approve/Reject).
   - **Storefront**: `CustomPrintConfigurator` component — option chips,
     upload zone, per-design qty, live price calc — replaces the normal
     add-to-cart block on any `fulfillmentType: custom_print` product
     page.
   - First real product: **RFID/Mifare/IC Card** (`prd_75bd36d1`), base
     ₹100 + Mifare/RFID +₹15, Screw/Glue Fix +₹20, UV Protection +₹40.
     Flipped live for real-buyer testing per user's explicit request.
2. **Post-launch bug fixes**, found by the user testing the live RFID
   product directly (not simulated):
   - Stale Google-indexed `/login` link (with a `srsltid` tracking param)
     hit a real 404 for a real customer via WhatsApp — added a
     `/login → /account/login` redirect route.
   - Header account/login icon lost redirect context (dropped the
     customer at `/account` instead of back where they were) — every
     *other* login link in the app already carried `?redirect=`, this was
     the one that didn't.
   - Qty stepper was coded to only show in `single_design` mode, hidden
     in `unique_batch` mode (the live product's actual mode) — removed
     the mode gate so it always shows; means "order extra copies of this
     exact same design."
   - "0 cards × ₹100, static" turned out to be silent upload rejection:
     the product's `uploadSpec.minHeightPx` (630) was stricter than the
     test photo's real height (600px, confirmed via `sharp` metadata
     on the server) — lowered the threshold and added a prominent
     red failed-upload banner so this fails loudly instead of silently
     next time.
   - Design preview was a plain thumbnail with no way to tell what would
     actually get cut off if the photo's aspect ratio didn't match the
     card. Built a real **drag-to-reposition + pinch/button-zoom crop
     tool** (`DesignPreview` in `custom-print-configurator.jsx`) — the
     photo pans/zooms under a fixed card-shaped frame, resolution-
     independent `{panX, panY, zoom}` model, persisted server-side via
     new `PATCH /api/print-uploads/:id/crop` (ownership-checked) so the
     admin's Print Jobs preview renders the *exact same framing* the
     buyer confirmed, not a guess.
3. Backend regression suite (Phase 25) extended to cover all of the
   above — upload validation, crop endpoint auth/ownership, add-on
   pricing math, batch-upload line-splitting, full checkout→print-job
   flow. Passing as of last run.

## Aug 11–15 2026 — what shipped

1. **WhatsApp early-nudge daily send cap** — admin-configurable ceiling on
   the abandoned-cart WhatsApp nudge (8–45 min post-abandonment), counted
   per IST calendar day. Settings tab UI. Commit `a5ce5ad`.
2. **Sales-growth pivot.** User: *"wishlist is low priority, more focus how
   to increase sale."* Pulled real production data instead of guessing.
   Confirmed ~97% of the 387-product catalog had never sold, and
   `keyFeatures` had **zero UI field anywhere** on add/edit product pages —
   not neglected content, a missing form field. Drove the AI Content
   Assistant build below.
3. **AI Content Assistant** (commits `1149e02`, `2342f01`) — new
   `backend/src/modules/products/product-content-ai.service.js` drafts
   `keyFeatures`, `specifications`, `technicalKeywords`, `customerKeywords`,
   `useCases`, `problemStatements`, `metaTitle`, `metaDescription`,
   `warnings` from existing product data (anti-hallucination instruction
   for technical/electrical specs). Two providers — OpenAI and Claude —
   wired through the existing generic Integrations credential store, shown
   in their own "AI Assistant Accounts" segment. New admin
   `product-content-assistant-page.jsx` (per-row generate only, no
   bulk-apply, by design) + a "Generate with AI" button on the single-
   product edit page. **User explicitly declined image alt-text
   generation** — don't propose it again unless raised.
4. **Home + product page load-speed fixes**, treated as a revenue-loss bug
   per the user's framing ("guest comes and go to other site"):
   - Zero `Cache-Control` headers on any static asset — fixed with
     `/etc/nginx/snippets/jenix-static-cache.conf` (1yr immutable on
     `/assets/`).
   - Home page "Bestsellers" was fake (just first-8-in-stock) — replaced
     with a real ranking from paid-order line items
     (`listBestSellingProducts`, `GET /api/products/best-sellers`).
   - All ~13 category rails fired at once on load — switched to
     `IntersectionObserver`-gated lazy loading.
   - Added preconnect/dns-prefetch to the API origin,
     `fetchPriority="high"` on the hero product image, and a real
     skeleton + de-slugified guessed `<h1>` while the product loads
     instead of generic "Loading...".
   Commits `6a9a1af`, `03692dd`, `3179cf4`.
5. **Major feature: product pages now server-rendered for real visitors,
   not just crawlers** (`f550c8d`). The existing bot-only prerender module
   (`backend/src/modules/prerender/`) now serves real HTML — real CSS,
   real image/title/price, an embedded `window.__INITIAL_PRODUCT__` seed
   — to every visitor on `/products/:slug`, with an nginx
   `@spa_fallback` safety net on any backend error. Staged rollout:
   `test.jenixindia.com` first, verified, then `jenixindia.com`. This is
   now **production-critical**, not an SEO-only helper — treat any future
   change to `prerender.service.js`'s product path accordingly.
6. **Two critical bugs found only via real-browser evidence** (curl/API
   checks could not have caught either):
   - **CSP was blocking every fetch() on real product pages** once they
     started being served as full HTML through Express (helmet's default
     CSP is meant for pure JSON responses). Found via a browser console
     log the user pasted into `../past.txt` (their established workaround
     for pasting text into chat — re-read that file whenever they
     reference it). Fixed with a `removeCsp` middleware scoped to
     `/prerender/products/:slug` only. Commit `0c2bfa0`.
   - **`trust proxy` was never configured** in `backend/src/app.js` —
     behind nginx, every request looked like it came from one address,
     collapsing the whole site's rate limit into one shared bucket
     (production-only, invisible in dev/staging). Found while chasing an
     unrelated single-customer "product not found" complaint. Fixed with
     `app.set("trust proxy", 1)`. Commit `2c9c6cf`. Also fixed alongside
     it: the product page showed a hard "Product not found" for *any*
     fetch failure — now only a real 404 shows that message; anything
     else shows a retry prompt.
7. **Home and Product routes pulled back out of route-level code-splitting**
   (`8432bf4`) — lazy-loading them was itself causing a "Loading..." flash
   on the first visit to that route's JS chunk. The other ~15 routes are
   still lazy-loaded; only these two highest-traffic ones were reverted to
   eager imports.
8. **Three small storefront fixes, user-confirmed "yes working"**
   (`74b6046`): GST chip now respects `product.priceIncludesGst` (was
   hardcoded to always show `+18% GST`); product images no longer cropped
   (`object-fit: contain` for gallery/thumb); pinch-zoom on the mobile
   fullscreen image viewer rebuilt with Pointer Events (native
   `touch-action` wasn't working on the fixed-position overlay).
9. **Order-success page redesign** (`4b61ed4`) — "Order Number: X"
   instead of a buried reference; gateway-paid orders show "Paid By —
   Razorpay/Cashfree" and skip the "verification in progress" steps;
   manual-payment orders show an explicit "Verification pending" /
   "Payment Not Yet Made" status depending on whether proof was uploaded.
10. **Admin "Stuck Payments" alert fixed** (`905b458`, `47715d4`) — user
    cross-checked two flagged orders against the real Razorpay/Cashfree
    dashboards, found nothing, asked whether it was a code bug. Confirmed
    via production data: neither was ever actually charged, and both were
    *already* correctly tracked in abandoned-cart recovery — the alert's
    own copy ("Payment received but no order created") was overstating
    risk for any 15-min stall regardless of gateway state. Added a
    `likelyCharged` flag, split the UI into an urgent section and a calm
    "already tracked, nothing to do" section, and added a self-cleaning
    24-hour filter for routine (never-charged) rows. Verified live: alert
    window went from 12 rows to 1.

All 11 commits (`a5ce5ad` through `47715d4`) pushed to `origin/main`.
Final live verification pass done afterward: backend health, storefront/
admin HTTP checks, product-page SSR headers, pm2 stability, error-log
scan — clean (one unrelated harmless bot GraphQL scan noted, no action
needed).

## Deferred or declined — don't restart without the user asking

- **Admin wishlist visibility** — buyer save-product works fully; admin
  has no view into it. Deprioritized 2026-08-11 in favor of sales-growth
  work. Planned shape when it comes back: saved-products list/count on
  the admin Customer Detail page, maybe a "saved by N customers" count on
  the Products list.
- **Image alt-text AI generation** — explicitly declined 2026-08-11
  ("no need image alt text"). Also note: product images are plain URL
  strings today, no alt-text field exists in the schema at all, so this
  would need a schema change first if ever revisited.
- **GSC "Blocked by robots.txt" warning** — raised 2026-08-11, referenced
  an Aug 8 report. Checked: robots.txt is currently clean/correct in
  production; almost certainly a stale report. No code change made.
- **Commerce Watchdog → new VPS migration** — deliberately parked
  (provision MongoDB, deploy code, configure .env/pm2, nginx+SSL for
  watchdog-api-ecom.iotsoft.in, update front `.env.production`). Watchdog
  itself is live and working on the OLD VPS (154.61.69.200); this is only
  about moving it. Do not resume unprompted.
- **East India shipping zone gap** — `zoneStateMap` has no bucket for
  WB/Bihar/Jharkhand/Odisha, those pincodes fall to "All India" pricing.
  Flagged to the user, not yet actioned.
- **SMTP / Phone OTP SMS** — SMTP is wired via nodemailer, verify it has
  real production credentials (not just code-complete). Phone OTP has no
  SMS provider connected (MSG91/Twilio) — optional, not blocking.

## Working-style rules already established (don't relitigate)

- Never delete working code — add new code or comment out old code only.
- Keep pages/components small and independent; fixing one must not break
  another.
- Never rapid-fire writes to the flat-file JSON stores (there was a real
  wipeout incident from this — atomic writes + mutex are now in place,
  don't bypass them).
- A bare `hidden` attribute has silently lost to CSS specificity more
  than once — pair it with `[hidden]{display:none!important}` or an
  inline style override.
- Both storefront and admin panel are PWAs — if a deployed change "isn't
  showing up," check the live bundle hash actually matches what was just
  built before assuming a fresh bug.
- When the user references `../past.txt` (one level above this `VPS`
  folder), that's their workaround for pasting text/console logs into
  chat — always re-read it when they point at it.
- Server-side curl/API verification cannot catch CSP, hydration, or
  production-only rate-limit bugs — anything touching prerendering, SSR,
  or request-origin logic needs an actual browser check before being
  called verified.

## Where to look for more detail

- `CLAUDE.md` (same folder) — architecture, tech stack, deploy commands,
  VPS access pattern, known-issues history. Read after this file.
- Claude's own memory system has topic-specific detail this file
  condenses: full session handoff history back to early Aug, the
  Reviews & Ratings feature, the checkout pipeline overhaul, the customer
  detail page, VPS access credentials (rotate — always verify current
  password rather than reusing one from an old note), and more. Ask
  Claude to check memory if a past decision's exact reasoning is needed.
