# Handoff — read this first

Last updated: **2026-08-17**. `origin/main` HEAD: **`817aad0`**.

**⚠️ Working tree is NOT clean.** Everything in the "Aug 15–17" section
below is deployed to production and verified live, but **not committed to
git** — `git status` shows the full custom-print feature (backend
modules, admin panel, storefront) as modified/untracked files sitting on
top of `817aad0`. It was shipped the same way the rest of this repo
always has been (build → pscp to VPS → restart/verify), just without a
commit afterward. Don't assume `git log` reflects what's actually live —
check `git status` before trusting it. Commit only if the user explicitly
asks; if picking this work back up, be aware a `git checkout`/`reset` on
this tree would discard it.

Everything described in earlier dated sections as "shipped" **is**
committed, pushed, and verified live — that convention broke only for the
most recent section below.

This file is the project-folder counterpart to Claude's own memory system
(which also has a fuller version of this under the name
"project-session-handoff-2026-08" plus several topic-specific memories).
Keeping a copy here means a fresh session can resume correctly even if
memory isn't available for some reason — read this file first, before
`CLAUDE.md`'s architecture reference.

## Aug 15–17 2026 — what shipped (NOT yet committed — see warning above)

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
