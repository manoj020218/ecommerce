# Handoff — read this first

Last updated: **2026-08-23**. `origin/main` HEAD is **`883d71c`**, pushed
and deployed to the production VPS (backend files synced + `pm2 restart`,
admin panel rebuilt and swapped into `dist` with `restorecon -Rv`,
verified live). Working tree also has one unrelated stray empty file
(`p.images` at repo root, dated Jul 7, predates every feature in this
file — leave it alone unless the user asks about it). Everything below,
including the Aug 19-20 cart-abandonment section (which was uncommitted
at the time it was written), is now committed, pushed, and deployed —
confirmed via `git log` and live verification.

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
